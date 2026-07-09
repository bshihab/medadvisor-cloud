import { getAuthOrThrow } from "./firebase";

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, detail?: string) {
    super(detail ?? code);
    this.status = status;
    this.code = code;
  }
}

export async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const user = getAuthOrThrow().currentUser;
  if (!user) throw new ApiError(401, "unauthenticated");
  const token = await user.getIdToken();
  const res = await fetch(path, {
    ...opts,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(opts.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? `http_${res.status}`, body.detail);
  return body as T;
}

export const publicApi = async <T>(path: string): Promise<T> =>
  (await fetch(path).then((r) => r.json())) as T;
