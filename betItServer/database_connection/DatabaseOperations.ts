import pg, { Pool } from 'pg';
import createSubscriber from "pg-listen"
import { apiLogger, mainLogger, sportsLogger, tokenLogger, userLogger, wagerLogger } from '../loggerSetup/logSetup.js';
import { BallDontLieData, BallDontLieResponse, BlockCypherAddressData, BlockCypherTxResponse, ClientUserModel, ClientWalletInfo, DatabaseGameModel, DatabaseUserModel, FullBlockCypherAddressData, GameToday, JWTUser, LoginResponse, RapidApiNbaGameData, RapidApiSeasonResponse, TxHashInfo, UserTokens, WagerStatus, wagerWinners, WalletInfo, XRPWalletInfo } from '../models/dataModels.js';
import { rippleApi } from '../RippleConnection/ripple_setup.js';
import bcrypt from 'bcrypt';
import * as tokenHandler from '../tokens/token_auth.js';
import { bballApi } from '../SportsData/Basketball.js';
import { EscrowWallet, GameModel, WagerModel, WagerNotification } from '../models/dbModels/dbModels.js';
import axios, { AxiosError, AxiosResponse } from 'axios';
import { AddressInformation } from "../models/dataModels";
import bitcoinjs, { ECPair } from "bitcoinjs-lib";
import dotenv from 'dotenv';
import { encrypt, decrypt } from '../routes/encrypt.js';
import jwt from 'jsonwebtoken';
import { allSocketConnections, io } from '../bin/www.js';
import { Socket } from 'socket.io';
import { emailHelper } from '../EmailNotifications/EmailWorker.js';

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
        const findUserQuery = 'SELECT password, username, wallet_address FROM users WHERE username = $1';
        const queryValues = [username];

        // can't do anything without the pw so I'll wait on it
        const user: DatabaseUserModel = await DatabaseOperations.dbConnection.query(findUserQuery, queryValues);
        // compare the pw to the hash I have in the db
        if (user.rows[0].password) {
            const isMatch = await bcrypt.compare(password, user.rows[0].password);
            if (isMatch) {
                try {
                    // generate and save refresh token to the db
                    const tokens: UserTokens = await this.insertTokensForUser(username);
                    const verifiedUser: JWTUser = jwt.verify(tokens.accessToken, process.env.ACCESSTOKENSECRET!) as JWTUser;

                    // construct the user model for the client to use
                    const {wallet_address} = user.rows[0]
                    const userForClient: ClientUserModel = {
                        username, wallet_address, 
                        access_token: tokens.accessToken, 
                        refresh_token: tokens.refreshToken, 
                        exp: verifiedUser.exp
                    };

                    return { tokens, validUser: true, user: userForClient };
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

    async logout(username: string) {
        const deleteQuery = 'UPDATE users SET refresh_token=null WHERE username=$1';
        const deleteQueryValues = [username];
        try {
            let logoutInfo = await DatabaseOperations.dbConnection.query(deleteQuery, deleteQueryValues);
            if (logoutInfo.rowCount == 1) {
                return true;
            } else {
                return false;
            }
        } catch (err) {
            userLogger.error(`Problem occurred when logging user ${username} out: ${err}`);
            return false
        }
    }

    /** Find a user's email address via their username */
    async getUserEmail(username: string): Promise<string> {
        let sql = 'SELECT email FROM users WHERE username=$1';
        let userData = (await DatabaseOperations.dbConnection.query(sql, [username])).rows[0];
        return userData.email;
    }

    async insertNewUser(username: string, pwHash: string, email: string) {
        // create a wallet for that user
        const userWalletInfo = await ltcOps.createAddr(false, username)

        // post the user to the database
        const insertUserQuery = 'INSERT INTO users(username, password, email, wallet_address, wallet_pk) VALUES($1, $2, $3, $4, $5) RETURNING *';
        const queryValues = [username, pwHash, email, userWalletInfo?.address, userWalletInfo?.private];

        const userInserted = await DatabaseOperations.dbConnection.query(insertUserQuery, queryValues);
        if (userInserted.rowCount > 0) {
            userLogger.info(`User created: ${username}`);
        }
    }

    async swapPasswords(oldPasswordHash: string, newPasswordHash: string) {
        let query = "UPDATE users SET password=$1 WHERE password=$2";
        let values = [newPasswordHash, oldPasswordHash];

        const updatedData = (await DatabaseOperations.dbConnection.query(query, values)).rows[0];

        return updatedData;
    }

    async removeUser(userName: string) {
        const sql = `DELETE FROM users WHERE username=$1`;
        await DatabaseOperations.dbConnection.query(sql, [userName]);
    }

    /**
     * this method generates the access and refresh tokens for the user
     *  and then inserts the user's refresh token into the database
     * @param username
     * @returns the newly created access and refresh token strings
     */
    async insertTokensForUser(username: string): Promise<UserTokens> {
        const { accessToken, refreshToken } = tokenHandler.generateTokens(username);
        const insertRefreshTokenQuery = 'UPDATE users SET refresh_token=$1 WHERE username=$2';
        const insertAccessTokenQueryValues = [refreshToken, username];
        let updateMe = await DatabaseOperations.dbConnection.query(insertRefreshTokenQuery, insertAccessTokenQueryValues);

        return { accessToken, refreshToken };
    }

    async findRefreshToken(refreshToken: string): Promise<string | undefined> {
        const findRefresh = 'SELECT refresh_token FROM users WHERE refresh_token=$1';
        const findRefreshValues = [refreshToken];
        return (await DatabaseOperations.dbConnection.query(findRefresh, findRefreshValues)).rows[0].refresh_token;
    }

    /** Look up the user's refresh_token by their username */
    async findRefreshTokenByUser(username: string): Promise<string | undefined> {
        const findRefresh = 'SELECT refresh_token FROM users WHERE username=$1';
        const findRefreshValues = [username];
        return (await DatabaseOperations.dbConnection.query(findRefresh, findRefreshValues)).rows[0].refresh_token;
    }

    /** Find an email address via a wallet address */
    async getEmailAddress(walletAddr: string): Promise<string> {
        const query = "SELECT email FROM users WHERE wallet_address=$1";
        const data = (await DatabaseOperations.dbConnection.query(query, [walletAddr])).rows[0];
        return data.email;
    }

    async findUserAndPassword(username: string): Promise<string> {
        let query = "SELECT password FROM users WHERE username=$1";
        const values = [username];
        const data = (await DatabaseOperations.dbConnection.query(query, values)).rows[0];
        if (data) {
            return data.password;
        } else {
            return "";
        }
    }

    async updateEmail(username: string, newEmail: string) {
        let query = "UPDATE users SET email=$1 WHERE username=$2";
        const values = [newEmail, username];
        const updateQuery = (await DatabaseOperations.dbConnection.query(query, values)).rows[0];
        return true;
    }
}

class SportsDataOperations extends DatabaseOperations {
    private static _sportsInstance: SportsDataOperations;
    private ballDontLieApi = 'https://www.balldontlie.io/api/v1/';
    #rapidApiNBA: string = 'https://api-nba-v1.p.rapidapi.com/';
    #rapidApiConfig = {
        headers: {
            'x-rapidapi-host': 'api-nba-v1.p.rapidapi.com',
            'x-rapidapi-key': process.env.RAPIDAPIKEY!
        }
    };

    public static get SportsInstance() {
        return this._sportsInstance || (this._sportsInstance = new this());
    }

    /** This method makes sure that games are at least than 30 minutes away from now */
    gameIsMoreThan30MinsOut(game: GameModel, rightNow = Date.now()): boolean {
        const thirtyMinsIinMilliseconds = 1.8e6; 
        const delta = (game.game_begins.valueOf() - rightNow);

        return delta > thirtyMinsIinMilliseconds;
    }

    /** this method compares the passed in date to Date.now() to see if the passed in date is at least 30 minutes in the future */
    moreThanThirtyMinutesAway(dateToCheck: Date, rightNow = Date.now()) {
        const thirtyMinsIinMilliseconds = 1.8e6;
        const delta = (dateToCheck.valueOf() - rightNow);

        return delta > thirtyMinsIinMilliseconds;
    }

    /** 
     * call this method when the database needs to be populated with games for the season
    */
    async insertAllGamesForSeason() {
        let currentYear = new Date().getFullYear();

        try {
            // grab all of the games for the season..
            const currentSznGames: RapidApiNbaGameData[] = await bballApi.getAllGamesForSzn(currentYear);

            // grab only the data that I need for my database table (game_id, home_team, away_team, game_begins, season)
            let insertNewGames: DatabaseGameModel[] =  currentSznGames.map(x => {
                return {
                    game_id: Number(x.gameId),
                    game_begins: x.startTimeUTC,
                    sport: 'Basketball',
                    home_team: Number(x.hTeam.teamId),
                    visitor_team: Number(x.vTeam.teamId),
                    season: currentYear
                } as DatabaseGameModel
            });

            let queryArray = [];
            // now insert each row into the db
            for (const x of insertNewGames) {
                let insertQuery = 'INSERT INTO games (game_id, sport, home_team, visitor_team, game_begins, season) VALUES ($1, $2, $3, $4, $5, $6)';
                let values = [x.game_id, x.sport, x.home_team, x.visitor_team, x.game_begins, x.season];
                queryArray.push(DatabaseOperations.dbConnection.query(insertQuery, values));
            };

            let allDataInserted = await Promise.all(queryArray);
            return 'Done';
        } catch (err) {
            sportsLogger.error(`Couldn't retrieve data for the ${currentYear} szn: ` + err);
        }
    }

    async getGameTimeFromDB(gameId: number): Promise<Date> {
        const sql = "select game_begins from games where game_id=$1";
        const gameTimeResponse = (await DatabaseOperations.dbConnection.query(sql, [gameId])).rows[0];
        return gameTimeResponse.game_begins;
    }

    async getGamesByDate(date: Date = new Date(), timezone: string = 'EST') {
        const month = date.getMonth() + 1
        const day = date.getDate()
        const year = date.getFullYear();
        const queryThisDate = `${year}-${month}-${day}`;
        try {
            const sql = `
                SELECT * 
                FROM games 
                WHERE CAST(("game_begins" AT TIME ZONE $1) AS date) = $2
                ORDER BY "game_begins"
            `;

            const games = (await DatabaseOperations.dbConnection.query(sql, [timezone, queryThisDate]));
            return games.rows;
        } catch (error) {
            sportsLogger.error(`Problem with database when looking for games on date ${queryThisDate}. \n Error Msg: ${error}`);
            return [];
        }
    }

    /**
     * returns all games being played from the passed in date up to 7 days out.
     * @param date the date to begin the search on
     * @returns all games being played from the date up to 7 days out max.
     */
    async getAllGamesThisWeek(date = new Date()) {
        // build the starting date
        const month = date.getMonth() + 1
        const day = date.getDate()
        const year = date.getFullYear();
        const startingDate = `${year}-${month}-${day}`;

        // build the ending date
        const endDateRaw: Date = new Date(date.setDate(date.getDate() + 7));
        const endMonth = endDateRaw.getMonth() + 1;
        const endDay = endDateRaw.getDate();
        const endYear = endDateRaw.getFullYear();
        const endingDate = `${endYear}-${endMonth}-${endDay}`;

        // query for games that are a week out from today
        const query = `
            SELECT 
                * 
            FROM 
                games
            WHERE 
                date_trunc('day', game_begins) 
            BETWEEN 
                $1 AND $2
            ORDER BY game_begins ASC
        `;
        let games: GameModel[] = (await DatabaseOperations.dbConnection.query(query, [startingDate, endingDate])).rows
        return games;
    }

    async testInsert(date: Date) {
        // remove the fluff from the date
        let regulatedDate = date.setHours(0, 0, 0, 0);
        let dateObj = new Date(regulatedDate)
        const query = "UPDATE games SET game_begins=$1 WHERE game_id=127502"
        // const queryValues = [regulatedDate];
        await DatabaseOperations.dbConnection.query(query, [dateObj]);
    }

    /** this method runs once a day to check for games that are being played today. */
    async gameDayCheck() {
        // create a holder for each game id and the teams in each game
        let gamesHolder: GameToday[] = [];

        // query for games that are being played today
        let games: GameModel[] = await this.getGamesByDate();

        if (games.length > 1 && games.length > 0) {
            // for each game returned
            games.forEach(x => {
                // store the game & team ids of the games being played today
                const { home_team, visitor_team, game_id } = x;
                gamesHolder.push({ home_team, visitor_team, game_id, game_date: x.game_begins });
            });

            if (gamesHolder.length > 0) {
                /** TODO: do some research to see if this will hold up the thread loop.
                 * consider spinning this up into it's own child process to allow for
                 * better response times
                */

                const gameIds = gamesHolder.map(x => x.game_id);

                await wagerOps.checkIfWagerForGameNotTaken(gameIds);
                await this.notifyUsersAboutGameTime(gameIds);
                await this.scoreChecker(gamesHolder);
            }
            return 'done';
        } else {
            apiLogger.info("No games being played today.");
        }
    }

    /**
     * @param gameId the game to update
     * @param winningTeam the id of the winning team
     * 
     * Save the winning team to the database along with the game's id.
     * once the games table is updated, my database trigger will update the wagers table
     * which will then kick off the payout process
     */
    async updateGamesWithWinners(gameId: number, winningTeam: number) {
        // update the games table with the winner of each game
        let updateGamesQuery = "UPDATE games SET winning_team=$1 WHERE game_id=$2";
        await DatabaseOperations.dbConnection.query(updateGamesQuery, [winningTeam, gameId]);
        return true;
    }

    /** This method will run for each game that is being played
     * on today's date
     */
    async scoreChecker(todaysGames: GameToday[]) {
        let requestArr: Promise<AxiosResponse<RapidApiSeasonResponse>>[] = [];

        let intervalId = setInterval(async () => {
            // grab the game id from each game and build a request with it
            todaysGames.forEach(x => {
                requestArr.push(axios.get(`${this.#rapidApiNBA}games/gameId/${x.game_id}`, this.#rapidApiConfig));
            });

            try {
                let dataForGames: RapidApiSeasonResponse[] = (await Promise.all(requestArr)).map(x => x.data);
                // find out which games were completed
                for (const gameData of dataForGames) {
                    let game = gameData.api.games[0];
                    // check to see if the game is over
                    if (game.statusGame == 'Finished') {
                        let winningTeam: number = (Number(game.hTeam.score?.points) > Number(game.vTeam.score?.points)) ? Number(game.hTeam.teamId) : Number(game.vTeam.teamId);

                        try {
                            // record the game winner and the score in the 'games' table.
                            let gameInserted = await this.updateGamesWithWinners(Number(game.gameId), winningTeam);

                            // remove that game from the todaysGames array
                            todaysGames = todaysGames.filter(x => x.game_id != Number(game.gameId));

                            if (todaysGames.length == 0) {
                                // then stop the interval
                                clearInterval(intervalId);
                            } else {
                                // reset the array so that we have a fresh start for the next go around
                                requestArr = [];
                            }
                        } catch (error) {
                            wagerLogger.error(`Issue saving game winner to db for game : ${Number(game.gameId)}. \n Error: ` + error);
                            // then stop the interval
                            clearInterval(intervalId);
                        }
                    }
                }
            } catch (apiErr) {
                if (axios.isAxiosError(apiErr)) {
                    apiLogger.error(`There was a problem with the Rapid API Nba endpoint: ${JSON.stringify(apiErr.response?.data)}`);
                }
                // then stop the interval
                clearInterval(intervalId);
            }
        }, 5000);
    }

    /**
     * this method finds all wagers for the passed-in gameId and then locates the socket for each wager holder
     * and then notifies their socket that the game is about to start
     * 
     * @param gameId - the game to find all wagers for
     */
    async notifyUsersAboutGameTime(gameIds: number[]) {
        type WagerParticipants = {
            bettor: string;
            fader: string;
            game_id: number;
            game_begins?: Date;
        };

        let sqlParams: string = '';

        for (let index = 1; index <= gameIds.length; index++) {
            if (index != gameIds.length) {
                sqlParams += `$${index},`;
            } else {
                sqlParams += `$${index}`;
            }
        }

        // TODO: Work with this query to see if it's what you need instead of making multiple db hits for what can be
        // retrieved in one.
        let gameSQL = `
            SELECT wagers.bettor, wagers.fader, wagers.game_id, games.game_begins
            FROM wagers
            INNER JOIN games
            ON wagers.game_id = games.game_id
            WHERE games.game_id IN (${sqlParams})`;

        // find all users who bet one each game in the game id array
        // const sql = 'SELECT bettor, fader, game_id FROM wagers WHERE game_id IN (' + sqlParams + ') ORDER BY game_id ASC';

        let wagerParticipants: WagerParticipants[] = (await DatabaseOperations.dbConnection.query(gameSQL, gameIds)).rows;

        if (wagerParticipants.length) {
            // find the email for each wallet address
            let emailArray = [];
            for (const participants of wagerParticipants) {
                let bettorEmail = this.getEmailAddress(participants.bettor);
                let faderEmail = this.getEmailAddress(participants.fader);
                const resolvedEmailPromises = await Promise.all([bettorEmail, faderEmail]);
                emailArray.push({bettorEmail: resolvedEmailPromises[0], faderEmail: resolvedEmailPromises[1], gameTime: participants.game_begins?.toDateString() ?? "'no date found'"});
            };

            // now send out an email to each notifying them of their game starting
            let promiseArray = [];
            for (const emailObject of emailArray) {
                let subject = `Your Game Is About To Start!`;
                let text = `A game you bet on is about to start on ${emailObject.gameTime}. Get Ready!`;
                promiseArray.push(
                    emailHelper.emailUser(emailObject.bettorEmail, subject, text),
                    emailHelper.emailUser(emailObject.faderEmail, subject, text),
                );
            }

            // consider not awaiting this. These emails shouldn't have the potential to break the app
            let emailsSentOut = await Promise.all(promiseArray);

            // now find the socket that belongs to each address and notify them
            wagerParticipants.forEach(x => {
                if (allSocketConnections.hasOwnProperty(x.bettor)) {
                    allSocketConnections[x.bettor].emit(
                        "game starting", 
                        {
                            gameUpdate: {
                                message: "A game you bet on is about to start",
                                gameId: x.game_id
                            }
                        }
                    );
                }

                if (allSocketConnections.hasOwnProperty(x.fader)) {
                    allSocketConnections[x.fader].emit(
                        "game starting",
                        {
                            gameUpdate: {
                                message: "A game you bet on is about to start",
                                gameId: x.game_id
                            }
                        }
                    );
                }
            });
        }
    }
}

class WagerDataOperations extends DatabaseOperations {

    constructor() {
        super();
    }

    /**This method will check for wagers whose game has started and no one has taken the wager. When found, the inactive wagers will be deleted*/
    async checkIfWagerForGameNotTaken(gameIds: number[]) {
        //TODO: make sure none of my other functions are locking people's crypto. I believe that it is locked based on what's in the db so they should be okay. but still double check
        type ShortWagerData = {
            id: number,
            bettor: string,
            fader?: string
        };

        let sqlParams: string = '';

        for (let index = 1; index <= gameIds.length; index++) {
            if (index != gameIds.length) {
                sqlParams += `$${index},`;
            } else {
                sqlParams += `$${index}`;
            }
        }
        const sql = `
            SELECT id, bettor, fader
            FROM wagers
            WHERE game_id
            IN (${sqlParams})
        `;

        try {
            let wagerDataArray: ShortWagerData[] = (await DatabaseOperations.dbConnection.query(sql, gameIds)).rows;
            let wagersToDelete: ShortWagerData[] = [];
            
            if (wagerDataArray.length) {
                wagerDataArray.forEach((wagerData: ShortWagerData) => {
                    if (!wagerData.fader) {
                        wagersToDelete.push(wagerData);
                    }
                });
        
                if (wagersToDelete.length) {
                    // delete all the wagers with no fader and free up db space
                    let deleteParams = "";
                    for (let index = 1; index <= wagersToDelete.length; index++) {
                        if (index != wagersToDelete.length) {
                            deleteParams += `$${index},`;
                        } else {
                            deleteParams += `$${index}`;
                        }
                    }
        
                    const deleteSql = `
                        DELETE FROM wagers
                        WHERE game_id IN (${deleteParams})
                    `;
                    const wagerIdsToDelete: number[] = wagersToDelete.map(x => x.id);
                    const numWagersDeleted = (await DatabaseOperations.dbConnection.query(deleteSql, wagerIdsToDelete)).rows;
                    if (numWagersDeleted.length) {
                        wagerLogger.info(`${numWagersDeleted.length} wagers deleted today due to not having a fader.`);
        
                        let emailArray = [];
                        //send an email to the user that their wager was deleted due to no one taking it.
                        for (let index = 0; index < wagersToDelete.length; index++) {
                            const element = wagersToDelete[index];
                            let subject = "Your Wager Was Not Taken"
                            let msg = `
                                No one took your wager and the game you wanted to bet on has started or will be starting soon. 
                                As a result, your wager has been deleted. The crypto you wanted to wager on this game has not been moved from your wallet.
                            `;
                            let emailAddress = await this.getEmailAddress(element.bettor);
        
                            emailArray.push(emailHelper.emailUser(emailAddress, subject, msg));
                        }
        
                        // now send them bitches out
                        const emailsSentOut = await Promise.all(emailArray);
                    }
                } else {
                    wagerLogger.info("No inactive wagers on any games today.");
                }
            }
        } catch (error) {
            wagerLogger.error(`There was an issue when trying to gather the wagers for deletion. The game id's are: ${gameIds.toString()} and the error is: \n\t${error}`);
        }
    }

    async findEmailAddressForBettorAndFader(wagerId: number) {
        const sql = `
            SELECT 
                bettor,
                fader
            FROM
                wagers
            WHERE 
                id=$1
        `;
        const bettorAndFader: {bettor: string, fader?: string} = (await DatabaseOperations.dbConnection.query(sql, [wagerId])).rows[0];

        if (bettorAndFader.fader) {
            const emailSql = `
                SELECT
                    email
                FROM 
                    users
                WHERE wallet_address IN ($1, $2)
            `;

            const emailAddress: {email: string}[] = (await DatabaseOperations.dbConnection.query(emailSql, [bettorAndFader.bettor, bettorAndFader.fader])).rows;
            return emailAddress;
        } else {
            const emailSql = `
                SELECT
                    email
                FROM 
                    users
                WHERE wallet_address =$1
            `;

            const emailAddress: {email: string} = (await DatabaseOperations.dbConnection.query(emailSql, [bettorAndFader.bettor])).rows[0];
            return [emailAddress];
        }
    }

    async findEscrowAddrViaWagerId(wagerId: string): Promise<string> {
        const sql = "SELECT address FROM escrow WHERE wager_id=$1";
        const escrowAddr = await (await DatabaseOperations.dbConnection.query(sql, [wagerId])).rows[0].wager_id;

        return escrowAddr;
    }

    async checkAddressWagerCount(walletAddr: string) {
        const sql = `
            SELECT count(*) 
            from wagers 
            WHERE $1
            IN (bettor, fader);
            `;
        const wagerCountData = (await DatabaseOperations.dbConnection.query(sql, [walletAddr])).rows[0];
        return wagerCountData;
    }

    async getUsersWagers(walletAddr: string) {
        const sql = `
            SELECT
                wagers.id as "wagerId", 
                wagers.is_active as "isActive", 
                wagers.wager_amount as "amount",
                games.game_begins as "gameStartTime",
                wagers.bettor_chosen_team as "chosenTeam"
            FROM 
                wagers
                    INNER JOIN games
                    ON wagers.game_id = games.game_id
            WHERE 
                bettor=$1`;
        const wagerData: WagerStatus[] = (await DatabaseOperations.dbConnection.query(sql, [walletAddr])).rows;

        // convert the amount data type into a number
        wagerData.map((x: WagerStatus) => {x.amount = Number(x.amount)});
        return wagerData;
    }

    async deleteWager(wagerId: number) {
        const sql = `
            DELETE FROM wagers
            WHERE id=$1
            AND is_active=false
        `;
        await DatabaseOperations.dbConnection.query(sql, [wagerId]);
    }

    async getWagersByGameId(gameId: number, walletAddr?: string) {
        let sql: string;
        if (walletAddr) {
            sql = 'select * from wagers where game_id=$1 and bettor <> $2';
            const wagers: WagerModel[] = (await DatabaseOperations.dbConnection.query(sql, [gameId, walletAddr])).rows;

            const availableWagers = (wagers.length > 0) ? wagers.filter(wager => wager.is_active == false) : [];
            return availableWagers
        } else {
            sql = 'select * from wagers where game_id=$1'
            const wagers: WagerModel[] = (await DatabaseOperations.dbConnection.query(sql, [gameId])).rows;

            const availableWagers = (wagers.length > 0) ? wagers.filter(wager => wager.is_active == false) : [];
            return availableWagers
        }
    }

    /**
     * This method will listen for changes to the wagers table in the db.
     * if the updated record contains a winning team, the payout process
     * will begin for the winner of the wager.
     */
    async setUpSubscriber() {
        // this will listen for changes to the wagers table
        this.dbSubscriber.notifications.on("wagers_updated", (payload: WagerNotification) => {
            let updatedRecord: WagerModel = payload.record;

            if (updatedRecord.fader && updatedRecord.winning_team) {
                const winner = this.determineWagerWinner(updatedRecord);
                this.payWinner(winner, updatedRecord.wager_amount, updatedRecord.id);
            }
        });

        this.dbSubscriber.connect();
        this.dbSubscriber.listenTo("wagers_updated");
        process.on("exit", () => {
            this.dbSubscriber.close();
        });
    }

    /** This method will pay the winner their crypto from their respective escrow wallet */
    private async payWinner(winner: string, amount: number, wagerId: number) {
        // grab the private key from this wager's escrow wallet
        const escrowSql = `
            SELECT *
            FROM escrow
            WHERE wager_id=$1
        `;
        const escrowWallet: EscrowWallet = (await DatabaseOperations.dbConnection.query(escrowSql, [wagerId])).rows[0];

        // decrypt the private key
        const rawPrivKey = decrypt(escrowWallet.private_key);

        try {
            // send cut to master wallet
            await ltcOps.payTheHouse(escrowWallet.address, rawPrivKey, (escrowWallet.balance * 0.03))
            
            const balanceAfterMyCut = escrowWallet.balance - (escrowWallet.balance * 0.03);

            // send crypto to winner's wallet
            await ltcOps.payoutFromEscrow(escrowWallet.address, rawPrivKey, winner, balanceAfterMyCut);

            // send notification to the winner's socket connection and email address
            let emailAddress = await this.getEmailAddress(winner);
            await emailHelper.emailUser(
                emailAddress, 
                "You Won A Wager!", 
                `Your payout in the amount of ${balanceAfterMyCut} LTC has began its transit to your wallet.
                The amount being sent to you is the remaining balance AFTER network transaction fees (which we don't control) and paying the house (so that we can keep the lights on and provide this service).
                We hope you come back and bet with us again soon.`
            );
            if (allSocketConnections.hasOwnProperty(winner)) {
                allSocketConnections[winner].emit('payout started', "You won a bet! The crypto is on its way to your wallet.");
            }
            
            wagerLogger.info(`payout started for address ${winner} in the amount of ${balanceAfterMyCut} LTC for wager ${wagerId}`);
        } catch (error) {
            wagerLogger.error(`An error occurred during the payout function: ${error}`);
        }
    }

    /** add a field into the escrow tabble */
    async insertIntoEscrow(addr: string, privKey: string, id: number, balance: number) {
        let query = "insert into escrow (address, private_key, balance, wager_id) values ($1, $2, $4, (select id from wagers where id=$3))"
        await DatabaseOperations.dbConnection.query(query, [addr, privKey, id, balance]);
        return 'OK'
    }

    private determineWagerWinner(wager: WagerModel): string {
        // determine the winner of the bet
        const winner = (wager.bettor_chosen_team == wager.winning_team) ? wager.bettor : wager.fader!;
        return winner;
    }

    /** adds a row to the wagers database and also generates an escrow wallet for the crypto */
    async createWager(bettor: string, amount: number, game_id: number, chosen_team: number, fader: string ="") {
        // create the escrow wallet and hold the data in memory
        let escrowAddr: ClientWalletInfo = await ltcOps.createAddr(true);

        // TODO: change to a model that generates an escrow address AFTER the bet has a fader

        // create the wager and insert it into the wager's table
        let wagerInsertQuery = 'INSERT INTO wagers (bettor, wager_amount, game_id, is_active, bettor_chosen_team, escrow_address) values ($1, $2, $3, $4, $5, $6) RETURNING *'
        let values = [bettor, amount, game_id, false, chosen_team, escrowAddr?.address];
        const wagerInsert: WagerModel = (await DatabaseOperations.dbConnection.query(wagerInsertQuery, values)).rows[0];

        // now insert the escrow addr info into the escrow table, using the wager's id as the FK. no crypto deposited yet
        if (escrowAddr) {
            let escrowInsert = await this.insertIntoEscrow(escrowAddr.address, escrowAddr.private, wagerInsert.id, (amount * 2));
        }
    }

    async updateWagerWithFader(wagerId: number, fader: string) {
        // make sure the wager isn't taken and then update
        let query = `
            UPDATE wagers 
            SET fader=$1, is_active=true 
            WHERE id=$2 AND fader IS NULL
            RETURNING *
        `;
        let values = [fader, wagerId];
        let updatedWager: WagerModel = (await DatabaseOperations.dbConnection.query(query, values)).rows[0];

        return updatedWager;
    }

    async wagerIsTaken(wagerId: number): Promise<boolean> {
        const query = 'SELECT fader FROM wagers WHERE id=$1';
        const values = [wagerId];
        const lookup = (await DatabaseOperations.dbConnection.query(query, values)).rows[0];
        return (lookup.fader == '' || lookup.fader == null || lookup.fader == undefined) ? false : true
    }
}

class LitecoinOperations extends DatabaseOperations {
    #api: string = 'https://api.blockcypher.com/v1/ltc/main';
    #token: string = `token=${process.env.BLOCKCYPHER_TOKEN}`;
    private static ltcInstance: LitecoinOperations;
    litoshiFactor: number = 10e7;

    public static get LitecoinInstance() {
        return this.ltcInstance || (this.ltcInstance = new this());
    }

    /** This function will move each user's crypto to the escrow wallet for the wager. */
    async fundEscrowForWager(bettor: string, fader: string, wagerId: number) {
        // grab the wager from the db
        const wagerSql = `
            SELECT *
            FROM wagers
            WHERE id=$1
        `;

        const wager: WagerModel = (await DatabaseOperations.dbConnection.query(wagerSql, [wagerId])).rows[0];

        // find the escrow wallet for the wager
        const escrowSql = `
            SELECT address
            FROM escrow
            WHERE wager_id=$1
        `;
        const escrowAddr: string = (await DatabaseOperations.dbConnection.query(escrowSql, [wager.id])).rows[0].address;
        // take the money from each user's wallet and send it to escrow
        let promiseArray = [
            this.createTx(bettor, escrowAddr, wager.wager_amount),
            this.createTx(fader, escrowAddr, wager.wager_amount)
        ];

        const escrowWalletFunded: string[] = await Promise.all(promiseArray);

        if (escrowWalletFunded[0] == "txs began" && escrowWalletFunded[1] == "txs began") {
            // send notification to the users that the crypto is being taken from their wallets & email them
            if (allSocketConnections.hasOwnProperty(bettor)) {
                allSocketConnections[bettor].emit(
                    'wallet txs', 
                    {
                        msg: `Tx Started`, 
                        details: `${wager.wager_amount} LTC sent to escrow for the wager`, 
                        escrowWallet: `${escrowAddr}`
                    }
                );
            }

            if (allSocketConnections.hasOwnProperty(fader)) {
                allSocketConnections[fader].emit(
                    'wallet txs', 
                    {
                        msg: `Tx Started`,
                        details: `${wager.wager_amount} LTC sent to escrow for the wager`, 
                        escrowWallet: `${escrowAddr}`
                    }
                );
            }

            const bettorEmail = await this.getEmailAddress(bettor);
            const faderEmail = await this.getEmailAddress(fader);

            const subject = "Crypto Has Moved To Escrow";
            const msg = "Your wager is now active and your crypto is on it's way to the escrow wallet.";
            let promiseArray = [
                emailHelper.emailUser(bettorEmail, subject, msg),
                emailHelper.emailUser(faderEmail, subject, msg)
            ];

            let emailsSentOut = await Promise.all(promiseArray);

            return true;
        } else {
            return false;
        }
    }

    /** use this method to generate a ltc address. the private key will be encrypted in the returned object */
    async createAddr(escrow: Boolean, username?: string) {
        if (!escrow && username) {
            let addrResponse: AddressInformation = await axios.post(this.#api + `/addrs?${this.#token}`);
            const addrData = addrResponse.data;
            // encrypt priv key first
            addrData.private = encrypt(addrData.private);

            return addrData;
        } else {
            let addrResponse: AddressInformation = await axios.post(this.#api + `/addrs?${this.#token}`);
            let addrData = addrResponse.data;

            // encrypt priv key first
            addrData.private = encrypt(addrData.private);

            return addrData;
        }
    }

    /** creates and starts a tx on the ltc network. always send in the amount in LTC's. This will convert the value to litoshis for you */
    async createTx(sendingAddr: string, receivingAddr: string, amountInLtc: number) {
        /* 
            input: the address sending from
            output: the address sending to
            value: litoshis
        */
        const amountInLitoshis = Number((amountInLtc * this.litoshiFactor).toFixed(7));

        // retrieve the private key from the db
        let privKey = await this.retrievePrivKey(sendingAddr);

        // create a buffer from the private key, expect a hex encoded format
        const privKeyBuffer: Buffer = Buffer.from(privKey, "hex");

        // derive the public key from the private key so that I now have both
        let keys = bitcoinjs.ECPair.fromPrivateKey(privKeyBuffer);

        let newtx = {
            inputs: [{ addresses: [sendingAddr] }],
            outputs: [{ addresses: [receivingAddr], value: amountInLitoshis }]
        };

        try {
            // now create the new transaction and get the partially complete tx back to sign with our priv key
            let tempTx: BlockCypherTxResponse = (await axios.post(`${this.#api}/txs/new?${this.#token}`, newtx)).data;

            // check if the fees can be covered by the sender's wallet balance
            

            tempTx.pubkeys = [];

            // use private key to sign the data in the 'tosign' array
            tempTx.signatures = tempTx.tosign.map((tosign: any) => {
                tempTx.pubkeys!.push(keys.publicKey.toString('hex'));
                return bitcoinjs.script.signature.encode(
                    keys.sign(Buffer.from(tosign, "hex")),
                    0x01,
                ).toString("hex").slice(0, -2);
            });

            try {
                // now send the transaction
                let sendMe = await axios.post(`${this.#api}/txs/send?${this.#token}`, tempTx);
                return "txs began"
            } catch (error) {
                if (axios.isAxiosError(error)) {
                    const err: AxiosError = error;
                    console.log(err.response?.data);
                    mainLogger.error(`There was a problem when sending the tx: ${JSON.parse(err.response?.data.errors)}`)
                }
                return `problem sending tx`
            }
        } catch (error) {
            if (axios.isAxiosError(error)) {
                let err: AxiosError = error;
                console.log(err.response?.data)
                mainLogger.error("tx error: " + err.response?.data.errors)
            }
            return `problem creating tx`;
        }
    }

    async payTheHouse(sendingAddr: string, sendingPrivKey: string, amount: number) {
        const myCut = amount * 0.03;
        const amountInLitoshis = Number((myCut * this.litoshiFactor).toFixed(7));

        // create a buffer from the private key, expect a hex encoded format
        const privKeyBuffer: Buffer = Buffer.from(sendingPrivKey, "hex");

        // derive the public key from the private key so that I now have both
        let keys = bitcoinjs.ECPair.fromPrivateKey(privKeyBuffer);

        let newtx = {
            inputs: [{ addresses: [sendingAddr] }],
            outputs: [{ addresses: [process.env.MASTERWALLETADDRESS as string], value: amountInLitoshis }]
        };

        try {
            // now create the new transaction and get the partially complete tx back to sign with our priv key
            let tempTx: BlockCypherTxResponse = (await axios.post(`${this.#api}/txs/new?${this.#token}`, newtx)).data;

            tempTx.pubkeys = [];

            // use private key to sign the data in the 'tosign' array
            tempTx.signatures = tempTx.tosign.map((tosign: any) => {
                tempTx.pubkeys!.push(keys.publicKey.toString('hex'));
                return bitcoinjs.script.signature.encode(
                    keys.sign(Buffer.from(tosign, "hex")),
                    0x01,
                ).toString("hex").slice(0, -2);
            });

            try {
                // now send the transaction
                let sendMe = await axios.post(`${this.#api}/txs/send?${this.#token}`, tempTx);
                return "txs began"
            } catch (error) {
                return "problem sending tx"
            }
        } catch (error) {
            return "problem creating tx"
        }
    }

    async payoutFromEscrow(sendingAddr: string, sendingPrivKey: string, receivingAddr: string, amountInLtc: number) {
        /* 
            input: the address sending from
            output: the address sending to
            value: litoshis
        */
        const amountInLitoshis = Number((amountInLtc * this.litoshiFactor).toFixed(7));

        // create a buffer from the private key, expect a hex encoded format
        const privKeyBuffer: Buffer = Buffer.from(sendingPrivKey, "hex");

        // derive the public key from the private key so that I now have both
        let keys = bitcoinjs.ECPair.fromPrivateKey(privKeyBuffer);

        let newtx = {
            inputs: [{ addresses: [sendingAddr] }],
            outputs: [{ addresses: [receivingAddr], value: amountInLitoshis }]
        };

        try {
            // now create the new transaction and get the partially complete tx back to sign with our priv key
            let tempTx: BlockCypherTxResponse = (await axios.post(`${this.#api}/txs/new?${this.#token}`, newtx)).data;

            tempTx.pubkeys = [];

            // use private key to sign the data in the 'tosign' array
            tempTx.signatures = tempTx.tosign.map((tosign: string) => {
                tempTx.pubkeys?.push(keys.publicKey.toString('hex'));
                return bitcoinjs.script.signature.encode(
                    keys.sign(Buffer.from(tosign, "hex")),
                    0x01,
                ).toString("hex").slice(0, -2);
            });

            try {
                // now send the transaction
                let sendMe = await axios.post(`${this.#api}/txs/send?${this.#token}`, tempTx);
                return "txs began"
            } catch (error) {
                return "problem sending tx"
            }
        } catch (error) {
            return "problem creating tx"
        }
    }

    async fetchAddressTxCount(address: string){
        const walletData: BlockCypherAddressData = (await axios.get(`${this.#api}/addrs/${address}/balance?${this.#token}`)).data;
        return walletData.txrefs[0].confirmations;
    }

    async fetchFullAddressData(address: string) {
        const walletData: BlockCypherAddressData = (await axios.get(`${this.#api}/addrs/${address}/balance?${this.#token}`)).data;
        return walletData;
    }

    async fetchFullAddress(address: string) {
        const walletData: FullBlockCypherAddressData = (await axios.get(`${this.#api}/addrs/${address}/full?${this.#token}`)).data;
        return walletData;
    }

    async updateUserLtcAddr(username: string, newAddr: string, encryptedPrivKey: string) {
        try {
            let query = 'UPDATE users SET wallet_address=$1, wallet_pk=$2 WHERE username=$3';
            let op = await DatabaseOperations.dbConnection.query(query, [newAddr, encryptedPrivKey, username]);
            return 'done';
        } catch (error) {
            console.log(error);
        }
    }

    async retrievePrivKey(sendingAddr: string) {
        // look up the sender's address in the table to get their private key
        let query = 'SELECT wallet_pk FROM users WHERE wallet_address=$1'
        const encryptedPrivKey = await DatabaseOperations.dbConnection.query(query, [sendingAddr]);
        const rawPrivKey = decrypt(encryptedPrivKey.rows[0].wallet_pk);
        return rawPrivKey;
    }

    async getWalletOwner(username: string): Promise<{username: string; wallet_address: string}>  {
        let query = 'SELECT username, wallet_address FROM users WHERE username=$1';
        let value = [username];

        let userData = (await DatabaseOperations.dbConnection.query(query, value)).rows[0];
        return userData
    }

    async fetchWalletBalance(walletAddress: string): Promise<number> {
        const walletData: BlockCypherAddressData = (await axios.get(`${this.#api}/addrs/${walletAddress}/balance?${this.#token}`)).data;
        return walletData.balance;
    }

    async fetchInfoForTxArray(txHashArray: string[]) {
        let requestArr: Promise<AxiosResponse<TxHashInfo>>[] = [];
        txHashArray.forEach(x => {
            requestArr.push(axios.get(`${this.#api}/txs/${x}`));
        });

        const txInfoForHashesResponses = await Promise.all(requestArr);
        const txInfoForHashes: TxHashInfo[] = txInfoForHashesResponses.map(x => x.data);

        // now turn litoshis into litecoins
        txInfoForHashes.forEach(x => {x.total = (x.total/this.litoshiFactor)});
        txInfoForHashes.forEach(x => {x.fees = (x.fees/this.litoshiFactor)});
        return txInfoForHashes;
    }

    async fetchTxInformation(txHash: string) {

    }

    async fetchUSDPrice() {
        let priceData = (await axios.get('https://api.coinbase.com/v2/prices/LTC-USD/buy')).data
        return Number(priceData.data.amount);
    }
}

export const dbOps = DatabaseOperations.Instance;
export const sportOps = SportsDataOperations.SportsInstance;
export const wagerOps = new WagerDataOperations();
export const ltcOps = LitecoinOperations.LitecoinInstance;