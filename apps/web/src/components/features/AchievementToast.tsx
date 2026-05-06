'use client';

import { useEffect } from 'react';

interface AchievementToastProps {
  badge: string;
  name: string;
  description: string;
  icon: string;
  onClose: () => void;
}

export default function AchievementToast({
  name,
  description,
  icon,
  onClose,
}: AchievementToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const materialIcon = icon;

  return (
    <>
      <style>{`
        @keyframes achievement-slide-in {
          0% {
            transform: translateX(120%);
            opacity: 0;
          }
          100% {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
      <div
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 100,
          display: 'flex',
          alignItems: 'flex-start',
          gap: '14px',
          padding: '16px 20px',
          background: '#272746',
          borderRadius: '16px',
          border: '1px solid rgba(255,222,89,0.3)',
          boxShadow: '0 0 24px rgba(255,222,89,0.1), 0 8px 32px rgba(0,0,0,0.4)',
          maxWidth: '360px',
          animation: 'achievement-slide-in 0.4s cubic-bezier(0.22,1,0.36,1) forwards',
        }}
      >
        {/* Icon */}
        <div
          style={{
            flexShrink: 0,
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: 'rgba(255,222,89,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: '24px',
              color: '#ffde59',
              fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24",
            }}
          >
            {materialIcon}
          </span>
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#ffde59',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '4px',
            }}
          >
            Achievement Unlocked
          </div>
          <div
            style={{
              fontSize: '15px',
              fontWeight: 700,
              color: '#e5e3ff',
              lineHeight: 1.3,
              marginBottom: '2px',
            }}
          >
            {name}
          </div>
          <div
            style={{
              fontSize: '12px',
              color: '#aaa8c8',
              lineHeight: 1.4,
            }}
          >
            {description}
          </div>
        </div>

        {/* Close */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          style={{
            flexShrink: 0,
            background: 'none',
            border: 'none',
            padding: '4px',
            cursor: 'pointer',
            color: '#6a6a8c',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '8px',
            transition:
              'color 0.2s cubic-bezier(0.22,1,0.36,1), background 0.2s cubic-bezier(0.22,1,0.36,1)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#e5e3ff';
            e.currentTarget.style.background = 'rgba(229,227,255,0.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#6a6a8c';
            e.currentTarget.style.background = 'none';
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
            close
          </span>
        </button>
      </div>
    </>
  );
}
