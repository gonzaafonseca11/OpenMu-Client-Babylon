// <copyright file="SaveUnsavedDropPlugIn.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameLogic.SaveGuard;

using System.Reflection;
using System.Runtime.InteropServices;
using Microsoft.Extensions.Logging;
using MUnique.OpenMU.GameLogic.PlugIns;
using MUnique.OpenMU.PlugIns;

/// <summary>
/// Saves the player a new, never saved item was dropped for (a quest reward on a full inventory, an event
/// reward). Picked up unsaved, OpenMU attaches it as saved and every later save of the session fails on its
/// option links. See ../../../readme.md (Save guard).
/// </summary>
[PlugIn]
[Display(Name = "Save an unsaved drop", Description = "Saves the player when a new item is dropped for them, so picking it up never breaks their saves.")]
[Guid("C4E91D27-6B3A-4F58-A2D0-9E17B5C8F346")]
public class SaveUnsavedDropPlugIn : IObjectAddedToMapPlugIn
{
    private static readonly FieldInfo? Dropper = typeof(DroppedItem).GetField("_dropper", BindingFlags.Instance | BindingFlags.NonPublic);

    private static readonly FieldInfo? Persisted = typeof(DroppedItem).GetField("_wasItemPersisted", BindingFlags.Instance | BindingFlags.NonPublic);

    /// <inheritdoc />
    public async ValueTask ObjectAddedToMapAsync(GameMap map, ILocateable addedObject)
    {
        // A player's own drop (DropItemAction) was saved first; a generated drop is a TemporaryItem.
        if (addedObject is not DroppedItem { Item: not TemporaryItem } dropped
            || Persisted?.GetValue(dropped) is not false
            || Dropper?.GetValue(dropped) is not Player player)
        {
            return;
        }

        if (!await player.SaveProgressAsync().ConfigureAwait(false))
        {
            player.Logger.LogWarning("Save guard: could not save {Player} after {Item} was dropped for them", player, dropped);
        }
    }
}
