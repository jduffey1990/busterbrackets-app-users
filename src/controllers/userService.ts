// src/controllers/userService.ts
import { ObjectId } from 'mongodb';
import { User } from '../models/user';
import { DatabaseService } from './mongodb.service';

export class UserService {
  /**
   * Fetch all users from the "users" collection.
   */
  public static async findAllUsers(): Promise<User[]> {
    try {
      // Grab the existing DB connection from the singleton
      const db = DatabaseService.getInstance().getDb();
      const usersCollection = db.collection<User>('users');
      return await usersCollection.find().toArray();
    } catch (error) {
      console.error('Failed to fetch users:', error);
      throw error;
    }
  }

  /**
   * Fetch a single user by ID from the "users" collection.
   */
  public static async findUserById(id: string): Promise<User | null> {
    try {
      const db = DatabaseService.getInstance().getDb();
      const user = await db
        .collection<User>('users')
        .findOne({ _id: new ObjectId(id) });
      return user;
    } catch (error) {
      console.error('Failed to find user:', error);
      throw error;
    }
  }
}
