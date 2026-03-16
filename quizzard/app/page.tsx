"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";

// =====================================================================
// PARTICLE CANVAS (inspired by 21st.dev Particles component)
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
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const COLORS = ["#8c52ff", "#5170ff", "#b899ff", "#3a2080", "#6040cc"];

    const resize = () => {
      canvas.width = container.offsetWidth;
      canvas.height = container.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    window.addEventListener("mousemove", onMouseMove);

    particlesRef.current = Array.from({ length: 90 }, () => ({
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
        .padStart(2, "0");

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
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}

// =====================================================================
// ROTATING TEXT
// =====================================================================
const WORDS = ["Companion", "Wizard", "Tutor", "Coach"];

function RotatingWord() {
  const [idx, setIdx] = useState(0);
  const [show, setShow] = useState(true);

  useEffect(() => {
    const t = setInterval(() => {
      setShow(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % WORDS.length);
        setShow(true);
      }, 380);
    }, 2800);
    return () => clearInterval(t);
  }, []);

  return (
    <span
      style={{
        display: "inline-block",
        color: "#ffde59",
        transition: "opacity 0.38s cubic-bezier(0.22,1,0.36,1), transform 0.38s cubic-bezier(0.22,1,0.36,1)",
        opacity: show ? 1 : 0,
        transform: show ? "translateY(0)" : "translateY(-14px)",
        textShadow: "0 0 40px rgba(255,222,89,0.4)",
      }}
    >
      {WORDS[idx]}
    </span>
  );
}

// =====================================================================
// SVG ICONS
// =====================================================================
const Ic = {
  brain: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/>
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/>
    </svg>
  ),
  book: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>
  ),
  cards: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="16" height="13" rx="2"/>
      <path d="M22 5H7a2 2 0 0 0-2 2"/>
      <path d="M6 3h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2"/>
    </svg>
  ),
  calendar: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  ),
  play: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/>
    </svg>
  ),
  users: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  upload: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  ),
  sparkle: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/>
      <path d="M19 3l.75 2.25L22 6l-2.25.75L19 9l-.75-2.25L16 6l2.25-.75z"/>
    </svg>
  ),
  trophy: (
    <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#ffde59" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
      <path d="M4 22h16"/>
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
    </svg>
  ),
  hat: (
    <svg width="62" height="62" viewBox="0 0 24 24" fill="none" stroke="#8c52ff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18v-1a7 7 0 0 1 7-7h4a7 7 0 0 1 7 7v1"/>
      <path d="M12 10V3"/>
      <path d="M8 7l4-4 4 4"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  ),
  flame: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
    </svg>
  ),
  medal: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="15" r="5"/>
      <path d="M8.56 2.9A7 7 0 0 1 19 9v4"/>
      <path d="M5 9v4a7 7 0 0 0 3.44 6.1"/>
      <line x1="12" y1="10" x2="12" y2="20"/>
    </svg>
  ),
  chart: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  ),
  bolt: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  phone: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2"/>
      <line x1="12" y1="18" x2="12.01" y2="18"/>
    </svg>
  ),
  share: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
    </svg>
  ),
  store: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
  group: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
};

// =====================================================================
// DATA
// =====================================================================
const FEATURES = [
  {
    icon: Ic.brain,
    title: "AI Tutor",
    desc: "Chat with AI about your uploaded documents. Get instant explanations, summaries, and answers 24/7 — always based on your own material.",
    delay: 1,
  },
  {
    icon: Ic.book,
    title: "Smart Notebooks",
    desc: "Organize everything by subject. Upload PDFs, lecture notes, slides, and more into clean, searchable notebooks with subfolders.",
    delay: 2,
  },
  {
    icon: Ic.cards,
    title: "Quizzes & Flashcards",
    desc: "AI generates multiple-choice quizzes and spaced-repetition flashcards from your material. Active recall proven to boost retention.",
    delay: 3,
  },
  {
    icon: Ic.calendar,
    title: "Exam Planner",
    desc: "Add your exam dates and Quizzard builds a personalized study schedule. Daily reminders take the stress out of planning.",
    delay: 1,
  },
  {
    icon: Ic.play,
    title: "YouTube & Articles",
    desc: "Find relevant YouTube videos and articles for any topic. Quizzard analyzes them and adds context directly to your notebook.",
    delay: 2,
  },
  {
    icon: Ic.users,
    title: "Study Together",
    desc: "Share notebooks with friends, create study groups, and browse the community notebook marketplace. Learn better, together.",
    delay: 3,
  },
];

const STEPS = [
  {
    n: "01",
    icon: Ic.book,
    title: "Create a Notebook",
    desc: "Set up a notebook for each subject. Give it a name, add a description, and organize it with subfolders.",
  },
  {
    n: "02",
    icon: Ic.upload,
    title: "Upload Your Material",
    desc: "Drop in PDFs, lecture notes, slides, or links to YouTube videos and articles. Everything in one place.",
  },
  {
    n: "03",
    icon: Ic.brain,
    title: "Study with AI",
    desc: "Chat with your tutor, get quizzes, make flashcards, and let Quizzard plan your path to exam day.",
  },
];

const ACTIVITY = [
  { name: "Alex", action: "studied Organic Chemistry for 2 hours", time: "Just now", initials: "A", color: "#8c52ff" },
  { name: "Maria", action: "created 24 flashcards for Calculus", time: "5m ago", initials: "M", color: "#5170ff" },
  { name: "Jonas", action: "scored 96% on History quiz", time: "1h ago", initials: "J", color: "#b040a0" },
];

const BADGES = [
  { icon: Ic.flame, label: "Study Streaks" },
  { icon: Ic.medal, label: "Achievements" },
  { icon: Ic.chart, label: "Activity Board" },
  { icon: Ic.bolt, label: "Daily Goals" },
];

// =====================================================================
// MAIN PAGE
// =====================================================================
export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 48);
    window.addEventListener("scroll", onScroll);

    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add("is-revealed");
        }),
      { threshold: 0.08, rootMargin: "0px 0px -48px 0px" }
    );
    document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));

    return () => {
      window.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, []);

  return (
    <main style={{ background: "#09081a", color: "#ede9ff", minHeight: "100vh", overflowX: "hidden" }}>
      {/* ── GLOBAL STYLES ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Shrikhand&family=Gliker:wght@400;500;600;700&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body { font-family: 'Gliker', 'DM Sans', sans-serif; background: #09081a; }

/* ── Scroll reveal ── */
        .reveal {
          opacity: 0;
          transform: translateY(36px);
          transition:
            opacity 0.75s cubic-bezier(0.22, 1, 0.36, 1),
            transform 0.75s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .reveal.is-revealed { opacity: 1; transform: translateY(0); }
        .d1 { transition-delay: 0.08s; }
        .d2 { transition-delay: 0.18s; }
        .d3 { transition-delay: 0.28s; }
        .d4 { transition-delay: 0.38s; }
        .d5 { transition-delay: 0.48s; }

        /* ── Buttons ── */
        .btn-yellow {
          display: inline-flex; align-items: center; gap: 8px;
          background: #ffde59; color: #09081a;
          font-family: 'Gliker', 'DM Sans', sans-serif; font-weight: 700; font-size: 16px;
          padding: 15px 32px; border-radius: 14px; border: none;
          text-decoration: none; cursor: pointer;
          box-shadow: 0 4px 28px rgba(255,222,89,0.28), 0 2px 8px rgba(0,0,0,0.4);
          transition: transform 0.22s cubic-bezier(0.22,1,0.36,1), box-shadow 0.22s cubic-bezier(0.22,1,0.36,1);
        }
        .btn-yellow:hover {
          transform: translateY(-3px);
          box-shadow: 0 10px 48px rgba(255,222,89,0.38), 0 4px 16px rgba(0,0,0,0.5);
        }
        .btn-yellow:active { transform: translateY(0); }

        .btn-ghost {
          display: inline-flex; align-items: center; gap: 8px;
          background: transparent; color: #ede9ff;
          font-family: 'Gliker', 'DM Sans', sans-serif; font-weight: 500; font-size: 16px;
          padding: 15px 32px; border-radius: 14px;
          border: 1px solid rgba(140,82,255,0.35);
          text-decoration: none; cursor: pointer;
          transition: background 0.2s ease, border-color 0.2s ease, transform 0.22s cubic-bezier(0.22,1,0.36,1);
        }
        .btn-ghost:hover {
          background: rgba(140,82,255,0.1);
          border-color: rgba(140,82,255,0.65);
          transform: translateY(-2px);
        }

        /* ── Feature cards ── */
        .fcard {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(140,82,255,0.14);
          border-radius: 20px; padding: 32px;
          transition:
            transform 0.3s cubic-bezier(0.22,1,0.36,1),
            box-shadow 0.3s cubic-bezier(0.22,1,0.36,1),
            border-color 0.3s ease,
            background 0.3s ease;
        }
        .fcard:hover {
          transform: translateY(-7px);
          box-shadow: 0 24px 64px rgba(140,82,255,0.13), 0 4px 20px rgba(0,0,0,0.5);
          border-color: rgba(140,82,255,0.38);
          background: rgba(140,82,255,0.06);
        }

        /* ── Nav link ── */
        .nlink {
          color: rgba(237,233,255,0.62); font-size: 15px; font-weight: 500;
          text-decoration: none;
          transition: color 0.2s ease;
        }
        .nlink:hover { color: #ede9ff; }

        /* ── Gradient text ── */
        .grad-text {
          background: linear-gradient(120deg, #8c52ff 0%, #5170ff 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        /* ── Section label ── */
        .slabel {
          font-size: 11px; font-weight: 700; letter-spacing: 0.12em;
          text-transform: uppercase; color: #8c52ff;
        }

        /* ── Grain texture ── */
        .grain {
          position: fixed; inset: 0; pointer-events: none; z-index: 999;
          opacity: 0.022;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='400' height='400' filter='url(%23n)'/%3E%3C/svg%3E");
        }

        /* ── Responsive ── */
        @media (max-width: 768px) {
          .community-grid { grid-template-columns: 1fr !important; }
          .hero-btns { flex-direction: column; align-items: center; }
          .nav-links { display: none !important; }
          .nav-auth { gap: 8px !important; }
          .stats-row { gap: 24px !important; }
        }
      `}</style>

      {/* Grain */}
      <div className="grain" />

      {/* ── STATIC LOGO ── */}
      <div style={{ position: "absolute", top: 20, left: 40, zIndex: 60 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo_trimmed.png" alt="Quizzard" style={{ height: "138px", width: "auto", display: "block" }} />
      </div>

      {/* ── NAVBAR ── */}
      <nav
        style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
          padding: "0 40px", height: 64,
          display: "flex", alignItems: "center", justifyContent: "flex-end",
          background: scrolled ? "rgba(9,8,26,0.88)" : "transparent",
          backdropFilter: scrolled ? "blur(24px)" : "none",
          borderBottom: scrolled ? "1px solid rgba(140,82,255,0.12)" : "1px solid transparent",
          transition: "background 0.35s ease, backdrop-filter 0.35s ease, border-color 0.35s ease",
        }}
      >
        {/* Nav links */}
        <div className="nav-links" style={{ display: "flex", gap: 36, marginRight: 48 }}>
          <a href="#features" className="nlink">Features</a>
          <a href="#how-it-works" className="nlink">How It Works</a>
          <a href="#community" className="nlink">Community</a>
        </div>

        {/* Auth */}
        <div className="nav-auth" style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <Link href="/auth/login" className="nlink">Log in</Link>
          <Link href="/auth/register" className="btn-yellow" style={{ padding: "9px 20px", fontSize: 14 }}>
            Get Started
          </Link>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section
        style={{
          position: "relative", minHeight: "100vh",
          display: "flex", alignItems: "center", justifyContent: "center",
          overflow: "hidden", padding: "120px 40px 80px",
        }}
      >
        {/* Radial glow blobs */}
        <div style={{ position: "absolute", width: 800, height: 800, borderRadius: "50%", background: "radial-gradient(circle, rgba(140,82,255,0.11) 0%, transparent 70%)", top: "5%", left: "50%", transform: "translateX(-50%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(81,112,255,0.09) 0%, transparent 70%)", top: "45%", right: "8%", pointerEvents: "none" }} />
        <div style={{ position: "absolute", width: 350, height: 350, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,222,89,0.05) 0%, transparent 70%)", bottom: "15%", left: "12%", pointerEvents: "none" }} />

        {/* Particles */}
        <ParticleCanvas />

        {/* Content */}
        <div style={{ textAlign: "center", maxWidth: 820, position: "relative", zIndex: 1 }}>
          <div
            style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              background: "rgba(140,82,255,0.12)",
              border: "1px solid rgba(140,82,255,0.28)",
              color: "#c4a0ff", borderRadius: 100, padding: "7px 16px",
              fontSize: 13, fontWeight: 500, letterSpacing: "0.02em",
              marginBottom: 32,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", color: "#c4a0ff" }}>{Ic.sparkle}</span>AI-Powered Study Companion
          </div>

          <h1
            style={{
              fontFamily: "'Shrikhand', cursive",
              fontSize: "clamp(52px, 9vw, 96px)",
              lineHeight: 1.03,
              letterSpacing: "-0.02em",
              marginBottom: 28,
              color: "#ede9ff",
            }}
          >
            Your AI Study{" "}
            <RotatingWord />
          </h1>

          <p
            style={{
              fontSize: "clamp(16px, 2.2vw, 20px)",
              lineHeight: 1.75,
              color: "rgba(237,233,255,0.58)",
              maxWidth: 580,
              margin: "0 auto 52px",
            }}
          >
            Upload your study material, chat with AI, get quizzes and flashcards, and
            plan your exam prep — all in one place.
          </p>

          <div className="hero-btns" style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/auth/register" className="btn-yellow">Start for Free →</Link>
            <a href="#how-it-works" className="btn-ghost">See How It Works</a>
          </div>

          <p style={{ marginTop: 20, fontSize: 13, color: "rgba(237,233,255,0.3)", letterSpacing: "0.02em" }}>
            No credit card · Free during beta · Invite your friends
          </p>

          {/* Stats */}
          <div
            className="stats-row"
            style={{
              display: "flex", gap: 64, justifyContent: "center",
              marginTop: 80, flexWrap: "wrap",
              borderTop: "1px solid rgba(140,82,255,0.12)",
              paddingTop: 40,
            }}
          >
            {[
              { val: "Free Beta", label: "Join now" },
              { val: "All-in-One", label: "Study platform" },
            ].map((s) => (
              <div key={s.label} style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontFamily: "'Shrikhand', cursive",
                    fontSize: 28, color: "#ede9ff", marginBottom: 4,
                  }}
                >
                  {s.val}
                </div>
                <div style={{ fontSize: 13, color: "rgba(237,233,255,0.35)", letterSpacing: "0.04em" }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section
        id="features"
        style={{
          padding: "120px 40px",
          borderTop: "1px solid rgba(140,82,255,0.1)",
        }}
      >
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 80 }}>
            <p className="slabel reveal" style={{ marginBottom: 14 }}>Features</p>
            <h2
              className="reveal d1"
              style={{
                fontFamily: "'Shrikhand', cursive",
                fontSize: "clamp(36px, 5vw, 60px)",
                letterSpacing: "-0.02em",
                marginBottom: 18, lineHeight: 1.05,
              }}
            >
              Everything to ace your studies
            </h2>
            <p
              className="reveal d2"
              style={{
                fontSize: 18, color: "rgba(237,233,255,0.5)",
                maxWidth: 500, margin: "0 auto", lineHeight: 1.75,
              }}
            >
              One app. Every tool you need. Powered by AI that understands your own material.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))",
              gap: 24,
            }}
          >
            {FEATURES.map((f) => (
              <div key={f.title} className={`fcard reveal d${f.delay}`}>
                <div style={{
                  width: 52, height: 52, borderRadius: 14, marginBottom: 18,
                  background: "rgba(140,82,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#b899ff",
                }}>{f.icon}</div>
                <h3
                  style={{
                    fontFamily: "'Shrikhand', cursive",
                    fontSize: 22, marginBottom: 10, color: "#ede9ff",
                  }}
                >
                  {f.title}
                </h3>
                <p style={{ fontSize: 15, color: "rgba(237,233,255,0.5)", lineHeight: 1.75 }}>
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section
        id="how-it-works"
        style={{
          padding: "120px 40px",
          background: "rgba(140,82,255,0.04)",
          borderTop: "1px solid rgba(140,82,255,0.1)",
          borderBottom: "1px solid rgba(140,82,255,0.1)",
        }}
      >
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 88 }}>
            <p className="slabel reveal" style={{ marginBottom: 14 }}>How It Works</p>
            <h2
              className="reveal d1"
              style={{
                fontFamily: "'Shrikhand', cursive",
                fontSize: "clamp(36px, 5vw, 60px)",
                letterSpacing: "-0.02em", lineHeight: 1.05,
              }}
            >
              Get started in minutes
            </h2>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 56,
            }}
          >
            {STEPS.map((step, i) => (
              <div key={step.n} className={`reveal d${i + 1}`} style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontFamily: "'Shrikhand', cursive",
                    fontSize: 80, lineHeight: 1,
                    background: "linear-gradient(135deg, #8c52ff, #5170ff)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                    opacity: 0.38,
                    marginBottom: 4,
                  }}
                >
                  {step.n}
                </div>
                <div style={{
                  width: 64, height: 64, borderRadius: 18, margin: "0 auto 18px",
                  background: "rgba(140,82,255,0.13)", display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#b899ff",
                }}>{step.icon}</div>
                <h3
                  style={{
                    fontFamily: "'Shrikhand', cursive",
                    fontSize: 24, marginBottom: 12, color: "#ede9ff",
                  }}
                >
                  {step.title}
                </h3>
                <p style={{ fontSize: 15, color: "rgba(237,233,255,0.5)", lineHeight: 1.78 }}>
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── COMMUNITY ── */}
      <section id="community" style={{ padding: "120px 40px" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <div
            className="community-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 80,
              alignItems: "center",
            }}
          >
            {/* Left */}
            <div>
              <p className="slabel reveal" style={{ marginBottom: 14 }}>Community</p>
              <h2
                className="reveal d1"
                style={{
                  fontFamily: "'Shrikhand', cursive",
                  fontSize: "clamp(32px, 4vw, 52px)",
                  letterSpacing: "-0.02em",
                  marginBottom: 22, lineHeight: 1.08,
                }}
              >
                Study together,<br />grow together
              </h2>
              <p
                className="reveal d2"
                style={{
                  fontSize: 16, color: "rgba(237,233,255,0.52)",
                  lineHeight: 1.82, marginBottom: 36,
                }}
              >
                Share notebooks with friends, create study groups, and discover community notebooks
                in the marketplace. See what your friends are crushing and get inspired.
              </p>
              <div className="reveal d3" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {[
                  { icon: Ic.phone, label: "Friends' study activity feed" },
                  { icon: Ic.share, label: "One-click notebook sharing" },
                  { icon: Ic.store, label: "Community notebook marketplace" },
                  { icon: Ic.group, label: "Collaborative study groups" },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      fontSize: 15, color: "rgba(237,233,255,0.72)",
                    }}
                  >
                    <span style={{ color: "#8c52ff", display: "flex" }}>{item.icon}</span>
                    {item.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Right - Mock activity card */}
            <div className="reveal d2">
              <div
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(140,82,255,0.2)",
                  borderRadius: 24, padding: 32,
                  position: "relative", overflow: "hidden",
                  boxShadow: "0 32px 80px rgba(0,0,0,0.4), inset 0 1px 0 rgba(140,82,255,0.1)",
                }}
              >
                <div
                  style={{
                    position: "absolute", width: 240, height: 240, borderRadius: "50%",
                    background: "radial-gradient(circle, rgba(140,82,255,0.12) 0%, transparent 70%)",
                    top: -80, right: -60, pointerEvents: "none",
                  }}
                />
                <p
                  style={{
                    fontFamily: "'Shrikhand', cursive",
                    fontSize: 15, color: "#a882ff", marginBottom: 24,
                    letterSpacing: "0.04em",
                  }}
                >
                  Friends Activity
                </p>
                {ACTIVITY.map((a) => (
                  <div
                    key={a.name}
                    style={{
                      display: "flex", gap: 12, alignItems: "flex-start",
                      padding: "14px 0",
                      borderBottom: "1px solid rgba(140,82,255,0.1)",
                    }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                      background: a.color, display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, fontWeight: 700, color: "#fff",
                    }}>{a.initials}</div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#ede9ff" }}>{a.name}</span>
                      <span style={{ fontSize: 14, color: "rgba(237,233,255,0.48)" }}> {a.action}</span>
                    </div>
                    <span style={{ fontSize: 12, color: "rgba(237,233,255,0.3)", whiteSpace: "nowrap" }}>
                      {a.time}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── GAMIFICATION ── */}
      <section
        style={{
          padding: "100px 40px",
          background: "linear-gradient(180deg, transparent, rgba(140,82,255,0.05), transparent)",
          borderTop: "1px solid rgba(140,82,255,0.08)",
          borderBottom: "1px solid rgba(140,82,255,0.08)",
        }}
      >
        <div style={{ maxWidth: 880, margin: "0 auto", textAlign: "center" }}>
          <div className="reveal" style={{ marginBottom: 24, display: "flex", justifyContent: "center" }}>{Ic.trophy}</div>
          <h2
            className="reveal d1"
            style={{
              fontFamily: "'Shrikhand', cursive",
              fontSize: "clamp(28px, 4vw, 48px)",
              letterSpacing: "-0.02em", marginBottom: 16,
            }}
          >
            Stay motivated. Earn rewards.
          </h2>
          <p
            className="reveal d2"
            style={{
              fontSize: 17, color: "rgba(237,233,255,0.52)",
              lineHeight: 1.78, maxWidth: 500, margin: "0 auto 48px",
            }}
          >
            Study streaks, trophies, XP levels, and a GitHub-style activity board keep you consistent.
            Like Duolingo, but for everything.
          </p>
          <div className="reveal d3" style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            {BADGES.map((b) => (
              <div
                key={b.label}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: "rgba(140,82,255,0.1)",
                  border: "1px solid rgba(140,82,255,0.22)",
                  borderRadius: 100, padding: "11px 22px",
                  fontSize: 14, color: "rgba(237,233,255,0.78)",
                  transition: "background 0.2s ease, border-color 0.2s ease",
                }}
              >
                <span style={{ color: "#8c52ff", display: "flex" }}>{b.icon}</span>
                {b.label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section
        style={{
          padding: "140px 40px",
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute", width: 700, height: 700, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(140,82,255,0.09) 0%, transparent 70%)",
            top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            pointerEvents: "none",
          }}
        />
        <div style={{ position: "relative", zIndex: 1, maxWidth: 680, margin: "0 auto" }}>
          <div className="reveal" style={{ marginBottom: 28, display: "flex", justifyContent: "center" }}>{Ic.hat}</div>
          <h2
            className="reveal d1"
            style={{
              fontFamily: "'Shrikhand', cursive",
              fontSize: "clamp(38px, 6vw, 72px)",
              letterSpacing: "-0.02em",
              marginBottom: 22, lineHeight: 1.04,
            }}
          >
            Ready to become a top student?
          </h2>
          <p
            className="reveal d2"
            style={{
              fontSize: 18, color: "rgba(237,233,255,0.52)",
              lineHeight: 1.78, marginBottom: 52,
            }}
          >
            Join the beta for free. We&apos;re testing with real students — your feedback shapes the product.
          </p>
          <div className="reveal d3">
            <Link href="/auth/register" className="btn-yellow" style={{ fontSize: 18, padding: "18px 52px" }}>
              Start Studying for Free →
            </Link>
          </div>
          <p
            className="reveal d4"
            style={{ marginTop: 22, fontSize: 13, color: "rgba(237,233,255,0.28)", letterSpacing: "0.02em" }}
          >
            No credit card · Invite your friends · Free forever for beta testers
          </p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer
        style={{
          padding: "40px 48px",
          borderTop: "1px solid rgba(140,82,255,0.1)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 20,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo_trimmed.png" alt="Quizzard" style={{ height: "32px", width: "auto", opacity: 0.75 }} />
        <p style={{ fontSize: 13, color: "rgba(237,233,255,0.28)" }}>
          © 2026 Quizzard — Built for students, by students.
        </p>
        <div style={{ display: "flex", gap: 24 }}>
          <Link href="/auth/login" className="nlink" style={{ fontSize: 14 }}>Log In</Link>
          <Link href="/auth/register" className="nlink" style={{ fontSize: 14 }}>Sign Up</Link>
        </div>
      </footer>
    </main>
  );
}
