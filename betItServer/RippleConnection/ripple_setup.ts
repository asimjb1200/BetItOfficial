import * as ripple from 'ripple-lib';
import { RippleAPI } from 'ripple-lib';
import { XRPWalletInfo } from '../models/dataModels.js';

class RippleHelpers {
    readonly #api: RippleAPI;
    private static _instance: RippleHelpers;
    private constructor() {
        this.#api = new ripple.RippleAPI({
            server: 'wss://s1.ripple.com' // Public rippled server
        });

        this.#api.on('error', (errorCode, errorMessage) => {
            console.log(errorCode + ': ' + errorMessage);
        });
        this.#api.on('connected', () => {
            console.log('connected');
        });
        this.#api.on('disconnected', (code) => {
            // code - [close code](https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent) sent by the server
            // will be 1000 if this was normal closure
            console.log('disconnected, code:', code);
        });
    }

    public static get Instance(): RippleHelpers {
        return this._instance || (this._instance = new this());
    }

    async connect() {
        return this.#api.connect();
    }

    async disconnect() {
        return this.#api.disconnect();
    }

    get api() {
        return this.#api;
    }

    createTestWallet(): XRPWalletInfo {
        return this.#api.generateXAddress({test: true});
    }

}

export const rippleApi = RippleHelpers.Instance;