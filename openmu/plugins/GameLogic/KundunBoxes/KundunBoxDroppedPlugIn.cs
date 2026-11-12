// <copyright file="KundunBoxDroppedPlugIn.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameLogic.KundunBoxes;

using System.Runtime.InteropServices;
using MUnique.OpenMU.DataModel.Configuration;
using MUnique.OpenMU.DataModel.Configuration.Items;
using MUnique.OpenMU.DataModel.Entities;
using MUnique.OpenMU.GameLogic.PlugIns;
using MUnique.OpenMU.GameLogic.Views.Character;
using MUnique.OpenMU.Pathfinding;
using MUnique.OpenMU.PlugIns;
using static MUnique.OpenMU.GameLogic.PlugIns.IItemDropPlugIn;

/// <summary>
/// Opens item boxes as OpenMU's ItemBoxDroppedPlugIn (switched off in its place), and gives the item of a
/// Box of Kundun +4 at least 2 options and of a +5 at least 3: a weapon's skill counts as one, the rest
/// are excellent options.
/// </summary>
[PlugIn]
[Display(Name = "Item boxes (Kundun +4/+5 options)", Description = "Opens item boxes; Box of Kundun +4 items get 2 options at least, +5 items 3.")]
[Guid("5E2D8B14-6A3F-4C71-9D05-B8E1F4A7C362")]
public sealed class KundunBoxDroppedPlugIn : IItemDropPlugIn
{
    /// <summary>Box of Kundun is Box of Luck (14, 11); +4 is level 11, +5 level 12.</summary>
    private static readonly Dictionary<int, int> MinimumOptions = new() { [11] = 2, [12] = 3 };

    /// <inheritdoc />
    public async ValueTask HandleItemDropAsync(Player player, Item sourceItem, Point target, ItemDropArguments cancelArgs)
    {
        if (sourceItem.Definition!.DropItems.Count <= 0
            || sourceItem.Definition!.DropItems.Where(di => di.SourceItemLevel == sourceItem.Level) is not { } itemDropGroups
            || !itemDropGroups.Any())
        {
            return;
        }

        cancelArgs.WasHandled = true;
        if (itemDropGroups.Any(g => g.RequiredCharacterLevel > player.Level))
        {
            cancelArgs.Success = false;
            return;
        }

        cancelArgs.Success = true;
        var (item, droppedMoneyAmount, dropEffect) = player.GameContext.DropGenerator.GenerateItemDrop(itemDropGroups);
        if (droppedMoneyAmount is not null)
        {
            await player.CurrentMap!.AddAsync(new DroppedMoney(droppedMoneyAmount.Value, player.Position, player.CurrentMap!)).ConfigureAwait(false);
        }

        if (item is not null)
        {
            if (sourceItem.Definition.Group == 14 && sourceItem.Definition.Number == 11
                && MinimumOptions.TryGetValue(sourceItem.Level, out var minimum))
            {
                TopUpExcellentOptions(item, minimum - (item.HasSkill ? 1 : 0));
            }

            await player.CurrentMap!.AddAsync(new DroppedItem(item, player.Position, player.CurrentMap!, player)).ConfigureAwait(false);
        }

        if (dropEffect is ItemDropEffect.Swirl)
        {
            await player.InvokeViewPlugInAsync<IShowEffectPlugIn>(p => p.ShowEffectAsync(player, IShowEffectPlugIn.EffectType.Swirl)).ConfigureAwait(false);
        }
        else if (dropEffect is not ItemDropEffect.Undefined)
        {
            await player.InvokeViewPlugInAsync<IShowItemDropEffectPlugIn>(p => p.ShowEffectAsync(dropEffect, player.Position)).ConfigureAwait(false);
        }
    }

    /// <summary>Adds random excellent options the item lacks until it has <paramref name="wanted"/> of them.</summary>
    private static void TopUpExcellentOptions(Item item, int wanted)
    {
        var excellent = item.Definition!.PossibleItemOptions.FirstOrDefault(
            o => o.PossibleOptions.Any(p => Equals(p.OptionType, ItemOptionTypes.Excellent)));
        if (excellent is null)
        {
            return;
        }

        var pool = excellent.PossibleOptions
            .Where(p => !item.ItemOptions.Any(o => Equals(o.ItemOption, p)))
            .ToList();
        var have = item.ItemOptions.Count(o => Equals(o.ItemOption?.OptionType, ItemOptionTypes.Excellent));
        while (have < wanted && have < excellent.MaximumOptionsPerItem && pool.Count > 0)
        {
            var option = pool[Random.Shared.Next(pool.Count)];
            pool.Remove(option);
            item.ItemOptions.Add(new ItemOptionLink { ItemOption = option });
            have++;
        }
    }
}
