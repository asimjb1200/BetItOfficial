import axios from "axios";
import { BallDontLieResponse } from "../models/dataModels";

class BasketballData {
    #mainApi: string = 'https://www.balldontlie.io/api/v1/';

    async getAllGamesForYear(year: number): Promise<BallDontLieResponse> {
        return await axios.get(this.#mainApi + `games?seasons[]=${year}`);
    }
}

export const bballApi = new BasketballData();