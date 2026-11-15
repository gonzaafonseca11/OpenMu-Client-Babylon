// <copyright file="CharacterSpeedBanPlugIn.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameLogic.Bans;

using System.Runtime.InteropServices;
using Microsoft.Extensions.Logging;
using MUnique.OpenMU.DataModel.Entities;
using MUnique.OpenMU.GameLogic.PlugIns;
using MUnique.OpenMU.Persistence;
using MUnique.OpenMU.PlugIns;

/// <summary>
/// The speed check's ban, on the character instead of the account. OpenMU's own check
/// (<see cref="SpeedHackDetectPlugIn"/>) keeps counting the warnings, with its AutoBan and DisconnectOnViolation
/// off; past its MaxWarnings on a walk this one bans the playing character, records why and disconnects.
/// </summary>
[PlugIn]
[Display(Name = "Speed check: ban the character", Description = "Past the speed check's warning limit, bans the character (not the account) and records why.")]
[Guid("5C1E7B42-9A0D-4F36-8E21-B7D4C3A9F160")]
public class CharacterSpeedBanPlugIn : ISpeedHackCheatCheckPlugIn
{
    /// <inheritdoc />
    public ValueTask WalkCheatCheckAsync(Player player, Memory<WalkingStep> steps, SpeedHackCheckEventArgs eventArgs) =>
        this.BanIfOverLimitAsync(player, "caminar");

    /// <inheritdoc />
    /// <remarks>Fast skill presses trip the attack check without any cheat, so attacks never ban.</remarks>
    public ValueTask AttackCheatCheckAsync(Player player, SpeedHackCheckEventArgs eventArgs) => ValueTask.CompletedTask;

    /// <inheritdoc />
    public ValueTask ResetMovementStateAsync(Player player) => ValueTask.CompletedTask;

    private async ValueTask BanIfOverLimitAsync(Player player, string action)
    {
        var check = player.GameContext.FeaturePlugIns.GetPlugIn<SpeedHackDetectPlugIn>();
        if (check?.Configuration is not { } config
            || player.SelectedCharacter is not { } character
            || character.CharacterStatus != CharacterStatus.Normal
            || character is not IIdentifiable identifiable)
        {
            return;
        }

        var warnings = check.GetWarningCount(player);
        if (warnings <= config.MaxWarnings)
        {
            return;
        }

        character.CharacterStatus = CharacterStatus.Banned;
        var reason = $"Anti-trampas: {warnings} avisos de velocidad en {config.WarningHistoryHours} h (el último al {action})";
        player.Logger.LogError("Speed check: banning character {Character} of {Account}: {Reason}", character.Name, player.Account?.LoginName, reason);
        try
        {
            await CharacterBanStore.Instance.RecordAsync(identifiable.Id, character.Name, reason).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            player.Logger.LogError(ex, "Could not record the ban of {Character}", character.Name);
        }

        await player.SaveProgressAsync().ConfigureAwait(false);
        await player.DisconnectAsync().ConfigureAwait(false);
    }
}
