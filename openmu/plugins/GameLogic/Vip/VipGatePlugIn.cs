// <copyright file="VipGatePlugIn.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameLogic.Vip;

using System.Runtime.InteropServices;
using Microsoft.Extensions.Logging;
using MUnique.OpenMU.DataModel.Entities;
using MUnique.OpenMU.GameLogic.PlugIns;
using MUnique.OpenMU.PlugIns;

/// <summary>
/// Only VIP accounts (and game masters) play on the VIP server: anyone else entering it is told so and
/// disconnected a few seconds later.
/// </summary>
[PlugIn]
[Display(Name = "VIP server gate", Description = "Only VIP accounts may enter the VIP game server.")]
[Guid("B6E4A2D9-3C71-4F8A-9E15-7D2C0A8B4F63")]
public class VipGatePlugIn : IPlayerStateChangingPlugIn
{
    /// <inheritdoc />
    public async ValueTask PlayerStateChangingAsync(Player player, StateMachine.StateChangeEventArgs eventArgs)
    {
        if (eventArgs.NextState != PlayerState.EnteredWorld
            || !Vip.OnVipServer(player)
            || player.Account is not { } account
            || account.State is AccountState.GameMaster or AccountState.GameMasterInvisible)
        {
            return;
        }

        bool vip;
        try
        {
            vip = await Vip.IsVipAsync(account.Id).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            player.Logger.LogError(ex, "Could not check the VIP of {Account}", account.LoginName);
            vip = false;
        }

        if (vip)
        {
            return;
        }

        _ = Task.Run(async () =>
        {
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(1)).ConfigureAwait(false);
                await Vip.SayAsync(player, "Este servidor es solo para VIP. Hacete VIP en mubardo.tech").ConfigureAwait(false);
                await Task.Delay(TimeSpan.FromSeconds(4)).ConfigureAwait(false);
                await player.DisconnectAsync().ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                player.Logger.LogError(ex, "Could not send {Account} off the VIP server", account.LoginName);
            }
        });
    }
}
