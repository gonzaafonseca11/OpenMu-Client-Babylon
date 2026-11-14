// <copyright file="SaveAfterCraftingResultPlugIn.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameServer.RemoteView.SaveGuard;

using System.Runtime.InteropServices;
using Microsoft.Extensions.Logging;
using MUnique.OpenMU.DataModel.Entities;
using MUnique.OpenMU.GameLogic.Views.NPC;
using MUnique.OpenMU.GameServer.RemoteView.NPC;
using MUnique.OpenMU.Network.PlugIns;
using MUnique.OpenMU.PlugIns;

/// <summary>
/// OpenMU's crafting result, then a save. A mix creates items with new option links (a chaos weapon's luck and
/// option); mixed again before the periodic save, deleting the unsaved links leaves every later save of the
/// session failing (OpenMU #1478, fixed by #988 after 0.9.10). Saving here leaves nothing unsaved for the next mix.
/// </summary>
[PlugIn]
[Display(Name = "Save after a crafting result", Description = "Saves the player after each mix, so a mixed item is never deleted with unsaved options.")]
[Guid("2E9C4B71-6A3D-4F58-B0E2-91D7C5A8F346")]
[MinimumClient(6, 3, ClientLanguage.Invariant)]
public class SaveAfterCraftingResultPlugIn : IShowItemCraftingResultPlugIn
{
    private readonly RemotePlayer _player;
    private readonly ShowItemCraftingResultPlugIn _result;

    /// <summary>
    /// Initializes a new instance of the <see cref="SaveAfterCraftingResultPlugIn"/> class.
    /// </summary>
    /// <param name="player">The player.</param>
    public SaveAfterCraftingResultPlugIn(RemotePlayer player)
    {
        this._player = player;
        this._result = new ShowItemCraftingResultPlugIn(player);
    }

    /// <inheritdoc />
    public async ValueTask ShowResultAsync(CraftingResult result, Item? createdItem)
    {
        await this._result.ShowResultAsync(result, createdItem).ConfigureAwait(false);
        if (result is not (CraftingResult.Success or CraftingResult.Failed))
        {
            return;
        }

        if (!await this._player.SaveProgressAsync().ConfigureAwait(false))
        {
            this._player.Logger.LogWarning("Save guard: could not save {Player} after a mix", this._player);
        }
    }
}
