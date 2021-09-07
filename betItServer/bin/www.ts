import app from '../app.js';
import Debug from 'debug';
import dotenv from 'dotenv';
const debug = Debug('betitserver:server');
import {Server, Socket} from 'socket.io';
import http from 'http';

let connections: Socket[] = [];

dotenv.config();

/**
 * Get port from environment and store in Express.
 */

let port = normalizePort(process.env.PORT || '3000');
app.set('port', port);

/**
 * Create HTTP server.
 */

let server = http.createServer(app);

/**
 * Set up socket.io
 */
export const io: Server = new Server(server);
export const allSocketConnections: {[id: string]: Socket} = {};
io.on("connection", (socket: Socket) => {
  // io.on("disconnect", (reason: string) => {
  //   console.log(reason);
  //   // remove the current socket from the connections array
  //   allSocketConnections[]
  // });

  // TODO: make the key for the socket objects the device's (user's) wallet address. that way
  // i can send notifications to specific devices when necessary
  console.log(socket.handshake.auth);

  // keep track of the new connection, the key will be the user's wallet address
  allSocketConnections[socket.handshake.auth.walletAddress as string] = socket;
  
  // define a channel to listen to and communicate with clients on
  socket.on('NodeJS Server Port', (data: any) => {
    console.log("data from the client: " + data);
    // send data back to the client
    io.emit('iOS Listeners', {msg: "We are now communicating"});
  });
});

/**
 * Listen on provided port, on all network interfaces.
 */

server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

/**
 * Normalize a port into a number, string, or false.
 */

function normalizePort(val: any) {
  let port = parseInt(val, 10);

  if (isNaN(port)) {
    // named pipe
    return val;
  }

  if (port >= 0) {
    // port number
    return port;
  }

  return false;
}

/**
 * Event listener for HTTP server "error" event.
 */

function onError(error: any) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  let bind = typeof port === 'string'
    ? 'Pipe ' + port
    : 'Port ' + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      console.error(bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(bind + ' is already in use');
      process.exit(1);
      break;
    default:
      throw error;
  }
}

/**
 * Event listener for HTTP server "listening" event.
 */

function onListening() {
  let addr = server.address();
  if (addr){
    let bind = typeof addr === 'string'
    ? 'pipe ' + addr
    : 'port ' + addr.port;

    console.log('Listening on ' + bind);
    debug('Listening on ' + bind);
  } else {
    debug('Something went wrong');
  }
}

// export {};
