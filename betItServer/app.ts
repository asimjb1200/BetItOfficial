let express = require('express');
let path = require('path');
let cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
let logger = require('morgan');
let fs = require('fs')
let indexRouter = require('./routes/index');
let usersRouter = require('./routes/users');
let sportsHandler = require('./routes/sports');
let walletHandler = require('./routes/wallet_routes');
import {authenticateJWT} from './tokens/token_auth';
let accessLogStream = fs.createWriteStream(path.join(__dirname, '/logs/access.log'), { flags: 'a' })
let app = express();

app.use(logger('dev'));
app.use(logger('combined', { stream: accessLogStream }))
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/btc-handler', walletHandler);
app.use('/sports-handler', authenticateJWT, sportsHandler);
app.use('/users', usersRouter);

module.exports = app;
