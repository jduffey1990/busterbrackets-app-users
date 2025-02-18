// src/routes/users.ts
import { Request, ResponseToolkit } from '@hapi/hapi';
const Bcrypt = require('bcrypt');

import { UserService } from '../controllers/userService';

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
    }
];
