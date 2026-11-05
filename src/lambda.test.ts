// lambda.test.ts
//
// Drives the real Lambda handler with API Gateway HTTP API (v2) events, the
// same shape production receives. Mongo is mocked; nothing here needs a
// network or a database.
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
// CodeBuild has no .env; email.ts constructs Resend at import and throws without a key.
process.env.RESEND_API_KEY = 're_test_dummy';

const connect = jest.fn().mockResolvedValue({});
jest.mock('./controllers/mongodb.service', () => ({
  DatabaseService: {
    getInstance: () => ({
      connect,
      getDb: () => {
        throw new Error('getDb should not be reached in these tests');
      },
    }),
  },
}));

import Stripe from 'stripe';
import { handler, resetForTests } from './lambda';

const stripe = new Stripe('sk_test_dummy', { apiVersion: '2025-02-24.acacia' });

function httpEvent(opts: {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
  isBase64Encoded?: boolean;
}) {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: opts.path,
    rawQueryString: '',
    headers: { host: 'users-api.busterbrackets.com', ...(opts.headers ?? {}) },
    requestContext: {
      accountId: '123456789012',
      apiId: 'api',
      domainName: 'users-api.busterbrackets.com',
      http: {
        method: opts.method,
        path: opts.path,
        protocol: 'HTTP/1.1',
        sourceIp: '203.0.113.7',
        userAgent: 'jest',
      },
      requestId: 'req-1',
      routeKey: '$default',
      stage: '$default',
      time: '04/Nov/2026:12:00:00 +0000',
      timeEpoch: 1793793600000,
    },
    body: opts.body,
    isBase64Encoded: opts.isBase64Encoded ?? false,
  };
}

const lambdaContext = {
  awsRequestId: 'aws-req-1',
  functionName: 'bb-users',
  getRemainingTimeInMillis: () => 10000,
};

function signedWebhook(payload: string) {
  return stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET as string,
  });
}

beforeEach(() => {
  resetForTests();
  connect.mockClear();
  connect.mockResolvedValue({});
});

describe('lambda handler', () => {
  it('connects Mongo once per container across requests', async () => {
    const first: any = await handler(httpEvent({ method: 'GET', path: '/' }), lambdaContext);
    const second: any = await handler(httpEvent({ method: 'GET', path: '/' }), lambdaContext);

    expect(first.statusCode).toBe(401);
    expect(second.statusCode).toBe(401);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('retries the cold start after a failed Mongo connect instead of failing forever', async () => {
    connect.mockRejectedValueOnce(new Error('atlas unreachable'));

    await expect(handler(httpEvent({ method: 'GET', path: '/' }), lambdaContext)).rejects.toThrow('atlas unreachable');
    const retried: any = await handler(httpEvent({ method: 'GET', path: '/' }), lambdaContext);

    expect(retried.statusCode).toBe(401);
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it('rejects a protected route without a token', async () => {
    const res: any = await handler(httpEvent({ method: 'GET', path: '/' }), lambdaContext);
    expect(res.statusCode).toBe(401);
  });

  it('answers a CORS preflight from the production origin', async () => {
    const res: any = await handler(
      httpEvent({
        method: 'OPTIONS',
        path: '/login',
        headers: {
          origin: 'https://busterbrackets.com',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type,x-csrftoken',
        },
      }),
      lambdaContext,
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://busterbrackets.com');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  describe('stripe webhook raw body', () => {
    const payload = JSON.stringify({
      id: 'evt_test',
      object: 'event',
      type: 'customer.created',
      data: { object: { id: 'cus_test' } },
    });

    it('verifies a signed plain-text body', async () => {
      const res: any = await handler(
        httpEvent({
          method: 'POST',
          path: '/stripe-webhook',
          headers: { 'content-type': 'application/json', 'stripe-signature': signedWebhook(payload) },
          body: payload,
        }),
        lambdaContext,
      );

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ received: true });
    });

    it('verifies a signed body that API Gateway delivered base64-encoded', async () => {
      const res: any = await handler(
        httpEvent({
          method: 'POST',
          path: '/stripe-webhook',
          headers: { 'content-type': 'application/json', 'stripe-signature': signedWebhook(payload) },
          body: Buffer.from(payload).toString('base64'),
          isBase64Encoded: true,
        }),
        lambdaContext,
      );

      expect(res.statusCode).toBe(200);
    });

    it('rejects a body that does not match its signature', async () => {
      const res: any = await handler(
        httpEvent({
          method: 'POST',
          path: '/stripe-webhook',
          headers: { 'content-type': 'application/json', 'stripe-signature': signedWebhook(payload) },
          body: payload.replace('cus_test', 'cus_tampered'),
        }),
        lambdaContext,
      );

      expect(res.statusCode).toBe(400);
    });
  });
});
