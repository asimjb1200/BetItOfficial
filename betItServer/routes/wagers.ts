import express, { Request, Response } from 'express';
import axios from'axios';
import { userLogger, wagerLogger } from '../loggerSetup/logSetup.js';
import { dbOps, wagerOps } from '../database_connection/DatabaseOperations.js';
let router = express.Router();

router.post('/get-wagers-by-game', async (req: Request, res: Response) => {
    if (req.body.hasOwnProperty("gameId")) {
        let wagers = await wagerOps.getWagersByGameId(req.body.gameId);
        res.json(wagers);
    }
});

export default router;