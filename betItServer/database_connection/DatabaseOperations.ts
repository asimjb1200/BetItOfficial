import pg, { Pool } from 'pg';
import { tokenLogger, userLogger } from '../loggerSetup/logSetup';
import { DatabaseUserModel, LoginResponse, UserTokens, XRPWalletInfo } from '../models/dataModels';
import { rippleApi } from '../RippleConnection/ripple_setup';
import bcrypt from 'bcrypt';
import * as tokenHandler from '../tokens/token_auth.js';

class DatabaseOperations {
    #dbConnection: Pool;
    private static _instance: DatabaseOperations;

    private constructor() {
        // connecting to the server
        // pooling helps minimizes new connections which are memory intensive, will instead use cached connections
        this.#dbConnection = new pg.Pool();
    }

    public static get Instance() {
        return this._instance || (this._instance = new this());
    }

    async login(username: string, password: string): Promise<LoginResponse> {
        const findUserQuery = 'SELECT password, username FROM users WHERE username = $1';
        const queryValues = [username];

        // can't do anything without the pw so I'll wait on it
        const user: DatabaseUserModel = await this.#dbConnection.query(findUserQuery, queryValues);
        // compare the pw to the hash I have in the db
        if (user.rows[0].password) {
            const isMatch = await bcrypt.compare(password, user.rows[0].password);
            if (isMatch) {
                try {
                    // generate and save tokens to the db
                    const tokens: UserTokens = await this.insertTokensForUser(username);
                    return {tokens, validUser: true};
                } catch (insertError) {
                    tokenLogger.error(`issue with insertTokensForUser(${username}): ` + insertError);
                    userLogger.error(`Could not generate & save tokens for ${username}`);
                    return {validUser: false};
                }
            } else {
                userLogger.warn(`Bad password attempted for: ${username}`);
                return {validUser: false};
            }
        } else {
            userLogger.info(`no password found for: ${username}. Check the login & register function`);
            return {validUser: false};
        }
    }

    logout(userName: string) {

    }

    async insertNewUser(username: string, pwHash: string, email: string) {
        // create a wallet for that user
        const userWalletInfo: XRPWalletInfo = await rippleApi.createTestWallet();

        // post the user to the database
        const insertUserQuery = 'INSERT INTO users(username, password, email, wallet_address, wallet_pk) VALUES($1, $2, $3, $4, $5) RETURNING *';
        const queryValues = [username, pwHash, email, userWalletInfo.xAddress, userWalletInfo.secret];

        await this.#dbConnection.query(insertUserQuery, queryValues);
        userLogger.info(`User created: ${username}`);
    }

    updateWalletAddr(walletAddr: string) {

    }

    removeUser(userName: string) {

    }

    generateAccessToken() {

    }

    generateRefreshToken(accessToken: string) {

    }

    async insertTokensForUser(username: string): Promise<UserTokens> {
        const { accessToken, refreshToken } = tokenHandler.generateTokens(username);
        // now save the access and refresh tokens to the user's data base
        const insertAccessTokenQuery = 'UPDATE users SET access_token=$1, refresh_token=$2 WHERE username=$3';
        const insertAccessTokenQueryValues = [accessToken, refreshToken, username];

        const insertTokensResult = await this.#dbConnection.query(insertAccessTokenQuery, insertAccessTokenQueryValues);

        return { accessToken, refreshToken };
    }

    findAccessToken(accessToken: string) {

    }

    findRefreshToken(refreshToken: string) {

    }
}

export const dbOps = DatabaseOperations.Instance;