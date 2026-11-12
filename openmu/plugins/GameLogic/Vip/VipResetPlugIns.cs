// <copyright file="VipResetPlugIns.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameLogic.Vip;

using System.Runtime.InteropServices;
using MUnique.OpenMU.DataModel.Entities;
using MUnique.OpenMU.GameLogic.NPC;
using MUnique.OpenMU.GameLogic.PlugIns;
using MUnique.OpenMU.GameLogic.PlugIns.ChatCommands;
using MUnique.OpenMU.GameLogic.Resets;
using MUnique.OpenMU.PlugIns;

/// <summary>
/// The reset level by server: 350 on the VIP server, 400 on the others. OpenMU's reset reads one level
/// for all (its ResetFeaturePlugIn is set to 350), so these take the place of its /reset command and of
/// Leo the Helper (switched off) and hold the other servers at 400 before handing over to it.
/// </summary>
internal static class VipReset
{
    public static async ValueTask ResetAsync(Player player, NonPlayerCharacter? npc)
    {
        var required = Vip.OnVipServer(player) ? Vip.VipResetLevel : Vip.NormalResetLevel;
        if (player.Level < required)
        {
            await Vip.SayAsync(player, $"Necesitás nivel {required} para hacer reset.").ConfigureAwait(false);
            return;
        }

        await new ResetCharacterAction(player, npc).ResetCharacterAsync().ConfigureAwait(false);
    }
}

/// <summary>The /reset command, at 350 on the VIP server and 400 elsewhere.</summary>
[PlugIn]
[Display(Name = "Reset command (VIP 350)", Description = "/reset at level 350 on the VIP server, 400 on the others.")]
[Guid("E7C25B90-4A13-4D6F-B8E2-9A0F3C6D1B47")]
public class VipResetChatCommandPlugIn : IChatCommandPlugIn
{
    /// <inheritdoc />
    public string Key => "/reset";

    /// <inheritdoc />
    public CharacterStatus MinCharacterStatusRequirement => CharacterStatus.Normal;

    /// <inheritdoc />
    public ValueTask HandleCommandAsync(Player player, string command) => VipReset.ResetAsync(player, null);
}

/// <summary>Leo the Helper's reset, at 350 on the VIP server and 400 elsewhere.</summary>
[PlugIn]
[Display(Name = "Reset NPC (VIP 350)", Description = "Leo the Helper resets at level 350 on the VIP server, 400 on the others.")]
[Guid("F4B8D1E6-2C95-4A3B-A7F0-5E6C8D2B9A14")]
public class VipResetNpcPlugIn : NpcTalkPlugInBase
{
    /// <inheritdoc />
    public override short DefaultNpcNumber => 371;

    /// <inheritdoc />
    protected override async ValueTask PlayerTalksToConfiguredNpcAsync(Player player, NonPlayerCharacter npc, NpcTalkEventArgs eventArgs)
    {
        eventArgs.HasBeenHandled = true;
        await VipReset.ResetAsync(player, npc).ConfigureAwait(false);
    }
}
