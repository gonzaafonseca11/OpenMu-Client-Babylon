// <copyright file="VipWelcomePlugIn.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameLogic.Vip;

using System.Globalization;
using System.Runtime.InteropServices;
using Microsoft.Extensions.Logging;
using MUnique.OpenMU.DataModel.Entities;
using MUnique.OpenMU.GameLogic.PlugIns;
using MUnique.OpenMU.GameLogic.Views.Inventory;
using MUnique.OpenMU.Persistence;
using MUnique.OpenMU.PlugIns;

/// <summary>
/// On entering the world, on any server, a VIP is told until when the VIP runs; the first time after
/// a paid VIP, the account also gets a Box of Kundun +4 (in the inventory, or at the feet when full).
/// </summary>
[PlugIn]
[Display(Name = "VIP welcome", Description = "Tells a VIP until when it runs and gives a Box of Kundun +4 once after the first payment.")]
[Guid("A9D5C3E1-7F42-4B8D-9C26-1E8F4A7B3D50")]
public class VipWelcomePlugIn : IPlayerStateChangedPlugIn
{
    private const byte BoxGroup = 14;

    private const short BoxNumber = 11;

    /// <summary>Box of Kundun +4.</summary>
    private const byte GiftLevel = 11;

    /// <inheritdoc />
    public async ValueTask PlayerStateChangedAsync(Player player, State previousState, State currentState)
    {
        if (currentState != PlayerState.EnteredWorld
            || player.Account is not { } account
            || account is not IIdentifiable identifiable)
        {
            return;
        }

        try
        {
            if (await Vip.UntilAsync(identifiable.Id).ConfigureAwait(false) is not { } until)
            {
                return;
            }

            var date = until.ToLocalTime().ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
            await Vip.SayAsync(player, $"VIP activo hasta el {date}.").ConfigureAwait(false);

            if (await Vip.ClaimGiftAsync(identifiable.Id).ConfigureAwait(false))
            {
                await this.GiveGiftAsync(player).ConfigureAwait(false);
                player.Logger.LogInformation("VIP gift given to {Account}", account.LoginName);
            }
        }
        catch (Exception ex)
        {
            player.Logger.LogError(ex, "VIP welcome failed for {Account}", account.LoginName);
        }
    }

    private async ValueTask GiveGiftAsync(Player player)
    {
        var definition = player.GameContext.Configuration.Items.FirstOrDefault(d => d.Group == BoxGroup && d.Number == BoxNumber)
            ?? throw new InvalidOperationException("There is no Box of Kundun.");
        var item = player.PersistenceContext.CreateNew<Item>();
        item.Definition = definition;
        item.Level = GiftLevel;
        item.Durability = 1;
        if (player.Inventory is { } inventory && await inventory.AddItemAsync(item).ConfigureAwait(false))
        {
            await player.InvokeViewPlugInAsync<IItemAppearPlugIn>(p => p.ItemAppearAsync(item)).ConfigureAwait(false);
            await Vip.SayAsync(player, "Regalo VIP: una Caja Kundun +4 en tu inventario. ¡Gracias por suscribirte!").ConfigureAwait(false);
        }
        else if (player.CurrentMap is { } map)
        {
            await map.AddAsync(new DroppedItem(item, player.Position, map, player, player.GetAsEnumerable())).ConfigureAwait(false);
            await Vip.SayAsync(player, "Regalo VIP: una Caja Kundun +4 a tus pies (tu inventario está lleno).").ConfigureAwait(false);
        }

        await player.SaveProgressAsync().ConfigureAwait(false);
    }
}
