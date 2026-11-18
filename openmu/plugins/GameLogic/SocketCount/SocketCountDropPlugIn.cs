// <copyright file="SocketCountDropPlugIn.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameLogic.SocketCount;

using System.ComponentModel;
using System.Runtime.InteropServices;
using MUnique.OpenMU.DataModel.Configuration.Items;
using MUnique.OpenMU.DataModel.Entities;
using MUnique.OpenMU.GameLogic.NPC;
using MUnique.OpenMU.GameLogic.PlugIns;
using MUnique.OpenMU.PlugIns;

/// <summary>
/// A monster's socket drop takes its socket count from a falling scale (1: 50 %, 2: 30 %, 3: 15 %,
/// 4: 4 %, 5: 1 %) instead of OpenMU's even roll, capped by the item's maximum. It runs before the
/// item lands, so the floor shows the same sockets the bag will.
/// </summary>
[Guid("3D7B9E14-6A2F-4C85-B1E0-92F4A7C6D8B3")]
[PlugIn]
[Display(Name = "Socket count by chance", Description = "Monster socket drops: 1 socket 50 %, 2 30 %, 3 15 %, 4 4 %, 5 1 % (capped by the item).")]
public class SocketCountDropPlugIn : IMonsterItemDropPlugIn
{
    /// <summary>Weight of 1, 2, 3, 4 and 5 sockets, in percent.</summary>
    public static readonly int[] Weights = [50, 30, 15, 4, 1];

    /// <inheritdoc />
    public void ItemDropping(AttackableNpcBase monster, Player killer, Item item, CancelEventArgs eventArgs)
    {
        // A generated drop is a TemporaryItem; a player's own item keeps its sockets.
        if (item is TemporaryItem { SocketCount: > 0 } && item.Definition is { MaximumSockets: > 0 } definition)
        {
            item.SocketCount = RollFor(definition);
        }
    }

    /// <summary>A socket count for a new drop of this item.</summary>
    public static int RollFor(ItemDefinition definition) => Math.Min(Roll(Random.Shared.Next(100)), definition.MaximumSockets);

    /// <summary>The socket count for a roll in [0, 100).</summary>
    public static int Roll(int roll)
    {
        for (var i = 0; i < Weights.Length; i++)
        {
            roll -= Weights[i];
            if (roll < 0)
            {
                return i + 1;
            }
        }

        return 1;
    }
}
