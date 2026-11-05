// lambda.ts
//
// Lambda entry point (handler "dist/lambda.handler").
// API Gateway HTTP API (payload v2) events go through serverless-express into
// the same Hapi server app.ts runs locally. The server and the Mongo connection
// are built once per container and reused across invocations.
import serverlessExpress from '@codegenie/serverless-express';
import type { Server } from '@hapi/hapi';
import type { IncomingMessage, ServerResponse } from 'http';

import { DatabaseService } from './controllers/mongodb.service';
import { createServer } from './server';

type ProxyHandler = (event: unknown, context: unknown) => Promise<unknown>;

let ready: Promise<ProxyHandler> | null = null;

async function build(): Promise<ProxyHandler> {
  await DatabaseService.getInstance().connect();

  const server: Server = await createServer(process.env.JWT_SECRET);
  // Initialize without listening: Lambda has no port, requests arrive as events.
  await server.initialize();

  return serverlessExpress({
    app: (req: IncomingMessage, res: ServerResponse) => server.listener.emit('request', req, res),
    eventSourceName: 'AWS_API_GATEWAY_V2',
  });
}

function getHandler(): Promise<ProxyHandler> {
  if (!ready) {
    // A failed cold start must not poison the container: clear the cached
    // promise so the next invocation retries instead of rethrowing forever.
    ready = build().catch(err => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

export const handler = async (event: any, context: any) => {
  const proxy = await getHandler();
  return proxy(event, context);
};

// Test-only: forget the cached server so each test builds its own.
export function resetForTests(): void {
  ready = null;
}
