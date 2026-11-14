// <copyright file="SaveBeforeMixPlugIn.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameLogic.SaveGuard;

using System.Runtime.InteropServices;
using Microsoft.Extensions.Logging;
using MUnique.OpenMU.DataModel.Entities;
using MUnique.OpenMU.GameLogic.PlugIns;
using MUnique.OpenMU.PlugIns;

/// <summary>
/// Saves the player when an item goes into a mix tray (the chaos machine and the other NPC trays). An option a
/// jewel just added is still unsaved there; a mix deleting that item would leave every later save of the session
/// failing (OpenMU #1478, fixed by #988 after 0.9.10). See SaveAfterCraftingResultPlugIn for the other half.
/// </summary>
[PlugIn]
[Display(Name = "Save before a mix", Description = "Saves the player when an item is put into a mix tray, so a mix never deletes unsaved options.")]
[Guid("7B1F3E85-2C64-4A9D-8E07-D5A6C2B9F413")]
public class SaveBeforeMixPlugIn : IItemMovedPlugIn
{
    /// <inheritdoc />
    public async ValueTask ItemMovedAsync(Player player, Item item)
    {
        if (player.TemporaryStorage?.Items.Contains(item) != true)
        {
            return;
        }

        if (!await player.SaveProgressAsync().ConfigureAwait(false))
        {
            player.Logger.LogWarning("Save guard: could not save {Player} before a mix", player);
        }
    }
}
