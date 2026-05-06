'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

// =====================================================================
// PARTICLE CANVAS (reused from original landing page)
// =====================================================================
interface Particle {
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  opacity: number;
  color: string;
  magnetism: number;
  tx: number;
  ty: number;
}

function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const particlesRef = useRef<Particle[]>([]);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const COLORS = ['#8c52ff', '#5170ff', '#b899ff', '#3a2080', '#6040cc'];

    const resize = () => {
      canvas.width = container.offsetWidth;
      canvas.height = container.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    window.addEventListener('mousemove', onMouseMove);

    particlesRef.current = Array.from({ length: 70 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 1.8 + 0.4,
      speedX: (Math.random() - 0.5) * 0.25,
      speedY: (Math.random() - 0.5) * 0.25,
      opacity: Math.random() * 0.45 + 0.08,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      magnetism: Math.random() * 5 + 0.5,
      tx: 0,
      ty: 0,
    }));

    const hexAlpha = (opacity: number) =>
      Math.floor(opacity * 255)
        .toString(16)
        .padStart(2, '0');

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particlesRef.current.forEach((p) => {
        const dxM = mouseRef.current.x - p.x;
        const dyM = mouseRef.current.y - p.y;
        p.tx += (dxM / (80 / p.magnetism) - p.tx) / 60;
        p.ty += (dyM / (80 / p.magnetism) - p.ty) / 60;

        p.x += p.speedX;
        p.y += p.speedY;

        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.save();
        ctx.translate(p.tx * 0.08, p.ty * 0.08);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `${p.color}${hexAlpha(p.opacity)}`;
        ctx.fill();
        ctx.restore();
      });
      animRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}

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
        background: '#0d0d1a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        padding: '24px',
      }}
    >
      {/* Background effects */}
      <ParticleCanvas />

      {/* Ambient glow blobs */}
      <div
        style={{
          position: 'absolute',
          top: '15%',
          left: '20%',
          width: '400px',
          height: '400px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(140,82,255,0.15) 0%, transparent 70%)',
          filter: 'blur(80px)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '10%',
          right: '15%',
          width: '350px',
          height: '350px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(81,112,255,0.12) 0%, transparent 70%)',
          filter: 'blur(80px)',
          pointerEvents: 'none',
        }}
      />

      {/* Center glow */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '600px',
          height: '600px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(140,82,255,0.08) 0%, transparent 60%)',
          pointerEvents: 'none',
        }}
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
            border: '1px solid rgba(140, 82, 255, 0.15)',
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
                  color: '#eeecff',
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
                  color: '#aaa8c8',
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
                  color: '#eeecff',
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
                  color: '#aaa8c8',
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
                      color: '#eeecff',
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
                      color: '#0d0d1a',
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
            color: '#8888a8',
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
