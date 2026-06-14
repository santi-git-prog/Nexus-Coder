import { useState, useEffect } from "react";
import api from "../api/axios";
import { useAuth } from "../auth/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import "./auth.css";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // OTP Verification state in case user tries to login but is unverified
  const [showOtp, setShowOtp] = useState(false);
  const [otp, setOtp] = useState("");
  const [resendTimer, setResendTimer] = useState(60);
  const [resendDisabled, setResendDisabled] = useState(true);
  const [verificationLoading, setVerificationLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let interval: any;
    if (showOtp && resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    } else if (resendTimer === 0) {
      setResendDisabled(false);
    }
    return () => clearInterval(interval);
  }, [showOtp, resendTimer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await api.post("/auth/login", { email, password });
      login(res.data.token);
      navigate("/problems");
    } catch (err: any) {
      if (err.response?.status === 403 && err.response?.data?.requiresVerification) {
        setError(err.response.data.message);
        setShowOtp(true);
        setResendTimer(60);
        setResendDisabled(true);
      } else {
        setError(err.response?.data?.message || "Login failed. Please check your credentials.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setVerificationLoading(true);

    try {
      const res = await api.post("/auth/verify-otp", { email, otp });
      login(res.data.token);
      navigate("/problems");
    } catch (err: any) {
      setError(err.response?.data?.message || "Verification failed. Please check the OTP.");
    } finally {
      setVerificationLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError("");
    setResendDisabled(true);
    setResendTimer(60);

    try {
      await api.post("/auth/resend-otp", { email });
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to resend verification code.");
      setResendDisabled(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-glow-blob blob-left"></div>
      <div className="auth-glow-blob blob-right"></div>
      <div className="auth-box">
        <div className="auth-header">
          <div className="auth-logo-wrapper">
            <img 
              src="/nexus1.png" 
              alt="Nexus Code Logo" 
              className="auth-logo"
              onError={(e) => {
                // If logo fails to load, use a fallback SVG or icon style
                (e.target as HTMLImageElement).src = "/vite.svg";
              }}
            />
          </div>
          <h1 className="auth-title">Nexus Code</h1>
          <p className="auth-subtitle">
            {showOtp ? "Verify your email address" : "Sign in to access your coding tracks"}
          </p>
        </div>

        {error && (
          <div className="auth-error-box">
            <svg style={{ width: "16px", height: "16px", flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>{error}</span>
          </div>
        )}

        {!showOtp ? (
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="input-group">
              <label className="input-label">Email Address</label>
              <input
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="auth-input"
                required
              />
            </div>

            <div className="input-group">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label className="input-label">Password</label>
                <Link 
                  to="/forgot-password" 
                  style={{ 
                    fontSize: "12px", 
                    color: "var(--primary)", 
                    textDecoration: "none", 
                    fontWeight: 600 
                  }}
                  className="auth-link-forgot"
                >
                  Forgot Password?
                </Link>
              </div>
              <input
                type="password"
                placeholder="********"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="auth-input"
                required
              />
            </div>

            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="auth-form">
            <div className="input-group">
              <label className="input-label">Verification Code (OTP)</label>
              <input
                type="text"
                placeholder="Enter 6-digit code"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="auth-input"
                maxLength={6}
                required
                style={{ textAlign: "center", letterSpacing: "4px", fontSize: "18px", fontWeight: "bold" }}
              />
              <span style={{ fontSize: "12px", color: "#64748b", marginTop: "4px", textAlign: "center" }}>
                Sent to {email}
              </span>
            </div>

            <button type="submit" className="auth-btn" disabled={verificationLoading}>
              {verificationLoading ? "Verifying..." : "Verify Code"}
            </button>

            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", marginTop: "10px", fontSize: "14px" }}>
              {resendDisabled ? (
                <span style={{ color: "#64748b" }}>Resend code in {resendTimer}s</span>
              ) : (
                <button
                  type="button"
                  onClick={handleResendOtp}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--primary)",
                    cursor: "pointer",
                    fontWeight: "600",
                    padding: 0,
                    textDecoration: "underline"
                  }}
                >
                  Resend Verification Code
                </button>
              )}
            </div>
          </form>
        )}

        <div className="auth-footer">
          {showOtp ? (
            <button
              type="button"
              onClick={() => {
                setShowOtp(false);
                setError("");
              }}
              style={{
                background: "none",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer",
                fontSize: "14px"
              }}
            >
              ← Back to Login
            </button>
          ) : (
            <>
              Don't have an account? 
              <Link to="/register" className="auth-link">Register</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
