export type WagerModel = {
    id: number;
    bettor: string;
    fader?: string;
    wager_amount: number;
    game_id: number;
    is_active: boolean;
    bettor_chosen_team: number;
    winning_team?: number;
    escorw_address?: string;
}

export type WagerNotification = {
    operation: string;
    record: WagerModel;
}

export type GameModel = {
    game_id: number;
    sport: string;
    home_team: number;
    visitor_team: number;
    game_begins: Date;
    home_score?: number;
    away_score?: number;
    winning_team?: number;
    season: number
}

export type EscrowWallet = {
    address: string;
    private_key: string;
    balance: number;
    wager_id: number;
}