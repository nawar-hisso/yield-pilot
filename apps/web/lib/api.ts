// Tiny fetch wrapper for apps/api. Base URL comes from NEXT_PUBLIC_API_URL.

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "content-type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    throw new Error(`apps/api ${path} failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}
