"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Component as MagicCursor } from "@/components/ui/magic-cursor";

// =====================================================================
// PARTICLE CANVAS
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
// SVG ICONS
// =====================================================================
const Ic = {
  sparkle: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/>
      <path d="M19 3l.75 2.25L22 6l-2.25.75L19 9l-.75-2.25L16 6l2.25-.75z"/>
    </svg>
  ),
  book: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>
  ),
  upload: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  ),
  brain: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/>
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/>
    </svg>
  ),
  check: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
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
  share: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
    </svg>
  ),
  arrow: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/>
      <polyline points="12 5 19 12 12 19"/>
    </svg>
  ),
};

// =====================================================================
// PRODUCT FRAME
// =====================================================================
function ProductFrame({ placeholder, alt }: { placeholder: string; alt: string }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(140,82,255,0.2)",
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "0 32px 80px rgba(140,82,255,0.08), 0 8px 32px rgba(0,0,0,0.4)",
        position: "relative",
      }}
    >
      {/* Browser dots */}
      <div
        style={{
          padding: "12px 16px",
          display: "flex",
          gap: 6,
          background: "rgba(140,82,255,0.06)",
          borderBottom: "1px solid rgba(140,82,255,0.1)",
        }}
      >
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "rgba(255,95,87,0.7)" }} />
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "rgba(255,189,46,0.7)" }} />
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "rgba(39,201,63,0.7)" }} />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={placeholder}
        alt={alt}
        style={{ width: "100%", height: "auto", display: "block" }}
      />
    </div>
  );
}

// =====================================================================
// PAS SECTION COMPONENT
// =====================================================================
function PASSection({
  label,
  problemHeadline,
  agitateLines,
  solveHeadline,
  solveBullets,
  ctaText,
  screenshotPlaceholder,
  screenshotAlt,
  reverse,
  id,
}: {
  label: string;
  problemHeadline: string;
  agitateLines: string[];
  solveHeadline: string;
  solveBullets: { bold: string; rest: string }[];
  ctaText: string;
  screenshotPlaceholder: string;
  screenshotAlt: string;
  reverse?: boolean;
  id?: string;
}) {
  return (
    <section
      id={id}
      style={{
        padding: "100px 40px",
        borderTop: "1px solid rgba(140,82,255,0.08)",
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        {/* Problem + Agitate (centered) */}
        <div style={{ textAlign: "center", marginBottom: 72, maxWidth: 720, margin: "0 auto 72px" }}>
          <p className="slabel reveal" style={{ marginBottom: 14 }}>{label}</p>
          <h2
            className="reveal d1"
            style={{
              fontFamily: "'Shrikhand', cursive",
              fontSize: "clamp(30px, 4.5vw, 52px)",
              letterSpacing: "-0.02em",
              lineHeight: 1.08,
              marginBottom: 24,
              color: "#ede9ff",
            }}
          >
            {problemHeadline}
          </h2>
          <div className="reveal d2">
            {agitateLines.map((line, i) => (
              <p
                key={i}
                style={{
                  fontSize: "clamp(15px, 2vw, 17px)",
                  color: "rgba(237,233,255,0.52)",
                  lineHeight: 1.78,
                  marginBottom: 8,
                }}
                dangerouslySetInnerHTML={{ __html: line }}
              />
            ))}
          </div>
        </div>

        {/* Solve (two-column) */}
        <div
          className="pas-grid reveal d3"
          style={{
            display: "grid",
            gridTemplateColumns: "0.8fr 1.5fr",
            gap: 64,
            alignItems: "center",
            direction: reverse ? "rtl" : "ltr",
          }}
        >
          {/* Text side */}
          <div style={{ direction: "ltr" }}>
            <h3
              style={{
                fontFamily: "'Shrikhand', cursive",
                fontSize: "clamp(24px, 3vw, 36px)",
                letterSpacing: "-0.01em",
                marginBottom: 28,
                color: "#ede9ff",
                lineHeight: 1.15,
              }}
            >
              {solveHeadline}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {solveBullets.map((b) => (
                <div key={b.bold} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span style={{ color: "#8c52ff", display: "flex", flexShrink: 0, marginTop: 2 }}>{Ic.check}</span>
                  <p style={{ fontSize: 16, color: "rgba(237,233,255,0.72)", lineHeight: 1.65 }}>
                    <strong style={{ color: "#ede9ff" }}>{b.bold}</strong> {b.rest}
                  </p>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 36 }}>
              <Link href="/auth/register" className="btn-yellow">
                {ctaText} <span style={{ display: "flex" }}>{Ic.arrow}</span>
              </Link>
            </div>
          </div>

          {/* Screenshot side */}
          <div style={{ direction: "ltr" }}>
            <ProductFrame placeholder={screenshotPlaceholder} alt={screenshotAlt} />
          </div>
        </div>
      </div>
    </section>
  );
}

// =====================================================================
// DATA
// =====================================================================
const STEPS = [
  {
    n: "01",
    icon: Ic.book,
    title: "Create a Notebook",
    desc: "Set up a notebook for each subject. Name it, organize with subfolders.",
  },
  {
    n: "02",
    icon: Ic.upload,
    title: "Upload Your Material",
    desc: "Drop in PDFs, notes, slides, or YouTube links. Everything in one place.",
  },
  {
    n: "03",
    icon: Ic.brain,
    title: "Study with AI",
    desc: "Chat, get quizzes, make flashcards, and plan your path to exam day.",
  },
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
      <MagicCursor colors={["174 137 255", "185 195 255", "255 222 89"]} />
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
        .btn-yellow:focus-visible {
          outline: 2px solid #ffde59;
          outline-offset: 3px;
        }

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
        .btn-ghost:focus-visible {
          outline: 2px solid #8c52ff;
          outline-offset: 3px;
        }

        /* ── Nav link ── */
        .nlink {
          color: rgba(237,233,255,0.62); font-size: 15px; font-weight: 500;
          text-decoration: none;
          transition: color 0.2s ease;
        }
        .nlink:hover { color: #ede9ff; }

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
          .hero-grid { grid-template-columns: 1fr !important; }
          .hero-btns { flex-direction: column; align-items: center; }
          .nav-links { display: none !important; }
          .nav-auth { gap: 8px !important; }
          .pas-grid { grid-template-columns: 1fr !important; direction: ltr !important; }
          .steps-grid { grid-template-columns: 1fr !important; gap: 48px !important; }
        }
      `}</style>

      {/* Grain */}
      <div className="grain" />

      {/* ── NAVBAR ── */}
      <nav
        style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
          padding: "0 40px", height: 64,
          display: "flex", alignItems: "center",
          background: scrolled ? "rgba(9,8,26,0.88)" : "transparent",
          backdropFilter: scrolled ? "blur(24px)" : "none",
          borderBottom: scrolled ? "1px solid rgba(140,82,255,0.12)" : "1px solid transparent",
          transition: "background 0.35s ease, backdrop-filter 0.35s ease, border-color 0.35s ease",
        }}
      >
        <div style={{ maxWidth: 1200, width: "100%", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {/* Logo */}
          <Link href="/" style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo_trimmed.png" alt="Quizzard" style={{ height: 40, width: "auto", display: "block" }} />
          </Link>

          {/* Right side: links + auth */}
          <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
            <div className="nav-links" style={{ display: "flex", gap: 36 }}>
              <Link href="/pricing" className="nlink">Pricing</Link>
              <a href="#how-it-works" className="nlink">How It Works</a>
            </div>
            <div className="nav-auth" style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <Link href="/auth/login" className="nlink">Log in</Link>
              <Link href="/auth/register" className="btn-yellow" style={{ padding: "9px 20px", fontSize: 14 }}>
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section
        style={{
          position: "relative", minHeight: "100vh",
          display: "flex", alignItems: "center",
          overflow: "hidden", padding: "120px 40px 80px",
        }}
      >
        {/* Radial glow blobs */}
        <div style={{ position: "absolute", width: 800, height: 800, borderRadius: "50%", background: "radial-gradient(circle, rgba(140,82,255,0.11) 0%, transparent 70%)", top: "5%", left: "50%", transform: "translateX(-50%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(81,112,255,0.09) 0%, transparent 70%)", top: "45%", right: "8%", pointerEvents: "none" }} />
        <div style={{ position: "absolute", width: 350, height: 350, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,222,89,0.05) 0%, transparent 70%)", bottom: "15%", left: "12%", pointerEvents: "none" }} />

        <ParticleCanvas />

        {/* Two-column hero */}
        <div
          className="hero-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "0.8fr 1.4fr",
            gap: 64,
            alignItems: "center",
            maxWidth: 1360,
            margin: "0 auto",
            position: "relative",
            zIndex: 1,
            width: "100%",
          }}
        >
          {/* Left - Copy */}
          <div>
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
              <span style={{ display: "flex", alignItems: "center", color: "#c4a0ff" }}>{Ic.sparkle}</span>
              AI-Powered Study Platform
            </div>

            <h1
              style={{
                fontFamily: "'Shrikhand', cursive",
                fontSize: "clamp(42px, 7vw, 80px)",
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
                marginBottom: 24,
                color: "#ede9ff",
              }}
            >
              Ace Every Exam<br />
              <span style={{ color: "#ffde59", textShadow: "0 0 40px rgba(255,222,89,0.3)" }}>
                Without the All-Nighters
              </span>
            </h1>

            <p
              style={{
                fontSize: "clamp(16px, 2vw, 19px)",
                lineHeight: 1.72,
                color: "rgba(237,233,255,0.58)",
                maxWidth: 480,
                marginBottom: 40,
              }}
            >
              Upload your notes. Quizzard turns them into quizzes, flashcards,
              and a study plan that actually works.
            </p>

            <div className="hero-btns" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <Link href="/auth/register" className="btn-yellow">
                Start Studying Free <span style={{ display: "flex" }}>{Ic.arrow}</span>
              </Link>
              <a href="#how-it-works" className="btn-ghost">See How It Works</a>
            </div>
          </div>

          {/* Right - Product visual */}
          <div className="reveal d2">
            <ProductFrame
              placeholder="/screenshots/dashboard.png"
              alt="Quizzard dashboard preview"
            />
          </div>
        </div>
      </section>

      {/* ── PAS BLOCK 1: Organization ── */}
      <PASSection
        label="THE PROBLEM"
        problemHeadline="Your Notes Are Everywhere. Your Grades Show It."
        agitateLines={[
          "Lecture slides in Drive. Notes in three apps. Highlights on paper.",
          "You spend more time <strong style='color:#ede9ff'>finding</strong> what to study than actually studying.",
          "And when the exam is in 3 days, you panic-cram a 200-page PDF with no plan.",
        ]}
        solveHeadline="One Place for Everything"
        solveBullets={[
          { bold: "Upload anything", rest: "— PDFs, slides, notes, YouTube links" },
          { bold: "Organized by subject", rest: "— Notebooks with subfolders, always searchable" },
          { bold: "AI reads your material", rest: "— Answers from YOUR notes, not generic responses" },
        ]}
        ctaText="Try It Free"
        screenshotPlaceholder="/screenshots/notebook-detail.png"
        screenshotAlt="Quizzard notebook view"
      />

      {/* ── PAS BLOCK 2: Study Method ── */}
      <PASSection
        label="SOUND FAMILIAR?"
        problemHeadline="Re-reading Your Notes Doesn't Work. Science Says So."
        agitateLines={[
          "You highlight everything. Re-read the same page 4 times. <em>Feel</em> productive.",
          "Then the exam hits and you can't recall a thing.",
          "<strong style='color:#ede9ff'>Active recall is proven to 2x retention.</strong> But making your own flashcards takes forever.",
        ]}
        solveHeadline="AI Builds Your Study Tools in Seconds"
        solveBullets={[
          { bold: "Auto-generated quizzes", rest: "— Multiple choice from your own material" },
          { bold: "Smart flashcards", rest: "— Spaced repetition that adapts to you" },
          { bold: "Instant explanations", rest: "— Ask the AI tutor anything about your uploads" },
        ]}
        ctaText="Generate Your First Quiz"
        screenshotPlaceholder="/screenshots/ai-chat.png"
        screenshotAlt="Quizzard quiz interface"
        reverse
      />

      {/* ── PAS BLOCK 3: Planning ── */}
      <PASSection
        label="THE REAL KILLER"
        problemHeadline="You Know You Should Start. You Just Don't Know Where."
        agitateLines={[
          "No plan. No schedule. No accountability.",
          "So you open Netflix &quot;just for one episode&quot; and it's 2 AM the night before.",
        ]}
        solveHeadline="Your Personal Exam Countdown"
        solveBullets={[
          { bold: "Add your exam dates", rest: "— Quizzard builds a day-by-day plan" },
          { bold: "Daily goals", rest: "— Know exactly what to cover today" },
          { bold: "Stay motivated", rest: "— Streaks, achievements, and progress tracking" },
        ]}
        ctaText="Plan Your Next Exam"
        screenshotPlaceholder="/screenshots/notebooks.png"
        screenshotAlt="Quizzard exam planner"
      />

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
            className="steps-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
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

          <div className="reveal d4" style={{ textAlign: "center", marginTop: 64 }}>
            <Link href="/auth/register" className="btn-yellow">
              Get Started in 2 Minutes <span style={{ display: "flex" }}>{Ic.arrow}</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ── PAS BLOCK 4: Community ── */}
      <PASSection
        id="community"
        label="YOU'RE NOT ALONE"
        problemHeadline="Studying Alone Sucks. It Doesn't Have To."
        agitateLines={[
          "You're stuck on a concept at midnight. No one to ask. No one to keep you accountable.",
          "Solo studying feels isolating — and isolation kills motivation.",
        ]}
        solveHeadline="Study With Friends. Learn From Everyone."
        solveBullets={[
          { bold: "Add friends", rest: "— See what your friends are studying and stay motivated together" },
          { bold: "Share notebooks", rest: "— One click to share your best notes with your crew" },
          { bold: "Study groups", rest: "— Create or join groups for any subject" },
          { bold: "Community marketplace", rest: "— Browse and use notebooks from other students" },
        ]}
        ctaText="Join the Community"
        screenshotPlaceholder="/screenshots/community.png"
        screenshotAlt="Quizzard community page"
        reverse
      />

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
          <h2
            className="reveal"
            style={{
              fontFamily: "'Shrikhand', cursive",
              fontSize: "clamp(38px, 6vw, 72px)",
              letterSpacing: "-0.02em",
              marginBottom: 22, lineHeight: 1.04,
            }}
          >
            Your Next Exam Doesn&apos;t Have to Be{" "}
            <span style={{ color: "#ffde59", textShadow: "0 0 40px rgba(255,222,89,0.3)" }}>Stressful</span>
          </h2>
          <p
            className="reveal d1"
            style={{
              fontSize: 18, color: "rgba(237,233,255,0.52)",
              lineHeight: 1.78, marginBottom: 48,
            }}
          >
            Quizzard is free. Real students are already using it to study smarter.
          </p>
          <div className="reveal d2">
            <Link href="/auth/register" className="btn-yellow" style={{ fontSize: 18, padding: "18px 52px" }}>
              Start Studying Free <span style={{ display: "flex" }}>{Ic.arrow}</span>
            </Link>
          </div>
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
