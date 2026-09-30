import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import api from "../api/axios";
import "./Dashboard.css";

export default function Dashboard() {
  const { logout } = useAuth();
  const [message, setMessage] = useState("");

  useEffect(() => {
    api
      .get("/users/me")
      .then((res) => setMessage(`Signed in as ${res.data.username}`))
      .catch((err) => setMessage("Failed to fetch data: " + err.message));
  }, []);

  return (
    <div className="dashboard">
      <h1>Dashboard</h1>
      <p>You are logged in 🎉</p>
      {message ? <p className="backend-message">{message}</p> : <p>Loading protected data...</p>}
      <button onClick={logout}>Logout</button>
    </div>
  );
}
