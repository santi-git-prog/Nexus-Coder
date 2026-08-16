import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../auth/AuthContext";
import "./AdminDashboard.css";

type ProblemSet = {
  id: string;
  title: string;
};

type Problem = {
  id: string;
  title: string;
  problem_set_id: string;
};

export default function AdminDashboard() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  // Loading and feedback states
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Loaded lists for dropdowns
  const [problemSets, setProblemSets] = useState<ProblemSet[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);

  // Selected state for testcase creator
  const [selectedSetId, setSelectedSetId] = useState<string>("");
  const [selectedProblemId, setSelectedProblemId] = useState<string>("");

  // Tab state: "set" | "problem" | "testcase"
  const [activeTab, setActiveTab] = useState<"set" | "problem" | "testcase">("set");

  // Form states
  // 1. Problem Set Form
  const [setTitle, setSetTitle] = useState("");
  const [setDescription, setSetDescription] = useState("");

  // 2. Problem Form
  const [probSetId, setProbSetId] = useState("");
  const [probTitle, setProbTitle] = useState("");
  const [probDescription, setProbDescription] = useState("");
  const [probDifficulty, setProbDifficulty] = useState("Easy");
  const [probTags, setProbTags] = useState("");
  const [probConstraints, setProbConstraints] = useState("");
  const [probFunctionName, setProbFunctionName] = useState("twoSum");
  const [probReturnType, setProbReturnType] = useState("int*");
  const [probParameters, setProbParameters] = useState(
    '[\n  { "name": "nums", "type": "int[]" },\n  { "name": "target", "type": "int" }\n]'
  );
  const [probStarterCode, setProbStarterCode] = useState("");
  const [probPythonStarterCode, setProbPythonStarterCode] = useState("");
  const [probPythonFunctionName, setProbPythonFunctionName] = useState("");

  // 3. Testcase Form
  const [tcInput, setTcInput] = useState("");
  const [tcExpectedOutput, setTcExpectedOutput] = useState("");
  const [tcIsHidden, setTcIsHidden] = useState(false);

  // Load dropdown lists on mount
  useEffect(() => {
    fetchDropdownData();
  }, []);

  const fetchDropdownData = async () => {
    try {
      // Fetch sets
      const setsRes = await api.get("/problem-sets");
      setProblemSets(setsRes.data);

      // Fetch all problems (loop over sets and merge them, or fetch individually)
      const allProblems: Problem[] = [];
      for (const set of setsRes.data) {
        const probsRes = await api.get(`/problem-sets/${set.id}/problems`);
        // Map problems to hold their setId
        const mappedProbs = probsRes.data.map((p: any) => ({
          id: p.id,
          title: p.title,
          problem_set_id: set.id,
        }));
        allProblems.push(...mappedProbs);
      }
      setProblems(allProblems);
    } catch (err: any) {
      console.error("Failed to load dropdown items:", err);
    }
  };

  const showNotification = (text: string, type: "success" | "error") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  // Submit handlers
  const handleCreateSet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setTitle.trim()) return;

    try {
      setLoading(true);
      await api.post("/admin/problem-sets", {
        title: setTitle,
        description: setDescription,
      });
      showNotification(`Problem set "${setTitle}" created successfully!`, "success");
      setSetTitle("");
      setSetDescription("");
      await fetchDropdownData();
    } catch (err: any) {
      console.error(err);
      showNotification(err.response?.data?.message || "Failed to create problem set.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProblem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!probSetId || !probTitle.trim() || !probDescription.trim()) {
      showNotification("Set, Title, and Description are required fields.", "error");
      return;
    }

    try {
      setLoading(true);
      const tagsArray = probTags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);

      let parsedParams: unknown[] = [];
      try {
        parsedParams = JSON.parse(probParameters);
        if (!Array.isArray(parsedParams)) throw new Error("Parameters must be an array");
      } catch {
        showNotification("Parameters must be a valid array.", "error");
        setLoading(false);
        return;
      }

      await api.post("/admin/problems", {
        problem_set_id: probSetId,
        title: probTitle,
        description: probDescription,
        difficulty: probDifficulty,
        tags: tagsArray,
        constraints: probConstraints,
        starter_code: probStarterCode,
        function_name: probFunctionName,
        return_type: probReturnType,
        parameters: parsedParams,
        python_starter_code: probPythonStarterCode,
        python_function_name: probPythonFunctionName,
      });

      showNotification(`Problem "${probTitle}" uploaded successfully!`, "success");
      setProbTitle("");
      setProbDescription("");
      setProbTags("");
      setProbConstraints("");
      setProbPythonStarterCode("");
      setProbPythonFunctionName("");
      await fetchDropdownData();
    } catch (err: any) {
      console.error(err);
      showNotification(err.response?.data?.message || "Failed to create problem.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTestcase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProblemId) {
      showNotification("Please select a target problem.", "error");
      return;
    }
    if (tcExpectedOutput === undefined || tcExpectedOutput.trim() === "") {
      showNotification("Expected output is required.", "error");
      return;
    }

    try {
      setLoading(true);
      await api.post(`/admin/problems/${selectedProblemId}/testcases`, {
        input: tcInput,
        expected_output: tcExpectedOutput,
        is_hidden: tcIsHidden,
      });

      showNotification(
        `${tcIsHidden ? "Hidden" : "Sample"} testcase uploaded successfully!`,
        "success"
      );
      setTcInput("");
      setTcExpectedOutput("");
      setTcIsHidden(false);
    } catch (err: any) {
      console.error(err);
      showNotification(err.response?.data?.message || "Failed to add testcase.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const filteredProblems = problems.filter((p) => p.problem_set_id === selectedSetId);

  return (
    <div className="admin-container">
      {/* Header */}
      <header className="admin-header">
        <div className="admin-logo">
          <span className="logo-icon">⚡</span>
          <h1>NexusCoder Admin</h1>
        </div>
        <nav className="admin-nav">
          <Link to="/problems" className="nav-link">Tracks</Link>
          <Link to="/workspace" className="nav-link">IDE Workspace</Link>
          <button onClick={handleLogout} className="admin-logout-btn">
            Logout
          </button>
        </nav>
      </header>

      {/* Main Grid */}
      <main className="admin-main">
        <section className="admin-hero">
          <h2>Problem Creation Suite</h2>
          <p>
            Create interview prep modules. Build tracks, add coding problems with templates, 
            and add example test cases students can run and submit against.
          </p>
        </section>

        {/* Global Notification */}
        {message && (
          <div className={`notification ${message.type}`}>
            <span className="notification-icon">{message.type === "success" ? "✓" : "⚠"}</span>
            <p>{message.text}</p>
          </div>
        )}

        {/* Tab Controls */}
        <div className="admin-tabs">
          <button 
            className={`tab-btn ${activeTab === "set" ? "active" : ""}`}
            onClick={() => setActiveTab("set")}
          >
            Create Problem Set
          </button>
          <button 
            className={`tab-btn ${activeTab === "problem" ? "active" : ""}`}
            onClick={() => setActiveTab("problem")}
          >
            Add Coding Problem
          </button>
          <button 
            className={`tab-btn ${activeTab === "testcase" ? "active" : ""}`}
            onClick={() => setActiveTab("testcase")}
          >
            Upload Testcases
          </button>
        </div>

        {/* Form Container */}
        <div className="admin-card">
          {activeTab === "set" && (
            <form onSubmit={handleCreateSet} className="admin-form">
              <h3>New Problem Set</h3>
              <div className="form-group">
                <label htmlFor="set-title">Track Title</label>
                <input 
                  type="text" 
                  id="set-title" 
                  value={setTitle}
                  onChange={(e) => setSetTitle(e.target.value)}
                  placeholder="e.g. Arrays, Strings, Bit Manipulation..."
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="set-desc">Track Description</label>
                <textarea 
                  id="set-desc" 
                  value={setDescription}
                  onChange={(e) => setSetDescription(e.target.value)}
                  placeholder="Describe the focus and skills targeted by this tracks module..."
                  rows={4}
                />
              </div>
              <button type="submit" disabled={loading} className="submit-form-btn">
                {loading ? "Creating..." : "Create Problem Set"}
              </button>
            </form>
          )}

          {activeTab === "problem" && (
            <form onSubmit={handleCreateProblem} className="admin-form full-width-form">
              <h3>New Coding Problem</h3>
              <div className="form-row-grid">
                <div className="form-group">
                  <label htmlFor="prob-set">Select Track Set</label>
                  <select 
                    id="prob-set" 
                    value={probSetId}
                    onChange={(e) => setProbSetId(e.target.value)}
                    required
                  >
                    <option value="">-- Choose Track Set --</option>
                    {problemSets.map((set) => (
                      <option key={set.id} value={set.id}>{set.title}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="prob-title">Problem Title</label>
                  <input 
                    type="text" 
                    id="prob-title" 
                    value={probTitle}
                    onChange={(e) => setProbTitle(e.target.value)}
                    placeholder="e.g. Find Duplicates, Two Sum"
                    required
                  />
                </div>
              </div>

              <div className="form-row-grid">
                <div className="form-group">
                  <label htmlFor="prob-diff">Difficulty</label>
                  <select 
                    id="prob-diff" 
                    value={probDifficulty}
                    onChange={(e) => setProbDifficulty(e.target.value)}
                  >
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="prob-tags">Tags (comma-separated)</label>
                  <input 
                    type="text" 
                    id="prob-tags" 
                    value={probTags}
                    onChange={(e) => setProbTags(e.target.value)}
                    placeholder="arrays, basic, loops"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="prob-desc">Problem Description</label>
                <textarea 
                  id="prob-desc" 
                  value={probDescription}
                  onChange={(e) => setProbDescription(e.target.value)}
                  placeholder="Detail the core algorithm objective and requirements..."
                  rows={4}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="prob-constraints">Constraints</label>
                <textarea 
                  id="prob-constraints" 
                  value={probConstraints}
                  onChange={(e) => setProbConstraints(e.target.value)}
                  placeholder="e.g. 1 <= N <= 10^5"
                  rows={2}
                />
              </div>

              <div className="form-row-grid">
                <div className="form-group">
                  <label htmlFor="prob-fn">Function Name</label>
                  <input
                    id="prob-fn"
                    type="text"
                    value={probFunctionName}
                    onChange={(e) => setProbFunctionName(e.target.value)}
                    placeholder="twoSum"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="prob-ret">Return Type</label>
                  <input
                    id="prob-ret"
                    type="text"
                    value={probReturnType}
                    onChange={(e) => setProbReturnType(e.target.value)}
                    placeholder="int*, int, bool, void"
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="prob-params">Parameters</label>
                <textarea
                  id="prob-params"
                  className="code-textarea-field"
                  value={probParameters}
                  onChange={(e) => setProbParameters(e.target.value)}
                  rows={5}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="prob-starter">C Starter code (optional — auto-generated if empty)</label>
                <textarea 
                  id="prob-starter" 
                  className="code-textarea-field"
                  value={probStarterCode}
                  onChange={(e) => setProbStarterCode(e.target.value)}
                  rows={8}
                />
              </div>

              <div className="form-row-grid">
                <div className="form-group">
                  <label htmlFor="prob-py-fn">Python Function Name (optional)</label>
                  <input
                    id="prob-py-fn"
                    type="text"
                    value={probPythonFunctionName}
                    onChange={(e) => setProbPythonFunctionName(e.target.value)}
                    placeholder="twoSum"
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="prob-py-starter">Python Starter code (optional)</label>
                <textarea 
                  id="prob-py-starter" 
                  className="code-textarea-field"
                  value={probPythonStarterCode}
                  onChange={(e) => setProbPythonStarterCode(e.target.value)}
                  rows={8}
                />
              </div>

              <button type="submit" disabled={loading} className="submit-form-btn">
                {loading ? "Uploading..." : "Upload Coding Problem"}
              </button>
            </form>
          )}

          {activeTab === "testcase" && (
            <form onSubmit={handleCreateTestcase} className="admin-form">
              <h3>Upload Problem Testcase</h3>
              <div className="form-row-grid">
                <div className="form-group">
                  <label htmlFor="tc-set">Select Track Set</label>
                  <select 
                    id="tc-set" 
                    value={selectedSetId}
                    onChange={(e) => {
                      setSelectedSetId(e.target.value);
                      setSelectedProblemId("");
                    }}
                    required
                  >
                    <option value="">-- Choose Track Set --</option>
                    {problemSets.map((set) => (
                      <option key={set.id} value={set.id}>{set.title}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="tc-prob">Select Target Problem</label>
                  <select 
                    id="tc-prob" 
                    value={selectedProblemId}
                    onChange={(e) => setSelectedProblemId(e.target.value)}
                    required
                    disabled={!selectedSetId}
                  >
                    <option value="">-- Choose Target Problem --</option>
                    {filteredProblems.map((prob) => (
                      <option key={prob.id} value={prob.id}>{prob.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="tc-input">Test Input</label>
                <textarea 
                  id="tc-input" 
                  value={tcInput}
                  onChange={(e) => setTcInput(e.target.value)}
                  placeholder="nums = [2,7,11,15], target = 9"
                  rows={4}
                />
              </div>

              <div className="form-group">
                <label htmlFor="tc-output">Expected Output</label>
                <textarea 
                  id="tc-output" 
                  value={tcExpectedOutput}
                  onChange={(e) => setTcExpectedOutput(e.target.value)}
                  placeholder="[0, 1]"
                  rows={4}
                  required
                />
              </div>

              <div className="form-group checkbox-group">
                <input 
                  type="checkbox" 
                  id="tc-hidden" 
                  checked={tcIsHidden}
                  onChange={(e) => setTcIsHidden(e.target.checked)}
                />
                <label htmlFor="tc-hidden">Hidden test case (Submit only)</label>
              </div>

              <button type="submit" disabled={loading} className="submit-form-btn">
                {loading ? "Uploading..." : "Upload Testcase"}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
