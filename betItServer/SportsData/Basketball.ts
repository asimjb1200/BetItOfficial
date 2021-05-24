import axios, { AxiosResponse } from "axios";
import { sportsLogger } from "../loggerSetup/logSetup";
import { BallDontLieData, BallDontLieResponse } from "../models/dataModels";

class BasketballData {
    #mainApi: string = 'https://www.balldontlie.io/api/v1/';

    async getAllRegSznGames(year: number) {
        // let sznData: BallDontLieData[] = [];
        let apiResponse: BallDontLieResponse = await axios.get(this.#mainApi + `games?seasons[]=${year}&per_page=100`);
        let apiArray = [];
        const totalCount: number = apiResponse.data.meta.total_count;
        let page: number = 2;
        const totalPages: number = apiResponse.data.meta.total_pages;

        // add the original response's data
        let gameData: BallDontLieData[] = [...apiResponse.data.data];

        // set up each url that I want to hit
        for (let i = 0; page <= totalPages; i++) {
            apiArray[i] = axios.get(this.#mainApi + `games?seasons[]=${year}&per_page=100&page=${page}`);
            page++;
        }
        let apiResponseData = await Promise.all(apiArray);

        // pull the relevant data out of the response
        gameData.push(...(apiResponseData.map(x => x.data.data)));

        // flatten the array of arrays
        let sznData: BallDontLieData[] = ([] as BallDontLieData[]).concat.apply([], gameData);

        return sznData;
    }
}

export const bballApi = new BasketballData();