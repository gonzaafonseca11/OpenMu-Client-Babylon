// <copyright file="GhostPlayerSweepPlugIn.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameServer.SessionSweep;

using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using Microsoft.Extensions.Logging;
using MUnique.OpenMU.GameLogic;
using MUnique.OpenMU.GameLogic.Offline;
using MUnique.OpenMU.GameLogic.PlugIns;
using MUnique.OpenMU.GameServer.RemoteView;
using MUnique.OpenMU.Network;
using MUnique.OpenMU.PlugIns;

/// <summary>
/// Takes ghost players out of the game: an offline session the offline manager no longer holds, or a player whose
/// connection is gone, still on the server after a minute. A ghost kept playing a copy of a character beside the
/// real one, and its every save failed on the items the real one changed. See ../../readme.md (Ghost players).
/// </summary>
[PlugIn]
[Display(Name = "Ghost Player Sweep", Description = "Every 30 s, removes (without saving) offline sessions nobody holds and players whose connection is gone.")]
[Guid("A8D35F1C-7E24-4B96-8C0F-2D61E9B4A57E")]
public class GhostPlayerSweepPlugIn : IPeriodicTaskPlugIn
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(30);

    /// <summary>How long a player may look like a ghost first: a handover or a disconnect takes seconds.</summary>
    private static readonly TimeSpan Grace = TimeSpan.FromSeconds(60);

    private static readonly PropertyInfo? ConnectionOf = typeof(RemotePlayer).GetProperty("Connection", BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);

    private readonly ConditionalWeakTable<GameContext, ContextState> _states = new();

    /// <inheritdoc />
    public ValueTask ExecuteTaskAsync(GameContext gameContext)
    {
        if (gameContext is not GameServerContext server)
        {
            return ValueTask.CompletedTask;
        }

        var state = this._states.GetValue(gameContext, _ => new ContextState());
        var now = DateTime.UtcNow;
        if (now < state.NextRunUtc || Interlocked.CompareExchange(ref state.Running, 1, 0) != 0)
        {
            return ValueTask.CompletedTask;
        }

        state.NextRunUtc = now + Interval;
        _ = Task.Run(async () =>
        {
            try
            {
                await SweepAsync(server, state).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                server.LoggerFactory.CreateLogger(nameof(GhostPlayerSweepPlugIn)).LogError(ex, "Ghost player sweep failed.");
            }
            finally
            {
                Volatile.Write(ref state.Running, 0);
            }
        });

        return ValueTask.CompletedTask;
    }

    /// <inheritdoc />
    public void ForceStart()
    {
    }

    /// <summary>
    /// Whether the player is a ghost: an offline session other than the one the manager holds for its account, or a
    /// client player whose connection is gone.
    /// </summary>
    internal static bool IsGhost(Player player, OfflinePlayerManager manager)
    {
        if (player.Account is not { IsTemplate: false } account)
        {
            return false;
        }

        if (player is OfflinePlayer)
        {
            return !manager.TryGetPlayer(account.LoginName, out var held) || !ReferenceEquals(held, player);
        }

        // The disconnect clears the connection (null), so a missing one is gone too.
        return player is RemotePlayer && ConnectionOf is not null && ConnectionOf.GetValue(player) is not IConnection { Connected: true };
    }

    private static async Task SweepAsync(GameServerContext server, ContextState state)
    {
        var now = DateTime.UtcNow;
        var ghosts = (await server.GetPlayersAsync().ConfigureAwait(false))
            .Where(p => IsGhost(p, server.OfflinePlayerManager))
            .ToList();

        foreach (var gone in state.FirstSeen.Keys.Where(p => !ghosts.Contains(p)).ToList())
        {
            state.FirstSeen.Remove(gone);
        }

        var logger = server.LoggerFactory.CreateLogger(nameof(GhostPlayerSweepPlugIn));
        foreach (var ghost in ghosts)
        {
            if (!state.FirstSeen.TryGetValue(ghost, out var since))
            {
                state.FirstSeen[ghost] = now;
                continue;
            }

            if (now - since < Grace)
            {
                continue;
            }

            state.FirstSeen.Remove(ghost);

            // Disposing removes it from the game and its map and drops its context: nothing of the ghost is saved.
            logger.LogWarning("Ghost player removed: {Player} ({Type}) was on game server {ServerId} for over {Grace} s.", ghost, ghost.GetType().Name, server.Id, Grace.TotalSeconds);
            await ghost.DisposeAsync().ConfigureAwait(false);
        }
    }

    private sealed class ContextState
    {
        /// <summary>Only touched by the sweep, which never runs twice at once (<see cref="Running"/>).</summary>
        public readonly Dictionary<Player, DateTime> FirstSeen = new(ReferenceEqualityComparer.Instance);

        public DateTime NextRunUtc = DateTime.UtcNow + Interval;

        public int Running;
    }
}
