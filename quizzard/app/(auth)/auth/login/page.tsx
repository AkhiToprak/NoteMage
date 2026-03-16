"use client";

import { signIn } from "next-auth/react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
        setError("Invalid email or password");
      } else if (result?.ok) {
        router.push("/dashboard");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ textAlign: "center", marginBottom: 32 }}>
      <h1 style={{ fontFamily: "'Shrikhand', cursive", fontSize: 32, marginBottom: 8, color: "#ede9ff" }}>
        Welcome Back
      </h1>
      <p style={{ color: "rgba(237,233,255,0.52)", fontSize: 14 }}>
        Sign in to your account to continue
      </p>

      <form onSubmit={handleSubmit} style={{ marginTop: 32 }}>
        {error && (
          <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5", fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

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
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{ width: "100%", padding: "12px 16px", background: "linear-gradient(135deg, #8c52ff, #5170ff)", border: "none", borderRadius: 12, color: "#fff", fontSize: 16, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontFamily: "'Gliker', 'DM Sans', sans-serif", boxShadow: "0 4px 20px rgba(140,82,255,0.28)", opacity: loading ? 0.6 : 1 }}
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <p style={{ marginTop: 24, fontSize: 14, color: "rgba(237,233,255,0.62)" }}>
        Don't have an account?{" "}
        <Link href="/auth/register" style={{ color: "#8c52ff", textDecoration: "none" }}>
          Create one
        </Link>
      </p>
    </div>
  );
}
