export type AddressInformation = {
    data: {
        private: string;
        public: string;
        wif: string;
        address: string;
    }
}

export type WalletInfo = {
    token: string;
    name: string;
    addresses: string[];
}

declare global {
    namespace Express {
        interface Request {
            user?: JWTUser; // let the compiler know that it can expect to find a property named 'user' in the Request object
        }
    }
}

export type wagerWinners = {
    wallet: string;
    wagerAmount: number;
};

export type GameToday = {
    home_team: number;
    visitor_team: number;
    game_id: number;
    game_date: Date;
};

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
            addresses: string[];
        }
    ];
    outputs: [
        {
            addresses: string[];
            value: number;
        }
    ]
}

export type DatabaseUserModel = {
    rows: UserModel[];
}

export type DatabaseGameModel = {
    game_id: number;
    sport: string;
    home_team: number;
    visitor_team: number;
    game_begins: Date;
    home_score?: number;
    away_score?: number;
    winning_team?: number;
    season: number;
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

export type BallDontLieResponse = {
    data: {
        data: BallDontLieData[];
        meta: BallDontLieMetaData;
    }
}

export type BallDontLieMetaData = {
    total_pages: number;
    current_page: number;
    next_page: number;
    per_page: number;
    total_count: number;
}

export type BallDontLieData = {
    id: number;
    date: Date;
    home_team: BallDontLieTeamData;
    home_team_score: number;
    period: number;
    postseason: boolean;
    season: number;
    status: string;
    time: any;
    visitor_team: BallDontLieTeamData;
    visitor_team_score: number;
}

export type BallDontLieTeamData = {
    id: number;
    abbreviation: string;
    city: string;
    conference: string;
    division: string;
    full_name: string;
    name: string;
}

export type BlockCypherTxResponse = {
    tx: BlockCypherTx;
    tosign: string[];
    signatures?: string[];
    pubkeys?: string[];
}

export type BlockCypherTxInput = {
        prev_hash: string;
        output_index: number;
        output_value: number;
        sequence: number;
        addresses: string[];
        script_type: string;
        age: number;
}

export type BlockCypherTxOutput = {
    value: number;
    script: string;
    addresses: string[];
    script_type: string;
}

export type BlockCypherTx = {
    block_height: number;
    block_index: number;
    hash: string;
    addresses: string[];
    total: number;
    fees: number;
    size: number;
    vsize: number;
    preference: string;
    relayed_by: any;
    received: Date;
    ver: number;
    double_spend: boolean;
    vin_sz: number;
    vout_sz: number;
    confirmations: number;
    inputs: BlockCypherTxInput[];
    outputs: BlockCypherTxOutput[];
}