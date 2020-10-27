const { Pool, Client } = require('pg')

// connecting to the server
// pooling helps to minimize new connections which are memory intensive, and will instead used cached connections
const pool = new Pool();

module.exports = {pool};