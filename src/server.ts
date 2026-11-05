// src/server.ts
//
// Builds the Hapi server: CORS, the JWT strategy, and every route.
// app.ts starts it on a port for local dev; lambda.ts initializes it without
// listening and feeds it API Gateway requests. Tests drive it either way
// without a database.
const Hapi = require('@hapi/hapi');
import { Server, ServerRoute } from '@hapi/hapi';
import { AuthService } from './controllers/authService';
import routes from './routes';

export async function createServer(jwtSecret: string | undefined): Promise<Server> {
  const server: Server = Hapi.server({
    port: 3000,
    host: '0.0.0.0',
    routes: {
      cors: {
        origin: [
          'http://localhost:4000',
          'http://busterbrackets.com.s3-website.us-east-2.amazonaws.com',
          'https://main.d2pmlcs4q5ckgp.amplifyapp.com',
          'https://busterbrackets.com',
          'http://busterbrackets.com',
        ],
        credentials: true, // allow cookies / Authorization headers
        additionalHeaders: ['X-CSRFToken', 'Content-Type', 'Authorization'],
      },
    },
  });

  await server.register(require('@hapi/jwt'));

  server.auth.strategy('jwt', 'jwt', {
    keys: jwtSecret,
    verify: {
      aud: false,
      iss: false,
      sub: false,
      maxAgeSec: 14400, // Tokens expire in 4 hours
    },
    validate: AuthService.validateToken,
  });

  server.auth.default('jwt');

  // Route files declare plain object literals, so their method strings widen to
  // `string`; the cast restores the ServerRoute shape Hapi validates at runtime.
  server.route(routes as ServerRoute[]);
  return server;
}
