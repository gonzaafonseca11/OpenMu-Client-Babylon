// <copyright file="LoginTokenAction.cs" company="MUnique">
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// </copyright>

namespace MUnique.OpenMU.GameLogic.LoginTokens;

using System.Runtime.CompilerServices;
using Microsoft.Extensions.Logging;
using MUnique.OpenMU.DataModel.Entities;
using MUnique.OpenMU.GameLogic.LoginRetry;
using MUnique.OpenMU.GameLogic.Views.Login;
using MUnique.OpenMU.GameLogic.Views.LoginTokens;
using MUnique.OpenMU.Persistence;

/// <summary>
/// The web client's saved login: issues a token after a password login, and logs an account in with one.
/// </summary>
/// <remarks>
/// The token login follows OpenMU's <c>LoginAction</c> step for step: the credentials, the ban states, the state
/// machine, an offline session's handover, the login server (reserved before the account loads, and remembered on the
/// player so its disconnect logs it off) and the "already connected" answers, then the login result. The one
/// difference: <c>LoginAction</c> holds the state machine's lock while it asks the login server, through a transition
/// context whose <c>Allowed</c> only OpenMU can set; this checks the transition first and makes it last. A
/// connection's packets are handled one at a time, so only a disconnect (or a state plugin's veto) can come between;
/// then the transition fails, the registration is released once, and the player gets <c>LoginAction</c>'s answer to a
/// refused transition. See ../../../readme.md.
/// </remarks>
public class LoginTokenAction
{
    /// <summary>The connections that already got a token: one each, so a client cannot fill the table.</summary>
    private static readonly ConditionalWeakTable<Player, object> Issued = new();

    private static readonly object Mark = new();

    private readonly LoginTokenStore _store = LoginTokenStore.Instance;

    /// <summary>
    /// A token for the account the player logged into, at the character list (E7 03).
    /// </summary>
    public async ValueTask IssueAsync(Player player)
    {
        var state = player.PlayerState.CurrentState;
        if (player.Account is not { IsTemplate: false } account
            || account is not IIdentifiable { Id: var accountId }
            || (state != PlayerState.Authenticated && state != PlayerState.CharacterSelection)
            || !Issued.TryAdd(player, Mark))
        {
            await AnswerAsync(player, LoginTokenStatus.Refused, null).ConfigureAwait(false);
            return;
        }

        try
        {
            var token = await this._store.IssueAsync(accountId, account.PasswordHash).ConfigureAwait(false);
            await AnswerAsync(player, LoginTokenStatus.Ok, token).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            player.Logger.LogError(ex, "Could not issue a login token for [{Username}].", account.LoginName);
            await AnswerAsync(player, LoginTokenStatus.Failed, null).ConfigureAwait(false);
        }
    }

    /// <summary>
    /// Logs the player in with a token instead of a password (E7 05). Answers with the login result, and on success
    /// replaces the token with a new one, sent right behind it.
    /// </summary>
    public async ValueTask LoginAsync(Player player, string username, byte[] token)
    {
        using var loggerScope = player.Logger.BeginScope(this.GetType());

        var state = await this.AuthenticateAsync(player, username, token).ConfigureAwait(false);
        if (state is null)
        {
            return;
        }

        if (!await ValidateAccountStateAsync(player, state.Value).ConfigureAwait(false))
        {
            return;
        }

        var (success, account) = await this.TryEstablishSessionAsync(player, username).ConfigureAwait(false);
        if (success && account is { })
        {
            try
            {
                await this.FinishLoginAsync(player, username, account, token).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                player.Logger.LogError(ex, "Failed to finish login for [{Username}].", username);
                await ReleaseLoginServerRegistrationAsync(player).ConfigureAwait(false);
                await ShowAsync(player, LoginResult.ConnectionError).ConfigureAwait(false);
            }
        }
    }

    /// <summary>
    /// <c>LoginAction.ReleaseLoginServerRegistrationAsync</c>: logs the account off at the login server, once. A
    /// disconnect that runs at the same time releases the same registration, so only one of them logs it off.
    /// </summary>
    private static async ValueTask ReleaseLoginServerRegistrationAsync(Player player)
    {
        if (player.ReleaseLoginServerRegistration() is not { } loginName
            || player.GameContext is not IGameServerContext gameServerContext)
        {
            return;
        }

        try
        {
            await gameServerContext.LoginServer.LogOffAsync(loginName, gameServerContext.Id).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            player.Logger.LogError(ex, "Couldn't log off [{Username}] at the login server after the failed login.", loginName);
        }
    }

    /// <summary>
    /// Reserves the account at the login server and remembers it on the player, as <c>LoginAction</c> does: OpenMU logs
    /// a disconnected player off only through that registration, so without it the account stayed "already connected"
    /// on every server until a restart.
    /// </summary>
    private static async ValueTask<bool> TryLoginAtLoginServerAsync(Player player, IGameServerContext gameServerContext, string username)
    {
        if (!await gameServerContext.LoginServer.TryLoginAsync(username, gameServerContext.Id).ConfigureAwait(false))
        {
            return false;
        }

        player.SetLoginServerRegistration(username);
        return true;
    }

    private static async ValueTask RefuseAsAlreadyConnectedAsync(Player player, IGameServerContext gameServerContext, string username)
    {
        await ShowAsync(player, LoginResult.AccountAlreadyConnected).ConfigureAwait(false);
        await gameServerContext.EventPublisher.PlayerAlreadyLoggedInAsync(gameServerContext.Id, username).ConfigureAwait(false);
    }

    private static ValueTask AnswerAsync(Player player, LoginTokenStatus status, byte[]? token)
        => player.InvokeViewPlugInAsync<ILoginTokenViewPlugIn>(p => p.SendLoginTokenAsync(status, token ?? ReadOnlyMemory<byte>.Empty));

    private static ValueTask ShowAsync(Player player, LoginResult result)
        => player.InvokeViewPlugInAsync<IShowLoginResultPlugIn>(p => p.ShowLoginResultAsync(result));

    /// <summary><c>LoginAction.ValidateAccountStateAsync</c>.</summary>
    private static async ValueTask<bool> ValidateAccountStateAsync(Player player, AccountState state)
    {
        if (state == AccountState.Banned)
        {
            await ShowAsync(player, LoginResult.AccountBlocked).ConfigureAwait(false);
            return false;
        }

        if (state == AccountState.TemporarilyBanned)
        {
            await ShowAsync(player, LoginResult.TemporaryBlocked).ConfigureAwait(false);
            return false;
        }

        return true;
    }

    /// <summary>
    /// The token in place of the password: it must be unexpired, issued to this account, under its current password.
    /// A refusal answers as a wrong password does. The account is read in a context of its own, as OpenMU's
    /// authentication reads only the state, so the player's context loads it once, in the session step.
    /// </summary>
    private async ValueTask<AccountState?> AuthenticateAsync(Player player, string username, byte[] token)
    {
        try
        {
            if (username.Length > 0 && token.Length == LoginTokenStore.TokenLength
                && await this._store.FindAsync(token).ConfigureAwait(false) is { } issued)
            {
                using var context = player.GameContext.PersistenceContextProvider.CreateNewPlayerContext(player.GameContext.Configuration);
                if (await context.GetAccountByLoginNameAsync(username).ConfigureAwait(false) is { IsTemplate: false } account
                    && account is IIdentifiable { Id: var accountId }
                    && accountId == issued.AccountId
                    && LoginTokenStore.Fingerprint(account.PasswordHash).AsSpan().SequenceEqual(issued.Fingerprint))
                {
                    return account.State;
                }
            }

            player.Logger.LogInformation("Login token refused, username: [{Username}].", username);
            await ShowAsync(player, LoginResult.InvalidPassword).ConfigureAwait(false);
            return null;
        }
        catch (Exception ex)
        {
            player.Logger.LogError(ex, "Token login failed.");
            await ShowAsync(player, LoginResult.ConnectionError).ConfigureAwait(false);
            return null;
        }
    }

    /// <summary><c>LoginAction.TryEstablishSessionAsync</c>, with the transition checked first and made last.</summary>
    private async ValueTask<(bool Success, Account? Account)> TryEstablishSessionAsync(Player player, string username)
    {
        try
        {
            if (player.PlayerState.CurrentState.PossibleTransitions?.Contains(PlayerState.Authenticated) is not true)
            {
                await HandleAlreadyConnectedAsync(player, username).ConfigureAwait(false);
                return (false, null);
            }

            if (player.GameContext is not IGameServerContext gameServerContext)
            {
                return (false, null);
            }

            Account? account;
            if (player.GameContext.OfflinePlayerManager.TryGetPlayer(username, out var offlinePlayer))
            {
                if (!offlinePlayer!.IsTemplatePlayer && !await TryLoginAtLoginServerAsync(player, gameServerContext, username).ConfigureAwait(false))
                {
                    await RefuseAsAlreadyConnectedAsync(player, gameServerContext, username).ConfigureAwait(false);
                    return (false, null);
                }

                account = await HandleOfflineSessionHandoverAsync(player, username).ConfigureAwait(false);
            }
            else
            {
                // Reserved BEFORE the load, as LoginAction does: the old session of the account saves and only then
                // logs off, so a quick reconnect (the client's resume) can't load a copy that is still being saved.
                var reserved = await TryLoginAtLoginServerAsync(player, gameServerContext, username).ConfigureAwait(false);
                FreshLoginPlugIn.Forget(player);
                account = await player.PersistenceContext.GetAccountByLoginNameAsync(username).ConfigureAwait(false);
                if (account is null)
                {
                    await ReleaseLoginServerRegistrationAsync(player).ConfigureAwait(false);
                    player.Logger.LogError("Failed to load account {Username} after authentication.", username);
                    await ShowAsync(player, LoginResult.ConnectionError).ConfigureAwait(false);
                    return (false, null);
                }

                if (account.IsTemplate)
                {
                    // Template accounts may be logged in several times at once, so they never hold the reservation.
                    await ReleaseLoginServerRegistrationAsync(player).ConfigureAwait(false);
                }
                else if (!reserved)
                {
                    await RefuseAsAlreadyConnectedAsync(player, gameServerContext, username).ConfigureAwait(false);
                    return (false, null);
                }
            }

            if (account is null
                || !await FreshLoginPlugIn.AdvanceAfterLoadAsync(player, () => player.PlayerState.TryAdvanceToAsync(PlayerState.Authenticated)).ConfigureAwait(false))
            {
                await ReleaseLoginServerRegistrationAsync(player).ConfigureAwait(false);

                if (account is not null)
                {
                    // The transition was refused after all (the player left, or a plugin said no): LoginAction's answer to that.
                    await HandleAlreadyConnectedAsync(player, username).ConfigureAwait(false);
                }

                return (false, null);
            }

            return (true, account);
        }
        catch (Exception ex)
        {
            player.Logger.LogError(ex, "Unexpected error during login through login server.");
            await ReleaseLoginServerRegistrationAsync(player).ConfigureAwait(false);
            await ShowAsync(player, LoginResult.ConnectionError).ConfigureAwait(false);
            return (false, null);
        }
    }

    /// <summary><c>LoginAction.HandleOfflineSessionHandoverAsync</c>.</summary>
    private static async ValueTask<Account?> HandleOfflineSessionHandoverAsync(Player player, string username)
    {
        player.Logger.LogInformation("Account {Username} has an active offline session. Stopping it and reloading account data.", username);

        try
        {
            await player.GameContext.OfflinePlayerManager.StopAsync(username).ConfigureAwait(false);
            FreshLoginPlugIn.Forget(player);
            var account = await player.PersistenceContext.GetAccountByLoginNameAsync(username).ConfigureAwait(false);
            if (account is null)
            {
                player.Logger.LogError("Failed to reload account {Username} after stopping offline session.", username);
                await ShowAsync(player, LoginResult.ConnectionError).ConfigureAwait(false);
            }

            return account;
        }
        catch (Exception ex)
        {
            player.Logger.LogError(ex, "Failed to reload account {Username} after stopping offline session.", username);
            await ShowAsync(player, LoginResult.ConnectionError).ConfigureAwait(false);
            return null;
        }
    }

    /// <summary><c>LoginAction.HandleAlreadyConnectedAsync</c>.</summary>
    private static async ValueTask HandleAlreadyConnectedAsync(Player player, string username)
    {
        var result = player.LoginResultOverride ?? LoginResult.AccountAlreadyConnected;
        player.LoginResultOverride = null;
        await ShowAsync(player, result).ConfigureAwait(false);
        if (player.GameContext is IGameServerContext gameServerContext)
        {
            await gameServerContext.EventPublisher.PlayerAlreadyLoggedInAsync(gameServerContext.Id, username).ConfigureAwait(false);
        }
    }

    /// <summary><c>LoginAction.FinishLoginAsync</c>, then the used token is replaced and the new one sent.</summary>
    private async ValueTask FinishLoginAsync(Player player, string username, Account account, byte[] usedToken)
    {
        await player.SetAccountAsync(account).ConfigureAwait(false);
        player.Logger.LogDebug("Token login successful, username: [{Username}].", username);

        byte[]? next = null;
        try
        {
            if (account is IIdentifiable { Id: var accountId })
            {
                next = await this._store.IssueAsync(accountId, account.PasswordHash, usedToken).ConfigureAwait(false);
            }
        }
        catch (Exception ex)
        {
            // The login stands; the client keeps the token it has, which still works.
            player.Logger.LogError(ex, "Could not replace the login token of [{Username}].", username);
        }

        Issued.AddOrUpdate(player, Mark);
        await ShowAsync(player, LoginResult.Ok).ConfigureAwait(false);
        await AnswerAsync(player, next is null ? LoginTokenStatus.Failed : LoginTokenStatus.Ok, next).ConfigureAwait(false);
    }
}
