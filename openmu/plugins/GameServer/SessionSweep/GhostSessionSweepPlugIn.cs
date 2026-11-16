// <copyright file="GhostSessionSweepPlugIn.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameServer.SessionSweep;

using System.Collections.Concurrent;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using Microsoft.Extensions.Logging;
using MUnique.OpenMU.GameLogic;
using MUnique.OpenMU.GameLogic.PlugIns;
using MUnique.OpenMU.GameServer.RemoteView;
using MUnique.OpenMU.Network;
using MUnique.OpenMU.PlugIns;

/// <summary>
/// Frees accounts whose session lost its connection but never left the server (a stuck teardown):
/// such an account answers "already connected" on every server until a restart. See ../../readme.md.
/// </summary>
[PlugIn]
[Display(Name = "Ghost Session Sweep", Description = "Every 30 s, frees accounts whose connection is gone but which still count as online.")]
[Guid("3f0c1a9e-5b27-4d84-a6e3-8c91d2f4b7a5")]
public class GhostSessionSweepPlugIn : IPeriodicTaskPlugIn
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(30);

    /// <summary>How long a session may stay without a connection before it is freed; a normal teardown takes milliseconds.</summary>
    private static readonly TimeSpan Grace = TimeSpan.FromSeconds(60);

    private static readonly TimeSpan StepTimeout = TimeSpan.FromSeconds(10);

    /// <summary>`RemotePlayer.Connection` is internal to OpenMU; read once by reflection, as the login token view does.</summary>
    private static readonly PropertyInfo ConnectionProperty =
        typeof(RemotePlayer).GetProperty("Connection", BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public)
        ?? throw new MissingMemberException(nameof(RemotePlayer), "Connection");

    private readonly ConditionalWeakTable<GameContext, ContextState> _states = new();

    /// <inheritdoc />
    public ValueTask ExecuteTaskAsync(GameContext gameContext)
    {
        var state = this._states.GetValue(gameContext, _ => new ContextState());
        var now = DateTime.UtcNow;
        if (now < state.NextRunUtc || Interlocked.CompareExchange(ref state.Running, 1, 0) != 0)
        {
            return ValueTask.CompletedTask;
        }

        state.NextRunUtc = now + Interval;

        // Off the 1 s task timer: a stuck teardown may hang here too.
        _ = Task.Run(async () =>
        {
            try
            {
                await SweepAsync(gameContext, state).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                gameContext.LoggerFactory.CreateLogger(nameof(GhostSessionSweepPlugIn)).LogError(ex, "Ghost session sweep failed.");
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

    /// <summary>A remote player whose connection is gone, or whose teardown started, is a ghost while it stays in the list.</summary>
    private static bool IsGhost(RemotePlayer player) =>
        player.PlayerState.CurrentState.IsDisconnectedOrFinished()
        || ConnectionProperty.GetValue(player) is not IConnection { Connected: true };

    private static async Task SweepAsync(GameContext gameContext, ContextState state)
    {
        var now = DateTime.UtcNow;
        var players = await gameContext.GetPlayersAsync().ConfigureAwait(false);
        var ghosts = players.OfType<RemotePlayer>().Where(IsGhost).ToList();

        // Forget players that recovered or left the list.
        foreach (var known in state.FirstSeen.Keys.Where(p => !ghosts.Contains(p)).ToList())
        {
            state.FirstSeen.TryRemove(known, out _);
        }

        foreach (var ghost in ghosts)
        {
            var since = state.FirstSeen.GetOrAdd(ghost, now);
            if (now - since >= Grace)
            {
                state.FirstSeen.TryRemove(ghost, out _);
                await FreeAsync(gameContext, ghost).ConfigureAwait(false);
            }
        }
    }

    private static async Task FreeAsync(GameContext gameContext, RemotePlayer player)
    {
        var logger = gameContext.LoggerFactory.CreateLogger(nameof(GhostSessionSweepPlugIn));
        var account = player.Account?.LoginName ?? "?";
        var stateName = player.PlayerState.CurrentState.Name;

        // First the regular teardown (it saves); it does nothing when one already started and hangs.
        try
        {
            await player.DisconnectAsync().AsTask().WaitAsync(StepTimeout).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Ghost session of {Account}: the regular disconnect did not finish.", account);
        }

        // Whatever is still left: out of the player list, and off at the login server.
        try
        {
            await gameContext.RemovePlayerAsync(player).AsTask().WaitAsync(StepTimeout).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Ghost session of {Account}: could not remove it from the player list.", account);
        }

        if (gameContext is GameServerContext server && player.ReleaseLoginServerRegistration() is { } loginName)
        {
            try
            {
                await server.LoginServer.LogOffAsync(loginName, server.Id).AsTask().WaitAsync(StepTimeout).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Ghost session of {Account}: could not log it off at the login server.", account);
            }
        }

        logger.LogWarning("Ghost session freed: account {Account} (state {State}) had no connection for over {Grace} s.", account, stateName, Grace.TotalSeconds);
    }

    private sealed class ContextState
    {
        public readonly ConcurrentDictionary<RemotePlayer, DateTime> FirstSeen = new();

        public DateTime NextRunUtc = DateTime.UtcNow + Interval;

        public int Running;
    }
}
