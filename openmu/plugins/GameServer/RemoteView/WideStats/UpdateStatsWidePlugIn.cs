// <copyright file="UpdateStatsWidePlugIn.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameServer.RemoteView.WideStats;

using System.Runtime.InteropServices;
using MUnique.OpenMU.GameServer.RemoteView.Character;
using MUnique.OpenMU.Network.PlugIns;
using MUnique.OpenMU.PlugIns;

/// <summary>
/// Health, mana, shield and ability in 32 bits (CurrentStatsExtended / MaximumStatsExtended) for our
/// Season 6 client too: the 16-bit packets wrap past 65535 and the client had to guess the real value.
/// OpenMU keeps these packets for its 106.3 client; this one only lowers the version they go to.
/// </summary>
[PlugIn]
[Display(Name = "Wide stats (32-bit health and mana)", Description = "Sends health, mana and shield past 65535 without wrapping to the browser client.")]
[Guid("C3B7E5A2-9F14-4E6D-8A21-6D0C4B9E7F18")]
[MinimumClient(6, 3, ClientLanguage.Invariant)]
public class UpdateStatsWidePlugIn : UpdateStatsExtendedPlugIn
{
    /// <summary>
    /// Initializes a new instance of the <see cref="UpdateStatsWidePlugIn"/> class.
    /// </summary>
    /// <param name="player">The player.</param>
    public UpdateStatsWidePlugIn(RemotePlayer player)
        : base(player)
    {
    }
}
