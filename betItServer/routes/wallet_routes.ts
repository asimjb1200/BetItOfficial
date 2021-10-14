'use strict';
export { };
import { Request, Response } from 'express';
import {BlockCypherAddressData, BlockCypherTx, BlockCypherTxInput, BlockCypherTxOutput, BlockCypherTxRef, TxHashInfo, WalletTxPreview } from '../models/dataModels.js';
import express from 'express';
import { dbOps, ltcOps } from '../database_connection/DatabaseOperations.js';
import { json } from 'body-parser';
import { apiLogger, mainLogger } from '../loggerSetup/logSetup.js';
import { encrypt, decrypt } from './encrypt.js';
import axios from 'axios';
let router = express.Router();

router.post('/create-ltc-addr', async (req: Request, res: Response) => {
    if (req.body.hasOwnProperty('userName') && typeof req.body.userName == 'string') {
        try {
            const walletInfo = await ltcOps.createAddr(false, req.body.userName);
            res.status(200).json(walletInfo);
        } catch (error) {
            if (axios.isAxiosError(error)) {
                apiLogger.error(`There was a problem creating a wallet for the user ${req.body.userName}: ${JSON.stringify(error.response?.data)}`);
                res.status(500).json("Couldn't create you wallet. try again.");
            } else {
                apiLogger.error(`There was a problem creating a wallet for the user ${req.body.userName}: ${error}`);
                res.status(500).json("Couldn't create you wallet. try again.");
            }
        }
    } else {
        res.status(400).json("send in a string");
    }
});

router.get('/wallet-history/:walletAddress', async (req: Request, res: Response) => {
    if (req.params.walletAddress && typeof req.params.walletAddress == 'string') {
        try {
            // grab the wallet's data
            const fullWalletData = await ltcOps.fetchFullAddress(req.params.walletAddress as string);
    
            // now grab the txs from the wallet
            let walletTxs: BlockCypherTx[] = fullWalletData.txs;
    
            /* 
                FIXME: THERE IS AN ISSUE WHEN DEALING WITH COINBASE TXS. THE VALUE AND FROM ADDRESS
                SHOW UP INCORRECTLY IN THE CLIENT OBJECTS. TRY TO FIX LATER
            */
    
    
            // now construct the objects to send back to the client
            const clientObjects: WalletTxPreview[] = walletTxs.map(x => {
                if (x.addresses.length > 2) {
                    let ltcAmountSent = 0;
                    x.outputs.forEach(y => {
                        if (y.addresses[0] == req.params.walletAddress) {
                            ltcAmountSent += y.value;
                        }
                    });
    
                    return {
                        date: x.received, 
                        ltcAmount: (ltcAmountSent/10e7), 
                        received: true, 
                        fromAddress: "coinbase",
                        fees: (x.fees/10e7),
                        toAddress: x.addresses[0]
                    } as WalletTxPreview;
                } else {
                    
                    return {
                        date: x.received, 
                        ltcAmount: (x.total/10e7), 
                        received: (x.addresses[0] == req.params.walletAddress ? false : true), 
                        fromAddress: x.addresses[0],
                        fees: (x.fees/10e7),
                        toAddress: x.addresses[1]
                    } as WalletTxPreview;
                }
            });
    
            res.status(200).json(clientObjects);
        } catch (err) {
            if (axios.isAxiosError(err)) {
                mainLogger.error(`There was a problem retrieving the wallet's information: \n${err.response?.data}`);
                res.status(502).json({message: "there was a problem with the wallet request"});
            }
        }
    } else {
        res.status(400).json("send in a string");
    }
});

router.post('/get-wallet-balance', async (req: Request, res: Response) => {
    if (req.body.hasOwnProperty('address') && req.body.hasOwnProperty('username')) {
        let walletOwnerData = await ltcOps.getWalletOwner(req.body.username);

        if (walletOwnerData.wallet_address == req.body.address) {
            try {
                let balance: number = await ltcOps.fetchWalletBalance(req.body.address);
                let dollarEquivalent: number = await ltcOps.fetchUSDPrice();
                res.status(200).json({balance: Number((balance/10e7).toFixed(7)), dollarEquivalent: (Number((balance/10e7).toFixed(7)))*dollarEquivalent});
            } catch (err) {
                if (axios.isAxiosError(err)) {
                    mainLogger.error(`
                        There was an error with the block cypher balance endpoint.
                        Address used: ${req.body.address}\n Message: ${JSON.stringify(err.response?.data)}`
                    );
                    res.status(500).json({message:'There was an error getting your balance.'});
                } else {
                    mainLogger.error(`
                    There was an error with the block cypher balance endpoint.\n Address used: ${req.body.address}\n Message: ${err}`);
                    // res.status(200).json({balance});
                    res.status(500).json({message:'There was an error getting your balance.'});
                }
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

});

router.post('/pay-user', async (req: Request, res: Response) => {
    const {toAddress, fromAddress, ltcAmount} = req.body;
    try {
        let sendMoney = await ltcOps.createTx(req.body.fromAddress, req.body.toAddress, Number(req.body.ltcAmount));
        if (sendMoney == "txs began") {
            res.status(200).json({message: "Transaction started"})
        } else {
            res.status(500).json({message: sendMoney});
        }
    } catch(err) {
        mainLogger.error("transaction error: " + err);
    }
});

router.get('/get-my-address/:user', (req: Request, res: Response) => {

});

export default router;