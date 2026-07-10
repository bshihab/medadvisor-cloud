import { useState } from "react";
import {
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { getAuthOrThrow } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const LOGIN_ERRORS: Record<string, string> = {
  "auth/invalid-credential": "Wrong email or password.",
  "auth/wrong-password": "Wrong email or password.",
  "auth/user-not-found": "Wrong email or password.",
  "auth/invalid-email": "That doesn't look like an email address.",
  "auth/too-many-requests": "Too many attempts — wait a few minutes and try again.",
  "auth/network-request-failed": "Network problem — check your connection.",
  "auth/operation-not-allowed": "Google sign-in isn't enabled for this environment.",
};

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const fail = (e: unknown) => {
    const code = (e as { code?: string })?.code ?? "";
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
    setErr(LOGIN_ERRORS[code] ?? "Sign-in failed. Please try again.");
  };

  return (
    <div className="grid min-h-screen place-items-center p-4">
      <div className="glass-card w-full max-w-sm !rounded-3xl p-8 text-center">
        <div className="btn-glow mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-accent text-2xl font-bold text-white">
          M
        </div>
        <h1 className="text-xl font-semibold">MedAdvisor</h1>
        <p className="mb-6 text-sm text-muted">Mentor Dashboard</p>
        <form
          className="grid gap-3 text-left"
          onSubmit={async (e) => {
            e.preventDefault();
            setErr("");
            setBusy(true);
            try {
              await signInWithEmailAndPassword(getAuthOrThrow(), email, password);
            } catch (ex) {
              fail(ex);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Input
            type="email"
            placeholder="Email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <div className="my-4 flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-line" />
          or
          <span className="h-px flex-1 bg-line" />
        </div>
        <Button
          variant="outline"
          className="w-full"
          onClick={async () => {
            setErr("");
            try {
              await signInWithPopup(getAuthOrThrow(), new GoogleAuthProvider());
            } catch (ex) {
              fail(ex);
            }
          }}
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
          </svg>
          Continue with Google
        </Button>
        <p className="mt-3 min-h-5 text-sm text-band-low">{err}</p>
      </div>
    </div>
  );
}
