// src/routes/users.ts
import { Request, ResponseToolkit } from '@hapi/hapi';
const Bcrypt = require('bcrypt');

import { UserService } from '../controllers/userService';
import { User } from '../models/user'
import { ObjectId } from 'mongodb';

export const userRoutes = [
    {
        method: 'GET',
        path: '/users',
        handler: (request: Request, h: ResponseToolkit) => {
            return UserService.findAllUsers()
        },
        options: {
            auth: false
        }
    },
    {
        method: 'GET',
        path: '/get-user',
        handler: (request: Request, h: ResponseToolkit) => {
            const id = request.query.id as string;  // Access query parameter
            if (!id) {
                return h.response("User ID is required").code(400);
            }
            return UserService.findUserById(id);
        }
    },
    {
      method: 'GET',
      path: '/session',
      handler: async (request:Request, h:ResponseToolkit) => {
        // At this point, Hapi has already validated the JWT token
        // and placed the “credentials” in request.auth.credentials
        const user = request.auth.credentials;
        return { user };
      },
    },
    {
        method: 'POST',
        path: '/create-user',
        handler: async (request: Request, h: ResponseToolkit) => {
          const payload = request.payload as any;
      
          // combine first and last name for "name"
          const name = payload.name ? payload.name :
            payload.firstName + ' ' + payload.lastName
            
      
          // Build the user object that matches your interface
          const now = new Date()
          const user: User = {
            _id: new ObjectId(),
            username: payload.username,
            email: payload.email,
            password: await Bcrypt.hash(payload.password, 10), // Hash the password
            name,
            createdAt: now,
            updatedAt:now,
            deletedAt:null,
            status: "active"
          };
      
          return UserService.createUser(user);
        },
        options: {
          auth: false,
        },
      }
];
