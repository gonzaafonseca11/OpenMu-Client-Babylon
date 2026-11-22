// <copyright file="OfflineAcrossServersPlugIn.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameLogic.OfflineHandover;

using System.Collections.Concurrent;
using System.Reflection;
using System.Runtime.InteropServices;
using Microsoft.Extensions.Logging;
using MUnique.OpenMU.GameLogic.Offline;
using MUnique.OpenMU.GameLogic.PlugIns;
using MUnique.OpenMU.PlugIns;

/// <summary>
/// A login stops the account's offline session only on its own game server. Logging in on another one left the
/// offline character playing there too: two copies of one character, both saving. Here, a login that reaches the
/// character list ends the account's offline sessions on the other game servers, without saving them: the login
/// already loaded the character, so their unsaved last minute is what is given up. See ../../readme.md (Offline
/// sessions across servers).
/// </summary>
[PlugIn]
[Display(Name = "Offline session across servers", Description = "A login on one game server ends the account's offline session on the others.")]
[Guid("E2B7C4A9-5D13-4F86-9A20-6C8E1F3B7D54")]
public class OfflineAcrossServersPlugIn : IPlayerStateChangingPlugIn
{
    private static readonly ConcurrentDictionary<IGameContext, byte> Contexts = new();

    private static readonly FieldInfo? ActivePlayersField = typeof(OfflinePlayerManager).GetField("_activePlayers", BindingFlags.Instance | BindingFlags.NonPublic);

    private static readonly FieldInfo? IntelligenceField = typeof(OfflinePlayer).GetField("_intelligence", BindingFlags.Instance | BindingFlags.NonPublic);

    /// <inheritdoc />
    public async ValueTask PlayerStateChangingAsync(Player player, StateMachine.StateChangeEventArgs eventArgs)
    {
        // Every game server shows up here as soon as anybody on it changes state; an offline session starts with one.
        Contexts.TryAdd(player.GameContext, 0);
        if (eventArgs.NextState != PlayerState.CharacterSelection
            || player is OfflinePlayer
            || player.Account is not { IsTemplate: false, LoginName: { } loginName })
        {
            return;
        }

        foreach (var other in Contexts.Keys)
        {
            if (!ReferenceEquals(other, player.GameContext)
                && other.OfflinePlayerManager.TryGetPlayer(loginName, out var offline)
                && offline is not null)
            {
                await EndAsync(other, loginName, offline, player).ConfigureAwait(false);
            }
        }
    }

    private static async ValueTask EndAsync(IGameContext context, string loginName, OfflinePlayer offline, Player newPlayer)
    {
        var logger = newPlayer.Logger;
        if (ActivePlayersField?.GetValue(context.OfflinePlayerManager) is not ConcurrentDictionary<string, OfflinePlayer> active)
        {
            logger.LogError("Offline session across servers: OpenMU's OfflinePlayerManager._activePlayers was not found; the offline session of {Account} keeps running.", loginName);
            return;
        }

        if (!active.TryRemove(new KeyValuePair<string, OfflinePlayer>(loginName, offline)))
        {
            return;
        }

        logger.LogWarning("Offline session across servers: {Account} logged in on another game server; its offline session there ends unsaved.", loginName);
        try
        {
            // Out of the world first, so its helper stops acting; then the helper, the game and the player go.
            await offline.PlayerState.TryAdvanceToAsync(PlayerState.Disconnected).ConfigureAwait(false);
            if (IntelligenceField?.GetValue(offline) is IAsyncDisposable intelligence)
            {
                IntelligenceField.SetValue(offline, null);
                await intelligence.DisposeAsync().ConfigureAwait(false);
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Offline session across servers: could not stop the helper of {Account}.", loginName);
        }
        finally
        {
            await context.RemovePlayerAsync(offline).ConfigureAwait(false);
            await offline.DisposeAsync().ConfigureAwait(false);
        }
    }
}
