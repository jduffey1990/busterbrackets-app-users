// mongodb.service.test.ts
//
// Uses the real driver against a port nothing listens on, the same failure an
// Atlas allowlist miss or outage produces from Lambda. No database needed.
import { DatabaseService, MONGO_SERVER_SELECTION_TIMEOUT_MS } from './mongodb.service';

const LAMBDA_TIMEOUT_MS = 10_000; // the shorter of the two services (users)

describe('DatabaseService.connect with Mongo unreachable', () => {
  const originalUri = process.env.MONGO_URI;

  beforeAll(() => {
    process.env.MONGO_URI = 'mongodb://127.0.0.1:1/bb';
  });

  afterAll(async () => {
    process.env.MONGO_URI = originalUri;
    await DatabaseService.getInstance().disconnect();
  });

  it('fails fast enough to be logged and retried inside the Lambda timeout', async () => {
    const started = Date.now();

    await expect(DatabaseService.getInstance().connect()).rejects.toThrow();

    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(MONGO_SERVER_SELECTION_TIMEOUT_MS - 500);
    expect(elapsed).toBeLessThan(LAMBDA_TIMEOUT_MS);
  }, 40_000);
});
