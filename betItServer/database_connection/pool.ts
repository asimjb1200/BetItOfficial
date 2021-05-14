import pg from 'pg';

// connecting to the server
// pooling helps to minimize new connections which are memory intensive, and will instead used cached connections
export const pool = new pg.Pool();

// module.exports = {pool};