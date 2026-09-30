# Google sign-in deployment setup

1. In Google Cloud Console, configure the OAuth consent screen and create an OAuth client of type **Web application**.
2. Add the production Vercel site origin (for example, `https://nexus-code.vercel.app`) under **Authorized JavaScript origins**. Add `http://localhost:5173` only if you need local development. This flow uses the Google Identity Services popup, so it does not need a redirect URI.
3. Set the same OAuth client ID in both services:
   - Vercel frontend: `VITE_GOOGLE_CLIENT_ID`
   - Render backend: `GOOGLE_CLIENT_ID`
4. Keep Render's `GOOGLE_ALLOWED_DOMAIN` set to `psgtech.ac.in`. The backend checks the verified email, Google Workspace hosted-domain claim, and token audience before creating/linking an account.
5. Redeploy Vercel and Render after setting the variables. During Google OAuth testing, add test accounts in the consent-screen configuration; for general availability, complete Google's publishing requirements.

The client ID is not a secret. Do not put a Google client secret or Resend key in the frontend.
