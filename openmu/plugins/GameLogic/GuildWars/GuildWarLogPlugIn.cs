// <copyright file="GuildWarLogPlugIn.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameLogic.GuildWars;

using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using Microsoft.Extensions.Logging;
using MUnique.OpenMU.GameLogic.GuildWar;
using MUnique.OpenMU.GameLogic.PlugIns;
using MUnique.OpenMU.Persistence.EntityFramework;
using MUnique.OpenMU.PlugIns;
using Npgsql;

/// <summary>
/// Writes each guild war (and Battle Soccer) that ends with a winner to <c>mu_plugins.guild_war</c>; the website's
/// guild rankings count them. OpenMU keeps no record of a war once it is over. A war is found through its players
/// (<see cref="Player.GuildWarContext"/>) and logged when its score says it ended; a cancelled war has no winner.
/// See ../../../readme.md (Guild wars won).
/// </summary>
[Guid("C51E8A37-2B94-4F06-9D7A-6E3F0B8C1D42")]
[PlugIn]
[Display(Name = "Guild war log (rankings)", Description = "Logs every guild war won for the website's guild rankings.")]
public class GuildWarLogPlugIn : IPeriodicTaskPlugIn
{
    /// <summary>The table; the installer creates it too (install/cli/siteRole.ts), so the site can read it.</summary>
    public const string CreateSql = """
        CREATE SCHEMA IF NOT EXISTS mu_plugins;
        CREATE TABLE IF NOT EXISTS mu_plugins.guild_war (id bigserial PRIMARY KEY, winner_id uuid, loser_id uuid, winner_name text NOT NULL, loser_name text NOT NULL, winner_score int NOT NULL, loser_score int NOT NULL, soccer boolean NOT NULL, at timestamptz NOT NULL DEFAULT now());
        CREATE INDEX IF NOT EXISTS guild_war_at ON mu_plugins.guild_war (at);
        """;

    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(5);

    /// <summary>The wars already watched: each is logged once, by whichever of its players was seen first.</summary>
    private static readonly ConditionalWeakTable<GuildWarScore, object> Watched = new();

    private static string? connectionString;
    private static bool created;

    private readonly ConditionalWeakTable<GameContext, StrongBox<DateTime>> _nextRun = new();

    private static string ConnectionString => connectionString ??=
        new ConfigFileDatabaseConnectionStringProvider().GetConnectionSetting(typeof(EntityDataContext)).ConnectionString
        ?? throw new InvalidOperationException("OpenMU has no admin connection string.");

    /// <inheritdoc />
    public async ValueTask ExecuteTaskAsync(GameContext gameContext)
    {
        var next = this._nextRun.GetValue(gameContext, _ => new StrongBox<DateTime>(DateTime.MinValue));
        if (DateTime.UtcNow < next.Value)
        {
            return;
        }

        next.Value = DateTime.UtcNow + Interval;
        foreach (var player in await gameContext.GetPlayersAsync().ConfigureAwait(false))
        {
            if (player.GuildWarContext is { Score: { HasEnded: false } score } war && !Watched.TryGetValue(score, out _))
            {
                Watched.AddOrUpdate(score, war);
                var soccer = war.WarType == GuildWarType.Soccer;
                var logger = player.Logger;
                score.PropertyChanged += (_, e) => OnScoreChanged(score, soccer, e, logger);
            }
        }
    }

    /// <inheritdoc />
    public void ForceStart()
    {
    }

    private static void OnScoreChanged(GuildWarScore score, bool soccer, PropertyChangedEventArgs e, ILogger logger)
    {
        if (e.PropertyName != nameof(GuildWarScore.HasEnded) || !score.HasEnded || score.Winners is not { } winners
            || !Watched.TryGetValue(score, out var mark) || mark is not GuildWarContext)
        {
            return;
        }

        Watched.AddOrUpdate(score, "logged");
        var first = winners == GuildWarTeam.First;
        var (winner, loser) = first ? (score.FirstGuildName, score.SecondGuildName) : (score.SecondGuildName, score.FirstGuildName);
        var (winnerScore, loserScore) = first ? (score.FirstGuildScore, score.SecondGuildScore) : (score.SecondGuildScore, score.FirstGuildScore);
        _ = Task.Run(async () =>
        {
            try
            {
                await InsertAsync(winner, loser, winnerScore, loserScore, soccer).ConfigureAwait(false);
                logger.LogInformation("Guild war logged: {Winner} beat {Loser} {WinnerScore}-{LoserScore}{Soccer}.", winner, loser, winnerScore, loserScore, soccer ? " (Battle Soccer)" : string.Empty);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Could not log the guild war {Winner} beat {Loser}", winner, loser);
            }
        });
    }

    private static async Task InsertAsync(string winner, string loser, int winnerScore, int loserScore, bool soccer)
    {
        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync().ConfigureAwait(false);
        if (!created)
        {
            await using var create = new NpgsqlCommand(CreateSql, connection);
            await create.ExecuteNonQueryAsync().ConfigureAwait(false);
            created = true;
        }

        await using var insert = new NpgsqlCommand(
            """
            INSERT INTO mu_plugins.guild_war (winner_id, loser_id, winner_name, loser_name, winner_score, loser_score, soccer)
            VALUES ((SELECT "Id" FROM guild."Guild" WHERE "Name" = @w), (SELECT "Id" FROM guild."Guild" WHERE "Name" = @l), @w, @l, @ws, @ls, @s)
            """,
            connection);
        insert.Parameters.AddWithValue("w", winner);
        insert.Parameters.AddWithValue("l", loser);
        insert.Parameters.AddWithValue("ws", winnerScore);
        insert.Parameters.AddWithValue("ls", loserScore);
        insert.Parameters.AddWithValue("s", soccer);
        await insert.ExecuteNonQueryAsync().ConfigureAwait(false);
    }
}
