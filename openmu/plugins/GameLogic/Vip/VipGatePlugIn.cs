// <copyright file="VipGatePlugIn.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameLogic.Vip;

using System.Runtime.InteropServices;
using Microsoft.Extensions.Logging;
using MUnique.OpenMU.DataModel.Entities;
using MUnique.OpenMU.GameLogic.PlugIns;
using MUnique.OpenMU.GameLogic.Views.Login;
using MUnique.OpenMU.Persistence;
using MUnique.OpenMU.PlugIns;

/// <summary>
/// Only VIP accounts (and game masters) play on the VIP server. Right after the password, before the
/// character list, anyone else gets the login answer NoChargeInfo (the client says "VIP only") and is
/// disconnected; the account is not known earlier than that.
/// </summary>
[PlugIn]
[Display(Name = "VIP server gate", Description = "Only VIP accounts may enter the VIP game server.")]
[Guid("B6E4A2D9-3C71-4F8A-9E15-7D2C0A8B4F63")]
public class VipGatePlugIn : IPlayerStateChangingPlugIn
{
    /// <inheritdoc />
    public async ValueTask PlayerStateChangingAsync(Player player, StateMachine.StateChangeEventArgs eventArgs)
    {
        if ((eventArgs.NextState != PlayerState.CharacterSelection && eventArgs.NextState != PlayerState.EnteredWorld)
            || !Vip.OnVipServer(player)
            || player.Account is not { } account
            || account is not IIdentifiable identifiable
            || account.State is AccountState.GameMaster or AccountState.GameMasterInvisible)
        {
            return;
        }

        bool vip;
        try
        {
            vip = await Vip.IsVipAsync(identifiable.Id).ConfigureAwait(false);
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

        player.Logger.LogInformation("VIP gate: {Account} is not VIP, sent off the VIP server", account.LoginName);
        eventArgs.Cancel = true;
        await player.InvokeViewPlugInAsync<IShowLoginResultPlugIn>(p => p.ShowLoginResultAsync(LoginResult.NoChargeInfo)).ConfigureAwait(false);
        _ = Task.Run(async () =>
        {
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(2)).ConfigureAwait(false);
                await player.DisconnectAsync().ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                player.Logger.LogError(ex, "Could not send {Account} off the VIP server", account.LoginName);
            }
        });
    }
}
