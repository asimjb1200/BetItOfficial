'use strict';
export { };
import { Request, Response } from 'express';
import {BlockCypherAddressData, BlockCypherTx, BlockCypherTxInput, BlockCypherTxOutput, BlockCypherTxRef, ClientWalletInfo, MainResponseToClient, TxHashInfo, WalletBalanceData, WalletInfo, WalletTxPreview } from '../models/dataModels.js';
import express from 'express';
import { dbOps, ltcOps } from '../database_connection/DatabaseOperations.js';
import { json } from 'body-parser';
import { apiLogger, mainLogger } from '../loggerSetup/logSetup.js';
import { encrypt, decrypt } from './encrypt.js';
import axios from 'axios';
import { check, param, validationResult } from 'express-validator';
let router = express.Router();

router.post('/create-ltc-addr', check('userName').exists().notEmpty().isString().isAlphanumeric(), async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() })
    }
    try {
        const walletInfo = await ltcOps.createAddr(false, req.body.userName as string);
        const responseObj: MainResponseToClient<ClientWalletInfo> = { dataForClient: walletInfo };
        if (res.locals.newAccessToken) {
            responseObj.newAccessToken = res.locals.newAccessToken;
        }

        res.status(200).json(responseObj);
    } catch (error) {
        if (axios.isAxiosError(error)) {
            apiLogger.error(`There was a problem creating a wallet for the user ${req.body.userName}: ${JSON.stringify(error.response?.data)}`);
            res.status(500).json("Couldn't create you wallet. try again.");
        } else {
            apiLogger.error(`There was a problem creating a wallet for the user ${req.body.userName}: ${error}`);
            res.status(500).json("Couldn't create you wallet. try again.");
        }
    }
});

/** handle any timestamps that come in with milliseconds.
 * the client app can only hand 2 digit seconds in the time stamp, so this will remove any excess digits.
 * @returns iso8601 format "yyyy-MM-dd'T'HH:MM:ssZ"
 */
function chopUpDate(date: string): string {
    date = date.replace(".", "Z");
    let cutOffHere = date.indexOf("Z") + 1;
    let correctDateString = date.substring(0, cutOffHere);
    return correctDateString;
}

router.get('/wallet-history/:walletAddress', param('walletAddress').exists().notEmpty().isString().isAlphanumeric(), async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() })
    }
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
        const clientObjects: WalletTxPreview[] = walletTxs.map((x: BlockCypherTx) => {
            if (x.addresses.length > 2) {
                let ltcAmountSent = 0;
                x.outputs.forEach(y => {
                    if (y.addresses[0] == req.params.walletAddress) {
                        ltcAmountSent += y.value;
                    }
                });
                
                if (x.received.length > 20) {
                    return {
                        date: chopUpDate(x.received), 
                        ltcAmount: (ltcAmountSent/10e7), 
                        received: true, 
                        fromAddress: "coinbase",
                        fees: (x.fees/10e7),
                        toAddress: x.addresses[0]
                    } as WalletTxPreview;
                } else {
                    return {
                        date: x.received, 
                        ltcAmount: (ltcAmountSent/10e7), 
                        received: true, 
                        fromAddress: "coinbase",
                        fees: (x.fees/10e7),
                        toAddress: x.addresses[0]
                    } as WalletTxPreview;
                }
            } else {
                if (x.received.length > 20) {
                    return {
                        date: chopUpDate(x.received), 
                        ltcAmount: (x.total/10e7), 
                        received: (x.addresses[0] == req.params.walletAddress ? false : true), 
                        fromAddress: x.addresses[0],
                        fees: (x.fees/10e7),
                        toAddress: x.addresses[1]
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
            }
        });

        const responseObj: MainResponseToClient<WalletTxPreview[]> = {dataForClient: clientObjects}
        if (res.locals.newAccessToken) {
            responseObj.newAccessToken = res.locals.newAccessToken;
        }
        res.status(200).json(responseObj);
    } catch (err) {
        if (axios.isAxiosError(err)) {
            mainLogger.error(`There was a problem retrieving the wallet's information: \n${err.response?.data}`);
            res.status(502).json({message: "there was a problem with the wallet request"});
        }
    }
});

router.post(
    '/get-wallet-balance', 
    [
        check('address').exists().notEmpty().isString().isAlphanumeric(), 
        check('username').exists().notEmpty().isString().isAlphanumeric()
    ], 
    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({ errors: errors.array() })
        }

        let walletOwnerData = await ltcOps.getWalletOwner(req.body.username);

        if (walletOwnerData.wallet_address == req.body.address) {
            try {
                const balance: number = await ltcOps.fetchWalletBalance(req.body.address);
                const dollarEquivalent: number = await ltcOps.fetchUSDPrice();
                const dataForClient: WalletBalanceData = {balance: Number((balance/10e7).toFixed(7)), dollarEquivalent: (Number((balance/10e7).toFixed(7)))*dollarEquivalent};
                const responseObj: MainResponseToClient<WalletBalanceData> = { dataForClient };
                if (res.locals.newAccessToken) {
                    responseObj.newAccessToken = res.locals.newAccessToken;
                }
                res.status(200).json(responseObj);
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
});

router.post(
    '/pay-user', 
    [
        check('fromAddress').exists().notEmpty().isString().isAlphanumeric(), 
        check('toAddress').exists().notEmpty().isString().isAlphanumeric(),
        check('ltcAmount').exists().notEmpty().isString()
    ], 
    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({ errors: errors.array() })
        }

        try {
            let sendMoney = await ltcOps.createTx(req.body.fromAddress, req.body.toAddress, Number(req.body.ltcAmount));
            if (sendMoney == "txs began") {
                res.status(200).json({message: "Transaction started"})
            } else {
                res.status(500).json({message: sendMoney});
            }
        } catch(err) {
            mainLogger.error("transaction error: " + err);
            res.status(500).json(err);
        }
    }
);

export default router;