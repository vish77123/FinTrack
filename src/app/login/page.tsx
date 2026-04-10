"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { signInWithEmail, signUpWithEmail, resetPassword } from "./actions";
import styles from "./login.module.css";

type AuthPage = "login" | "signup" | "forgot";

export default function LoginPage() {
  const [activePage, setActivePage] = useState<AuthPage>("login");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const switchPage = (page: AuthPage) => {
    setActivePage(page);
    setError(null);
    setSuccess(null);
  };

  const handleSignIn = async (formData: FormData) => {
    setLoading(true);
    setError(null);
    const result = await signInWithEmail(formData);
    if (result?.error) {
      setError(result.error);
    }
    setLoading(false);
  };

  const handleSignUp = async (formData: FormData) => {
    setLoading(true);
    setError(null);
    const result = await signUpWithEmail(formData);
    if (result?.error) {
      setError(result.error);
    }
    setLoading(false);
  };

  const handleResetPassword = async (formData: FormData) => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    const result = await resetPassword(formData);
    if (result?.error) {
      setError(result.error);
    }
    if (result?.success) {
      setSuccess(result.success);
    }
    setLoading(false);
  };

  const handleGoogleSignIn = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: "https://www.googleapis.com/auth/gmail.readonly",
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });
  };

  return (
    <div className={styles.authLayout}>
      {/* Left Brand Panel */}
      <div className={styles.authBrand}>
        <div className={styles.brandContent}>
          <div className={styles.brandLogo}>M</div>
          <h1>Money Manager</h1>
          <p>
            Take control of your finances with smart tracking, budgets, and
            automated bank SMS parsing — all in one beautiful app.
          </p>
          <div className={styles.featurePills}>
            <span className={styles.featurePill}>📊 Smart Budgets</span>
            <span className={styles.featurePill}>📱 SMS Auto-Parse</span>
            <span className={styles.featurePill}>📧 Gmail Sync</span>
            <span className={styles.featurePill}>🔒 Bank-Level Security</span>
            <span className={styles.featurePill}>☁️ Cloud Synced</span>
          </div>
          <div className={styles.brandStats}>
            <div className={styles.brandStat}>
              <div className="num">100%</div>
              <div className="label">Free forever</div>
            </div>
            <div className={styles.brandStat}>
              <div className="num">₹0</div>
              <div className="label">Hidden charges</div>
            </div>
            <div className={styles.brandStat}>
              <div className="num">🔒</div>
              <div className="label">Privacy first</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Form Panel */}
      <div className={styles.authFormPanel}>
        <div className={styles.authFormContainer}>
          <div className={styles.authTabs}>
            <button
              className={`${styles.authTab} ${activePage === "login" ? styles.active : ""}`}
              onClick={() => switchPage("login")}
            >
              Sign In
            </button>
            <button
              className={`${styles.authTab} ${activePage === "signup" ? styles.active : ""}`}
              onClick={() => switchPage("signup")}
            >
              Sign Up
            </button>
          </div>

          {/* LOGIN */}
          <div
            className={`${styles.authPage} ${activePage === "login" ? styles.active : ""}`}
          >
            <div className={styles.authForm}>
              <h2>Welcome back</h2>
              <p className={styles.subtitle}>
                Sign in to your Money Manager account
              </p>

              {error && <div className={styles.errorMessage}>{error}</div>}

              <form action={handleSignIn}>
                <div className="form-group">
                  <label className="form-label" htmlFor="login-email">Email</label>
                  <input
                    id="login-email"
                    type="email"
                    name="email"
                    className="form-input"
                    placeholder="you@example.com"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="login-password">Password</label>
                  <input
                    id="login-password"
                    type="password"
                    name="password"
                    className="form-input"
                    placeholder="Enter your password"
                    required
                  />
                </div>

                <div className={styles.formRow}>
                  <label className={styles.checkboxLabel}>
                    <input type="checkbox" defaultChecked /> Remember me
                  </label>
                  <button
                    type="button"
                    className={styles.forgotLink}
                    onClick={() => switchPage("forgot")}
                  >
                    Forgot password?
                  </button>
                </div>

                <button type="submit" className={styles.btnSubmit} disabled={loading}>
                  {loading ? "Signing in…" : "Sign In"}
                </button>
              </form>

              <div className={styles.divider}>
                <span>or continue with</span>
              </div>

              <div className={styles.socialButtons}>
                <button
                  className={styles.btnSocial}
                  onClick={handleGoogleSignIn}
                  type="button"
                >
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Google
                </button>
                <button className={styles.btnSocial} type="button">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.32 2.32-2.12 4.53-3.74 4.25z" />
                  </svg>
                  Apple
                </button>
              </div>
            </div>
          </div>

          {/* SIGNUP */}
          <div
            className={`${styles.authPage} ${activePage === "signup" ? styles.active : ""}`}
          >
            <div className={styles.authForm}>
              <h2>Create account</h2>
              <p className={styles.subtitle}>
                Start tracking your finances in under 2 minutes
              </p>

              {error && <div className={styles.errorMessage}>{error}</div>}

              <form action={handleSignUp}>
                <div className="form-group">
                  <label className="form-label" htmlFor="signup-name">Full Name</label>
                  <input
                    id="signup-name"
                    type="text"
                    name="fullName"
                    className="form-input"
                    placeholder="Rahul Kumar"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="signup-email">Email</label>
                  <input
                    id="signup-email"
                    type="email"
                    name="email"
                    className="form-input"
                    placeholder="you@example.com"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="signup-password">Password</label>
                  <input
                    id="signup-password"
                    type="password"
                    name="password"
                    className="form-input"
                    placeholder="Min. 8 characters"
                    minLength={8}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className={styles.checkboxLabel}>
                    <input type="checkbox" required /> I agree to the{" "}
                    <a
                      href="#"
                      style={{ color: "var(--accent)", fontWeight: 500 }}
                    >
                      Terms of Service
                    </a>
                  </label>
                </div>

                <button type="submit" className={styles.btnSubmit} disabled={loading}>
                  {loading ? "Creating account…" : "Create Account"}
                </button>
              </form>

              <div className={styles.divider}>
                <span>or sign up with</span>
              </div>

              <div className={styles.socialButtons}>
                <button
                  className={styles.btnSocial}
                  onClick={handleGoogleSignIn}
                  type="button"
                >
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Google
                </button>
                <button className={styles.btnSocial} type="button">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.32 2.32-2.12 4.53-3.74 4.25z" />
                  </svg>
                  Apple
                </button>
              </div>
            </div>
          </div>

          {/* FORGOT PASSWORD */}
          <div
            className={`${styles.authPage} ${activePage === "forgot" ? styles.active : ""}`}
          >
            <div className={styles.authForm}>
              <h2>Reset password</h2>
              <p className={styles.subtitle}>
                Enter your email and we&apos;ll send you a reset link
              </p>

              {error && <div className={styles.errorMessage}>{error}</div>}
              {success && <div className={styles.successMessage}>{success}</div>}

              <form action={handleResetPassword}>
                <div className="form-group">
                  <label className="form-label" htmlFor="reset-email">Email</label>
                  <input
                    id="reset-email"
                    type="email"
                    name="email"
                    className="form-input"
                    placeholder="you@example.com"
                    required
                  />
                </div>

                <button type="submit" className={styles.btnSubmit} disabled={loading}>
                  {loading ? "Sending…" : "Send Reset Link"}
                </button>
              </form>

              <div className={styles.backLink}>
                <button
                  className={styles.forgotLink}
                  onClick={() => switchPage("login")}
                  type="button"
                >
                  ← Back to Sign In
                </button>
              </div>
            </div>
          </div>

          <div className={styles.authFooter}>
            By continuing, you agree to Money Manager&apos;s
            <br />
            <a href="#">Terms of Service</a> and{" "}
            <a href="#">Privacy Policy</a>
          </div>
        </div>
      </div>
    </div>
  );
}
