// userRoutes.test.ts
//
// Drives the real Hapi server with server.inject. Mongo is mocked with a
// fake users collection that honors findOne projections, so the test proves
// the JWT validation actually strips the hash instead of the mock doing it.
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
process.env.RESEND_API_KEY = 're_test_dummy';

import { ObjectId } from 'mongodb';

const seedUser = {
  _id: new ObjectId('65f000000000000000000001'),
  username: 'user1',
  email: 'user1@example.com',
  password: '$2b$10$fakebcrypthashfakebcrypthashfakebcrypthashfakebcrypthash',
  name: 'User One',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  deletedAt: null,
  status: 'active',
  credits: 0,
  role: 'user',
};

// Minimal collection: findOne applies a `{ field: 0 }` projection the way the
// driver does, and ignores the filter since there is only one document.
const usersCollection = {
  findOne: jest.fn(async (_filter: unknown, options?: { projection?: Record<string, 0 | 1> }) => {
    const doc: Record<string, unknown> = { ...seedUser };
    for (const [field, include] of Object.entries(options?.projection ?? {})) {
      if (include === 0) delete doc[field];
    }
    return doc;
  }),
};

jest.mock('../controllers/mongodb.service', () => ({
  DatabaseService: {
    getInstance: () => ({
      connect: jest.fn().mockResolvedValue({}),
      getDb: () => ({ collection: () => usersCollection }),
    }),
  },
}));

import Jwt from '@hapi/jwt';
import type { Server } from '@hapi/hapi';
import { createServer } from '../server';

let server: Server;

beforeAll(async () => {
  server = await createServer(process.env.JWT_SECRET);
  await server.initialize();
});

afterAll(async () => {
  await server.stop();
});

describe('GET /session', () => {
  it('returns the authenticated user without the password hash', async () => {
    const token = Jwt.token.generate(
      { id: seedUser._id.toString(), username: seedUser.username },
      process.env.JWT_SECRET as string,
    );

    const res = await server.inject({
      method: 'GET',
      url: '/session',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const { user } = JSON.parse(res.payload);
    expect(user.username).toBe('user1');
    expect(user).not.toHaveProperty('password');
  });
});
