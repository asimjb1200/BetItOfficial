export type WalletInformation = {
    data: {
        private: string;
        public: string;
        wif: string;
        address: string;
    }
}

declare global {
    namespace Express {
        interface Request {
            user?: JWTUser; // let the compiler know that it can expect to find a property named 'user' in the Request object
        }
    }
}

export type JWTUser = {
    username: string;
    iat: number;
    exp: number;
}


export type LoginResponse = {
    tokens?: UserTokens;
    validUser: boolean;
}

export type UserTokens = {
    accessToken: string;
    refreshToken: string;
}

export type XRPWalletInfo = {
    xAddress: string;
    secret: string;
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