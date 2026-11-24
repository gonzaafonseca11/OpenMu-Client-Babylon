// <copyright file="WidePointsPlugIn.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameLogic.WidePoints;

using System.Buffers.Binary;
using System.Runtime.InteropServices;
using MUnique.OpenMU.GameLogic.Offline;
using MUnique.OpenMU.GameLogic.PlugIns;
using MUnique.OpenMU.GameLogic.Views.Modules;
using MUnique.OpenMU.PlugIns;

/// <summary>
/// The character packets carry level-up points in 16 bits, so past 65535 the web client shows them wrapped
/// (66000 as 464). On each entry to the world this sends the real count to the client's hero module.
/// See ../../../readme.md (Level-up points past 65535).
/// </summary>
[PlugIn]
[Display(Name = "Level-up points past 65535", Description = "Sends the web client the real level-up points, which the 16-bit packets wrap.")]
[Guid("3B7E9D42-6A15-4C80-9F2E-5D1A8C4B7E63")]
public class WidePointsPlugIn : IPlayerStateChangedPlugIn
{
    /// <summary>The web client module that hears it (src/modules/hero/widePoints.ts).</summary>
    public const string ModuleId = "hero";

    /// <inheritdoc />
    public async ValueTask PlayerStateChangedAsync(Player player, State previousState, State currentState)
    {
        // Every entry, not only from the character list: OpenMU resends the 16-bit stats on some re-entries too.
        if (currentState != PlayerState.EnteredWorld
            || player is OfflinePlayer
            || player.SelectedCharacter is not { } character)
        {
            return;
        }

        var payload = new byte[4];
        BinaryPrimitives.WriteUInt32LittleEndian(payload, (uint)Math.Max(0, character.LevelUpPoints));
        await player.InvokeViewPlugInAsync<IModulePacketViewPlugIn>(p => p.SendModulePacketAsync(ModuleId, payload)).ConfigureAwait(false);
    }
}
