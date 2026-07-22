import { initializeApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

// Config comes from the API at runtime (public client identifiers), so one
// bundle serves both environments.
let auth: Auth | null = null;

export async function initAuth(): Promise<Auth> {
  if (auth) return auth;
  const res = await fetch("/v1/client-config");
  if (!res.ok) {
    // A cold-start 429/500 here must surface as a real error the boot flow can
    // catch and show a retry for — not garbage fed into initializeApp() that
    // hangs the app on the loading spinner forever.
    throw new Error(`Couldn't reach the server (${res.status}). Please try again.`);
  }
  const cfg = await res.json();
  auth = getAuth(initializeApp(cfg));
  return auth;
}

export function getAuthOrThrow(): Auth {
  if (!auth) throw new Error("auth not initialized");
  return auth;
}
