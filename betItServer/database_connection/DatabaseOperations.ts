import pg, { Pool } from 'pg';
import createSubscriber from "pg-listen"
import { apiLogger, mainLogger, sportsLogger, tokenLogger, userLogger, wagerLogger } from '../loggerSetup/logSetup.js';
import { BallDontLieData, BallDontLieResponse, BlockCypherAddressData, BlockCypherTxResponse, ClientUserModel, DatabaseGameModel, DatabaseUserModel, GameToday, JWTUser, LoginResponse, UserTokens, WagerStatus, wagerWinners, WalletInfo, XRPWalletInfo } from '../models/dataModels.js';
import { rippleApi } from '../RippleConnection/ripple_setup.js';
import bcrypt from 'bcrypt';
import * as tokenHandler from '../tokens/token_auth.js';
import { bballApi } from '../SportsData/Basketball.js';
import { EscrowWallet, GameModel, WagerModel, WagerNotification } from '../models/dbModels/dbModels.js';
import axios, { AxiosError, AxiosResponse } from 'axios';
import { AddressInformation } from "../models/dataModels";
import bitcoinjs from "bitcoinjs-lib";
import dotenv from 'dotenv';
import { encrypt, decrypt } from '../routes/encrypt.js';
import jwt from 'jsonwebtoken';
import { allSocketConnections, io } from '../bin/www.js';

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
                    // generate and save tokens to the db
                    const tokens: UserTokens = await this.insertTokensForUser(username);
                    const verifiedUser: JWTUser = (await jwt.verify(tokens.accessToken, process.env.ACCESSTOKENSECRET!))as JWTUser;

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

    async logout(token: string) {
        const deleteQuery = 'UPDATE users SET access_token=null, refresh_token=null WHERE access_token=$1';
        const deleteQueryValues = [token];

        try {
            let logoutInfo = await DatabaseOperations.dbConnection.query(deleteQuery, deleteQueryValues);
            if (logoutInfo.rowCount == 1) {
                return true
            } else {
                userLogger.error(`token not found during logout: ${token}`);
                return false
            }
        } catch (error) {
            return false
        }
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

        let updateMe = await DatabaseOperations.dbConnection.query(insertAccessTokenQuery, insertAccessTokenQueryValues);

        return { accessToken, refreshToken };
    }

    findAccessToken(accessToken: string) {

    }

    async findRefreshToken(refreshToken: string): Promise<string | undefined> {
        const findRefresh = 'SELECT refresh_token FROM users WHERE refresh_token=$1';
        const findRefreshValues = [refreshToken];
        return (await DatabaseOperations.dbConnection.query(findRefresh, findRefreshValues)).rows[0];
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

    public static get SportsInstance() {
        return this._sportsInstance || (this._sportsInstance = new this());
    }

    async insertAllGamesForSeason() {
        let currentYear = new Date().getFullYear();
        // const findCurrentSeason = 'SELECT season FROM games LIMIT 1';
        // const games: DatabaseGameModel[] = (await DatabaseOperations.dbConnection.query(findCurrentSeason)).rows;
        let insertNewGames: DatabaseGameModel[] = [];
        let queryArray = [];

        try {
            // grab all of the games for the season..
            const currentSznGames: BallDontLieData[] = await bballApi.getAllRegSznGames(--currentYear);

            // grab only the data that I need for my database table (game_id, home_team, away_team, game_begins, season)
            for (const game of currentSznGames) {
                const { id, home_team, visitor_team, date, season } = game;
                insertNewGames.push({ game_id: id, sport: 'Basketball', home_team: home_team.id, visitor_team: visitor_team.id, game_begins: date, season });
            }

            // now insert each row into the db
            for (const x of insertNewGames) {
                let insertQuery = 'INSERT INTO games (game_id, sport, home_team, visitor_team, game_begins, season) VALUES ($1, $2, $3, $4, $5, $6)';
                let values = [x.game_id, x.sport, x.home_team, x.visitor_team, x.game_begins, x.season];
                queryArray.push(DatabaseOperations.dbConnection.query(insertQuery, values));
            }

            let allDataInserted = await Promise.all(queryArray);
            return 'Done';

        } catch (err) {
            sportsLogger.error(`Couldn't retrieve data for the ${currentYear} szn: ` + err);
        }
    }

    async getGameTimeFromDB(gameId: number) {
        const sql = "select game_begins from games where game_id=$1";
        const gameTimeResponse = (await DatabaseOperations.dbConnection.query(sql, [gameId])).rows[0];
        return gameTimeResponse.game_begins;
    }

    async getGamesByDate(date: Date) {
        const month = date.getMonth() + 1
        const day = date.getDate()
        const year = date.getFullYear();
        const queryThisDate = `${year}-${month}-${day}`;
        try {
            const sql = `
                SELECT *
                FROM games
                WHERE CAST(game_begins as DATE)=$1
            `;
            const games = await DatabaseOperations.dbConnection.query(sql, [queryThisDate])
            return games.rows
        } catch (error) {
            sportsLogger.error(`Problem with database when looking for games on date ${queryThisDate}. \n Error Msg: ${error}`);
            return []
        }
    }

    async getAllGamesThisWeek() {
        // query for games that are a week out from today
        let games: GameModel[] = (await DatabaseOperations.dbConnection.query("select * from games where game_begins='2020-12-22 18:00:00-06'")).rows
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
                    const { home_team, visitor_team, game_id } = x;
                    gameHolder.push({ home_team, visitor_team, game_id, game_date: today });
                }
            });

            if (gameHolder.length > 0) {
                this.scoreChecker(gameHolder);
            }
        } else {
            apiLogger.info("No games being played today.");
        }
    }

    async updateGamesWithWinners(gameId: number, winningTeam: number) {
        // update the games table with the winner of each game
        let updateGamesQuery = "UPDATE games SET winning_team=$1 WHERE game_id=$2";
        await DatabaseOperations.dbConnection.query(updateGamesQuery, [winningTeam, gameId]);

        // once the games table is updated, my database trigger will update the wagers table
    }

    scoreChecker(todaysGames: GameToday[]) {
        let requestArr: any[] = [];

        let intervalId = setInterval(async () => {
            // grab the game id from each game and build a request with it
            todaysGames.forEach(x => {
                requestArr.push(axios.get(`${this.ballDontLieApi}games/${x.game_id}`));
            });

            try {
                let allGamesData: BallDontLieData[] = await Promise.all(requestArr);
                // find out which games were completed
                for (const gameData of allGamesData) {
                    // check to see if the game is over
                    if (gameData.status == 'Final') {
                        let winningTeam = (gameData.home_team_score > gameData.visitor_team_score) ? gameData.home_team.id : gameData.visitor_team.id;

                        try {
                            // record the game winner and the score in the 'games' table
                            this.updateGamesWithWinners(gameData.id, winningTeam);

                            // remove that game from the todaysGames array
                            todaysGames.filter(x => x.game_id !== gameData.id);

                            if (todaysGames.length == 0) {
                                // then stop the interval
                                clearInterval(intervalId);
                            } else {
                                requestArr = [];
                            }
                        } catch (error) {
                            wagerLogger.error(`Issue saving game winner to db for game : ${gameData.id}. \n Error: ` + error);
                        }
                    }
                }
            } catch (apiErr) {
                apiLogger.error("Trouble fetching game information during score checker interval: " + apiErr);
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

    async cancelWager() {

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

    async getWagersByGameId(gameId: number) {
        try {
            const wagers: WagerModel[] = (await DatabaseOperations.dbConnection.query('select * from wagers where game_id=$1', [gameId])).rows;

            const availableWagers = wagers.length > 0 ? wagers.filter(wager => wager.is_active == false) : [];
            return availableWagers
        } catch (error) {
            mainLogger.error(`Error when retrieving wagers for gameId ${gameId}. \n Error: ${error}`);
            return [];
        }
    }

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

            // send notification to the winner's socket connection
            io.to(allSocketConnections[winner].id).emit('payout started', {winner});
            wagerLogger.info(`payout started for address ${winner} in the amount of ${balanceAfterMyCut} LTC for wager ${wagerId}`);
        } catch (error) {
            wagerLogger.error(`An error occurred during the payout function: ${error}`);
        }
    }

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

    async createWager(bettor: string, amount: number, game_id: number, chosen_team: number, fader: string ="") {
        // create the escrow wallet and hold the data in memory
        let escrowAddr = await ltcOps.createAddr(true);

        // create the wager and insert it into the wager's table
        let wagerInsertQuery = 'INSERT INTO wagers (bettor, wager_amount, game_id, is_active, bettor_chosen_team, escrow_address) values ($1, $2, $3, $4, $5, $6) RETURNING *'
        let values = [bettor, amount, game_id, false, chosen_team, escrowAddr?.address];
        const wagerInsert: WagerModel = (await DatabaseOperations.dbConnection.query(wagerInsertQuery, values)).rows[0];

        // now insert the escrow addr info into the escrow table, using the wager's id as the FK. no crypto deposited yet
        if (escrowAddr) {
            // determine how much of the wager will be taken out due to tx fees before sending
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
        const escrowAddr: string = await (await DatabaseOperations.dbConnection.query(escrowSql, [wager.id])).rows[0].address;
        // take the money from each user's wallet and send it to escrow
        let promiseArray = [
            this.createTx(bettor, escrowAddr, wager.wager_amount),
            this.createTx(fader, escrowAddr, wager.wager_amount)
        ];

        const escrowWalletFunded: string[] = await Promise.all(promiseArray);

        if (escrowWalletFunded[0] == "txs began" && escrowWalletFunded[1] == "txs began") {
            // send notification to the users that the crypto is being taken from their wallets
            io
            .to(allSocketConnections[bettor].id)
            .emit(
                'wallet txs', 
                {
                    msg: `Tx Started`, 
                    details: `${wager.wager_amount} LTC sent to escrow for the wager`, 
                    escrowWallet: `${escrowAddr}`
                }
            );

            io
            .to(allSocketConnections[fader].id)
            .emit(
                'wallet txs', 
                {
                    msg: `Tx Started`, 
                    details: `${wager.wager_amount} LTC sent to escrow for the wager`, 
                    escrowWallet: `${escrowAddr}`
                }
            );
            return true;
        } else {
            return false;
        }
    }

    async createAddr(escrow: Boolean, username?: string) {
        if (!escrow && username) {
            try {
                let addrResponse: AddressInformation = await axios.post(this.#api + `/addrs?${this.#token}`);
                const addrData = addrResponse.data
                // encrypt priv key first
                addrData.private = encrypt(addrData.private);
                
                // update that users wallet attribute
                // await this.updateUserLtcAddr(username, addrData.address, encryptedPrivKey)
    
                return addrData
            } catch (error) {
                console.log(error)
            }
        } else {
            try {
                let addrResponse: AddressInformation = await axios.post(this.#api + `/addrs?${this.#token}`);
                let addrData = addrResponse.data;
    
                // encrypt priv key first
                addrData.private = encrypt(addrData.private);
    
                return addrData
            } catch (error) {
                console.log(error)
            }
        }
    }

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
            outputs: [{ addresses: [process.env.MASTERWALLERADDRESS as string], value: amountInLitoshis }]
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

    async fetchAddressTxCount(address: string){
        const walletData: BlockCypherAddressData = (await axios.get(`${this.#api}/addrs/${address}/balance?${this.#token}`)).data;
        return walletData.txrefs[0].confirmations;
    }

    async fetchFullAddressData(address: string) {
        const walletData: BlockCypherAddressData = (await axios.get(`${this.#api}/addrs/${address}/balance?${this.#token}`)).data;
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

    async fetchUSDPrice() {
        let priceData = (await axios.get('https://api.coinbase.com/v2/prices/LTC-USD/buy')).data
        return Number(priceData.data.amount);
    }
}

export const dbOps = DatabaseOperations.Instance;
export const sportOps = SportsDataOperations.SportsInstance;
export const wagerOps = new WagerDataOperations();
export const ltcOps = LitecoinOperations.LitecoinInstance;