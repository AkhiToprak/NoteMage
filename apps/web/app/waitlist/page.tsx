'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { BGPattern } from '@/components/ui/bg-pattern';

// =====================================================================
// WAITLIST PAGE
// =====================================================================
export default function WaitlistPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg('');

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (data.success) {
        setStatus('success');
      } else {
        setStatus('error');
        setErrorMsg(data.error || 'Something went wrong');
      }
    } catch {
      setStatus('error');
      setErrorMsg('Something went wrong. Please try again.');
    }
  };

  return (
    <div
      className="waitlist-outer"
      style={{
        minHeight: '100vh',
        background: '#000000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        isolation: 'isolate',
        overflow: 'hidden',
        padding: '24px',
      }}
    >
      <BGPattern
        variant="dots"
        size={22}
        fill="rgba(174, 137, 255, 0.14)"
        style={{ position: 'fixed' }}
      />

      {/* Content card */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: '460px',
          width: '100%',
          textAlign: 'center',
        }}
      >
        {/* Logo */}
        <div style={{ marginBottom: '40px' }}>
          <Image
            src="/logo_white.png"
            alt="Notemage"
            width={180}
            height={50}
            style={{ margin: '0 auto' }}
            priority
          />
        </div>

        {/* Glass card */}
        <div
          className="waitlist-card"
          style={{
            background: 'rgba(33, 33, 62, 0.6)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(174, 137, 255, 0.30)',
            borderRadius: '20px',
            padding: '48px 36px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.3), 0 0 80px rgba(140,82,255,0.06)',
          }}
        >
          {status === 'success' ? (
            /* Success state */
            <div
              style={{
                animation: 'fadeInUp 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            >
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: 'rgba(255, 222, 89, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 20px',
                }}
              >
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ffde59"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h2
                style={{
                  fontFamily: 'var(--font-epilogue), sans-serif',
                  fontSize: '24px',
                  fontWeight: 700,
                  color: 'var(--on-surface)',
                  marginBottom: '12px',
                  letterSpacing: '-0.03em',
                }}
              >
                You&apos;re on the list!
              </h2>
              <p
                style={{
                  fontFamily: 'var(--font-plus-jakarta), sans-serif',
                  fontSize: '15px',
                  color: 'var(--on-surface-variant)',
                  lineHeight: 1.7,
                }}
              >
                We&apos;ll send you an email when Notemage launches. Stay tuned!
              </p>
            </div>
          ) : (
            /* Form state */
            <>
              <h1
                className="waitlist-heading"
                style={{
                  fontFamily: 'var(--font-epilogue), sans-serif',
                  fontSize: '28px',
                  fontWeight: 700,
                  color: 'var(--on-surface)',
                  marginBottom: '12px',
                  letterSpacing: '-0.03em',
                  lineHeight: 1.2,
                }}
              >
                Something big is coming
              </h1>
              <p
                style={{
                  fontFamily: 'var(--font-plus-jakarta), sans-serif',
                  fontSize: '15px',
                  color: 'var(--on-surface-variant)',
                  lineHeight: 1.7,
                  marginBottom: '32px',
                }}
              >
                Notemage turns your study materials into flashcards, quizzes, and AI-powered study
                plans. Be the first to know when we launch.
              </p>

              <form onSubmit={handleSubmit}>
                <div
                  style={{
                    display: 'flex',
                    gap: '10px',
                    flexDirection: 'column',
                  }}
                >
                  <input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '14px 18px',
                      background: 'rgba(13, 13, 26, 0.7)',
                      border: '1px solid rgba(136, 136, 168, 0.25)',
                      borderRadius: '12px',
                      color: 'var(--on-surface)',
                      fontSize: '15px',
                      fontFamily: 'var(--font-plus-jakarta), sans-serif',
                      outline: 'none',
                      transition: 'border-color 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(140, 82, 255, 0.5)')}
                    onBlur={(e) =>
                      (e.currentTarget.style.borderColor = 'rgba(136, 136, 168, 0.25)')
                    }
                  />
                  <button
                    type="submit"
                    disabled={status === 'loading'}
                    style={{
                      width: '100%',
                      padding: '14px 24px',
                      background: status === 'loading' ? '#ccb238' : '#ffde59',
                      color: '#000000',
                      fontFamily: 'var(--font-epilogue), sans-serif',
                      fontSize: '15px',
                      fontWeight: 700,
                      border: 'none',
                      borderRadius: '12px',
                      cursor: status === 'loading' ? 'not-allowed' : 'pointer',
                      boxShadow: '0 4px 20px rgba(255, 222, 89, 0.25)',
                      transition:
                        'transform 0.2s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
                    }}
                    onMouseEnter={(e) => {
                      if (status !== 'loading') {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 6px 28px rgba(255, 222, 89, 0.35)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 4px 20px rgba(255, 222, 89, 0.25)';
                    }}
                  >
                    {status === 'loading' ? 'Joining...' : 'Join the Waitlist'}
                  </button>
                </div>

                {status === 'error' && (
                  <p
                    style={{
                      color: '#fd6f85',
                      fontSize: '13px',
                      marginTop: '12px',
                      fontFamily: 'var(--font-plus-jakarta), sans-serif',
                    }}
                  >
                    {errorMsg}
                  </p>
                )}
              </form>
            </>
          )}
        </div>

        {/* Login link */}
        <p
          style={{
            marginTop: '28px',
            fontSize: '14px',
            color: 'var(--outline)',
            fontFamily: 'var(--font-plus-jakarta), sans-serif',
          }}
        >
          Already have an account?{' '}
          <Link
            href="/auth/login"
            style={{
              color: '#ae89ff',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Log in
          </Link>
        </p>
      </div>

      {/* Keyframes + Responsive */}
      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
      <style>{`
        /* ── Responsive: Tablet (768–1023px) ── */
        @media (min-width: 768px) and (max-width: 1023px) {
          .waitlist-outer { padding: 24px 24px !important; }
        }

        /* ── Responsive: Phone (max-width 767px) ── */
        @media (max-width: 767px) {
          .waitlist-outer { padding: 24px 16px !important; }
          .waitlist-card { padding: 32px 20px !important; }
          .waitlist-heading { font-size: 24px !important; }
        }
      `}</style>
    </div>
  );
}
