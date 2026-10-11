"use client";

/** Anonymous per-browser namespace for temporary in-memory demo data. */
export async function accessToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const key = "second-opinion-demo-session";
  try {
    let id = window.localStorage.getItem(key);
    if (!id) {
      id = window.crypto.randomUUID();
      window.localStorage.setItem(key, id);
    }
    return `demo:${id}`;
  } catch {
    return `demo:${window.crypto.randomUUID()}`;
  }
}
