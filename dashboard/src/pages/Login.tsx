import { useState } from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  OAuthProvider,
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
  "auth/email-already-in-use": "You already have an account with this email — sign in instead.",
  "auth/weak-password": "Password needs at least 6 characters.",
};

export function Login() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
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
              if (mode === "signup") {
                await createUserWithEmailAndPassword(getAuthOrThrow(), email, password);
              } else {
                await signInWithEmailAndPassword(getAuthOrThrow(), email, password);
              }
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
            {busy ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}
          </Button>
          <button
            type="button"
            className="cursor-pointer text-center text-xs text-muted underline"
            onClick={() => {
              setErr("");
              setMode((m) => (m === "signin" ? "signup" : "signin"));
            }}
          >
            {mode === "signin"
              ? "New here? Create an account"
              : "Already have an account? Sign in"}
          </button>
        </form>
        <div className="my-4 flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-line" />
          or
          <span className="h-px flex-1 bg-line" />
        </div>
        <button
          className="mb-2 flex h-[38px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-ink text-sm font-semibold text-background transition-[filter,transform] hover:brightness-110 active:scale-[0.97]"
          onClick={async () => {
            setErr("");
            try {
              const apple = new OAuthProvider("apple.com");
              apple.addScope("email");
              apple.addScope("name");
              await signInWithPopup(getAuthOrThrow(), apple);
            } catch (ex) {
              fail(ex);
            }
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M16.365 1.43c0 1.14-.46 2.21-1.21 3.02-.79.86-2.08 1.53-3.12 1.44a3.4 3.4 0 0 1-.03-.42c0-1.1.48-2.24 1.23-3.03.38-.41.88-.76 1.48-1.03.6-.26 1.17-.4 1.63-.42.02.15.02.3.02.44zM20.94 17.4c-.5 1.12-.74 1.62-1.39 2.61-.9 1.38-2.17 3.1-3.75 3.11-1.4.01-1.77-.92-3.67-.9-1.9.01-2.3.92-3.71.9-1.58-.02-2.78-1.57-3.68-2.95-2.52-3.84-2.79-8.36-1.23-10.76 1.1-1.7 2.85-2.7 4.49-2.7 1.67 0 2.72.92 4.1.92 1.34 0 2.16-.92 4.09-.92 1.46 0 3 .8 4.11 2.17-3.61 1.98-3.02 7.13.64 8.52z" />
          </svg>
          Continue with Apple
        </button>
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
