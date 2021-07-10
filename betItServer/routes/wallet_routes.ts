'use strict';
export { };
import { Request, Response } from 'express';
import {XRPWalletInfo } from '../models/dataModels.js';
import express from 'express';
import { dbOps, ltcOps } from '../database_connection/DatabaseOperations.js';
import { json } from 'body-parser';
import { mainLogger, xrpLogger } from '../loggerSetup/logSetup.js';
import axios from 'axios';
import { encrypt, decrypt } from './encrypt.js';
import {rippleApi} from '../RippleConnection/ripple_setup.js';
let router = express.Router();

router.post('/create-ltc-addr', async (req: Request, res: Response) => {
    if (req.body.hasOwnProperty('userName')) {
        const walletInfo = await ltcOps.createAddr(false, req.body.userName);
        res.json(walletInfo);
    }
});

router.post('/get-wallet-balance', async (req: Request, res: Response) => {
    if (req.body.hasOwnProperty('address') && req.body.hasOwnProperty('username')) {
        let walletOwnerData = await ltcOps.getWalletOwner(req.body.username);

        if (walletOwnerData.wallet_address == req.body.address) {
            let balance = await ltcOps.fetchWalletBalance(req.body.address);
            res.status(200).json({balance});
        } else {
            res.status(401).send('This is not your wallet')
        }
    }
});

router.post('/test-encryption/:pw', async (req: Request, res: Response) => {
    const plainPrivateKey = req.params.pw;
    const encryptedText = encrypt(plainPrivateKey);
    res.send(encryptedText);
});

router.post('/test-decryption/:pw', async (req: Request, res: Response) => {
    const plainPrivateKey = req.params.pw;
    const decryptedText = decrypt(plainPrivateKey);
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