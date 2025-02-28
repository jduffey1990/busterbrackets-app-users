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

  /**
   * Fetch a single user by ID from the "users" collection.
   */
  public static async createUser(userObject: User): Promise<User | null> {
    try {
      const db = DatabaseService.getInstance().getDb();
      
      // Insert the user document into the 'users' collection
      const insertResult = await db.collection<User>('users').insertOne(userObject);
      
      // If successful, insertResult.insertedId will contain the new _id
      // You could return the inserted user object with `_id`:
      if (insertResult.acknowledged) {
        // Optionally, fetch the full user document from the DB to return
        const createdUser = await db
          .collection<User>('users')
          .findOne({ _id: insertResult.insertedId });
          
        return createdUser || null;
      }
      
      return null;
    } catch (error) {
      console.error('Failed to create user:', error);
      throw error;
    }
  }
  
}
