// NM3-32 — regression test for the HMAC gate on
// POST /api/billing/lemonsqueezy/webhook. A request whose X-Signature does
// not match HMAC-SHA256(rawBody, secret) must be rejected (400) before any
// provisioning runs, and a correctly-signed-but-unconfigured server must 500.
// Strategy: mock the db + lemonsqueezy + entitlement boundaries so nothing
// real is provisioned; drive only the signature path.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  dbMock: {
    webhookEvent: { create: vi.fn(), delete: vi.fn() },
    user: { update: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
  },
  provisionFromLemonSqueezySubscription: vi.fn(),
  resolveLemonSqueezyUserId: vi.fn(),
  mapSubscription: vi.fn(),
  isActiveLemonSqueezyStatus: vi.fn(() => false),
  endSubscription: vi.fn(() => ({})),
}));

vi.mock('@/lib/db', () => ({ db: mocks.dbMock }));
vi.mock('@/lib/lemonsqueezy', () => ({
  provisionFromLemonSqueezySubscription: mocks.provisionFromLemonSqueezySubscription,
  resolveLemonSqueezyUserId: mocks.resolveLemonSqueezyUserId,
  mapSubscription: mocks.mapSubscription,
  isActiveLemonSqueezyStatus: mocks.isActiveLemonSqueezyStatus,
}));
vi.mock('@/lib/entitlement', () => ({ endSubscription: mocks.endSubscription }));

import { POST } from '../../../../app/api/billing/lemonsqueezy/webhook/route';

const SECRET = 'test-webhook-secret';

function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function callPost(body: string, signature: string) {
  const req = new NextRequest('http://localhost/api/billing/lemonsqueezy/webhook', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', 'x-signature': signature },
  });
  return POST(req);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.LEMONSQUEEZY_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
});

describe('POST lemonsqueezy webhook — HMAC gate', () => {
  it('400 on a forged signature, never provisions', async () => {
    const body = JSON.stringify({ meta: { event_name: 'subscription_created' }, data: { id: 's1' } });
    const forged = sign(body, 'wrong-secret');

    const res = await callPost(body, forged);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/signature/i);
    expect(mocks.dbMock.webhookEvent.create).not.toHaveBeenCalled();
    expect(mocks.provisionFromLemonSqueezySubscription).not.toHaveBeenCalled();
  });

  it('400 on an empty / missing signature header', async () => {
    const body = JSON.stringify({ meta: { event_name: 'subscription_created' }, data: { id: 's1' } });
    const res = await callPost(body, '');
    expect(res.status).toBe(400);
    expect(mocks.dbMock.webhookEvent.create).not.toHaveBeenCalled();
  });

  it('400 on a non-hex signature of mismatched length', async () => {
    const body = JSON.stringify({ data: { id: 's1' } });
    const res = await callPost(body, 'not-hex-and-wrong-length');
    expect(res.status).toBe(400);
    expect(mocks.provisionFromLemonSqueezySubscription).not.toHaveBeenCalled();
  });

  it('400 when the body is tampered after signing (signature no longer matches)', async () => {
    const original = JSON.stringify({ meta: { event_name: 'subscription_created' }, data: { id: 's1' } });
    const sig = sign(original);
    const tampered = JSON.stringify({ meta: { event_name: 'subscription_created' }, data: { id: 's2' } });
    const res = await callPost(tampered, sig);
    expect(res.status).toBe(400);
    expect(mocks.dbMock.webhookEvent.create).not.toHaveBeenCalled();
  });

  it('passes the HMAC gate for a correctly-signed body (does not 400 on signature)', async () => {
    // A validly-signed but content-less payload is acknowledged + ignored
    // (no event_name/id/attrs → received:true, ignored:true) — proving the
    // signature check itself accepts a real signature.
    const body = JSON.stringify({ meta: {}, data: {} });
    const res = await callPost(body, sign(body));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ received: true, ignored: true });
    expect(mocks.provisionFromLemonSqueezySubscription).not.toHaveBeenCalled();
  });
});

describe('POST lemonsqueezy webhook — config gate', () => {
  it('500 when the webhook secret is not configured', async () => {
    delete process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    const body = JSON.stringify({ data: { id: 's1' } });
    const res = await callPost(body, 'deadbeef');
    expect(res.status).toBe(500);
    expect(mocks.dbMock.webhookEvent.create).not.toHaveBeenCalled();
  });
});
