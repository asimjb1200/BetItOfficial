import express, { Request, Response } from 'express';
import axios, { AxiosResponse } from'axios';
import * as cp from 'child_process';
import { dbOps, sportOps } from '../database_connection/DatabaseOperations.js';
import { stderr, stdout } from 'process';
import { BallDontLieData } from '../models/dataModels.js';
import { GameModel } from '../models/dbModels/dbModels.js';
import { mainLogger } from '../loggerSetup/logSetup.js';
import { allSocketConnections, io } from '../bin/www.js';
let router = express.Router();

/* BASKETBALL */
router.get('/bball/populate-games', async (req: Request, res: Response) => {
    const games = await sportOps.insertAllGamesForSeason();
    res.send({games});
});

router.get('/bball/games-this-week', async (req: Request, res: Response) => {
    try {
        const data = await sportOps.getAllGamesThisWeek();
        res.status(200).json(data);
    } catch (error) {
        mainLogger.error(`Couldn't retrieve games for the week: ${error}`);
        res.status(500).json('There was a problem fetching the games.');
    }
});

router.get('/bball/game-day-check', async (req: Request, res: Response) => {
    const asim = await sportOps.gameDayCheck();
    res.status(200).json('Asim');
});

router.post('/bball/games-by-date', async (req: Request, res: Response) => {
    let date = new Date(req.body.date);
    let timezone = req.body.timeZone;
    let games: GameModel[] = await sportOps.getGamesByDate(date, timezone);

    // filter out games that will be played within the next 30 minutes
    let filteredGames: GameModel[] = games.filter((x: GameModel) => {
        if (sportOps.gameIsMoreThan30MinsOut(x)) {
            return x;
        }
    });
    console.log(allSocketConnections);
    if (filteredGames != null && filteredGames.length > 0) {
        res.status(200).json(filteredGames);
    } else if (!filteredGames.length) {
        res.status(200).json(filteredGames);
    } else {
        res.status(200).json([]);
    }
});

router.get('/bball/get-game-time', async (req: Request, res: Response) => {
    // send game id to database and return the game time
    try {
        const gameTime = await sportOps.getGameTimeFromDB(Number(req.query.gameId));
        res.status(200).json({gameTime});
    } catch (error) {
        res.status(500).json("can't find that game");
    }
});

export default router;