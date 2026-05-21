import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../auth/AuthContext";
import "./ProblemSets.css";

type ProblemSet = {
  id: string;
  title: string;
  description: string;
  total_problems: number;
  easy_count: number;
  medium_count: number;
  hard_count: number;
};

type UserProfile = {
  id: string;
  username: string;
  email: string;
  role: string;
};

export default function ProblemSets() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [sets, setSets] = useState<ProblemSet[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Fetch user profile to check role
        const profileRes = await api.get("/users/me");
        setProfile(profileRes.data);

        // Fetch problem sets
        const setsRes = await api.get("/problem-sets");
        setSets(setsRes.data);
      } catch (err: any) {
        console.error(err);
        setError("Failed to load problem sets. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <div className="sets-container">
      {/* Premium Navbar */}
      <header className="sets-header">
        <div className="sets-logo">
          <span className="sets-logo-icon">⚡</span>
          <h1>NexusCoder IDE</h1>
        </div>
        <nav className="sets-nav">
          <Link to="/workspace" className="nav-link">IDE Workspace</Link>
          {profile?.role === "admin" && (
            <Link to="/admin" className="admin-pill">Admin Dashboard</Link>
          )}
          <button onClick={handleLogout} className="sets-logout-btn">
            Logout
          </button>
        </nav>
      </header>

      {/* Main Body */}
      <main className="sets-main">
        <section className="sets-hero">
          <h2>Interview Prep Tracks</h2>
          <p>
            Accelerate your career. Choose a practice set below, master data structures, 
            and track your solutions against our compiler testcases.
          </p>
        </section>

        {loading ? (
          <div className="sets-loading">
            <span className="spinner"></span>
            <p>Loading curated problem sets...</p>
          </div>
        ) : error ? (
          <div className="sets-error-card">
            <p className="error-text">{error}</p>
            <button onClick={() => window.location.reload()} className="retry-btn">Retry</button>
          </div>
        ) : (
          <div className="sets-grid">
            {sets.map((set) => (
              <div 
                key={set.id} 
                className="set-card"
                onClick={() => navigate(`/problems/set/${set.id}`)}
              >
                <div className="set-card-glow"></div>
                <div className="set-card-content">
                  <div className="set-card-header">
                    <h3>{set.title}</h3>
                    <span className="problem-count-badge">
                      {set.total_problems} {set.total_problems === 1 ? "Problem" : "Problems"}
                    </span>
                  </div>
                  <p className="set-description">{set.description}</p>
                  
                  <div className="set-difficulty-bar">
                    <div className="difficulty-tag easy">
                      <span className="bullet green"></span>
                      <span>Easy: {set.easy_count}</span>
                    </div>
                    <div className="difficulty-tag medium">
                      <span className="bullet yellow"></span>
                      <span>Medium: {set.medium_count}</span>
                    </div>
                    <div className="difficulty-tag hard">
                      <span className="bullet red"></span>
                      <span>Hard: {set.hard_count}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {sets.length === 0 && (
              <div className="empty-state">
                <p>No problem sets uploaded yet. Check back soon or upload one as Admin!</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
