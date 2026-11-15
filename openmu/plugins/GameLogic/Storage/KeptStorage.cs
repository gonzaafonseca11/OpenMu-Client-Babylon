// <copyright file="KeptStorage.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameLogic.Storage;

using MUnique.OpenMU.Persistence;
using MUnique.OpenMU.Persistence.EntityFramework;
using Npgsql;

/// <summary>
/// Our item storages that no OpenMU row points at: the extra vaults of <c>/baul</c> and the marketplace's escrow
/// boxes. OpenMU's migration CleanUpOrphanedAggregateMembers (after 0.9.10) deletes every ItemStorage that no
/// foreign key reaches, items included. A row here is such a key, so those storages survive it; it goes with
/// its storage (ON DELETE CASCADE) when the storage is deleted on purpose.
/// </summary>
public static class KeptStorage
{
    /// <summary>The table; openmu/upgrade/keep_storages.sql fills it with the storages saved before it existed.</summary>
    public const string CreateSql = """
        CREATE SCHEMA IF NOT EXISTS mu_plugins;
        CREATE TABLE IF NOT EXISTS mu_plugins.kept_storage (
            storage_id uuid PRIMARY KEY REFERENCES data."ItemStorage"("Id") ON DELETE CASCADE);
        """;

    private static string? connectionString;

    private static bool created;

    private static string ConnectionString => connectionString ??=
        new ConfigFileDatabaseConnectionStringProvider().GetConnectionSetting(typeof(EntityDataContext)).ConnectionString
        ?? throw new InvalidOperationException("OpenMU has no admin connection string.");

    /// <summary>Records saved storages as ours. Call it after the save that wrote them: the key needs the row.</summary>
    public static async ValueTask KeepAsync(params Guid[] storageIds)
    {
        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync().ConfigureAwait(false);
        if (!created)
        {
            await using var create = new NpgsqlCommand(CreateSql, connection);
            await create.ExecuteNonQueryAsync().ConfigureAwait(false);
            created = true;
        }

        foreach (var id in storageIds.Where(id => id != Guid.Empty).Distinct())
        {
            await using var insert = new NpgsqlCommand(
                """INSERT INTO mu_plugins.kept_storage (storage_id) SELECT @s WHERE EXISTS (SELECT 1 FROM data."ItemStorage" WHERE "Id" = @s) ON CONFLICT DO NOTHING""",
                connection);
            insert.Parameters.AddWithValue("s", id);
            await insert.ExecuteNonQueryAsync().ConfigureAwait(false);
        }
    }
}
