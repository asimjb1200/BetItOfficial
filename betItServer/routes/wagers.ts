import express, { Request, Response } from 'express';
import axios from'axios';
import { userLogger, wagerLogger } from '../loggerSetup/logSetup.js';
import { dbOps, ltcOps, sportOps, wagerOps } from '../database_connection/DatabaseOperations.js';
import { WagerModel } from '../models/dbModels/dbModels.js';
import {allSocketConnections, io} from '../bin/www.js'
import { MainResponseToClient, WagerStatus } from '../models/dataModels.js';
import { emailHelper } from '../EmailNotifications/EmailWorker.js';
import { check, query, validationResult } from 'express-validator';
let router = express.Router();

router.post(
    '/get-wagers-by-game', 
    check('gameId').exists().notEmpty().isInt(),
    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(422).json({ errors: errors.array() })
        }
        try {
            let wagers: WagerModel[] = await wagerOps.getWagersByGameId(req.body.gameId);
            if (wagers.length > 0) {

                // the numeric data type from the database comes in as a string
                wagers.forEach(element => {
                    element.wager_amount = Number(element.wager_amount);
                });

                let wagersThatPassedTest: WagerModel[] = [];
                
                // filter out wagers whose gametime is in 30 minutes or less
                for (const x of wagers) {
                    // first locate the gametime of the game that the wager is associated with
                    const gameTime: Date = await sportOps.getGameTimeFromDB(x.game_id);
                    if (sportOps.moreThanThirtyMinutesAway(gameTime)) {
                        wagersThatPassedTest.push(x);
                    }
                }

                let responseObj: MainResponseToClient<WagerModel[]> = {
                    dataForClient: wagersThatPassedTest
                }

                if (res.locals.newAccessToken) {
                    responseObj.newAccessToken = res.locals.newAccessToken;
                }
                
                if (wagersThatPassedTest.length > 0) {
                    res.status(200).json(responseObj);
                } else {
                    res.status(404).json([]);
                }
            } else {
                res.status(404).json([]);
            }
        } catch (error) {
            wagerLogger.error(`An error occurred when fetching wagers for game ${req.body.gameId}.\n ${error}`);
            res.status(500).json({message: "Something went wrong while trying to fetch wagers for the game."})
        }
});

router.post(
    '/add-fader-to-wager',
    [
        check('wager_id').exists().bail().notEmpty().bail().isInt(),
        check('fader_address').exists().bail().notEmpty().bail().isString().bail().isAlphanumeric()
    ],
    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(422).json({ errors: errors.array() })
        }
        const faderAddr = req.body.fader_address
        const wagerId = req.body.wager_id

        // FIXME: This function doesn't work correctly
        try {
            // make the update to the wager
            let updatedWager: WagerModel = await wagerOps.updateWagerWithFader(wagerId, faderAddr);

            // Send the crypto from each user's wallet to the escrow address
            let escrowFunded = await ltcOps.fundEscrowForWager(updatedWager.bettor, faderAddr, updatedWager.id);

            // find the email address that belongs to each wallet address
            let emailAddresses: string[] = [];
            for (const address of [updatedWager.bettor, faderAddr]) {
                let email = await dbOps.getEmailAddress(address);
                emailAddresses.push(email);
            }

            // email each user about the cypto being taken from their wallets
            await Promise.all([
                emailHelper.emailUser(emailAddresses[0], "Crypto Being Moved To Escrow", `Your wager is now active. ${updatedWager.wager_amount} LTC has started its transit to escrow from your wallet in preparation for the game.`),
                emailHelper.emailUser(emailAddresses[1], "Crypto Being Moved To Escrow", `Your wager is now active. ${updatedWager.wager_amount} LTC has started its transit to escrow from your wallet in preparation for the game.`)
            ]);

            // emit the updated wager to the app so that everyone will update their views
            io.emit('wager updated', {msg: 'A wager has just been taken', wager: updatedWager});

            let responseObj: MainResponseToClient<WagerModel> = {
                dataForClient: updatedWager
            };

            if (res.locals.newAccessToken) {
                responseObj.newAccessToken = res.locals.newAccessToken;
            }
            // now everything is okay
            return res.status(200).json(responseObj);
        } catch (error) {
            wagerLogger.error(`Wasn't able to add a fader ${req.body.fader_address} to wager ${req.body.wager_id}.\n ${error}`)
            return res.status(500).json({message: "Something went wrong while trying to add a fader."})
        }
});

router.post(
    '/create-wager',
    [
        check('bettor').exists().bail().notEmpty().bail().isString().bail().isAlphanumeric(),
        check('wagerAmount').exists().bail().notEmpty().bail().isNumeric(),
        check('gameId').exists().bail().notEmpty().bail().isInt(),
        check('bettorChosenTeam').exists().bail().notEmpty().bail().isInt()
    ],
    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({ errors: errors.array() })
        }

        const {bettor, wagerAmount, gameId, bettorChosenTeam} = req.body;
        try {
            await wagerOps.createWager(bettor, wagerAmount, gameId, bettorChosenTeam);
            let responseObj: MainResponseToClient<{message: string}> = {dataForClient: {message: 'Wager Created'}};
            if (res.locals.newAccessToken) {
                responseObj.newAccessToken = res.locals.newAccessToken;
            }
            res.status(201).json(responseObj);
        } catch (error) {
            wagerLogger.error(`An error occurred when creating a new wager for ${bettor} for team ${bettorChosenTeam} on game ${gameId} with an amount of ${wagerAmount} LTC.\n ${error}`);
            res.status(500).json({message: "Something went wrong while trying to create the wager."});
        }
});

router.get(
    '/check-number-of-bets',
    query('walletAddress').exists().bail().notEmpty().bail().isString().bail().isAlphanumeric(), 
    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({ errors: errors.array() })
        }
        const walletOccurrences = await wagerOps.checkAddressWagerCount(req.query.walletAddress as string);
        let responseObj: MainResponseToClient<{numberOfBets: number}> = { dataForClient: { numberOfBets: Number(walletOccurrences.count) } }
        if (res.locals.newAccessToken) {
            responseObj.newAccessToken = res.locals.newAccessToken;
        }
        if (walletOccurrences != null) {
            res.status(200).json(responseObj)
        } else {
            responseObj.dataForClient.numberOfBets = 0
            res.status(200).json(responseObj);
        }
});

router.post('/delete-wager', check('wagerId').exists().bail().notEmpty().bail().isNumeric(), async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() })
    }
    try {
        // get the email addresses of the users in the wager
        const emailAddress = await wagerOps.findEmailAddressForBettorAndFader(req.body.wagerId);

        await wagerOps.deleteWager(req.body.wagerId);

        // email the user informing them of the deletion
        for (let emailObj of emailAddress) {
            emailHelper.emailUser(emailObj.email, "Your Wager Was Deleted", "<p>You have elected to cancel your wager. It has been removed from our servers.</p>");
        }

        res.status(200).send('OK');
    } catch(err) {
        console.log(err)
        wagerLogger.error(`Problem trying to delete wager ${req.body.wagerId}.\n ${err}`)
        res.status(500).send({message: "Something went wrong when trying to delete. Try again."})
    }
});

router.get('/get-users-wagers', query('walletAddr').exists().isString().isAlphanumeric(), async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() })
    }
    const walletAddr = req.query.walletAddr as string;
    try {
        // search the database for the user's bets
        const userWagers: WagerStatus[] = await wagerOps.getUsersWagers(walletAddr);
        const responseObj: MainResponseToClient<WagerStatus[]> = {
            dataForClient: userWagers
        }
        if (res.locals.newAccessToken) {
            responseObj.newAccessToken = res.locals.newAccessToken;
        }
        res.status(200).json(responseObj);
    } catch (error) {
        wagerLogger.error(`Error when fetching wagers for ${req.query.walletAddr}.\n${error}`);
        res.status(500).json({message: 'There was a problem fetching the records'})
    }
});

router.post('/check-for-fader', check('wagerId').exists().bail().notEmpty().bail().isNumeric(), async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() })
    }
    try {
        let wagerIsAvailable = await wagerOps.wagerIsTaken(req.body.wagerId as number);
        res.status(200).send(wagerIsAvailable);
    } catch (error) {
        wagerLogger.error(`Error occured when checking for a fader for wager ${req.body.wagerId}.\n ${error}`);
        res.status(500).json({message: "Something went wrong while fetching the user's wager."});
    }
});

export default router;