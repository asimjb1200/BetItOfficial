'use strict';
export { };
import { Request, Response } from 'express';
import {BlockCypherAddressData } from '../models/dataModels.js';
import express from 'express';
import { dbOps, ltcOps } from '../database_connection/DatabaseOperations.js';
import { json } from 'body-parser';
import { mainLogger } from '../loggerSetup/logSetup.js';
import { encrypt, decrypt } from './encrypt.js';
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
            try {
                let balance: number = await ltcOps.fetchWalletBalance(req.body.address);
                let dollarEquivalent: number = await ltcOps.fetchUSDPrice();
                
                res.status(200).json({balance, dollarEquivalent: balance * dollarEquivalent});
            } catch (err) {
                mainLogger.error(`
                There was an error with the block cypher balance endpoint.\n Address used: ${req.body.address}\n Message: ${err.message}`);
                // res.status(200).json({balance});
                res.status(500).json({message:'There was an error getting your balance.'});
            }
        } else {
            res.status(401).json({message: 'This is not your wallet'})
        }
    }
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