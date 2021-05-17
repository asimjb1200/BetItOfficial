import express from 'express';
import axios from'axios';
import { userLogger, wagerLogger } from '../loggerSetup/logSetup.js';
import { dbOps } from '../database_connection/DatabaseOperations.js';
let router = express.Router();