import axios, { AxiosResponse } from "axios";
import { sportsLogger } from "../loggerSetup/logSetup";
import { BallDontLieData, BallDontLieResponse, RapidApiSeasonResponse } from "../models/dataModels";
import dotenv from 'dotenv';
dotenv.config();

class BasketballData {
    #mainApi: string = 'https://www.balldontlie.io/api/v1/';
    #rapidApi: string = 'https://api-nba-v1.p.rapidapi.com/';
    #rapidApiConfig = {
        headers: {
            'x-rapidapi-host': 'api-nba-v1.p.rapidapi.com',
            'x-rapidapi-key': process.env.RAPIDAPIKEY!
        }
    };
    constructor() {
        
    }

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

    /** This method uses Rapid API to get all games for one szn*/
    async getAllGamesForSzn(year: number) {
        let apiResponse: RapidApiSeasonResponse = (await axios.get(`${this.#rapidApi}games/seasonYear/${year}`, this.#rapidApiConfig)).data;
        return apiResponse.api.games;
    }
}

export const bballApi = new BasketballData();