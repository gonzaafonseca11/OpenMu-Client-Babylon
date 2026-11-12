// <copyright file="SocketExcellentDropPlugIn.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameLogic.SocketExcellentDrop;

using System.Runtime.InteropServices;
using Microsoft.Extensions.Logging;
using MUnique.OpenMU.DataModel.Configuration.Items;
using MUnique.OpenMU.DataModel.Entities;
using MUnique.OpenMU.GameLogic.Attributes;
using MUnique.OpenMU.GameLogic.NPC;
using MUnique.OpenMU.GameLogic.PlugIns;
using MUnique.OpenMU.PlugIns;

/// <summary>
/// LaCleon's monsters may drop an excellent socket item: OpenMU's own drops never make one
/// (DefaultDropGenerator keeps socket items out of excellent drops), so this plugin does.
/// </summary>
[Guid("8F4C2A71-5B3E-4D96-A2C8-1E7F9D0B6A35")]
[PlugIn]
[Display(Name = "Excellent socket drops (LaCleon)", Description = "LaCleon monsters drop an excellent socket item 1 in 400 kills.")]
public class SocketExcellentDropPlugIn : IAttackableGotKilledPlugIn
{
    /// <summary>The map: LaCleon.</summary>
    public const short MapNumber = 57;

    /// <summary>One drop per this many kills on average.</summary>
    public const int OneIn = 400;

    private static int kills;

    /// <inheritdoc />
    public async ValueTask AttackableGotKilledAsync(IAttackable killed, IAttacker? killer)
    {
        if (killed is not Monster monster
            || killer is not Player player
            || monster.CurrentMap is not { } map
            || map.Definition.Number != MapNumber)
        {
            return;
        }

        var count = Interlocked.Increment(ref kills);
        if (count % 100 == 0)
        {
            player.Logger.LogInformation("Socket drop: {Count} LaCleon kills so far", count);
        }

        if (Random.Shared.Next(OneIn) != 0)
        {
            return;
        }

        var level = (int)monster.Definition[Stats.Level];
        var candidates = player.GameContext.Configuration.Items
            .Where(d => d.MaximumSockets > 0 && d.DropLevel <= level)
            .ToList();
        if (candidates.Count == 0)
        {
            return;
        }

        var definition = candidates[Random.Shared.Next(candidates.Count)];
        var item = new TemporaryItem { Definition = definition };
        item.SocketCount = Random.Shared.Next(1, definition.MaximumSockets + 1);
        item.HasSkill = definition.Skill is not null;
        AddExcellentOptions(item);
        item.Durability = item.GetMaximumDurabilityOfOnePiece();

        player.Logger.LogInformation("Socket drop: {Item} with {Sockets} sockets for {Player} after {Count} kills", definition.Name, item.SocketCount, player.Name, count);
        await map.AddAsync(new DroppedItem(item, monster.Position, map, null, new object[] { player })).ConfigureAwait(false);
    }

    /// <summary>One excellent option always, more by the definition's chance, as OpenMU's excellent drops.</summary>
    private static void AddExcellentOptions(Item item)
    {
        var excellent = item.Definition!.PossibleItemOptions.FirstOrDefault(
            o => o.PossibleOptions.Any(p => Equals(p.OptionType, ItemOptionTypes.Excellent)));
        if (excellent is null)
        {
            return;
        }

        var pool = excellent.PossibleOptions.ToList();
        for (var i = 0; i < excellent.MaximumOptionsPerItem && pool.Count > 0; i++)
        {
            if (i > 0 && Random.Shared.NextDouble() >= excellent.AddChance)
            {
                continue;
            }

            var option = pool[Random.Shared.Next(pool.Count)];
            pool.Remove(option);
            item.ItemOptions.Add(new ItemOptionLink { ItemOption = option });
        }
    }
}
