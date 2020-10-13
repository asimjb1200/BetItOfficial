let express = require('express');
const axios = require('axios');
let router = express.Router();

/* BASKETBALL */
router.get('/bball/current-games', async (req, res) => {

    // grab the season that is being requested
    const {szn} = req.body;

    // find out the day because I only want to return games that are a week out, MAX
    let today = new Date();
    let dd = String(today.getDate()).padStart(2, '0');
    let mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
    let yyyy = today.getFullYear();

    today = yyyy + '-' + mm + '-' + dd;

    let nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    let next_dd = String(nextWeek.getDate()).padStart(2, 0);
    let next_mm = String(nextWeek.getMonth() + 1).padStart(2, 0);
    let next_yr = nextWeek.getFullYear();

    nextWeek = next_yr + '-' + next_mm + '-' + next_dd;

    try {
        const sznData = axios.get(`https://www.balldontlie.io/api/v1/games?seasons[]=${szn}&start_date=${today}&end_date=${nextWeek}`);
    } catch (err){

    }
});

module.exports = router;


// football