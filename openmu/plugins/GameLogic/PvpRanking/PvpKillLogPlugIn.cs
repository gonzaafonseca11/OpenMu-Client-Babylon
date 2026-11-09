// <copyright file="PvpKillLogPlugIn.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameLogic.PvpRanking;

using System.Runtime.InteropServices;
using Microsoft.Extensions.Logging;
using MUnique.OpenMU.GameLogic.Attributes;
using MUnique.OpenMU.GameLogic.PlugIns;
using MUnique.OpenMU.Persistence;
using MUnique.OpenMU.Persistence.EntityFramework;
using MUnique.OpenMU.PlugIns;
using Npgsql;

/// <summary>
/// Writes each player kill between two characters of <see cref="MinimumResets"/> resets or more to
/// <c>mu_plugins.pvp_kill</c>; the website ranks from it (all time and per month).
/// </summary>
[Guid("6E2B9F14-7C3A-4D85-B1E6-0A9D4C2F8E51")]
[PlugIn]
[Display(Name = "PvP kill log (rankings)", Description = "Logs kills between characters of 50+ resets for the website's PK rankings.")]
public class PvpKillLogPlugIn : IAttackableGotKilledPlugIn
{
    /// <summary>Both the killer and the killed need this many resets for the kill to count.</summary>
    public const int MinimumResets = 50;

    /// <summary>The table; the installer creates it too (install/cli/siteRole.ts), so the site can read it.</summary>
    public const string CreateSql = """
        CREATE SCHEMA IF NOT EXISTS mu_plugins;
        CREATE TABLE IF NOT EXISTS mu_plugins.pvp_kill (id bigserial PRIMARY KEY, killer_id uuid NOT NULL, victim_id uuid NOT NULL, at timestamptz NOT NULL DEFAULT now());
        CREATE INDEX IF NOT EXISTS pvp_kill_at ON mu_plugins.pvp_kill (at);
        """;

    private static string? connectionString;
    private static bool created;

    private static string ConnectionString => connectionString ??=
        new ConfigFileDatabaseConnectionStringProvider().GetConnectionSetting(typeof(EntityDataContext)).ConnectionString
        ?? throw new InvalidOperationException("OpenMU has no admin connection string.");

    /// <inheritdoc />
    public ValueTask AttackableGotKilledAsync(IAttackable killed, IAttacker? killer)
    {
        if (killer is not Player { SelectedCharacter: { } killerCharacter } killerPlayer
            || killed is not Player { SelectedCharacter: { } victimCharacter } victim
            || killerCharacter.Id == victimCharacter.Id
            || Resets(killerPlayer) < MinimumResets
            || Resets(victim) < MinimumResets)
        {
            return ValueTask.CompletedTask;
        }

        // Off the death path: the game never waits on the database for this.
        _ = Task.Run(async () =>
        {
            try
            {
                await InsertAsync(killerCharacter.Id, victimCharacter.Id).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                killerPlayer.Logger.LogError(ex, "Could not log the PvP kill of {Victim} by {Killer}", victimCharacter.Name, killerCharacter.Name);
            }
        });
        return ValueTask.CompletedTask;
    }

    private static int Resets(Player player) => (int)(player.Attributes?[Stats.Resets] ?? 0f);

    private static async Task InsertAsync(Guid killer, Guid victim)
    {
        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync().ConfigureAwait(false);
        if (!created)
        {
            await using var create = new NpgsqlCommand(CreateSql, connection);
            await create.ExecuteNonQueryAsync().ConfigureAwait(false);
            created = true;
        }

        await using var insert = new NpgsqlCommand("INSERT INTO mu_plugins.pvp_kill (killer_id, victim_id) VALUES (@k, @v)", connection);
        insert.Parameters.AddWithValue("k", killer);
        insert.Parameters.AddWithValue("v", victim);
        await insert.ExecuteNonQueryAsync().ConfigureAwait(false);
    }
}
