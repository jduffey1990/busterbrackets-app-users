// app.ts
//
// Local and Docker entry point: connect to Mongo, then listen on port 3000.
// Production runs on Lambda through lambda.ts instead and never loads this file.
import dotenv from 'dotenv';

import { DatabaseService } from './controllers/mongodb.service';
import { createServer } from './server';

dotenv.config();

const init = async () => {
  console.log('Initializing server...');

  // Connect to MongoDB once, before any route can run.
  await DatabaseService.getInstance().connect();

  const server = await createServer(process.env.JWT_SECRET);
  await server.start();
  console.log('Server running on %s', server.info.uri);
};

init().catch(err => {
  console.error('Failed to start the server:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.log(err);
  process.exit(1);
});
