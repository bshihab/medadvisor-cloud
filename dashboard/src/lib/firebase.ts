import { initializeApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

// Config comes from the API at runtime (public client identifiers), so one
// bundle serves both environments.
let auth: Auth | null = null;

export async function initAuth(): Promise<Auth> {
  if (auth) return auth;
  const cfg = await fetch("/v1/client-config").then((r) => r.json());
  auth = getAuth(initializeApp(cfg));
  return auth;
}

export function getAuthOrThrow(): Auth {
  if (!auth) throw new Error("auth not initialized");
  return auth;
}
