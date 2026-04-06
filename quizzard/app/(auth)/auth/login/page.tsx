"use client";

import { signIn } from "next-auth/react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        if (result.error.includes("ACCOUNT_LOCKED:")) {
          const unlockAt = new Date(result.error.split("ACCOUNT_LOCKED:")[1]);
          const timeStr = unlockAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          setError(`Your account has been locked due to too many failed login attempts. It will be unlocked at ${timeStr}.`);
        } else {
          setError("Invalid email or password");
        }
      } else if (result?.ok) {
        router.push("/home");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "16px 16px 16px 44px",
    background: "#23233c",
    border: "none",
    borderRadius: "16px",
    color: "#e5e3ff",
    fontSize: "15px",
    fontFamily: "inherit",
    fontWeight: 600,
    outline: "none",
    boxSizing: "border-box",
    transition: "box-shadow 0.2s cubic-bezier(0.22,1,0.36,1)",
  };

  return (
    <>
      {/* Logo + heading */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "40px" }}>
        <div style={{ position: "relative", marginBottom: "24px" }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(174,137,255,0.2)",
              filter: "blur(24px)",
              borderRadius: "50%",
            }}
          />
          <Image
            src="/logo_trimmed.png"
            alt="Quizzard"
            width={96}
            height={96}
            style={{ objectFit: "contain", position: "relative" }}
            priority
          />
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-brand)',
            fontSize: "48px",
            fontWeight: 400,
            color: "#ae89ff",
            margin: "0 0 8px",
            letterSpacing: "-0.02em",
          }}
        >
          Welcome back
        </h1>
        <p style={{ color: "#aaa8c8", fontSize: "17px", margin: 0 }}>
          Continue your quest for knowledge.
        </p>
      </div>

      {/* Card */}
      <div
        style={{
          background: "#121222",
          borderRadius: "32px",
          padding: "40px",
          boxShadow: "0 32px 64px -12px rgba(0,0,0,0.5)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Top gradient line */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "1px",
            background:
              "linear-gradient(90deg, transparent 0%, rgba(174,137,255,0.4) 50%, transparent 100%)",
          }}
        />

        {error && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "12px",
              background: "rgba(253,111,133,0.12)",
              color: "#fd6f85",
              fontSize: "14px",
              marginBottom: "24px",
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Email */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 700,
                color: "#b9c3ff",
                marginBottom: "8px",
                paddingLeft: "4px",
              }}
            >
              Email Address
            </label>
            <div style={{ position: "relative" }}>
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  paddingLeft: "14px",
                  display: "flex",
                  alignItems: "center",
                  pointerEvents: "none",
                  color: "#737390",
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>
                  mail
                </span>
              </div>
              <input
                type="email"
                placeholder="scholar@quizzard.ai"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                style={inputStyle}
                onFocus={(e) => { e.target.style.boxShadow = "0 0 0 2px rgba(174,137,255,0.4)"; }}
                onBlur={(e) => { e.target.style.boxShadow = "none"; }}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 700,
                color: "#b9c3ff",
                marginBottom: "8px",
                paddingLeft: "4px",
              }}
            >
              Password
            </label>
            <div style={{ position: "relative" }}>
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  paddingLeft: "14px",
                  display: "flex",
                  alignItems: "center",
                  pointerEvents: "none",
                  color: "#737390",
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>
                  lock
                </span>
              </div>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                style={{ ...inputStyle, paddingRight: "48px" }}
                onFocus={(e) => { e.target.style.boxShadow = "0 0 0 2px rgba(174,137,255,0.4)"; }}
                onBlur={(e) => { e.target.style.boxShadow = "none"; }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                style={{
                  position: "absolute",
                  right: 0,
                  top: 0,
                  bottom: 0,
                  paddingRight: "14px",
                  display: "flex",
                  alignItems: "center",
                  background: "transparent",
                  border: "none",
                  color: "#737390",
                  cursor: "pointer",
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>
                  {showPassword ? "visibility_off" : "visibility"}
                </span>
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "10px" }}>
              <a
                href="#"
                style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "#c1a4ff",
                  textDecoration: "none",
                  transition: "color 0.15s",
                }}
              >
                Forgot Password?
              </a>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "16px",
              background: loading
                ? "#464560"
                : "linear-gradient(135deg, #ae89ff 0%, #884efb 100%)",
              border: "none",
              borderRadius: "16px",
              color: loading ? "#aaa8c8" : "#2a0066",
              fontSize: "17px",
              fontWeight: 800,
              cursor: loading ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              boxShadow: loading ? "none" : "0 8px 24px rgba(174,137,255,0.25)",
              transition: "transform 0.2s cubic-bezier(0.22,1,0.36,1), box-shadow 0.2s cubic-bezier(0.22,1,0.36,1)",
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.02)";
                (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 12px 32px rgba(174,137,255,0.35)";
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
                (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 8px 24px rgba(174,137,255,0.25)";
              }
            }}
            onMouseDown={(e) => {
              if (!loading) (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.98)";
            }}
            onMouseUp={(e) => {
              if (!loading) (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.02)";
            }}
          >
            {loading ? "Signing in…" : "Log In"}
            {!loading && (
              <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>
                auto_awesome
              </span>
            )}
          </button>
        </form>

        {/* Divider */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            margin: "32px 0",
          }}
        >
          <div style={{ height: "1px", flex: 1, background: "rgba(70,69,96,0.2)" }} />
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "#737390",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            Or continue with
          </span>
          <div style={{ height: "1px", flex: 1, background: "rgba(70,69,96,0.2)" }} />
        </div>

        {/* OAuth buttons */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "8px" }}>
          {[
            {
              label: "Google",
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              ),
            },
            {
              label: "Apple",
              icon: (
                <span className="material-symbols-outlined" style={{ fontSize: "20px", color: "#e5e3ff" }}>
                  brand_family
                </span>
              ),
            },
          ].map(({ label, icon }) => (
            <button
              key={label}
              type="button"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                padding: "12px 16px",
                background: "#1d1d33",
                borderRadius: "12px",
                border: "none",
                color: "#e5e3ff",
                fontSize: "14px",
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "background 0.2s cubic-bezier(0.22,1,0.36,1)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "#23233c";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "#1d1d33";
              }}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Waitlist link */}
      <p
        style={{
          marginTop: "32px",
          textAlign: "center",
          color: "#aaa8c8",
          fontSize: "15px",
        }}
      >
        Don&apos;t have an account?{" "}
        <Link
          href="/"
          style={{ color: "#ffde59", fontWeight: 900, textDecoration: "none" }}
        >
          Join the Waitlist
        </Link>
      </p>

      {/* Footer */}
      <div
        style={{
          marginTop: "48px",
          display: "flex",
          justifyContent: "center",
          gap: "32px",
        }}
      >
        {["Privacy Policy", "Terms of Service", "Help Center"].map((item) => (
          <a
            key={item}
            href="#"
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "rgba(115,115,144,0.4)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              textDecoration: "none",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.color = "#737390";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.color = "rgba(115,115,144,0.4)";
            }}
          >
            {item}
          </a>
        ))}
      </div>
    </>
  );
}
