import { Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import Dashboard from "./pages/Dashboard";
import ProblemSets from "./pages/ProblemSets";
import ProblemList from "./pages/ProblemList";
import AdminDashboard from "./pages/AdminDashboard";
import CodingWorkspace from "./pages/CodingWorkspace";
import ProtectedRoute from "./auth/ProtectedRoute";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/problems"
        element={
          <ProtectedRoute>
            <ProblemSets />
          </ProtectedRoute>
        }
      />
      <Route
        path="/problems/set/:setId"
        element={
          <ProtectedRoute>
            <ProblemList />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/workspace"
        element={
          <ProtectedRoute>
            <CodingWorkspace />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
