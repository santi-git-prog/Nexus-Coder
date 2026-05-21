import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

type ProtectedRouteProps = {
  children: React.ReactNode;
};

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { token } = useAuth();

  if (!token) {
    // If user is not logged in, redirect to login page
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
