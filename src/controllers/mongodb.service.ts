// users/src/controllers/mongodb.service.ts
import { MongoClient, Db } from 'mongodb';

export class DatabaseService {
  private static instance: DatabaseService; // The singleton instance
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
    const client = new MongoClient(url);
    await client.connect();

    // When the DB name is in the URI, you can do:
    this.db = client.db(); // it automatically selects 'busterBrackets'
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
}

