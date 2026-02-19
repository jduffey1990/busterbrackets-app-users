// src/controllers/userService.ts
import { ModifyResult, ObjectId } from 'mongodb';
import { User } from '../models/user';
import { DatabaseService } from './mongodb.service';
import crypto from 'crypto';
const Bcrypt = require('bcrypt');

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
   * Find a user by their email address.
   */
  public static async findByEmail(email: string): Promise<User | null> {
    try {
      const db = DatabaseService.getInstance().getDb();
      return await db.collection<User>('users').findOne({ email: email.toLowerCase() });
    } catch (error) {
      console.error('Failed to find user by email:', error);
      throw error;
    }
  }

  /**
   * Fetch a single user by ID from the "users" collection.
   */
  public static async createUser(userObject: User): Promise<User | null> {
    try {
      const db = DatabaseService.getInstance().getDb();
      const usersCollection = db.collection<User>('users');
  
      // Check if username or email is already taken
      const existingUser = await usersCollection.findOne({
        $or: [
          { username: userObject.username },
          { email: userObject.email },
        ],
      });
  
      if (existingUser) {
        // Error matching frontend logic
        throw new Error('duplicate key value violates unique constraint');
      }
  
      // If all is good, proceed
      const insertResult = await usersCollection.insertOne(userObject);
  
      if (insertResult.acknowledged) {
        const createdUser = await usersCollection.findOne({
          _id: insertResult.insertedId,
        });
        return createdUser || null;
      }
  
      return null;
    } catch (error) {
      console.error('Failed to create user:', error);
      throw error; // re-throw so we can catch in the route
    }
  }  

   /**
   * Update user by id.
   */
   public static async userUpdateInfo(userId: string, account: any): Promise<User | null> {
    try {
      const db = DatabaseService.getInstance().getDb();
      const usersCollection = db.collection<User>('users');

      // Verify that the user exists.
      const existingUser = await usersCollection.findOne({ _id: new ObjectId(userId) });
      if (!existingUser) {
        throw new Error('User not found');
      }

      // Join firstName and lastName into a single name string.
      const fullName = `${account.firstName} ${account.lastName}`;

      // Build the update object
      const update = {
        name: fullName,
        email: account.email,
      };

      // Update the user document.
      await usersCollection.updateOne(
        { _id: new ObjectId(userId) },
        { $set: update }
      );

      // Optionally, fetch and return the updated user.
      return await usersCollection.findOne({ _id: new ObjectId(userId) });
    } catch (error) {
      console.error('Failed to update user:', error);
      throw error;
    }
  }

  /**
 * Update a user based on the successful Stripe PaymentIntent
 */

public static async updateUserStripe(paymentIntent: any): Promise<User | null> {
  try {
    const db = DatabaseService.getInstance().getDb();
    const usersCollection = db.collection<User>('users');

    if (!paymentIntent?.metadata?.userId) {
      console.error('No userId found in paymentIntent.metadata');
      return null;
    }

    const userId = paymentIntent.metadata.userId;

    // Use $inc to increment "credits" by 1, plus $set for updatedAt
    const updatedResult = await usersCollection.findOneAndUpdate(
      { _id: new ObjectId(userId) },
      {
        $inc: { credits: 4 },
        $set: { updatedAt: new Date() },
      },
      { returnDocument: 'after' } // returns the updated doc
    );

    const doc = updatedResult && 'value' in updatedResult
        ? updatedResult.value  // (MongoDB 4.x+ style)
        : updatedResult;       // (Older driver style)

    if (!doc) {
      console.error(`User not found or not updated for _id: ${userId}`);
      return null;
    }

    return updatedResult;
  } catch (error) {
    console.error('Failed to update user with Stripe data:', error);
    throw error;
  }
}

  /**
 * Update a user based on the successful Stripe PaymentIntent
 */

  public static async userCreditDecrement(userId: string): Promise<User | null> {
    try {
      const db = DatabaseService.getInstance().getDb();
      const usersCollection = db.collection<User>('users');
  
  
      // Use $inc to increment "credits" by 1, plus $set for updatedAt
      const updatedResult = await usersCollection.findOneAndUpdate(
        { _id: new ObjectId(userId) },
        {
          $inc: { credits: -1 },
          $set: { updatedAt: new Date() },
        },
        { returnDocument: 'after' } // returns the updated doc
      );
  
      const doc = updatedResult && 'value' in updatedResult
          ? updatedResult.value  // (MongoDB 4.x+ style)
          : updatedResult;       // (Older driver style)
  
      if (!doc) {
        console.error(`User not found or not updated for _id: ${userId}`);
        return null;
      }
  
      return updatedResult;
    } catch (error) {
      console.error('Failed to update user with Stripe data:', error);
      throw error;
    }
  }

  /**
   * Generate and store a reset token on the user document.
   * Returns the raw token (to be included in the email link).
   */
  public static async setResetToken(userId: string): Promise<string> {
    try {
      const db = DatabaseService.getInstance().getDb();
      const usersCollection = db.collection<User>('users');

      const token = crypto.randomBytes(32).toString('hex');
      const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

      await usersCollection.updateOne(
        { _id: new ObjectId(userId) },
        {
          $set: {
            resetToken: token,
            resetTokenExpiry: expiry,
            updatedAt: new Date(),
          },
        }
      );

      return token;
    } catch (error) {
      console.error('Failed to set reset token:', error);
      throw error;
    }
  }

  /**
   * Validate a reset token and update the password.
   * Clears the token after successful reset.
   */
  public static async resetPasswordWithToken(
    token: string,
    newPassword: string
  ): Promise<boolean> {
    try {
      const db = DatabaseService.getInstance().getDb();
      const usersCollection = db.collection<User>('users');

      const user = await usersCollection.findOne({
        resetToken: token,
        resetTokenExpiry: { $gt: new Date() }, // token must not be expired
      });

      if (!user) {
        return false; // invalid or expired token
      }

      const hashedPassword = await Bcrypt.hash(newPassword, 10);

      await usersCollection.updateOne(
        { _id: user._id },
        {
          $set: {
            password: hashedPassword,
            resetToken: null,
            resetTokenExpiry: null,
            updatedAt: new Date(),
          },
        }
      );

      return true;
    } catch (error) {
      console.error('Failed to reset password with token:', error);
      throw error;
    }
  }

  /**
   * Authenticated password change — verify current password, then update.
   */
  public static async updatePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<boolean> {
    try {
      const db = DatabaseService.getInstance().getDb();
      const usersCollection = db.collection<User>('users');

      const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
      if (!user) {
        throw new Error('User not found');
      }

      const match = await Bcrypt.compare(currentPassword, user.password);
      if (!match) {
        return false; // current password doesn't match
      }

      const hashedPassword = await Bcrypt.hash(newPassword, 10);

      await usersCollection.updateOne(
        { _id: new ObjectId(userId) },
        {
          $set: {
            password: hashedPassword,
            updatedAt: new Date(),
          },
        }
      );

      return true;
    } catch (error) {
      console.error('Failed to update password:', error);
      throw error;
    }
  }


  
}
