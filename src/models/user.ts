// src/models/user.ts

import { ObjectId } from "mongodb";

export interface User {
    _id: ObjectId;
    username: string;
    email: string;
    password: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    status: string;
    deletedAt?: Date | null;
    credits: number;
    role: string;   // "user" | "admin" — default "user", set yours to "admin" in MongoDB
}