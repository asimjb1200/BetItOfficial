import express, { Request, Response } from 'express';
import axios from'axios';
import { sportOps } from '../database_connection/DatabaseOperations.js';
let router = express.Router();

/* BASKETBALL */
router.get('/bball/current-games', async (req: Request, res: Response) => {
    const games = await sportOps.insertAllGamesForSeason();
    res.send({games});
});

export default router;


// football