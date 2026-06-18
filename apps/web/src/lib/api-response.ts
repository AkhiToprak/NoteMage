import { NextResponse } from 'next/server';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  /** Stable machine-readable failure code for client branching (e.g. an upsell). */
  code?: string;
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
 * Payment required response (402). Use when a capability is gated behind a
 * paid tier rather than a transient quota — e.g. the Phase 12 free-tier
 * switchover routes FREE users away from AI path generation toward the
 * community library. Distinct from 429 (quota exhausted, retry later).
 */
export function paymentRequiredResponse(error: string = 'Payment required', code?: string) {
  return NextResponse.json(
    {
      success: false,
      error,
      code,
    } as ApiResponse,
    { status: 402 }
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
 * Unprocessable entity response (422). Use when the request is well-formed and
 * authorized but the target cannot be processed — e.g. a YouTube video has no
 * captions to extract. Distinct from 400 (malformed) and 500 (server fault) so
 * a UI can branch on it (the transcript → native-video upsell handoff).
 */
export function unprocessableEntityResponse(error: string = 'Unprocessable entity') {
  return NextResponse.json(
    {
      success: false,
      error,
    } as ApiResponse,
    { status: 422 }
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

/**
 * Service unavailable response (503). Use when a dependency the route
 * needs (e.g. a self-hosted runner) is not configured or reachable.
 */
export function serviceUnavailableResponse(error: string = 'Service unavailable') {
  return NextResponse.json(
    {
      success: false,
      error,
    } as ApiResponse,
    { status: 503 }
  );
}
