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
// DATA
// =====================================================================
const FEATURES = [
  {
    icon: "🧠",
    title: "AI Tutor",
    desc: "Chat with Claude AI about your uploaded documents. Get instant explanations, summaries, and answers 24/7 — always based on your own material.",
    delay: 1,
  },
  {
    icon: "📓",
    title: "Smart Notebooks",
    desc: "Organize everything by subject. Upload PDFs, lecture notes, slides, and more into clean, searchable notebooks with subfolders.",
    delay: 2,
  },
  {
    icon: "🃏",
    title: "Quizzes & Flashcards",
    desc: "AI generates multiple-choice quizzes and spaced-repetition flashcards from your material. Active recall proven to boost retention.",
    delay: 3,
  },
  {
    icon: "📅",
    title: "Exam Planner",
    desc: "Add your exam dates and Quizzard builds a personalized study schedule. Daily reminders take the stress out of planning.",
    delay: 1,
  },
  {
    icon: "🎯",
    title: "YouTube & Articles",
    desc: "Find relevant YouTube videos and articles for any topic. Quizzard analyzes them and adds context directly to your notebook.",
    delay: 2,
  },
  {
    icon: "👥",
    title: "Study Together",
    desc: "Share notebooks with friends, create study groups, and browse the community notebook marketplace. Learn better, together.",
    delay: 3,
  },
];

const STEPS = [
  {
    n: "01",
    icon: "📓",
    title: "Create a Notebook",
    desc: "Set up a notebook for each subject. Give it a name, add a description, and organize it with subfolders.",
  },
  {
    n: "02",
    icon: "📤",
    title: "Upload Your Material",
    desc: "Drop in PDFs, lecture notes, slides, or links to YouTube videos and articles. Everything in one place.",
  },
  {
    n: "03",
    icon: "✨",
    title: "Study with AI",
    desc: "Chat with your tutor, get quizzes, make flashcards, and let Quizzard plan your path to exam day.",
  },
];

const ACTIVITY = [
  { name: "Alex", action: "studied Organic Chemistry for 2 hours", time: "Just now", avatar: "🧑" },
  { name: "Maria", action: "created 24 flashcards for Calculus", time: "5m ago", avatar: "👩" },
  { name: "Jonas", action: "scored 96% on History quiz", time: "1h ago", avatar: "🧑‍💼" },
];

const BADGES = ["🔥 Study Streaks", "🏅 Achievements", "📊 Activity Board", "⚡ Daily Goals"];

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
        @import url('https://fonts.googleapis.com/css2?family=Shrikhand&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body { font-family: 'DM Sans', sans-serif; background: #09081a; }

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
          font-family: 'DM Sans', sans-serif; font-weight: 700; font-size: 16px;
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
          font-family: 'DM Sans', sans-serif; font-weight: 500; font-size: 16px;
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

      {/* ── NAVBAR ── */}
      <nav
        style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
          padding: "0 40px", height: 64,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: scrolled ? "rgba(9,8,26,0.88)" : "transparent",
          backdropFilter: scrolled ? "blur(24px)" : "none",
          borderBottom: scrolled ? "1px solid rgba(140,82,255,0.12)" : "1px solid transparent",
          transition: "background 0.35s ease, backdrop-filter 0.35s ease, border-color 0.35s ease",
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Image src="/quizzard_logo.png" alt="Quizzard" width={130} height={36} style={{ objectFit: "contain" }} />
        </div>

        {/* Nav links */}
        <div className="nav-links" style={{ display: "flex", gap: 36 }}>
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
            <span>✨</span>AI-Powered Study Companion
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
            Upload your study material, chat with Claude AI, get quizzes and flashcards, and
            plan your exam prep — all in one place. Like NotebookLM, but{" "}
            <em style={{ color: "rgba(237,233,255,0.8)", fontStyle: "italic" }}>actually good</em>.
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
              { val: "Claude AI", label: "Powered by" },
              { val: "14 Phases", label: "Roadmap" },
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
                <div style={{ fontSize: 38, marginBottom: 18 }}>{f.icon}</div>
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
                <div style={{ fontSize: 52, margin: "0 0 18px" }}>{step.icon}</div>
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
                  "📱 Friends' study activity feed",
                  "📚 One-click notebook sharing",
                  "🛒 Community notebook marketplace",
                  "👥 Collaborative study groups",
                ].map((item) => (
                  <div
                    key={item}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      fontSize: 15, color: "rgba(237,233,255,0.72)",
                    }}
                  >
                    {item}
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
                    <span style={{ fontSize: 26 }}>{a.avatar}</span>
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
          <div className="reveal" style={{ fontSize: 56, marginBottom: 24 }}>🏆</div>
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
                key={b}
                style={{
                  background: "rgba(140,82,255,0.1)",
                  border: "1px solid rgba(140,82,255,0.22)",
                  borderRadius: 100, padding: "11px 22px",
                  fontSize: 14, color: "rgba(237,233,255,0.78)",
                  transition: "background 0.2s ease, border-color 0.2s ease",
                }}
              >
                {b}
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
          <div className="reveal" style={{ fontSize: 68, marginBottom: 28 }}>🎩</div>
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
              Start Studying for Free ✨
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
        <Image src="/quizzard_logo.png" alt="Quizzard" width={110} height={30} style={{ objectFit: "contain", opacity: 0.8 }} />
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
