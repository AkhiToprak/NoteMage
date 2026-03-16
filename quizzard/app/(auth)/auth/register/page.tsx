"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to create account");
        return;
      }

      router.push("/auth/login?registered=true");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ textAlign: "center", marginBottom: 32 }}>
      <h1 style={{ fontFamily: "'Shrikhand', cursive", fontSize: 32, marginBottom: 8, color: "#ede9ff" }}>
        Join Quizzard
      </h1>
      <p style={{ color: "rgba(237,233,255,0.52)", fontSize: 14 }}>
        Create your account and start studying smarter
      </p>

      <form onSubmit={handleSubmit} style={{ marginTop: 32 }}>
        {error && (
          <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5", fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 20, textAlign: "left" }}>
          <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 600, color: "#ede9ff" }}>Name</label>
          <input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
            style={{ width: "100%", padding: "12px 16px", background: "rgba(140,82,255,0.08)", border: "1px solid rgba(140,82,255,0.3)", borderRadius: 12, color: "#ede9ff", fontSize: 14, fontFamily: "'Gliker', 'DM Sans', sans-serif", boxSizing: "border-box" }}
          />
        </div>

        <div style={{ marginBottom: 20, textAlign: "left" }}>
          <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 600, color: "#ede9ff" }}>Email</label>
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
            style={{ width: "100%", padding: "12px 16px", background: "rgba(140,82,255,0.08)", border: "1px solid rgba(140,82,255,0.3)", borderRadius: 12, color: "#ede9ff", fontSize: 14, fontFamily: "'Gliker', 'DM Sans', sans-serif", boxSizing: "border-box" }}
          />
        </div>

        <div style={{ marginBottom: 20, textAlign: "left" }}>
          <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 600, color: "#ede9ff" }}>Password</label>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
            style={{ width: "100%", padding: "12px 16px", background: "rgba(140,82,255,0.08)", border: "1px solid rgba(140,82,255,0.3)", borderRadius: 12, color: "#ede9ff", fontSize: 14, fontFamily: "'Gliker', 'DM Sans', sans-serif", boxSizing: "border-box" }}
          />
          <div style={{ fontSize: 12, color: "rgba(237,233,255,0.35)", marginTop: 6, textAlign: "left" }}>At least 8 characters</div>
        </div>

        <div style={{ marginBottom: 20, textAlign: "left" }}>
          <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 600, color: "#ede9ff" }}>Confirm Password</label>
          <input
            type="password"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            disabled={loading}
            style={{ width: "100%", padding: "12px 16px", background: "rgba(140,82,255,0.08)", border: "1px solid rgba(140,82,255,0.3)", borderRadius: 12, color: "#ede9ff", fontSize: 14, fontFamily: "'Gliker', 'DM Sans', sans-serif", boxSizing: "border-box" }}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{ width: "100%", padding: "12px 16px", background: "linear-gradient(135deg, #8c52ff, #5170ff)", border: "none", borderRadius: 12, color: "#fff", fontSize: 16, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontFamily: "'Gliker', 'DM Sans', sans-serif", boxShadow: "0 4px 20px rgba(140,82,255,0.28)", opacity: loading ? 0.6 : 1 }}
        >
          {loading ? "Creating account..." : "Create Account"}
        </button>
      </form>

      <p style={{ marginTop: 24, fontSize: 14, color: "rgba(237,233,255,0.62)" }}>
        Already have an account?{" "}
        <Link href="/auth/login" style={{ color: "#8c52ff", textDecoration: "none" }}>
          Sign in
        </Link>
      </p>
    </div>
  );
}
