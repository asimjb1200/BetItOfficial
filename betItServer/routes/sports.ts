import express, { Request, Response } from 'express';
import axios, { AxiosResponse } from'axios';
import * as cp from 'child_process';
import { dbOps, sportOps } from '../database_connection/DatabaseOperations.js';
import { stderr, stdout } from 'process';
import { BallDontLieData } from '../models/dataModels.js';
import { GameModel } from '../models/dbModels/dbModels.js';
let router = express.Router();

/* BASKETBALL */
router.get('/bball/populate-games', async (req: Request, res: Response) => {
    const games = await sportOps.insertAllGamesForSeason();
    res.send({games});
});

router.get('/bball/games-this-week', async (req: Request, res: Response) => {
    const data = await sportOps.getAllGamesThisWeek();
    res.json(data);
});

router.post('/bball/games-by-date', async (req: Request, res: Response) => {
    let date = new Date(req.body.date);

    let games: GameModel[] = await sportOps.getGamesByDate(date);
    
    // if (games.length > 0) {
        res.status(200).json(games);
    // } else {
    //     res.status(404).send("No games today");
    // }
});

router.get('/test', async (req, res) => {
    let index = 4;
    let requestArr: Promise<AxiosResponse<BallDontLieData>>[] = [];
    let intervalId = setInterval(async () => {
        if (index > 1) {
            for (let i = 1; i < index; i++) {
                requestArr.push(axios.get('https://www.balldontlie.io/api/v1/games/'+i)); 
            }

            let allGames = await Promise.all(requestArr);
            console.log(allGames + '\n');
            index--;
            requestArr = [];
        } else {
            console.log("no more requests to send");
            clearInterval(intervalId);
        }
    }, 10000);
    res.send('good');
});

export default router;