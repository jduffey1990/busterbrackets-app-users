// users/src/controllers/mongodb.service.ts
import { MongoClient, Db } from 'mongodb';

// How long the driver waits to find a reachable server, for the first connect
// and for every later operation. The driver default is 30s, longer than either
// Lambda timeout (users 10s, brackets 29s), so an unreachable Atlas would
// surface as a silent Lambda timeout instead of a logged, retryable error.
// Coupled to lambda_timeout in terraform/variables.tf: keep this well under it.
export const MONGO_SERVER_SELECTION_TIMEOUT_MS = 5_000;

export class DatabaseService {
  private static instance: DatabaseService; // The singleton instance
  private client: MongoClient | null = null;  // Store the actual client
  private db: Db | null = null;            

  private constructor() {}

  /**
   * The static method to access the single `DatabaseService` instance.
   */
  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * Connect to MongoDB only once. If `this.db` already exists, just return it.
   */
  public async connect(): Promise<Db> {
    if (this.db) {
      // Already connected; just return it
      return this.db;
    }

    // Otherwise, create a new connection
    const url = process.env.MONGO_URI || "mongodb://localhost:27017/busterBrackets";
    this.client = new MongoClient(url, { serverSelectionTimeoutMS: MONGO_SERVER_SELECTION_TIMEOUT_MS });

    try {
      await this.client.connect();
    } catch (err) {
      // Drop the half-open client so the next connect() starts clean.
      await this.client.close().catch(() => {});
      this.client = null;
      throw err;
    }
    this.db = this.client.db(); 
    console.log('Connected successfully to MongoDB (singleton).');

    return this.db;
  }

  /**
   * Get the `Db` object directly. Throws if not connected.
   */
  public getDb(): Db {
    if (!this.db) {
      throw new Error('DatabaseService not connected. Call connect() first.');
    }
    return this.db;
  }

  /**
   *  Disconnect / close the client
   */
  public async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      console.log('Disconnected from MongoDB.');
      this.client = null;
      this.db = null;
    }
  }

}

