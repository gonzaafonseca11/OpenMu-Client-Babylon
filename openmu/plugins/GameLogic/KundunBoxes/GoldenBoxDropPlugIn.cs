// <copyright file="GoldenBoxDropPlugIn.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameLogic.KundunBoxes;

using System.Runtime.InteropServices;
using MUnique.OpenMU.DataModel.Configuration;
using MUnique.OpenMU.GameLogic.NPC;
using MUnique.OpenMU.GameLogic.PlugIns;
using MUnique.OpenMU.PlugIns;

/// <summary>
/// The golden monsters' Box of Kundun. Invasion goldens drop +4 (the common ones) or +5 (the bosses);
/// the 15 goldens that live on a map all the time drop +1, +2 or +3 by the map. The monsters have no
/// drop groups of their own, so this is their only drop.
/// </summary>
[PlugIn]
[Display(Name = "Golden monster boxes", Description = "Invasion goldens drop Box of Kundun +4/+5, map goldens +1/+2/+3 by map.")]
[Guid("A9C3F6E1-2D48-4B7A-8E50-3F1D6C9B2A74")]
public class GoldenBoxDropPlugIn : IAttackableGotKilledPlugIn
{
    /// <summary>Box of Kundun +N is Box of Luck (14, 11) at level N + 7.</summary>
    private const byte BoxGroup = 14;

    private const short BoxNumber = 11;

    /// <summary>Invasion golden monster number to box level: the 20-strong ones +4, the 10-strong +5.</summary>
    private static readonly Dictionary<short, byte> InvasionBox = new()
    {
        [43] = 11, [78] = 11, [54] = 11, [81] = 11, [83] = 11,
        [53] = 12, [79] = 12, [80] = 12, [82] = 12,
    };

    /// <summary>Map number to the box level its own goldens drop.</summary>
    private static readonly Dictionary<short, byte> MapBox = new()
    {
        [0] = 8, [3] = 8, [51] = 8, // Lorencia, Noria, Elvenland: +1
        [2] = 9, [1] = 9, [7] = 9, // Devias, Dungeon, Atlans: +2
        [4] = 10, [8] = 10, [10] = 10, // Lost Tower, Tarkan, Icarus: +3
    };

    /// <inheritdoc />
    public async ValueTask AttackableGotKilledAsync(IAttackable killed, IAttacker? killer)
    {
        if (killed is not Monster monster
            || killer is not Player player
            || monster.CurrentMap is not { } map
            || !InvasionBox.TryGetValue(monster.Definition.Number, out var invasionLevel))
        {
            return;
        }

        byte level;
        if (monster.SpawnArea.SpawnTrigger == SpawnTrigger.Automatic)
        {
            if (!MapBox.TryGetValue(map.Definition.Number, out level))
            {
                return;
            }
        }
        else
        {
            level = invasionLevel;
        }

        var definition = player.GameContext.Configuration.Items.FirstOrDefault(d => d.Group == BoxGroup && d.Number == BoxNumber);
        if (definition is null)
        {
            return;
        }

        var box = new TemporaryItem { Definition = definition, Level = level, Durability = 1 };
        await map.AddAsync(new DroppedItem(box, monster.Position, map, null, new object[] { player })).ConfigureAwait(false);
    }
}
