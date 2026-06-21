'use client';

import { useState } from 'react';
import { Mage } from '@/figma/kit';
import { ONB, Sparkle, app } from './shell';
import { AppMobileFrame, APPC, MageTip } from './shell';

/**
 * Profile — Mobile (Figma node 97:3, 393px wide).
 * Pixel-faithful reproduction. No backend — all interactions are local state.
 */

// ── Settings rows ────────────────────────────────────────────────────────────
const SETTINGS = [
  { icon: 'person',             label: 'Account' },
  { icon: 'notifications',      label: 'Notifications' },
  { icon: 'dark_mode',          label: 'Appearance' },
  { icon: 'workspace_premium',  label: 'Subscription' },
  { icon: 'help',               label: 'Help & support' },
] as const;

// ── Achievement badges ───────────────────────────────────────────────────────
type Badge = { pose: string; label: string; locked?: boolean };
const BADGES: Badge[] = [
  { pose: 'graduation', label: 'First path' },
  { pose: 'wand',       label: '7-day streak' },
  { pose: 'quizzing',   label: 'Quiz ace' },
  { pose: 'scroll',     label: '10 paths', locked: true },
];

export default function ProfileMobile() {
  // Tracks the last-pressed control (press feedback also comes from the CSS classes).
  const setPressed = useState<string | null>(null)[1];

  return (
    <AppMobileFrame active="profile" time="9:41">
      {/* ── Page header ──────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 24px 6px',
        }}
      >
        <span
          style={{
            fontFamily: ONB.font,
            fontSize: 26,
            fontWeight: 700,
            color: ONB.ink,
            letterSpacing: '-0.5px',
            lineHeight: 1.3,
          }}
        >
          Profile
        </span>
        {/* Kebab menu */}
        <button
          className={app.pill}
          onClick={() => setPressed('menu')}
          style={{
            width: 40,
            height: 40,
            borderRadius: 14,
            background: ONB.lavender,
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: ONB.ink }}>
            more_vert
          </span>
        </button>
      </div>

      {/* ── Scrollable body ───────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 24px 24px' }}>

        {/* Profile header card */}
        <div
          style={{
            background: ONB.white,
            border: `1.2px solid ${ONB.line}`,
            borderRadius: 24,
            boxShadow: '0px 10px 28px rgba(124,92,255,0.1), 0px 2px 8px rgba(26,19,48,0.05)',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            position: 'relative',
            marginBottom: 12,
          }}
        >
          {/* Avatar */}
          <div style={{ position: 'relative', flex: '0 0 auto' }}>
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: '50%',
                background: ONB.lavender2,
                border: `3px solid ${ONB.primary}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                className="material-symbols-outlined filled"
                style={{ fontSize: 40, color: ONB.primary, opacity: 0.6 }}
              >
                person
              </span>
            </div>
            {/* Streak badge */}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 26,
                height: 26,
                borderRadius: '50%',
                background: ONB.primary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `2px solid ${ONB.white}`,
              }}
            >
              <span
                style={{
                  fontFamily: ONB.font,
                  fontSize: 11,
                  fontWeight: 700,
                  color: ONB.white,
                  lineHeight: 1,
                }}
              >
                3
              </span>
            </div>
          </div>

          {/* Name + email + pills */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontFamily: ONB.font,
                fontSize: 18,
                fontWeight: 700,
                color: ONB.ink,
                letterSpacing: '-0.2px',
                lineHeight: 1.3,
              }}
            >
              Alex Rivera
            </p>
            <p
              style={{
                margin: '2px 0 10px',
                fontFamily: ONB.font,
                fontSize: 12.5,
                fontWeight: 500,
                color: ONB.muted,
                lineHeight: 1.3,
              }}
            >
              alex@notemage.app
            </p>
            {/* Pills */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span
                style={{
                  height: 22,
                  padding: '0 10px',
                  borderRadius: 11,
                  background: ONB.lavender,
                  fontFamily: ONB.font,
                  fontSize: 10.5,
                  fontWeight: 600,
                  color: ONB.primary,
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                Free plan
              </span>
              <span
                style={{
                  height: 22,
                  padding: '0 10px',
                  paddingLeft: 7,
                  borderRadius: 11,
                  background: APPC.amberBg,
                  fontFamily: ONB.font,
                  fontSize: 10.5,
                  fontWeight: 600,
                  color: APPC.amberInk,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                }}
              >
                <span
                  className="material-symbols-outlined filled"
                  style={{ fontSize: 12, color: ONB.gold }}
                >
                  local_fire_department
                </span>
                12-day streak
              </span>
            </div>
          </div>

          {/* Edit pill */}
          <button
            className={app.pill}
            onClick={() => setPressed('edit')}
            style={{
              position: 'absolute',
              top: 14,
              right: 16,
              height: 26,
              padding: '0 12px',
              borderRadius: 13,
              background: ONB.lavender,
              border: 'none',
              fontFamily: ONB.font,
              fontSize: 11,
              fontWeight: 600,
              color: ONB.primary,
              cursor: 'pointer',
            }}
          >
            Edit
          </button>
        </div>

        {/* Stats grid — 2×2 */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            marginBottom: 20,
          }}
        >
          {[
            { val: '12',  label: 'Day streak' },
            { val: '3',   label: 'Active paths' },
            { val: '248', label: 'Questions answered' },
            { val: '82%', label: 'Accuracy' },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                background: ONB.white,
                border: `1.2px solid ${ONB.line}`,
                borderRadius: 16,
                boxShadow: '0px 5px 16px rgba(58,46,102,0.06)',
                padding: '14px 16px',
              }}
            >
              <p
                style={{
                  margin: '0 0 4px',
                  fontFamily: ONB.font,
                  fontSize: 22,
                  fontWeight: 700,
                  color: ONB.ink,
                  lineHeight: 1.3,
                }}
              >
                {s.val}
              </p>
              <p
                style={{
                  margin: 0,
                  fontFamily: ONB.font,
                  fontSize: 12,
                  fontWeight: 500,
                  color: ONB.muted,
                  lineHeight: 1.3,
                }}
              >
                {s.label}
              </p>
            </div>
          ))}
        </div>

        {/* Achievements */}
        <div style={{ marginBottom: 20 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span
              style={{
                fontFamily: ONB.font,
                fontSize: 16,
                fontWeight: 700,
                color: ONB.ink,
              }}
            >
              Achievements
            </span>
            <button
              className={app.link}
              style={{
                background: 'none',
                border: 'none',
                fontFamily: ONB.font,
                fontSize: 13,
                fontWeight: 600,
                color: ONB.primary,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              See all
            </button>
          </div>

          {/* Latest achievement card */}
          <div
            className={app.card}
            style={{
              background: '#f4f1ff',
              border: `1.4px solid #cbb9ff`,
              borderRadius: 18,
              boxShadow: '0px 6px 18px rgba(124,92,255,0.1)',
              padding: '0 16px',
              height: 80,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              marginBottom: 12,
              cursor: 'pointer',
            }}
          >
            <div style={{ position: 'relative', width: 48, height: 48, flex: '0 0 auto' }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  background: ONB.lavender,
                  position: 'absolute',
                  inset: 0,
                }}
              />
              <div style={{ position: 'absolute', top: 2, left: 2 }}><Mage pose="celebrate" size={44} /></div>
            </div>
            <div>
              <p
                style={{
                  margin: '0 0 2px',
                  fontFamily: ONB.font,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  color: ONB.primary,
                  lineHeight: 1.3,
                }}
              >
                LATEST
              </p>
              <p
                style={{
                  margin: '0 0 3px',
                  fontFamily: ONB.font,
                  fontSize: 15,
                  fontWeight: 700,
                  color: ONB.ink,
                  letterSpacing: '-0.2px',
                  lineHeight: 1.3,
                }}
              >
                Weak point cleared
              </p>
              <p
                style={{
                  margin: 0,
                  fontFamily: ONB.font,
                  fontSize: 12,
                  fontWeight: 500,
                  color: ONB.muted,
                  lineHeight: 1.3,
                }}
              >
                Unlocked today · nice recovery
              </p>
            </div>
          </div>

          {/* Badge tiles row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {BADGES.map((b) => (
              <div
                key={b.label}
                className={app.card}
                style={{
                  background: ONB.white,
                  border: `1.2px solid ${ONB.line}`,
                  borderRadius: 14,
                  boxShadow: '0px 4px 12px rgba(58,46,102,0.06)',
                  padding: '12px 0 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 5,
                  cursor: 'pointer',
                  opacity: b.locked ? 0.5 : 1,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: ONB.lavender,
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div style={{ opacity: b.locked ? 0.4 : 1 }}>
                    <Mage
                      pose={b.pose as Parameters<typeof Mage>[0]['pose']}
                      size={32}
                    />
                  </div>
                </div>
                <span
                  style={{
                    fontFamily: ONB.font,
                    fontSize: 9.5,
                    fontWeight: 600,
                    color: b.locked ? APPC.navInactive : ONB.ink,
                    textAlign: 'center',
                    lineHeight: 1.15,
                    padding: '0 4px',
                  }}
                >
                  {b.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Pro upsell card */}
        <div
          className={app.card}
          style={{
            background: ONB.primary,
            borderRadius: 22,
            boxShadow: '0px 12px 26px rgba(124,92,255,0.32)',
            padding: '16px 20px 16px',
            position: 'relative',
            overflow: 'hidden',
            marginBottom: 20,
            minHeight: 132,
            cursor: 'pointer',
          }}
        >
          <div style={{ maxWidth: 196 }}>
            <p
              style={{
                margin: '0 0 8px',
                fontFamily: ONB.font,
                fontSize: 15.5,
                fontWeight: 700,
                color: ONB.white,
                letterSpacing: '-0.2px',
                lineHeight: 1.25,
              }}
            >
              Prepare faster with Pro
            </p>
            <p
              style={{
                margin: '0 0 18px',
                fontFamily: ONB.font,
                fontSize: 11.5,
                fontWeight: 500,
                color: 'rgba(255,255,255,0.92)',
                lineHeight: 1.3,
              }}
            >
              Unlimited paths, exam mode &amp; deeper reviews.
            </p>
            <button
              className={app.pill}
              onClick={() => setPressed('upgrade')}
              style={{
                height: 30,
                padding: '0 20px',
                borderRadius: 15,
                background: ONB.white,
                border: 'none',
                fontFamily: ONB.font,
                fontSize: 12.5,
                fontWeight: 700,
                color: ONB.primary,
                cursor: 'pointer',
              }}
            >
              Upgrade
            </button>
          </div>

          {/* Mage mascot */}
          <div
            style={{
              position: 'absolute',
              right: -6,
              bottom: -4,
              pointerEvents: 'none',
            }}
          >
            <Mage pose="wand" size={104} />
          </div>
        </div>

        {/* Settings list */}
        <div
          style={{
            background: ONB.white,
            border: `1.2px solid ${ONB.line}`,
            borderRadius: 20,
            boxShadow: '0px 5px 16px rgba(58,46,102,0.06)',
            overflow: 'hidden',
            marginBottom: 12,
          }}
        >
          {SETTINGS.map((s, i) => (
            <div key={s.label}>
              <button
                className={app.card}
                onClick={() => setPressed(s.label)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  padding: '0 20px',
                  height: 52,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    background: ONB.lavender,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: '0 0 auto',
                  }}
                >
                  <span
                    className="material-symbols-outlined filled"
                    style={{ fontSize: 18, color: ONB.primaryInk }}
                  >
                    {s.icon}
                  </span>
                </span>
                <span
                  style={{
                    flex: 1,
                    fontFamily: ONB.font,
                    fontSize: 14.5,
                    fontWeight: 600,
                    color: ONB.ink,
                    lineHeight: 1.3,
                  }}
                >
                  {s.label}
                </span>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 20, color: '#c2bfb6' }}
                >
                  chevron_right
                </span>
              </button>
              {i < SETTINGS.length - 1 && (
                <div
                  style={{
                    height: 1,
                    background: '#f0ece3',
                    marginLeft: 64,
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Log out */}
        <button
          className={app.pill}
          onClick={() => setPressed('logout')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 52,
            width: '100%',
            background: ONB.white,
            border: `1.2px solid ${ONB.line}`,
            borderRadius: 16,
            fontFamily: ONB.font,
            fontSize: 15,
            fontWeight: 600,
            color: '#d6442a',
            cursor: 'pointer',
            marginBottom: 16,
          }}
        >
          Log out
        </button>

        {/* Mage Tip */}
        <div style={{ position: 'relative' }}>
          <MageTip style={{ paddingRight: 110 }}>
            You&apos;re 2 days away from your next streak reward.
          </MageTip>
          {/* Pointing Mage */}
          <div
            style={{
              position: 'absolute',
              right: -6,
              bottom: -4,
              pointerEvents: 'none',
            }}
          >
            <Sparkle size={12} style={{ position: 'absolute', top: -8, right: 10 }} />
            <Mage pose="pointing" size={96} />
          </div>
        </div>
      </div>
    </AppMobileFrame>
  );
}
