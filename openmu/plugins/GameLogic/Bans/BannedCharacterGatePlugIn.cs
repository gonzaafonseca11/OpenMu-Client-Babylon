// <copyright file="BannedCharacterGatePlugIn.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameLogic.Bans;

using System.Runtime.InteropServices;
using Microsoft.Extensions.Logging;
using MUnique.OpenMU.DataModel.Entities;
using MUnique.OpenMU.GameLogic.PlugIns;
using MUnique.OpenMU.PlugIns;

/// <summary>
/// A banned character stays out of the world. OpenMU marks <see cref="CharacterStatus.Banned"/> in the character
/// list but still lets it in; the web client refuses to connect it, and this answers any other client by
/// cancelling the entry and disconnecting.
/// </summary>
[PlugIn]
[Display(Name = "Banned character gate", Description = "A banned character may not enter the world.")]
[Guid("8F3D2A61-4B7C-4E19-A5D0-6C2B9E7F1A84")]
public class BannedCharacterGatePlugIn : IPlayerStateChangingPlugIn
{
    /// <inheritdoc />
    public ValueTask PlayerStateChangingAsync(Player player, StateMachine.StateChangeEventArgs eventArgs)
    {
        if (eventArgs.NextState != PlayerState.EnteredWorld
            || player.SelectedCharacter is not { CharacterStatus: CharacterStatus.Banned } character)
        {
            return ValueTask.CompletedTask;
        }

        player.Logger.LogInformation("Banned character {Character} kept out of the world", character.Name);
        eventArgs.Cancel = true;

        // Outside the state change, as the VIP gate does.
        _ = Task.Run(async () =>
        {
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(1)).ConfigureAwait(false);
                await player.DisconnectAsync().ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                player.Logger.LogError(ex, "Could not disconnect banned character {Character}", character.Name);
            }
        });
        return ValueTask.CompletedTask;
    }
}
