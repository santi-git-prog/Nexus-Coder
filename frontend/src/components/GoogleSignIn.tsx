import { GoogleLogin } from "@react-oauth/google";
import { isAxiosError } from "axios";
import api from "../api/axios";

type GoogleSignInProps = {
  onAuthenticated: (token: string) => void;
  onError: (message: string) => void;
};

export default function GoogleSignIn({ onAuthenticated, onError }: GoogleSignInProps) {
  if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) return null;

  return (
    <div className="google-sign-in">
      <div className="auth-divider"><span>or continue with</span></div>
      <GoogleLogin
        onSuccess={async ({ credential }) => {
          if (!credential) {
            onError("Google did not return a sign-in credential. Please try again.");
            return;
          }
          try {
            const response = await api.post("/auth/google", { credential });
            onAuthenticated(response.data.token);
          } catch (error: any) {
            const message = isAxiosError(error) ? error.response?.data?.message : undefined;
            onError(message || "Google sign-in failed. Please try again.");
          }
        }}
        onError={() => onError("Google sign-in was cancelled or could not start.")}
        text="continue_with"
        shape="rectangular"
        theme="outline"
        size="large"
        width="240"
      />
      <span className="auth-google-note">Use your verified @psgtech.ac.in Google account</span>
    </div>
  );
}
