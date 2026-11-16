// <copyright file="GhostSessionSweepPlugIn.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameServer.SessionSweep;

using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using Microsoft.Extensions.Logging;
using MUnique.OpenMU.GameLogic;
using MUnique.OpenMU.GameLogic.PlugIns;
using MUnique.OpenMU.PlugIns;

/// <summary>
/// Frees accounts the login server still holds for this game server while no player of that account is on it: such an
/// account answers "already connected" on every server until a restart. See ../../readme.md (Ghost sessions).
/// </summary>
[PlugIn]
[Display(Name = "Ghost Session Sweep", Description = "Every 30 s, logs off accounts the login server holds for this server while nobody of that account is on it.")]
[Guid("3f0c1a9e-5b27-4d84-a6e3-8c91d2f4b7a5")]
public class GhostSessionSweepPlugIn : IPeriodicTaskPlugIn
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(30);

    /// <summary>How long an account may be held with nobody on the server; a login takes a moment, not a minute.</summary>
    private static readonly TimeSpan Grace = TimeSpan.FromSeconds(60);

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
                server.LoggerFactory.CreateLogger(nameof(GhostSessionSweepPlugIn)).LogError(ex, "Ghost session sweep failed.");
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

    private static async Task SweepAsync(GameServerContext server, ContextState state)
    {
        var now = DateTime.UtcNow;
        var held = (await server.LoginServer.GetSnapshotAsync().ConfigureAwait(false))
            .Where(entry => entry.Value == server.Id)
            .Select(entry => entry.Key)
            .ToList();

        var present = (await server.GetPlayersAsync().ConfigureAwait(false))
            .Select(p => p.Account?.LoginName)
            .OfType<string>()
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var orphans = held.Where(account => !present.Contains(account) && !server.OfflinePlayerManager.IsActive(account)).ToList();

        // Forget accounts that got their player (a login in progress) or left the login server.
        foreach (var known in state.FirstSeen.Keys.Except(orphans, StringComparer.OrdinalIgnoreCase).ToList())
        {
            state.FirstSeen.Remove(known);
        }

        var logger = server.LoggerFactory.CreateLogger(nameof(GhostSessionSweepPlugIn));
        foreach (var account in orphans)
        {
            if (!state.FirstSeen.TryGetValue(account, out var since))
            {
                state.FirstSeen[account] = now;
                continue;
            }

            if (now - since < Grace)
            {
                continue;
            }

            state.FirstSeen.Remove(account);
            await server.LoginServer.LogOffAsync(account, server.Id).ConfigureAwait(false);
            logger.LogWarning("Ghost session freed: account {Account} was held on game server {ServerId} for over {Grace} s with nobody of it there.", account, server.Id, Grace.TotalSeconds);
        }
    }

    private sealed class ContextState
    {
        /// <summary>Only touched by the sweep, which never runs twice at once (<see cref="Running"/>).</summary>
        public readonly Dictionary<string, DateTime> FirstSeen = new(StringComparer.OrdinalIgnoreCase);

        public DateTime NextRunUtc = DateTime.UtcNow + Interval;

        public int Running;
    }
}
