// src/scripts/seedUsers.ts
import { ObjectId } from 'mongodb';
const Bcrypt = require('bcrypt');

import { DatabaseService } from '../controllers/mongodb.service';

interface User {
    _id: ObjectId;
    username: string;
    email: string;
    password: string;
    name: string;
}

const users: User[] = Array.from({ length: 10 }, (v, i) => ({
    _id: new ObjectId(),
    username: `user${i+1}`,
    email: `user${i+1}@example.com`,
    password: 'password123', // Default password for demonstration
    name: `User ${i+1}`
}));

const seedUsers = async () => {
    try {
        const db = DatabaseService.getInstance().getDb();
        const usersCollection = db.collection('users');

        // Hash passwords and update user objects
        const usersWithHashedPasswords = await Promise.all(users.map(async user => ({
            ...user,
            password: await Bcrypt.hash(user.password, 10) // Hash the password
        })));

        // Insert users into the database
        await usersCollection.insertMany(usersWithHashedPasswords);
        console.log('Users seeded successfully');
    } catch (error) {
        console.error('Error seeding users:', error);
    }
};

seedUsers().catch(console.error);

