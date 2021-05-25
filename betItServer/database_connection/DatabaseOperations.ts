import pg, { Pool, Notification } from 'pg';
import createSubscriber from "pg-listen"
import { sportsLogger, tokenLogger, userLogger } from '../loggerSetup/logSetup.js';
import { DatabaseGameModel, DatabaseUserModel, GameToday, LoginResponse, UserTokens, wagerWinners, XRPWalletInfo } from '../models/dataModels.js';
import { rippleApi } from '../RippleConnection/ripple_setup.js';
import bcrypt from 'bcrypt';
import * as tokenHandler from '../tokens/token_auth.js';
import { bballApi } from '../SportsData/Basketball.js';
import { GameModel, WagerModel, WagerNotification } from '../models/dbModels/dbModels.js';
const db_url = process.env.DATABASE_URL ? process.env.DATABASE_URL : '';

class DatabaseOperations {
    protected static dbConnection: Pool = new pg.Pool();
    protected dbSubscriber = createSubscriber({ connectionString: db_url});
    private static _instance: DatabaseOperations;
    

    protected constructor() {
    }

    setUpSubscriber() {
        // this will listen for changes to the wagers table
        this.dbSubscriber.notifications.on("wagers_updated", (payload: WagerNotification) => {
            let updatedRecord: WagerModel = payload.record;
            console.log("Received notification in 'wagers_updated':", payload);

            // TODO: add logic that will detect the winner of the bet and pay them out
        });

        this.dbSubscriber.connect();
        this.dbSubscriber.listenTo("wagers_updated");
    }

    public static get Instance() {
        return this._instance || (this._instance = new this());
    }

    async login(username: string, password: string): Promise<LoginResponse> {
        const findUserQuery = 'SELECT password, username FROM users WHERE username = $1';
        const queryValues = [username];

        // can't do anything without the pw so I'll wait on it
        const user: DatabaseUserModel = await DatabaseOperations.dbConnection.query(findUserQuery, queryValues);
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

        await DatabaseOperations.dbConnection.query(deleteQuery, deleteQueryValues);
    }

    async insertNewUser(username: string, pwHash: string, email: string) {
        // create a wallet for that user
        const userWalletInfo: XRPWalletInfo = await rippleApi.createTestWallet();

        // post the user to the database
        const insertUserQuery = 'INSERT INTO users(username, password, email, wallet_address, wallet_pk) VALUES($1, $2, $3, $4, $5) RETURNING *';
        const queryValues = [username, pwHash, email, userWalletInfo.xAddress, userWalletInfo.secret];

        await DatabaseOperations.dbConnection.query(insertUserQuery, queryValues);
        userLogger.info(`User created: ${username}`);

    }

    updateWalletAddr(walletAddr: string) {

    }

    removeUser(userName: string) {

    }

    async updateAccessToken(newAccessToken: string, oldToken: string) {
        const insertAccessTokenQuery = 'UPDATE users SET access_token=$1 WHERE refresh_token=$2';
        const insertAccessTokenQueryValues = [newAccessToken, oldToken];
        await DatabaseOperations.dbConnection.query(insertAccessTokenQuery, insertAccessTokenQueryValues);
    }

    async insertNewTokens(accessToken: string, refreshToken: string, username: string) {
        const insertNewTokensQuery = 'UPDATE users SET access_token=$1, refresh_token=$2 WHERE username=$3';
        const insertNewTokensQueryValues = [accessToken, refreshToken, username];
        await DatabaseOperations.dbConnection.query(insertNewTokensQuery, insertNewTokensQueryValues);
    }

    async insertTokensForUser(username: string): Promise<UserTokens> {
        const { accessToken, refreshToken } = tokenHandler.generateTokens(username);
        // now save the access and refresh tokens to the user's data base
        const insertAccessTokenQuery = 'UPDATE users SET access_token=$1, refresh_token=$2 WHERE username=$3';
        const insertAccessTokenQueryValues = [accessToken, refreshToken, username];

        const insertTokensResult = await DatabaseOperations.dbConnection.query(insertAccessTokenQuery, insertAccessTokenQueryValues);

        return { accessToken, refreshToken };
    }

    findAccessToken(accessToken: string) {

    }

    async findRefreshToken(refreshToken: string): Promise<string|undefined> {
        const findRefresh = 'SELECT refresh_token FROM users WHERE refresh_token=$1';
        const findRefreshValues = [refreshToken];
        return (await DatabaseOperations.dbConnection.query(findRefresh, findRefreshValues)).rows[0];
    }
}

class SportsDataOperations extends DatabaseOperations {
    private static _sportsInstance: SportsDataOperations;

    public static get SportsInstance() {
        return this._sportsInstance || (this._sportsInstance = new this());
    }

    async insertAllGamesForSeason() {
        let currentYear = new Date().getFullYear();
        const findCurrentSeason = 'SELECT season FROM games LIMIT 1';
        const games: DatabaseGameModel[] = (await DatabaseOperations.dbConnection.query(findCurrentSeason)).rows;

        if (games.length == 0 || games[0].season !== (currentYear - 1)) {
            try {
                // grab all of the games for the season..
                const currentSznGames = await bballApi.getAllRegSznGames(--currentYear);
                
                return currentSznGames;
                // now add them to the db


            } catch (err) {
                sportsLogger.error(`Couldn't retrieve data for the ${currentYear} szn: ` + err);
            }
        }
    }

    /*
    * Checks the database to see if any games are played today
    */
    async gameDayCheck() {
        // grab today's date
        let today = new Date();

        // create a holder for each game id and the teams in each game
        let gameHolder: GameToday[] = [];

        // grab the dates of all the games
        let games: GameModel[] = (await DatabaseOperations.dbConnection.query('SELECT * FROM games')).rows;

        if (games.length > 1 && games.length > 0) {
            // for each game returned
            games.forEach(x => {
                // store the game & team ids of the games being played today
                if (x.game_begins.setHours(0,0,0,0) == today.setHours(0,0,0,0)) {
                    const {home_team, away_team, game_id} = x;
                    gameHolder.push({home_team, away_team, game_id, game_date: today});
                }
            });
        }
    }

    async checkWinner(date: Date, homeTeam: string, awayTeam: string) {

    }

    // async transactionHandler(data: any, tableName: string) {
    //     ;(async () => {
    //         const pool = new Pool()
    //         // note: we don't try/catch this because if connecting throws an exception
    //         // we don't need to dispose of the client (it will be undefined)
    //         const client = await pool.connect()
    //         try {
    //           await client.query('BEGIN')
    //           const queryText = `INSERT INTO ${tableName}(name) VALUES($1) RETURNING id`
    //           const res = await client.query(queryText, ['brianc'])
    //           const insertPhotoText = 'INSERT INTO photos(user_id, photo_url) VALUES ($1, $2)'
    //           const insertPhotoValues = [res.rows[0].id, 's3.bucket.foo']
    //           await client.query(insertPhotoText, insertPhotoValues)
    //           await client.query('COMMIT')
    //         } catch (e) {
    //           await client.query('ROLLBACK')
    //           throw e
    //         } finally {
    //           client.release()
    //         }
    //       })().catch(e => console.error(e.stack))
    // }

    async updateGameData(gameId: number, homeScore: number, awayScore: number, winningTeam: string) {

    }
}

class WagerDataOperations extends DatabaseOperations {

    async findWagerWinners(gameId: number, winningTeam: number) {
        
        let winningWalletAddrs: wagerWinners[] = [];

        // find every bet for the specific game
        const findWinnersQuery = 'SELECT * FROM wagers WHERE game_id=$1'
        let gameBets: WagerModel[] = (await DatabaseOperations.dbConnection.query(findWinnersQuery, [gameId])).rows;

        // cycle through the bets and record the winner of each bet
        gameBets.forEach(singleBet => {
            let betWinner = singleBet.bettor_chosen_team == gameId ? singleBet.bettor : singleBet.fader;
            let winnerObj: wagerWinners = {wallet: betWinner, wagerAmount: singleBet.wager_amount};

            // add the winner to the array
            winningWalletAddrs.push(winnerObj);
        });

        // begin the payout of each winner
    }
}

export const dbOps = DatabaseOperations.Instance;
export const sportOps = SportsDataOperations.SportsInstance;
// export const wagerOps = WagerDataOperations.WagerInstance;
