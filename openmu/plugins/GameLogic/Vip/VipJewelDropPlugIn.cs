// <copyright file="VipJewelDropPlugIn.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameLogic.Vip;

using System.Runtime.InteropServices;
using MUnique.OpenMU.DataModel.Configuration;
using MUnique.OpenMU.GameLogic.NPC;
using MUnique.OpenMU.GameLogic.PlugIns;
using MUnique.OpenMU.PlugIns;

/// <summary>
/// Twice the jewels on the VIP server: every kill there rolls the map's jewel drops a second time.
/// </summary>
[PlugIn]
[Display(Name = "VIP double jewels", Description = "Kills on the VIP server roll the map's jewel drops a second time.")]
[Guid("D3A81F5C-6B29-4E07-8C4D-2F9B7E1A0C58")]
public class VipJewelDropPlugIn : IAttackableGotKilledPlugIn
{
    /// <inheritdoc />
    public async ValueTask AttackableGotKilledAsync(IAttackable killed, IAttacker? killer)
    {
        if (killed is not Monster monster
            || killer is not Player player
            || !Vip.OnVipServer(player)
            || monster.CurrentMap is not { } map)
        {
            return;
        }

        foreach (var group in map.Definition.DropItemGroups)
        {
            if (group.ItemType != SpecialItemType.Jewel
                || group.PossibleItems.Count == 0
                || Random.Shared.NextDouble() >= group.Chance)
            {
                continue;
            }

            var definition = group.PossibleItems.ElementAt(Random.Shared.Next(group.PossibleItems.Count));
            var jewel = new TemporaryItem { Definition = definition, Durability = 1 };
            await map.AddAsync(new DroppedItem(jewel, monster.Position, map, null, new object[] { player })).ConfigureAwait(false);
            return;
        }
    }
}
