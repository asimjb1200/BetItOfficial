import axios from "axios";
import { AddressInformation, BlockCypherAddressData, BlockCypherTxResponse } from "../models/dataModels";
import { encrypt } from "../routes/encrypt";

class LitecoinNetworking {
    #api: string = 'https://api.blockcypher.com/v1/ltc/main';
    #token: string = `token=${process.env.BLOCKCYPHER_TOKEN}`;

    async createAddr(escrow: Boolean, username?: string) {
        if (!escrow && username) {
            try {
                let addrResponse: AddressInformation = await axios.post(this.#api + `/addrs?${this.#token}`);
                const addrData = addrResponse.data
                // encrypt priv key first
                addrData.private = encrypt(addrData.private);
                
                // update that users wallet attribute
                // await this.updateUserLtcAddr(username, addrData.address, encryptedPrivKey)
    
                return addrData
            } catch (error) {
                console.log(error)
            }
        } else {
            try {
                let addrResponse: AddressInformation = await axios.post(this.#api + `/addrs?${this.#token}`);
                let addrData = addrResponse.data;
    
                // encrypt priv key first
                addrData.private = encrypt(addrData.private);
    
                return addrData
            } catch (error) {
                console.log(error)
            }
        }
    }

    async fetchWalletBalance(walletAddress: string): Promise<number> {
        const walletData: BlockCypherAddressData = (await axios.get(`${this.#api}/addrs/${walletAddress}/balance?${this.#token}`)).data;
        return walletData.balance;
    
    }
    
    async fetchUSDPrice() {
        let priceData = (await axios.get('https://api.coinbase.com/v2/prices/LTC-USD/buy')).data
        return Number(priceData.data.amount);
    }

}