import express, { Request, Response } from 'express';
import axios from'axios';
import { userLogger, wagerLogger } from '../loggerSetup/logSetup.js';
import { dbOps, ltcOps, sportOps, wagerOps } from '../database_connection/DatabaseOperations.js';
import { WagerModel } from '../models/dbModels/dbModels.js';
let router = express.Router();
import {io} from '../bin/www.js'
import { WagerStatus } from '../models/dataModels.js';
import { emailHelper } from '../EmailNotifications/EmailWorker.js';

router.post('/get-wagers-by-game', async (req: Request, res: Response) => {
    if (req.body.hasOwnProperty("gameId") && typeof req.body.gameId == 'number') {
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
                
                if (wagersThatPassedTest.length > 0) {
                    res.status(200).json(wagersThatPassedTest);
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
    } else {
        res.status(400).send('invalid game id');
    }
});

router.post('/add-fader-to-wager', async (req: Request, res: Response) => {
    if (req.body.hasOwnProperty("wager_id") && req.body.hasOwnProperty("fader_address")) {
        const faderAddr = req.body.fader_address
        const wagerId = req.body.wager_id

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

            // now everything is okay
            return res.status(200).json(updatedWager);
        } catch (error) {
            wagerLogger.error(`Wasn't able to add a fader ${req.body.fader_address} to wager ${req.body.wager_id}.\n ${error}`)
            return res.status(500).json({message: "Something went wrong while trying to add a fader."})
        }
    }
});

router.post('/create-wager', async (req: Request, res: Response) => {
    const props = ['bettor', 'wagerAmount', 'gameId', 'bettorChosenTeam'];
    let allPropsPresent = true;
    // check req object for the fields that I need to create the wager
    props.forEach(field => {
        if (!req.body.hasOwnProperty(field)) {
            allPropsPresent = false
        }
    });

    if (allPropsPresent) {
        if (typeof req.body.bettor == 'string' && 
            typeof req.body.wagerAmount == 'number' && 
            typeof req.body.bettorChosenTeam == 'number' &&
            typeof req.body.gameId == 'number'
            ) {
                const {bettor, wagerAmount, gameId, bettorChosenTeam} = req.body;
                try {
                    await wagerOps.createWager(bettor, wagerAmount, gameId, bettorChosenTeam);
                    res.status(201).json({message: 'Wager Created'});
                } catch (error) {
                    wagerLogger.error(`An error occurred when creating a new wager for ${bettor} for team ${bettorChosenTeam} on game ${gameId} with an amount of ${wagerAmount} LTC.\n ${error}`);
                    res.status(500).json({message: "Something went wrong while trying to create the wager."});
                }
            } else {
                res.status(400).json({message:'Incorrect JSON body'});
            }
    } else {
        res.status(400).json({message:'Missing necessary fields'});
    }
});

router.get('/check-number-of-bets', async (req: Request, res: Response) => {
const walletOccurrences = await wagerOps.checkAddressWagerCount(req.query.walletAddress as string);
if (walletOccurrences != null) {
    res.status(200).json({numberOfBets: Number(walletOccurrences.count)})
} else {
    res.status(200).json({numberOfBets: 0});
}
});

router.post('/delete-wager', async (req: Request, res: Response) => {
    if (req.body.hasOwnProperty('wagerId') && typeof req.body.wagerId == 'number') {
        try {
            await wagerOps.deleteWager(req.body.wagerId);
            res.status(200).send('OK');
        } catch(err) {
            console.log(err)
            wagerLogger.error(`Problem trying to delete wager ${req.body.wagerId}.\n ${err}`)
            res.status(500).send({message: "Something went wrong when trying to delete. Try again."})
        }
    } else {
        res.status(400).send('invalid data sent');
    }
});

router.get('/get-users-wagers', async (req: Request, res: Response) => {
    if (req.query.walletAddr && typeof req.query.walletAddr == 'string') {
        const walletAddr = req.query.walletAddr as string;
        try {
            // search the database for the user's bets
            const userWagers: WagerStatus[] = await wagerOps.getUsersWagers(walletAddr);
            res.status(200).json(userWagers);
        } catch (error) {
            wagerLogger.error(`Error when fetching wagers for ${req.query.walletAddr}.\n${error}`);
            res.status(500).json({message: 'There was a problem fetching the records'})
        }
    } else {
        res.status(400).json({message: 'that is not a string'})
    }
});

router.post('/check-for-fader', async (req: Request, res: Response) => {
    if (req.body.wagerId && typeof req.body.wagerId == 'number') {
        try {
            let wagerIsAvailable = await wagerOps.wagerIsTaken(req.body.wagerId);
            res.status(200).send(wagerIsAvailable);
        } catch (error) {
            wagerLogger.error(`Error occured when checking for a fader for wager ${req.body.wagerId}.\n ${error}`);
            res.status(500).json({message: "Something went wrong while fetching the user's wager."});
        }
    } else {
        res.status(400).json({message: 'that is not a number'})
    }
});

export default router;