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