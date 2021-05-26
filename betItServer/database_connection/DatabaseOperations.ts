import pg, { Pool, Notification } from 'pg';
import createSubscriber from "pg-listen"
import { sportsLogger, tokenLogger, userLogger } from '../loggerSetup/logSetup.js';
import { BallDontLieResponse, DatabaseGameModel, DatabaseUserModel, GameToday, LoginResponse, UserTokens, wagerWinners, XRPWalletInfo } from '../models/dataModels.js';
import { rippleApi } from '../RippleConnection/ripple_setup.js';
import bcrypt from 'bcrypt';
import * as tokenHandler from '../tokens/token_auth.js';
import { bballApi } from '../SportsData/Basketball.js';
import { GameModel, WagerModel, WagerNotification } from '../models/dbModels/dbModels.js';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

class DatabaseOperations {
    protected static dbConnection: Pool = new pg.Pool();
    protected dbSubscriber = createSubscriber({ connectionString: process.env.DATABASE_URL! });
    private static _instance: DatabaseOperations;


    protected constructor() {
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
                    return { tokens, validUser: true };
                } catch (insertError) {
                    tokenLogger.error(`issue with insertTokensForUser(${username}): ` + insertError);
                    userLogger.error(`Could not generate & save tokens for ${username}`);
                    return { validUser: false };
                }
            } else {
                userLogger.warn(`Bad password attempted for: ${username}`);
                return { validUser: false };
            }
        } else {
            userLogger.info(`no password found for: ${username}. Check the login & register function`);
            return { validUser: false };
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

        await DatabaseOperations.dbConnection.query(insertAccessTokenQuery, insertAccessTokenQueryValues);

        return { accessToken, refreshToken };
    }

    findAccessToken(accessToken: string) {

    }

    async findRefreshToken(refreshToken: string): Promise<string | undefined> {
        const findRefresh = 'SELECT refresh_token FROM users WHERE refresh_token=$1';
        const findRefreshValues = [refreshToken];
        return (await DatabaseOperations.dbConnection.query(findRefresh, findRefreshValues)).rows[0];
    }
}

class SportsDataOperations extends DatabaseOperations {
    private static _sportsInstance: SportsDataOperations;
    private ballDontLieApi = 'https://www.balldontlie.io/api/v1/';

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
                if (x.game_begins.setHours(0, 0, 0, 0) == today.setHours(0, 0, 0, 0)) {
                    const { home_team, away_team, game_id } = x;
                    gameHolder.push({ home_team, away_team, game_id, game_date: today });
                }
            });

            gameHolder.forEach(x => {
                this.scoreChecker(x);
            });
        }
    }

    async updateGamesWithWinners(gameId: number, winningTeam: number) {
        // update the games table with the winner of each game
        let updateGamesQuery = "UPDATE games SET winning_team=$1 WHERE game_id=$2";
        await DatabaseOperations.dbConnection.query(updateGamesQuery, [winningTeam, gameId]);

        // once the games table is updated, my database trigger will update the wagers table
    }

    scoreChecker(gameToday: GameToday) {
        let gameOver = false;
        // check the score of the game every ~20 minutes
        let intervalId = setInterval(async () => {
            try {
                // grab the game's data
                let gameResponse: BallDontLieResponse = await axios.get(`${this.ballDontLieApi}games/${gameToday.game_id}`);
                let gameData = gameResponse.data.data[0];
                // check to see if the game is over
                if (gameData.status == 'Final') {
                    let winningTeam = (gameData.home_team_score > gameData.visitor_team_score) ? gameData.home_team.id : gameData.visitor_team.id;
                    
                    // record the game winner and the score in the 'games' table
                    this.updateGamesWithWinners(gameData.id, winningTeam)

                    // then stop the interval
                    clearInterval(intervalId);
                }
            } catch (error) {
                // TODO: think of a way to keep the app running in the event of an error
            }
        }, 1200000);
    }

    async getGameData(game: GameModel, intervalId: any) {
    }

    async checkWinner(date: Date, homeTeam: string, awayTeam: string) {

    }

    async updateGameData(gameId: number, homeScore: number, awayScore: number, winningTeam: string) {

    }
}

class WagerDataOperations extends DatabaseOperations {

    constructor() {
        super();
    }

    setUpSubscriber() {
        // this will listen for changes to the wagers table
        this.dbSubscriber.notifications.on("wagers_updated", (payload: WagerNotification) => {
            let updatedRecord: WagerModel = payload.record;

            const winner = this.determineWagerWinner(updatedRecord);
            this.payWinner(winner, updatedRecord.wager_amount);
        });

        this.dbSubscriber.connect();
        this.dbSubscriber.listenTo("wagers_updated");
        process.on("exit", () => {
            this.dbSubscriber.close();
        });
    }

    private payWinner(winner: string, amount: number) {
        // TODO: payout to the winner's address
    }

    private determineWagerWinner(wager: WagerModel): string {
        // determine the winner of the bet
        const winner = (wager.bettor_chosen_team == wager.winning_team) ? wager.bettor : wager.fader;
        return winner;
    }
}

export const dbOps = DatabaseOperations.Instance;
export const sportOps = SportsDataOperations.SportsInstance;
export const wagerOps = new WagerDataOperations();
