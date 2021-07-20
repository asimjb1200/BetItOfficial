import express, { Request, Response } from 'express';
import axios from'axios';
import { userLogger, wagerLogger } from '../loggerSetup/logSetup.js';
import { dbOps, ltcOps, wagerOps } from '../database_connection/DatabaseOperations.js';
import { WagerModel } from '../models/dbModels/dbModels.js';
let router = express.Router();
import {io} from '../bin/www.js'

router.post('/get-wagers-by-game', async (req: Request, res: Response) => {
    if (req.body.hasOwnProperty("gameId") && typeof req.body.gameId == 'number') {
        let wagers = await wagerOps.getWagersByGameId(req.body.gameId);
        if (wagers.length > 0) {
            res.status(200).json(wagers);
        } else {
            res.status(404).json([]);
        }
    } else {
        res.status(400).send('invalid game id');
    }
});

router.post('/add-fader-to-wager', async (req: Request, res: Response) => {
    if (req.body.hasOwnProperty("wager_id") && req.body.hasOwnProperty("fader_address")) {
        const faderAddr = req.body.fader_address
        const wagerId = req.body.wager_id

        // make the update to the wager
        let updatedWager: WagerModel = await wagerOps.updateWagerWithFader(wagerId, faderAddr);

        // emit the updated wager to the app so that everyone will update their views
        io.emit('wager updated', {msg: 'A wager has just been taken', wager: updatedWager});

        return res.status(200).json(updatedWager);
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
                await wagerOps.createWager(bettor, wagerAmount, gameId, bettorChosenTeam);
                res.status(201).json({message: 'Wager Created'})
            } else {
                res.status(400).json({message:'Incorrect JSON body'});
            }
    } else {
        res.status(400).json({message:'Missing necessary fields'});
    }
});

router.post('/check-for-fader', async (req: Request, res: Response) => {
    let wagerIsAvailable = await wagerOps.wagerIsTaken(req.body.wagerId);
    res.status(200).send(wagerIsAvailable);
});

export default router;