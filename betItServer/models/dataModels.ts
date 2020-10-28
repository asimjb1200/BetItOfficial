export type WalletInformation = {
    data: {
        private: string;
        public: string;
        wif: string;
        address: string;
    }
}

export type NewTransaction = {
    inputs: [
        {
            addresses: string[],
        }
    ],
    outputs: [
        {
            addresses: string[],
            value: number,
        }
    ]
}

export type DatabaseUserModel = {
    rows: UserModel[],
}

export type UserModel = {
    id: number;
    username: string;
    password?: string;
    email: string;
    wallet_address?: string;
    access_token?: string;
    refresh_token?: string;
    wallet_pk?: string;
}