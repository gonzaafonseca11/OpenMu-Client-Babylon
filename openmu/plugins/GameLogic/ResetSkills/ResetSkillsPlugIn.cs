// <copyright file="ResetSkillsPlugIn.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameLogic.ResetSkills;

using System.Runtime.InteropServices;
using MUnique.OpenMU.GameLogic.Attributes;
using MUnique.OpenMU.GameLogic.Offline;
using MUnique.OpenMU.GameLogic.PlugIns;
using MUnique.OpenMU.GameLogic.StarterGift;
using MUnique.OpenMU.GameLogic.Views.Modules;
using MUnique.OpenMU.PlugIns;

/// <summary>
/// Past a character's first real reset (the starter gift's are not), the web client lets it cast every learned
/// skill whatever the level and energy the skill asks for. The server's level and energy rows were deleted from the
/// database; the client greys them out, so this tells it, on each entry to the world, through the skills module's
/// packet. Switching it off leaves the original rule. See ../../../readme.md (Skills after a reset).
/// </summary>
[PlugIn]
[Display(Name = "Skills after a real reset", Description = "Past the first real reset (not the starter gift's), learned skills ask for no level or energy in the web client.")]
[Guid("8F2C6B19-3E47-4A5D-B071-D94E2A6C5F83")]
public class ResetSkillsPlugIn : IPlayerStateChangedPlugIn
{
    /// <summary>The web client module that hears it (src/modules/skills/resetWaiver.ts).</summary>
    public const string ModuleId = "skills";

    /// <summary>When the starter gift began: the first character it gave 10 resets was made at 23:14:32 UTC.</summary>
    public static readonly DateTime GiftStartUtc = new(2026, 11, 9, 23, 14, 0, DateTimeKind.Utc);

    /// <inheritdoc />
    public async ValueTask PlayerStateChangedAsync(Player player, State previousState, State currentState)
    {
        if (currentState != PlayerState.EnteredWorld
            || previousState != PlayerState.CharacterSelection
            || player is OfflinePlayer
            || player.SelectedCharacter is not { } character
            || player.Attributes is null)
        {
            return;
        }

        var resets = (int)player.Attributes[Stats.Resets];
        var on = HasRealReset(resets, character.CreateDate);
        await player.InvokeViewPlugInAsync<IModulePacketViewPlugIn>(p => p.SendModulePacketAsync(ModuleId, new[] { (byte)(on ? 1 : 0) })).ConfigureAwait(false);
    }

    /// <summary>Whether a character made at <paramref name="createdUtc"/> with these resets made one itself.</summary>
    public static bool HasRealReset(int resets, DateTime createdUtc)
    {
        var gifted = createdUtc.ToUniversalTime() >= GiftStartUtc ? StarterGiftPlugIn.Resets : 0;
        return resets > gifted;
    }
}
