'use client';

import type { CSSProperties, ReactNode } from 'react';
import { StatusBar } from './StatusBar';
import { HomeIndicator } from './HomeIndicator';

/** Logical phone screen size the Figma mobile frames are drawn at. */
export const PHONE_WIDTH = 393;
export const PHONE_HEIGHT = 852;

export interface PhoneFrameProps {
  children: ReactNode;
  /** Status-bar clock text. */
  time?: string;
  showStatusBar?: boolean;
  showHomeIndicator?: boolean;
  /** Screen-area background (defaults to the app surface). */
  background?: string;
  /** Fixed content height; defaults to the iPhone logical height (852). */
  height?: number;
  style?: CSSProperties;
}

/**
 * A 393×852 device shell with rounded bezel, used by the gallery's device-frame
 * comparison views so the mobile build can be reviewed at its true size on any
 * monitor. The screen area scrolls internally; the status bar / home indicator
 * float above it (the screen content sits behind the safe areas, matching the
 * `viewport-fit=cover` mobile frames).
 */
export function PhoneFrame({
  children,
  time = '9:41',
  showStatusBar = true,
  showHomeIndicator = true,
  background = 'var(--surface)',
  height = PHONE_HEIGHT,
  style,
}: PhoneFrameProps) {
  return (
    <div
      style={{
        width: PHONE_WIDTH + 16,
        padding: 8,
        borderRadius: 56,
        background: '#05050f',
        boxShadow: '0 24px 64px rgba(0,0,0,0.45), 0 0 0 2px rgba(255,255,255,0.04) inset',
        flex: '0 0 auto',
        ...style,
      }}
    >
      <div
        style={{
          position: 'relative',
          width: PHONE_WIDTH,
          height,
          borderRadius: 48,
          overflow: 'hidden',
          background,
          color: 'var(--on-surface)',
        }}
      >
        {/* Scrollable screen content (fills the full screen, under the safe areas). */}
        <div
          className="custom-scrollbar"
          style={{ position: 'absolute', inset: 0, overflowY: 'auto', overflowX: 'hidden' }}
        >
          {children}
        </div>

        {/* Safe-area chrome floats over the content. */}
        {showStatusBar && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, pointerEvents: 'none' }}>
            <StatusBar time={time} />
          </div>
        )}
        {showHomeIndicator && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, pointerEvents: 'none' }}>
            <HomeIndicator />
          </div>
        )}
      </div>
    </div>
  );
}
