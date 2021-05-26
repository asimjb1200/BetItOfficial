import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import schedule from 'node-schedule';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// import bodyParser from 'body-parser';
import logger from 'morgan';
import fs from 'fs';
// import indexRouter from './routes/index';
import usersRouter from './routes/users.js';
import sportsHandler from './routes/sports.js';
import walletHandler from './routes/wallet_routes.js';
import { sportOps, wagerOps } from './database_connection/DatabaseOperations.js';
let accessLogStream = fs.createWriteStream(path.join(__dirname, '/logs/access.log'), { flags: 'a' })
let app = express();

app.use(logger('dev'));
app.use(logger('combined', { stream: accessLogStream }))
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));
app.use(express.static(path.join(__dirname, 'public')));

// listen to db events
wagerOps.setUpSubscriber();

// set up scheduler to check for nba games once a day at 6am central
const gameDayJob = schedule.scheduleJob({hour: 6, minute: 0, tz: 'America/Chicago'}, function(){
  sportOps.gameDayCheck();
});

// app.use('/', indexRouter);
// app.use('/btc-handler', walletHandler);
app.use('/xrp-handler', walletHandler);
// app.use('/sports-handler', authenticateJWT, sportsHandler);
app.use('/sports-handler', sportsHandler);
app.use('/users', usersRouter);

export default app;
