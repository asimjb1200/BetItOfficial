import express, { Request, Response } from 'express';
import axios from'axios';
import { userLogger, wagerLogger } from '../loggerSetup/logSetup.js';
import { dbOps, wagerOps } from '../database_connection/DatabaseOperations.js';
let router = express.Router();

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
        let updatedWager = await wagerOps.updateWager(wagerId, faderAddr);

        return res.status(200).json(updatedWager);
    }
});

export default router;