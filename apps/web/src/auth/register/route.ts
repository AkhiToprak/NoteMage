import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { createdResponse, badRequestResponse, internalErrorResponse } from '@/lib/api-response';

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name } = body;
    let { username } = body;

    if (!email || !password) {
      return badRequestResponse('Email and password are required');
    }

    if (!username) {
      return badRequestResponse('Username is required');
    }

    username = String(username).toLowerCase();

    if (!USERNAME_REGEX.test(username)) {
      return badRequestResponse(
        'Username must be 3–20 characters: letters, numbers, underscores only'
      );
    }

    if (!EMAIL_REGEX.test(String(email))) {
      return badRequestResponse('Invalid email address');
    }

    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      return badRequestResponse('Password must be 8–128 characters');
    }

    const existingEmail = await db.user.findUnique({ where: { email } });
    if (existingEmail) {
      return badRequestResponse('An account with this email already exists');
    }

    const existingUsername = await db.user.findUnique({ where: { username } });
    if (existingUsername) {
      return badRequestResponse('This username is already taken');
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await db.user.create({
      data: {
        email: String(email),
        name: name ? String(name).slice(0, 100) : null,
        password: hashedPassword,
        username,
      },
    });

    return createdResponse(
      { id: user.id, email: user.email, name: user.name, username: user.username },
      'Account created successfully'
    );
  } catch (error) {
    console.error('Registration error:', error);
    return internalErrorResponse('Failed to create account');
  }
}
