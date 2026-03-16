import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import {
  createdResponse,
  badRequestResponse,
  internalErrorResponse,
} from '@/lib/api-response';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name } = body;

    if (!email || !password) {
      return badRequestResponse('Email and password are required');
    }

    if (password.length < 8) {
      return badRequestResponse('Password must be at least 8 characters');
    }

    const existingUser = await db.user.findUnique({ where: { email } });
    if (existingUser) {
      return badRequestResponse('An account with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await db.user.create({
      data: { email, name, password: hashedPassword },
    });

    return createdResponse(
      { id: user.id, email: user.email, name: user.name },
      'Account created successfully'
    );
  } catch (error) {
    console.error('Registration error:', error);
    return internalErrorResponse('Failed to create account');
  }
}
