// <copyright file="VaultSwitchChatCommandPlugIn.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameLogic.Vaults;

using System.Runtime.InteropServices;
using System.Security.Cryptography;
using Microsoft.Extensions.Logging;
using MUnique.OpenMU.DataModel.Entities;
using MUnique.OpenMU.GameLogic.PlugIns.ChatCommands;
using MUnique.OpenMU.GameLogic.Views;
using MUnique.OpenMU.Interfaces;
using MUnique.OpenMU.Persistence;
using MUnique.OpenMU.Persistence.EntityFramework;
using MUnique.OpenMU.PlugIns;
using Npgsql;

/// <summary>
/// <c>/baul N</c> (0-5): the account's vault becomes vault N, with the vault window closed. Vault 0 is the
/// account's own vault, kept in <c>mu_plugins.vault_home</c>; vaults 1-5 are <see cref="ItemStorage"/> rows
/// whose ids are derived from the account id, made the first time they are opened. Each keeps its own Zen.
/// </summary>
[Guid("3B0C8E7A-5D41-4A8E-9E0B-2C6F1D7A9B13")]
[PlugIn]
[Display(Name = "Vault switch (/baul)", Description = "/baul 0-5 switches the account between six vaults.")]
public class VaultSwitchChatCommandPlugIn : IChatCommandPlugIn
{
    private const int MaximumVault = 5;

    private const string CreateSql = """
        CREATE SCHEMA IF NOT EXISTS mu_plugins;
        CREATE TABLE IF NOT EXISTS mu_plugins.vault_home (account_id uuid PRIMARY KEY, home_vault uuid NOT NULL);
        """;

    private static string? connectionString;

    /// <inheritdoc />
    public string Key => "/baul";

    /// <inheritdoc />
    public CharacterStatus MinCharacterStatusRequirement => CharacterStatus.Normal;

    private static string ConnectionString => connectionString ??=
        new ConfigFileDatabaseConnectionStringProvider().GetConnectionSetting(typeof(EntityDataContext)).ConnectionString
        ?? throw new InvalidOperationException("OpenMU has no admin connection string.");

    /// <summary>The id of vault <paramref name="number"/> (1-5) of an account: the same every time, unique per account.</summary>
    public static Guid DerivedVaultId(Guid accountId, int number)
    {
        Span<byte> input = stackalloc byte[17];
        accountId.TryWriteBytes(input);
        input[16] = (byte)number;
        return new Guid(SHA256.HashData(input)[..16]);
    }

    /// <inheritdoc />
    public async ValueTask HandleCommandAsync(Player player, string command)
    {
        var argument = command.Length > this.Key.Length ? command[this.Key.Length..].Trim() : string.Empty;
        if (!int.TryParse(argument, out var number) || number < 0 || number > MaximumVault)
        {
            await SayAsync(player, $"Uso: /baul 0 a /baul {MaximumVault}").ConfigureAwait(false);
            return;
        }

        if (player.Account is not { } account || account is not IIdentifiable accountEntity)
        {
            return;
        }

        if (player.Vault is not null || player.PlayerState.CurrentState != PlayerState.EnteredWorld)
        {
            await SayAsync(player, "Cerrá el baúl antes de cambiar.").ConfigureAwait(false);
            return;
        }

        try
        {
            var current = account.Vault;
            var currentId = (current as IIdentifiable)?.Id ?? Guid.Empty;
            var home = await HomeVaultAsync(accountEntity.Id, currentId).ConfigureAwait(false);
            var targetId = number == 0 ? home : DerivedVaultId(accountEntity.Id, number);
            if (targetId == currentId && current is not null)
            {
                await SayAsync(player, $"Ya estás en el baúl {number}.").ConfigureAwait(false);
                return;
            }

            var context = player.PersistenceContext;
            var target = await LoadAsync(player, targetId).ConfigureAwait(false);
            var created = target is null;
            if (target is null)
            {
                target = context.CreateNew<ItemStorage>();
                if (target is IIdentifiable identifiable)
                {
                    identifiable.Id = targetId;
                }
            }

            account.Vault = target;
            if (!await player.SaveProgressAsync().ConfigureAwait(false))
            {
                account.Vault = current;
                if (created)
                {
                    await context.DeleteAsync(target).ConfigureAwait(false);
                }
                else
                {
                    Detach(context, target);
                }

                await SayAsync(player, "No se pudo cambiar de baúl. Probá de nuevo.").ConfigureAwait(false);
                return;
            }

            // The old vault is saved and no longer the account's: let it go, so loading it again later is clean.
            if (current is not null)
            {
                Detach(context, current);
            }

            await SayAsync(player, $"Ahora estás en el baúl {number}.").ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            player.Logger.LogError(ex, "Vault switch to {Number} failed for {Player}", number, player);
            await SayAsync(player, "No se pudo cambiar de baúl. Probá de nuevo.").ConfigureAwait(false);
        }
    }

    private static ValueTask SayAsync(Player player, string message)
        => player.InvokeViewPlugInAsync<IShowMessagePlugIn>(p => p.ShowMessageAsync(message, MessageType.BlueNormal));

    private static void Detach(IContext context, ItemStorage storage)
    {
        foreach (var item in storage.Items.ToList())
        {
            context.Detach(item);
        }

        context.Detach(storage);
    }

    /// <summary>
    /// The vault an account had before it ever switched: recorded on first use (the vault it has then), read after.
    /// </summary>
    private static async ValueTask<Guid> HomeVaultAsync(Guid accountId, Guid currentVault)
    {
        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync().ConfigureAwait(false);
        await using (var create = new NpgsqlCommand(CreateSql, connection))
        {
            await create.ExecuteNonQueryAsync().ConfigureAwait(false);
        }

        if (currentVault != Guid.Empty)
        {
            await using var insert = new NpgsqlCommand("INSERT INTO mu_plugins.vault_home (account_id, home_vault) VALUES (@a, @v) ON CONFLICT DO NOTHING", connection);
            insert.Parameters.AddWithValue("a", accountId);
            insert.Parameters.AddWithValue("v", currentVault);
            await insert.ExecuteNonQueryAsync().ConfigureAwait(false);
        }

        await using var select = new NpgsqlCommand("SELECT home_vault FROM mu_plugins.vault_home WHERE account_id = @a", connection);
        select.Parameters.AddWithValue("a", accountId);
        return await select.ExecuteScalarAsync().ConfigureAwait(false) is Guid home ? home : DerivedVaultId(accountId, 0);
    }

    /// <summary>Loads a vault with its items and hands it to the player's context (as the marketplace escrow adopts a box).</summary>
    private static async ValueTask<ItemStorage?> LoadAsync(Player player, Guid id)
    {
        var configuration = player.GameContext.Configuration;
        using var loader = player.GameContext.PersistenceContextProvider.CreateNewTypedContext(typeof(ItemStorage), true, configuration);
        var storage = await loader.GetByIdAsync<ItemStorage>(id).ConfigureAwait(false);
        if (storage is null)
        {
            return null;
        }

        loader.Detach(storage);
        foreach (var item in storage.Items)
        {
            loader.Detach(item);
            Marketplace.MarketplaceEscrowAction.Rehome(item, configuration);
        }

        player.PersistenceContext.Attach(storage);
        return storage;
    }
}
