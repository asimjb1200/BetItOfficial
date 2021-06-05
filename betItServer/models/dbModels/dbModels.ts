export type WagerModel = {
    id: number;
    bettor: string;
    fader: string;
    wager_amount: number;
    game_id: number;
    is_active: boolean;
    bettor_chosen_team: number;
    winning_team: number;
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