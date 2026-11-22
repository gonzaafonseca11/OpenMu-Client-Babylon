// <copyright file="FreshLoginPlugIn.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameLogic.LoginRetry;

using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using MUnique.OpenMU.GameLogic.Offline;
using MUnique.OpenMU.GameLogic.PlugIns;
using MUnique.OpenMU.PlugIns;

/// <summary>
/// A login refused as "already connected" has loaded the account into the player's context already, and OpenMU's
/// account load hands back what that context tracks instead of reading it again. The client's retry on the same
/// connection then got the copy from before the old session's last save: items it had used up were still there, and
/// using one failed every later save. Here, every login starts with that context emptied. See ../../../readme.md
/// (Login retries).
/// </summary>
[PlugIn]
[Display(Name = "Fresh login after a refusal", Description = "Each login reads the account again, not the copy an earlier refused login of the connection left behind.")]
[Guid("5B8E2D71-C4A6-4F39-9D10-7A3E6B1F8C25")]
public class FreshLoginPlugIn : IPlayerStateChangingPlugIn
{
    /// <summary>Players whose next change to <see cref="PlayerState.Authenticated"/> comes after a load of their own.</summary>
    private static readonly ConditionalWeakTable<Player, object> Loaded = new();

    private static readonly object Mark = new();

    private static readonly PropertyInfo? DbContextOf = FindDbContextProperty();

    /// <inheritdoc />
    public ValueTask PlayerStateChangingAsync(Player player, StateMachine.StateChangeEventArgs eventArgs)
    {
        // OpenMU's LoginAction changes the state first and loads the account after; the token login loads first.
        if (eventArgs.NextState == PlayerState.Authenticated
            && player is not OfflinePlayer
            && player.Account is null
            && !Loaded.TryGetValue(player, out _))
        {
            Forget(player);
        }

        return ValueTask.CompletedTask;
    }

    /// <summary>
    /// Empties the player's context before an account load of a login, so the load reads the database.
    /// </summary>
    /// <returns><c>false</c>, if OpenMU's context could not be reached (logged).</returns>
    public static bool Forget(Player player)
    {
        if (DbContextOf?.GetValue(player.PersistenceContext) is not DbContext context)
        {
            player.Logger.LogError("Fresh login: the database context of {Player} was not found; a login retry may load an old copy.", player);
            return false;
        }

        var left = context.ChangeTracker.Entries().Count();
        if (left > 0)
        {
            context.ChangeTracker.Clear();
            player.Logger.LogWarning("Fresh login: {Player} retried a login on the same connection; the {Count} records an earlier attempt had loaded are read again.", player, left);
        }

        return true;
    }

    /// <summary>
    /// For a login that loads the account before it changes the state: the change made in <paramref name="advance"/>
    /// keeps what was loaded.
    /// </summary>
    public static async ValueTask<bool> AdvanceAfterLoadAsync(Player player, Func<ValueTask<bool>> advance)
    {
        Loaded.AddOrUpdate(player, Mark);
        try
        {
            return await advance().ConfigureAwait(false);
        }
        finally
        {
            Loaded.Remove(player);
        }
    }

    private static PropertyInfo? FindDbContextProperty()
    {
        // MUnique.OpenMU.Persistence.EntityFramework.EntityFrameworkContextBase.Context is internal.
        var type = Type.GetType("MUnique.OpenMU.Persistence.EntityFramework.EntityFrameworkContextBase, MUnique.OpenMU.Persistence.EntityFramework");
        return type?.GetProperty("Context", BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);
    }
}
