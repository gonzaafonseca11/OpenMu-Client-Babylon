// <copyright file="StarterGiftPlugIn.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameLogic.StarterGift;

using System.Runtime.InteropServices;
using MUnique.OpenMU.GameLogic.Attributes;
using MUnique.OpenMU.GameLogic.PlugIns;
using MUnique.OpenMU.Persistence;
using MUnique.OpenMU.PlugIns;

/// <summary>
/// A temporary welcome gift: a new character starts as if it had made <see cref="Resets"/> resets,
/// with their points. Switch it off in the admin panel's plugin list when the promotion ends.
/// </summary>
[Guid("3C8E1A57-9D24-4F6B-A0E3-7B5D2C9F1E84")]
[PlugIn]
[Display(Name = "Starter gift (10 resets)", Description = "New characters start with 10 resets and 5000 points.")]
public class StarterGiftPlugIn : ICharacterCreatedPlugIn
{
    /// <summary>The gifted resets; the website's monthly ranking does not count them (site/server/monthly.ts).</summary>
    public const int Resets = 10;

    /// <summary>The points a character holds after 10 resets at 500 points per reset.</summary>
    public const int Points = 5000;

    /// <inheritdoc />
    public void CharacterCreated(Account account, Character createdCharacter, IContext persistenceContext, GameConfiguration gameConfiguration, ILogger logger)
    {
        var resets = createdCharacter.Attributes.FirstOrDefault(a => a.Definition == Stats.Resets);
        if (resets is null || resets.Value > 0)
        {
            return;
        }

        resets.Value = Resets;
        createdCharacter.LevelUpPoints += Points;
    }
}
