// <copyright file="Vip.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameLogic.Vip;

using System.Collections.Concurrent;
using MUnique.OpenMU.GameLogic.Views;
using MUnique.OpenMU.Interfaces;
using MUnique.OpenMU.Persistence.EntityFramework;
using Npgsql;

/// <summary>
/// The VIP game server and who may play on it: <c>mu_plugins.vip</c> holds each VIP account's end date,
/// written by the website (GM panel, and later the Mercado Pago subscription).
/// </summary>
public static class Vip
{
    /// <summary>The VIP game server's id (GameServerDefinition.ServerID): 0 No PvP, 1 Bardo PvP, 2 VIP.</summary>
    public const byte ServerId = 2;

    /// <summary>The reset level on the VIP server; the others keep <see cref="NormalResetLevel"/>.</summary>
    public const int VipResetLevel = 350;

    /// <summary>The reset level everywhere else.</summary>
    public const int NormalResetLevel = 400;

    /// <summary>The table; the installer creates it too (install/cli/siteRole.ts), so the site can write it.</summary>
    public const string CreateSql = """
        CREATE SCHEMA IF NOT EXISTS mu_plugins;
        CREATE TABLE IF NOT EXISTS mu_plugins.vip (account_id uuid PRIMARY KEY, until timestamptz NOT NULL, auto_renew boolean NOT NULL DEFAULT false, subscription_id text, updated_at timestamptz NOT NULL DEFAULT now());
        """;

    private static readonly ConcurrentDictionary<Guid, (bool Vip, DateTime CheckedAt)> Cache = new();

    private static string? connectionString;

    private static bool created;

    private static string ConnectionString => connectionString ??=
        new ConfigFileDatabaseConnectionStringProvider().GetConnectionSetting(typeof(EntityDataContext)).ConnectionString
        ?? throw new InvalidOperationException("OpenMU has no admin connection string.");

    /// <summary>Whether the player is on the VIP game server.</summary>
    public static bool OnVipServer(Player player) => (player.GameContext as IGameServerContext)?.Id == ServerId;

    /// <summary>Whether the account's VIP runs now; asked of the database at most once a minute per account.</summary>
    public static async ValueTask<bool> IsVipAsync(Guid accountId)
    {
        if (Cache.TryGetValue(accountId, out var hit) && DateTime.UtcNow - hit.CheckedAt < TimeSpan.FromMinutes(1))
        {
            return hit.Vip;
        }

        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync().ConfigureAwait(false);
        if (!created)
        {
            await using var create = new NpgsqlCommand(CreateSql, connection);
            await create.ExecuteNonQueryAsync().ConfigureAwait(false);
            created = true;
        }

        await using var command = new NpgsqlCommand("SELECT EXISTS (SELECT 1 FROM mu_plugins.vip WHERE account_id = @id AND until > now())", connection);
        command.Parameters.AddWithValue("id", accountId);
        var vip = (bool)(await command.ExecuteScalarAsync().ConfigureAwait(false) ?? false);
        Cache[accountId] = (vip, DateTime.UtcNow);
        return vip;
    }

    /// <summary>A blue system message to the player.</summary>
    public static ValueTask SayAsync(Player player, string message)
        => player.InvokeViewPlugInAsync<IShowMessagePlugIn>(p => p.ShowMessageAsync(message, MessageType.BlueNormal));
}
