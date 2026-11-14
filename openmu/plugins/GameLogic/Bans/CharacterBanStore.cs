// <copyright file="CharacterBanStore.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameLogic.Bans;

using MUnique.OpenMU.Persistence.EntityFramework;
using Npgsql;

/// <summary>
/// Why a character is banned: <c>mu_plugins.character_ban</c>, one row per banned character, beside OpenMU's own
/// <c>CharacterStatus.Banned</c>. The website's GM panel lists it and lifts a ban by deleting the row and the status.
/// </summary>
public sealed class CharacterBanStore
{
    private const string CreateSql = """
        CREATE SCHEMA IF NOT EXISTS mu_plugins;
        CREATE TABLE IF NOT EXISTS mu_plugins.character_ban (
            character_id uuid PRIMARY KEY,
            character_name text NOT NULL,
            reason text NOT NULL,
            banned_at timestamptz NOT NULL DEFAULT now());
        """;

    private readonly object _sync = new();

    private Task? _created;

    private string? _connectionString;

    private CharacterBanStore()
    {
    }

    /// <summary>Gets the store of this process.</summary>
    public static CharacterBanStore Instance { get; } = new();

    /// <summary>OpenMU's admin connection, read the way OpenMU reads it (as LoginTokenStore does).</summary>
    private string ConnectionString => this._connectionString ??=
        new ConfigFileDatabaseConnectionStringProvider().GetConnectionSetting(typeof(EntityDataContext)).ConnectionString
        ?? throw new InvalidOperationException("OpenMU has no admin connection string.");

    /// <summary>Records why the character is banned; a second ban replaces the reason.</summary>
    public async ValueTask RecordAsync(Guid characterId, string characterName, string reason)
    {
        await this.EnsureCreatedAsync().ConfigureAwait(false);
        await using var connection = new NpgsqlConnection(this.ConnectionString);
        await connection.OpenAsync().ConfigureAwait(false);
        await using var insert = new NpgsqlCommand(
            """
            INSERT INTO mu_plugins.character_ban (character_id, character_name, reason) VALUES (@id, @name, @reason)
            ON CONFLICT (character_id) DO UPDATE SET character_name = @name, reason = @reason, banned_at = now()
            """,
            connection);
        insert.Parameters.AddWithValue("id", characterId);
        insert.Parameters.AddWithValue("name", characterName);
        insert.Parameters.AddWithValue("reason", reason);
        await insert.ExecuteNonQueryAsync().ConfigureAwait(false);
    }

    /// <summary>Creates the schema and the table when they are missing; once per process, again after a failure.</summary>
    public Task EnsureCreatedAsync()
    {
        lock (this._sync)
        {
            if (this._created is null || this._created.IsFaulted || this._created.IsCanceled)
            {
                this._created = this.CreateAsync();
            }

            return this._created;
        }
    }

    private async Task CreateAsync()
    {
        await using var connection = new NpgsqlConnection(this.ConnectionString);
        await connection.OpenAsync().ConfigureAwait(false);
        await using var create = new NpgsqlCommand(CreateSql, connection);
        await create.ExecuteNonQueryAsync().ConfigureAwait(false);
    }
}
