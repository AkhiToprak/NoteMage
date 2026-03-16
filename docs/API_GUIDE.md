# API Development Guide

## Overview

Quizzard uses Next.js API Routes for the backend. All API endpoints should follow consistent patterns for responses, error handling, and authentication.

---

## File Structure

```
app/api/
├── auth/              # Authentication endpoints
│   ├── register/
│   ├── login/
│   └── logout/
├── notebooks/         # Notebook operations
│   ├── route.ts       # GET (list), POST (create)
│   └── [id]/
│       ├── route.ts   # GET, PUT, DELETE
│       └── documents/ # Document endpoints
├── user/              # User profile
│   └── route.ts
└── health/            # Health check
    └── route.ts
```

---

## Response Format

All API responses follow this format:

### Success Response (200, 201)
```json
{
  "success": true,
  "data": { /* actual data */ },
  "message": "Optional message"
}
```

### Error Response (4xx, 5xx)
```json
{
  "success": false,
  "error": "Error description"
}
```

---

## Using API Helpers

### Import in your route
```typescript
import { successResponse, createdResponse, badRequestResponse } from '@/lib/api-response';
import { db } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const data = await db.notebook.findMany();
    return successResponse(data);
  } catch (error) {
    return internalErrorResponse('Failed to fetch notebooks');
  }
}
```

### Available Helpers
- `successResponse(data, message?)` - 200 OK
- `createdResponse(data, message?)` - 201 Created
- `badRequestResponse(error)` - 400 Bad Request
- `unauthorizedResponse(error?)` - 401 Unauthorized
- `forbiddenResponse(error?)` - 403 Forbidden
- `notFoundResponse(error?)` - 404 Not Found
- `internalErrorResponse(error?)` - 500 Server Error

---

## Database Access

Use the `db` export from `@/lib/db`:

```typescript
import { db } from '@/lib/db';

// Create
const notebook = await db.notebook.create({
  data: {
    userId: 'user-123',
    name: 'Biology',
    subject: 'Science',
  },
});

// Read
const notebook = await db.notebook.findUnique({
  where: { id: 'notebook-123' },
});

// Update
const updated = await db.notebook.update({
  where: { id: 'notebook-123' },
  data: { name: 'Advanced Biology' },
});

// Delete
await db.notebook.delete({
  where: { id: 'notebook-123' },
});

// List with relations
const notebooks = await db.notebook.findMany({
  where: { userId: 'user-123' },
  include: {
    documents: true,
    chatMessages: true,
  },
});
```

---

## Error Handling

Always wrap database operations in try-catch:

```typescript
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate input
    if (!body.name) {
      return badRequestResponse('Name is required');
    }

    // Create record
    const notebook = await db.notebook.create({
      data: body,
    });

    return createdResponse(notebook, 'Notebook created');
  } catch (error) {
    console.error('Error creating notebook:', error);
    return internalErrorResponse('Failed to create notebook');
  }
}
```

---

## Authentication (Phase 3)

Authentication will be handled via NextAuth.js middleware. Protected routes will require a session.

```typescript
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/auth/config';

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return unauthorizedResponse();
  }

  // User is authenticated
  const userId = session.user.id;
  // ...
}
```

---

## Example: Complete Notebook Endpoint

**File**: `app/api/notebooks/route.ts`

```typescript
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import {
  successResponse,
  createdResponse,
  badRequestResponse,
  internalErrorResponse,
} from '@/lib/api-response';

// GET /api/notebooks - List user's notebooks
export async function GET(request: NextRequest) {
  try {
    // TODO: Get userId from session (Phase 3)
    const userId = request.nextUrl.searchParams.get('userId');

    if (!userId) {
      return badRequestResponse('userId is required');
    }

    const notebooks = await db.notebook.findMany({
      where: { userId },
      include: {
        _count: {
          select: { documents: true, chatMessages: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return successResponse(notebooks);
  } catch (error) {
    console.error('Error fetching notebooks:', error);
    return internalErrorResponse();
  }
}

// POST /api/notebooks - Create new notebook
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // TODO: Get userId from session (Phase 3)
    const userId = body.userId;

    if (!userId || !body.name) {
      return badRequestResponse('userId and name are required');
    }

    const notebook = await db.notebook.create({
      data: {
        userId,
        name: body.name,
        description: body.description,
        subject: body.subject,
        color: body.color,
      },
    });

    return createdResponse(notebook, 'Notebook created successfully');
  } catch (error) {
    console.error('Error creating notebook:', error);
    return internalErrorResponse('Failed to create notebook');
  }
}
```

---

## Testing Endpoints

Use these tools to test APIs during development:

- **cURL**: Command line tool
- **Postman**: GUI for API testing
- **VS Code REST Client**: Lightweight extension
- **Thunder Client**: VS Code extension alternative

Example cURL:
```bash
curl -X POST http://localhost:3000/api/notebooks \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-1","name":"Physics","subject":"Science"}'
```

---

## Environment Variables

Required environment variables in `.env.local`:

```
DATABASE_URL=postgresql://quizzard:dev_password@localhost:5432/quizzard_dev?schema=public
NEXTAUTH_SECRET=your-secret-key
NEXTAUTH_URL=http://localhost:3000
```

---

## Next Steps

- **Phase 3**: Add authentication with NextAuth.js
- **Phase 4**: Build frontend components
- **Phase 5**: Implement notebook CRUD endpoints
