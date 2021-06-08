'use strict';
export { };
import { Request, Response } from 'express';
import {XRPWalletInfo } from '../models/dataModels.js';
import express from 'express';
import { dbOps, ltcOps } from '../database_connection/DatabaseOperations.js';
import { json } from 'body-parser';
import { mainLogger, xrpLogger } from '../loggerSetup/logSetup.js';
import axios from 'axios';
import { encryptKey, decryptKey } from './encrypt.js';
import {rippleApi} from '../RippleConnection/ripple_setup.js';
let router = express.Router();

async function sendCoins(senderAddr: string, receiverAddr: string, senderPrivKey: string, amount: number) {

}

router.post('/create-ltc-addr', async (req: Request, res: Response) => {
    if (req.body.hasOwnProperty('userName')) {
        const walletInfo = await ltcOps.createAddr(false, req.body.userName);
        res.json(walletInfo);
    }
});

// router.post('/send-ltc-transaction', async (req: Request, res: Response) => {
//     if (req.body.hasOwnProperty('sender') && req.body.hasOwnProperty('receiver') && req.body.hasOwnProperty('value')) {

//     } else {

//     }
// });

router.post('/test-encryption/:pw', async (req: Request, res: Response) => {
    const plainPrivateKey = req.params.pw;
    const encryptedText = encryptKey(plainPrivateKey);
    res.send(encryptedText);
});

router.post('/test-decryption/:pw', async (req: Request, res: Response) => {
    const plainPrivateKey = req.params.pw;
    const decryptedText = decryptKey(plainPrivateKey);
    res.send(decryptedText);
});

router.get('/fund-master-wallet', (req: Request, res: Response) => {

})

router.post('/send-to-escrow', async (req: Request, res: Response) => {
    const { user1, user2, wagerAmount } = req.body;
});

router.get('/pay-winner/:user', (req: Request, res: Response) => {

})

router.get('/get-my-address/:user', (req: Request, res: Response) => {

})

export default router;