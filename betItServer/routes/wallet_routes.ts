'use strict';
export { };
import { Request, Response } from 'express';
import { WalletInformation, NewTransaction, XRPWalletInfo } from '../models/dataModels.js';
import express from 'express';
import { pool } from '../database_connection/pool.js';
import { json } from 'body-parser';
import { mainLogger, xrpLogger } from '../loggerSetup/logSetup.js';
import axios from 'axios';
import { encryptKey, decryptKey } from './encrypt.js';
import {rippleApi} from '../RippleConnection/ripple_setup.js';
let router = express.Router();

async function sendCoins(senderAddr: string, receiverAddr: string, senderPrivKey: string, amount: number) {
    // construct the transaction message
    let newtx: NewTransaction = {
        inputs: [{ addresses: [senderAddr] }],
        outputs: [{ addresses: [receiverAddr], value: amount }]
    };

    // import private key of address I want to transfer coins from
    const keyBuffer = Buffer.from(senderPrivKey, 'hex')
    let keys = bitcoin.ECPair.fromPrivateKey(keyBuffer, { network: currentNetwork })

    try {
        let tmptx = await axios.post(`${apiTest}/txs/new`, {
            inputs: [{ addresses: [senderAddr] }],
            outputs: [{ addresses: [receiverAddr], value: amount }]
        });
        // signing each of the hex-encoded string required to finalize the transaction
        tmptx.data.pubkeys = [];
        tmptx.data.signatures = tmptx.data.tosign.map(function (tosign: any, n: any) {
            tmptx.data.pubkeys.push(keys.publicKey.toString('hex'));
            return bitcoin.script.signature.encode(
                keys.sign(Buffer.from(tosign, "hex")),
                0x01,
            ).toString("hex").slice(0, -2);
        });

        // remove circular references in the object
        let circularsRemoved = fclone(tmptx)

        let sendtx = {
            tx: circularsRemoved.data.tx,
            tosign: circularsRemoved.data.tosign,
            signatures: circularsRemoved.data.signatures,
            pubkeys: circularsRemoved.data.pubkeys
        };

        // sending back the transaction with all the signatures to broadcast
        let finaltx = await axios.post(`${apiTest}/txs/send`, JSON.stringify(sendtx));
        if (finaltx) {
            return 200
        }
    } catch (err) {
        return 500
    }
}

router.post('/create-wallet', async (req: Request, res: Response) => {
    if (req.body.hasOwnProperty('userName')) {
        const name: string = req.body.userName;
        await rippleApi.connect();
        if (rippleApi.api.isConnected()) {
            const newUserWallet: XRPWalletInfo = rippleApi.createTestWallet();
            await rippleApi.disconnect();
            res.send({newUserWallet});
        } else {
            res.send('having trouble connecting to the network');
        }
        res.send('complete');
    } else {
        res.send('must send in a user name');
    }
});

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