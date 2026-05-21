import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../auth/AuthContext";
import "./ProblemList.css";

type Problem = {
  id: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  tags: string[];
  status: "Not Started" | "Attempted" | "Solved";
};

type ProblemSet = {
  id: string;
  title: string;
  description: string;
};

export default function ProblemList() {
  const { setId } = useParams<{ setId: string }>();
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [problems, setProblems] = useState<Problem[]>([]);
  const [problemSet, setProblemSet] = useState<ProblemSet | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const fetchProblems = async () => {
      try {
        setLoading(true);

        // Fetch all problem sets first to find the current set details
        const setsRes = await api.get("/problem-sets");
        const currentSet = setsRes.data.find((s: any) => s.id === setId);
        setProblemSet(currentSet || null);

        // Fetch problems in this set
        const problemsRes = await api.get(`/problem-sets/${setId}/problems`);
        setProblems(problemsRes.data);
      } catch (err: any) {
        console.error(err);
        setError("Failed to fetch problems. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    if (setId) {
      fetchProblems();
    }
  }, [setId]);

  const getStatusBulletClass = (status: string) => {
    switch (status) {
      case "Solved":
        return "status-dot solved";
      case "Attempted":
        return "status-dot attempted";
      case "Not Started":
      default:
        return "status-dot not-started";
    }
  };

  const getDifficultyClass = (diff: string) => {
    return `diff-pill ${diff.toLowerCase()}`;
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <div className="list-container">
      {/* Header */}
      <header className="list-header">
        <div className="list-logo">
          <span className="logo-icon">⚡</span>
          <h1>NexusCoder IDE</h1>
        </div>
        <nav className="list-nav">
          <Link to="/problems" className="nav-link">Tracks</Link>
          <Link to="/workspace" className="nav-link">IDE Workspace</Link>
          <button onClick={handleLogout} className="list-logout-btn">
            Logout
          </button>
        </nav>
      </header>

      {/* Main Panel */}
      <main className="list-main">
        {/* Breadcrumb Back link */}
        <div className="breadcrumb">
          <Link to="/problems" className="back-link">
            <span className="arrow">←</span> Back to Tracks
          </Link>
        </div>

        {/* Hero Track summary */}
        {problemSet && (
          <section className="track-summary">
            <h2>{problemSet.title}</h2>
            <p>{problemSet.description}</p>
          </section>
        )}

        {loading ? (
          <div className="list-loading">
            <span className="spinner"></span>
            <p>Fetching programming tasks...</p>
          </div>
        ) : error ? (
          <div className="list-error-card">
            <p className="error-text">{error}</p>
            <button onClick={() => window.location.reload()} className="retry-btn">Retry</button>
          </div>
        ) : (
          <div className="list-table-wrapper">
            <table className="problems-table">
              <thead>
                <tr>
                  <th className="col-status">Status</th>
                  <th className="col-title">Problem Title</th>
                  <th className="col-difficulty">Difficulty</th>
                  <th className="col-tags">Tags</th>
                </tr>
              </thead>
              <tbody>
                {problems.map((problem) => (
                  <tr 
                    key={problem.id}
                    onClick={() => navigate(`/workspace?problem=${problem.id}`)}
                    className="problem-row"
                  >
                    <td className="col-status">
                      <div className="status-cell">
                        <span className={getStatusBulletClass(problem.status)}></span>
                        <span className="status-text">{problem.status}</span>
                      </div>
                    </td>
                    <td className="col-title">
                      <span className="problem-title">{problem.title}</span>
                    </td>
                    <td className="col-difficulty">
                      <span className={getDifficultyClass(problem.difficulty)}>
                        {problem.difficulty}
                      </span>
                    </td>
                    <td className="col-tags">
                      <div className="tags-container">
                        {problem.tags && problem.tags.map((tag) => (
                          <span key={tag} className="tag-pill">#{tag}</span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}

                {problems.length === 0 && (
                  <tr>
                    <td colSpan={4} className="table-empty-state">
                      No problems uploaded in this track yet. Admins are actively working on it!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
