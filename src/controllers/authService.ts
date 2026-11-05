//src/controllers/authServices.ts
const Bcrypt = require('bcrypt');
import Jwt from '@hapi/jwt';
import dotenv from 'dotenv';

import { User } from '../models/user'; // Assuming you have a User type
import { Request, ResponseToolkit } from '@hapi/hapi';
import { DatabaseService } from './mongodb.service'; 
import { Db, ObjectId } from 'mongodb';
import { UserService } from './userService';

dotenv.config();
const jwtSecret = process.env.JWT_SECRET || ""

export class AuthService {

  public static async validateUser(
    request: Request,
    username: string,
    password: string,
    h: ResponseToolkit
  ): Promise<{ isValid: boolean; credentials?: User; token?: string }> {
    const db: Db = DatabaseService.getInstance().getDb();

    // Grab the user by username
    const user: User | null = await db.collection<User>('users').findOne({ username });
    if (!user) {
      return { isValid: false };
    }

    const match = await Bcrypt.compare(password, user.password);
    if (match) {
      // Generate JWT
      const token = Jwt.token.generate(
        { id: user._id.toString(), username: user.username },
        jwtSecret // 🔑 Use our secret key
      );

      return { isValid: true, credentials: user, token };
    }

    return { isValid: false };
  }
  
  public static async validateToken(decoded: any, request: Request, h: ResponseToolkit) {
    const { id } = decoded.decoded.payload; // Use decoded.payload.id, not decoded.id
  
    const db: Db = DatabaseService.getInstance().getDb();
    // Exclude the bcrypt hash: these credentials become request.auth.credentials
    // on every authenticated route, and GET /session returns them to the browser.
    const user = await db
      .collection<User>('users')
      .findOne<Omit<User, 'password'>>({ _id: new ObjectId(id) }, { projection: { password: 0 } });
  
    if (!user) {
      return { isValid: false };
    }
  
    return { isValid: true, credentials: user };
  }

}