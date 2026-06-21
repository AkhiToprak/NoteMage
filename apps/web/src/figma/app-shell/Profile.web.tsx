'use client';

import { useState } from 'react';
import { Mage } from '@/figma/kit';
import { ONB, Sparkle, app } from './shell';
import { AppWebFrame, APPC, MageTip } from './shell';

/**
 * Profile — Web (Figma node 96:3, 1440px wide).
 * Pixel-faithful reproduction. No backend — all interactions are local state.
 */

// ── Settings rows ────────────────────────────────────────────────────────────
const SETTINGS = [
  { icon: 'person', label: 'Account' },
  { icon: 'notifications', label: 'Notifications' },
  { icon: 'dark_mode', label: 'Appearance' },
  { icon: 'workspace_premium', label: 'Subscription' },
  { icon: 'help', label: 'Help & support' },
] as const;

// ── Achievement badges ───────────────────────────────────────────────────────
type Badge = { pose: string; label: string; locked?: boolean };
const BADGES: Badge[] = [
  { pose: 'graduation', label: 'First path' },
  { pose: 'wand',       label: '7-day streak' },
  { pose: 'quizzing',   label: 'Quiz ace' },
  { pose: 'scroll',     label: '10 paths', locked: true },
];

export default function ProfileWeb() {
  // Tracks the last-pressed control (press feedback also comes from the CSS classes).
  const setPressed = useState<string | null>(null)[1];

  return (
    <AppWebFrame active="profile" askSubtitle="Help me study" minHeight={716} mainPadding="36px 34px 36px 34px">
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>

        {/* ── LEFT COLUMN ─────────────────────────────────────────── */}
        <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Profile header card */}
          <div
            style={{
              background: ONB.white,
              border: `1.2px solid ${ONB.line}`,
              borderRadius: 24,
              boxShadow: '0px 10px 28px rgba(124,92,255,0.1), 0px 2px 8px rgba(26,19,48,0.05)',
              padding: '20px 24px',
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              position: 'relative',
            }}
          >
            {/* Avatar circle */}
            <div
              style={{
                position: 'relative',
                flex: '0 0 auto',
              }}
            >
              <div
                style={{
                  width: 88,
                  height: 88,
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
                  style={{ fontSize: 44, color: ONB.primary, opacity: 0.6 }}
                >
                  person
                </span>
              </div>
              {/* Streak badge circle */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  width: 28,
                  height: 28,
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
                    fontSize: 12,
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
                  fontSize: 22,
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
                  margin: '4px 0 12px',
                  fontFamily: ONB.font,
                  fontSize: 14,
                  fontWeight: 500,
                  color: ONB.muted,
                  lineHeight: 1.3,
                }}
              >
                alex@notemage.app
              </p>
              {/* Pills row */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Free plan pill */}
                <span
                  style={{
                    height: 24,
                    padding: '0 11px',
                    borderRadius: 12,
                    background: ONB.lavender,
                    fontFamily: ONB.font,
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: ONB.primary,
                    display: 'inline-flex',
                    alignItems: 'center',
                  }}
                >
                  Free plan
                </span>
                {/* Streak pill (amber) */}
                <span
                  style={{
                    height: 24,
                    padding: '0 11px',
                    paddingLeft: 8,
                    borderRadius: 12,
                    background: APPC.amberBg,
                    fontFamily: ONB.font,
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: APPC.amberInk,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span
                    className="material-symbols-outlined filled"
                    style={{ fontSize: 13, color: ONB.gold }}
                  >
                    local_fire_department
                  </span>
                  12-day streak
                </span>
              </div>
            </div>

            {/* Edit button */}
            <button
              className={app.pill}
              onClick={() => setPressed('edit')}
              style={{
                position: 'absolute',
                top: 20,
                right: 24,
                height: 28,
                padding: '0 14px',
                borderRadius: 14,
                background: ONB.lavender,
                border: 'none',
                fontFamily: ONB.font,
                fontSize: 11.5,
                fontWeight: 600,
                color: ONB.primary,
                cursor: 'pointer',
              }}
            >
              Edit
            </button>
          </div>

          {/* Stats row */}
          <div
            style={{
              background: ONB.white,
              border: `1.2px solid ${ONB.line}`,
              borderRadius: 20,
              boxShadow: '0px 5px 16px rgba(58,46,102,0.06)',
              display: 'flex',
              alignItems: 'stretch',
            }}
          >
            {[
              { val: '12',  label: 'Day streak' },
              { val: '3',   label: 'Active paths' },
              { val: '248', label: 'Questions' },
              { val: '82%', label: 'Accuracy' },
            ].map((s, i) => (
              <div
                key={s.label}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '20px 0',
                  borderLeft: i > 0 ? `1px solid ${ONB.line}` : undefined,
                }}
              >
                <span
                  style={{
                    fontFamily: ONB.font,
                    fontSize: 22,
                    fontWeight: 700,
                    color: ONB.ink,
                    lineHeight: 1.3,
                  }}
                >
                  {s.val}
                </span>
                <span
                  style={{
                    fontFamily: ONB.font,
                    fontSize: 11.5,
                    fontWeight: 500,
                    color: ONB.muted,
                    lineHeight: 1.3,
                    marginTop: 2,
                  }}
                >
                  {s.label}
                </span>
              </div>
            ))}
          </div>

          {/* Achievements section */}
          <div>
            {/* Section header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span
                style={{
                  fontFamily: ONB.font,
                  fontSize: 17,
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

            {/* Latest achievement highlight card */}
            <div
              className={app.card}
              style={{
                background: '#f4f1ff',
                border: `1.4px solid #cbb9ff`,
                borderRadius: 18,
                boxShadow: '0px 6px 18px rgba(124,92,255,0.1)',
                padding: '0 20px',
                height: 84,
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                marginBottom: 12,
                position: 'relative',
                cursor: 'pointer',
              }}
            >
              {/* Avatar bubble */}
              <div
                style={{
                  position: 'relative',
                  width: 48,
                  height: 48,
                  flex: '0 0 auto',
                }}
              >
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

              {/* Text */}
              <div>
                <p
                  style={{
                    margin: '0 0 4px',
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
                    margin: '0 0 4px',
                    fontFamily: ONB.font,
                    fontSize: 16,
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

              {/* Sparkle decoration */}
              <Sparkle size={16} style={{ position: 'absolute', top: 12, right: 16 }} />
            </div>

            {/* Badge row */}
            <div style={{ display: 'flex', gap: 12 }}>
              {BADGES.map((b) => (
                <div
                  key={b.label}
                  className={app.card}
                  style={{
                    flex: 1,
                    background: ONB.white,
                    border: `1.2px solid ${ONB.line}`,
                    borderRadius: 16,
                    boxShadow: '0px 5px 16px rgba(58,46,102,0.06)',
                    padding: '16px 0 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    opacity: b.locked ? 0.5 : 1,
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
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
                        size={44}
                      />
                    </div>
                  </div>
                  <span
                    style={{
                      fontFamily: ONB.font,
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: b.locked ? APPC.navInactive : ONB.ink,
                      textAlign: 'center',
                      lineHeight: 1.2,
                    }}
                  >
                    {b.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Mage Tip */}
          <div style={{ position: 'relative' }}>
            <MageTip style={{ paddingRight: 130 }}>
              You&apos;re 2 days away from your next streak reward.
            </MageTip>
            {/* Pointing Mage sticking out of the right edge */}
            <div
              style={{
                position: 'absolute',
                right: -8,
                bottom: -4,
                pointerEvents: 'none',
              }}
            >
              <Sparkle size={12} style={{ position: 'absolute', top: -10, right: 8 }} />
              <Mage pose="pointing" size={116} />
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN ─────────────────────────────────────────── */}
        <div style={{ flex: '0 0 312px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Pro upsell card */}
          <div
            className={app.card}
            style={{
              background: ONB.primary,
              borderRadius: 22,
              boxShadow: '0px 12px 26px rgba(124,92,255,0.32)',
              padding: '20px 20px 16px',
              position: 'relative',
              overflow: 'hidden',
              minHeight: 150,
              cursor: 'pointer',
            }}
          >
            {/* Text content */}
            <div style={{ maxWidth: 178 }}>
              <p
                style={{
                  margin: '0 0 10px',
                  fontFamily: ONB.font,
                  fontSize: 16,
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
                  margin: '0 0 20px',
                  fontFamily: ONB.font,
                  fontSize: 12,
                  fontWeight: 500,
                  color: 'rgba(255,255,255,0.92)',
                  lineHeight: 1.35,
                }}
              >
                Unlimited paths, exam mode, and deeper reviews.
              </p>
              <button
                className={app.pill}
                onClick={() => setPressed('upgrade')}
                style={{
                  height: 32,
                  padding: '0 20px',
                  borderRadius: 16,
                  background: ONB.white,
                  border: 'none',
                  fontFamily: ONB.font,
                  fontSize: 13,
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
                top: 8,
                right: -4,
                pointerEvents: 'none',
              }}
            >
              <Mage pose="wand" size={100} />
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
                  {/* Icon chip */}
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

                {/* Divider (except after last) */}
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
            }}
          >
            Log out
          </button>
        </div>
      </div>
    </AppWebFrame>
  );
}
