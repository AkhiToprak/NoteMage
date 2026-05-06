import { NextResponse } from 'next/server';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Success response
 */
export function successResponse<T>(data: T, message?: string) {
  return NextResponse.json(
    {
      success: true,
      data,
      message,
    } as ApiResponse<T>,
    { status: 200 }
  );
}

/**
 * Created response (201)
 */
export function createdResponse<T>(data: T, message?: string) {
  return NextResponse.json(
    {
      success: true,
      data,
      message,
    } as ApiResponse<T>,
    { status: 201 }
  );
}

/**
 * Bad request response (400)
 */
export function badRequestResponse(error: string) {
  return NextResponse.json(
    {
      success: false,
      error,
    } as ApiResponse,
    { status: 400 }
  );
}

/**
 * Unauthorized response (401)
 */
export function unauthorizedResponse(error: string = 'Unauthorized') {
  return NextResponse.json(
    {
      success: false,
      error,
    } as ApiResponse,
    { status: 401 }
  );
}

/**
 * Forbidden response (403)
 */
export function forbiddenResponse(error: string = 'Forbidden') {
  return NextResponse.json(
    {
      success: false,
      error,
    } as ApiResponse,
    { status: 403 }
  );
}

/**
 * Not found response (404)
 */
export function notFoundResponse(error: string = 'Not found') {
  return NextResponse.json(
    {
      success: false,
      error,
    } as ApiResponse,
    { status: 404 }
  );
}

/**
 * Conflict response (409)
 */
export function conflictResponse(error: string = 'Conflict') {
  return NextResponse.json(
    {
      success: false,
      error,
    } as ApiResponse,
    { status: 409 }
  );
}

/**
 * Too many requests response (429)
 */
export function tooManyRequestsResponse(
  error: string = 'Too many requests',
  retryAfterMs?: number
) {
  const headers: Record<string, string> = {};
  if (retryAfterMs) {
    headers['Retry-After'] = String(Math.ceil(retryAfterMs / 1000));
  }
  return NextResponse.json(
    {
      success: false,
      error,
    } as ApiResponse,
    { status: 429, headers }
  );
}

/**
 * Internal server error response (500)
 */
export function internalErrorResponse(error: string = 'Internal server error') {
  return NextResponse.json(
    {
      success: false,
      error,
    } as ApiResponse,
    { status: 500 }
  );
}
