import pg, { Pool } from 'pg';
import { sportsLogger, tokenLogger, userLogger } from '../loggerSetup/logSetup.js';
import { DatabaseGameModel, DatabaseUserModel, LoginResponse, UserTokens, XRPWalletInfo } from '../models/dataModels.js';
import { rippleApi } from '../RippleConnection/ripple_setup.js';
import bcrypt from 'bcrypt';
import * as tokenHandler from '../tokens/token_auth.js';
import { bballApi } from '../SportsData/Basketball.js';

class DatabaseOperations {
    protected dbConnection: Pool;
    private static _instance: DatabaseOperations;

    protected constructor() {
        // connecting to the server
        // pooling helps minimizes new connections which are memory intensive, will instead use cached connections
        this.dbConnection = this.DatabaseConnection;
    }

    private get DatabaseConnection(): Pool {
        // this is to ensure that the same pool is reused
        return this.dbConnection ? this.dbConnection : new pg.Pool();
    }

    public static get Instance() {
        return this._instance || (this._instance = new this());
    }

    async login(username: string, password: string): Promise<LoginResponse> {
        const findUserQuery = 'SELECT password, username FROM users WHERE username = $1';
        const queryValues = [username];

        // can't do anything without the pw so I'll wait on it
        const user: DatabaseUserModel = await this.dbConnection.query(findUserQuery, queryValues);
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

    async logout(token: string) {
        const deleteQuery = 'UPDATE users SET access_token=null, refresh_token=null WHERE refresh_token = $1';
        const deleteQueryValues = [token];

        await this.dbConnection.query(deleteQuery, deleteQueryValues);
    }

    async insertNewUser(username: string, pwHash: string, email: string) {
        // create a wallet for that user
        const userWalletInfo: XRPWalletInfo = await rippleApi.createTestWallet();

        // post the user to the database
        const insertUserQuery = 'INSERT INTO users(username, password, email, wallet_address, wallet_pk) VALUES($1, $2, $3, $4, $5) RETURNING *';
        const queryValues = [username, pwHash, email, userWalletInfo.xAddress, userWalletInfo.secret];

        await this.dbConnection.query(insertUserQuery, queryValues);
        userLogger.info(`User created: ${username}`);

    }

    updateWalletAddr(walletAddr: string) {

    }

    removeUser(userName: string) {

    }

    async updateAccessToken(newAccessToken: string, oldToken: string) {
        const insertAccessTokenQuery = 'UPDATE users SET access_token=$1 WHERE refresh_token=$2';
        const insertAccessTokenQueryValues = [newAccessToken, oldToken];
        await this.dbConnection.query(insertAccessTokenQuery, insertAccessTokenQueryValues);
    }

    async insertNewTokens(accessToken: string, refreshToken: string, username: string) {
        const insertNewTokensQuery = 'UPDATE users SET access_token=$1, refresh_token=$2 WHERE username=$3';
        const insertNewTokensQueryValues = [accessToken, refreshToken, username];
        await this.dbConnection.query(insertNewTokensQuery, insertNewTokensQueryValues);
    }

    async insertTokensForUser(username: string): Promise<UserTokens> {
        const { accessToken, refreshToken } = tokenHandler.generateTokens(username);
        // now save the access and refresh tokens to the user's data base
        const insertAccessTokenQuery = 'UPDATE users SET access_token=$1, refresh_token=$2 WHERE username=$3';
        const insertAccessTokenQueryValues = [accessToken, refreshToken, username];

        const insertTokensResult = await this.dbConnection.query(insertAccessTokenQuery, insertAccessTokenQueryValues);

        return { accessToken, refreshToken };
    }

    findAccessToken(accessToken: string) {

    }

    async findRefreshToken(refreshToken: string): Promise<string|undefined> {
        const findRefresh = 'SELECT refresh_token FROM users WHERE refresh_token=$1';
        const findRefreshValues = [refreshToken];
        return (await this.dbConnection.query(findRefresh, findRefreshValues)).rows[0];
    }
}

class SportsDataOperations extends DatabaseOperations {
    private static _sportsInstance: SportsDataOperations;

    protected constructor() {
        super();
    }

    public static get SportsInstance() {
        return this._sportsInstance || (this._sportsInstance = new this());
    }

    async insertAllGamesForSeason() {
        let currentYear = new Date().getFullYear();
        const findCurrentSeason = 'SELECT season FROM games LIMIT 1';
        const games: DatabaseGameModel[] = (await this.dbConnection.query(findCurrentSeason)).rows;
        if (games.length == 0 || games[0].season !== (currentYear - 1)) {
            try {
                // grab all of the games for the season..
                const currentSznGames = await bballApi.getAllGamesForYear(--currentYear);

                // now add them to the db
                currentSznGames.data.forEach(game => {
                    
                });

            } catch (err) {
                sportsLogger.error(`Couldn't retrieve data for the ${currentYear} szn: ` + err);
            }
        }

        return games;
    }

    async checkWinner(date: Date, homeTeam: string, awayTeam: string) {

    }

    async updateGameData(gameId: number, homeScore: number, awayScore: number, winningTeam: string) {

    }
}

export const dbOps = DatabaseOperations.Instance;
export const sportOps = SportsDataOperations.SportsInstance;
