// <copyright file="VipBloodCastleExperiencePlugIn.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameLogic.Vip;

using System.Runtime.InteropServices;
using MUnique.OpenMU.DataModel.Configuration;
using MUnique.OpenMU.GameLogic.MiniGames;
using MUnique.OpenMU.GameLogic.PlugIns;
using MUnique.OpenMU.PlugIns;

/// <summary>
/// Twice the Blood Castle experience on the VIP server: OpenMU gives a mini game's experience reward
/// as configured, past the server's rate, so the finishers there get the flat experience rewards again.
/// </summary>
[Guid("5C1E8A3F-2D47-4B96-9E0A-7F3B6C2D8E14")]
[PlugIn]
[Display(Name = "VIP Blood Castle experience", Description = "On the VIP server the Blood Castle experience rewards are given twice.")]
public class VipBloodCastleExperiencePlugIn : IMiniGameEndedPlugIn
{
    /// <inheritdoc />
    public async ValueTask MiniGameEndedAsync(MiniGameContext miniGame, Player? winner, IReadOnlyCollection<Player> finishers)
    {
        if (miniGame.Definition.Type != MiniGameType.BloodCastle)
        {
            return;
        }

        foreach (var player in finishers)
        {
            if (!Vip.OnVipServer(player))
            {
                continue;
            }

            var won = winner is not null && (player == winner || (player.Party is { } party && party == winner.Party));
            var extra = ExtraExperience(miniGame.Definition.Rewards, won);
            if (extra > 0)
            {
                await player.AddExperienceAsync(extra, null).ConfigureAwait(false);
            }
        }
    }

    /// <summary>The flat experience rewards a finisher got: those for everyone, and those for the winners or the losers.</summary>
    public static int ExtraExperience(IEnumerable<MiniGameReward> rewards, bool won) => rewards
        .Where(r => r.RewardType == MiniGameRewardType.Experience && r.Rank is null && r.RequiredKill is null)
        .Where(r => r.RequiredSuccess == MiniGameSuccessFlags.None
            || (r.RequiredSuccess == MiniGameSuccessFlags.WinnerOrInWinningParty && won)
            || (r.RequiredSuccess == MiniGameSuccessFlags.Loser && !won))
        .Sum(r => r.RewardAmount);
}
