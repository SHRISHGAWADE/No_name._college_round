"use client";

import { useEffect, useState } from "react";
import { auditResultSchema, getAudit, getSource, streamAudit, type AuditEventStream } from "./api";
import type { AuditResult, Source } from "./types";

const SOURCE_STORAGE_KEY = "second-opinion-audit-sources";
export function saveAuditSources(sources: Source[]) {
  try {
    const existing = JSON.parse(sessionStorage.getItem(SOURCE_STORAGE_KEY) ?? "[]") as unknown;
    const previous = Array.isArray(existing) ? existing.filter((item): item is Source => typeof item === "object" && item !== null && "source_id" in item) : [];
    const merged = new Map(previous.map((source) => [source.source_id, source]));
    sources.forEach((source) => merged.set(source.source_id, source));
    sessionStorage.setItem(SOURCE_STORAGE_KEY, JSON.stringify(Array.from(merged.values())));
    window.dispatchEvent(new Event("second-opinion:sources"));
  } catch { /* Session storage can be disabled. */ }
}
export function getAuditSources(sourceIds: string[]): Source[] {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(SOURCE_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Source => typeof item === "object" && item !== null && "source_id" in item && sourceIds.includes(String(item.source_id)));
  } catch { return []; }
}

export function useAudit(auditId: string) {
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let finished = false;
    let source: AuditEventStream | null = null;
    let inactivityTimer = 0;
    let pollTimer = 0;
    let sourcesHydrated = false;
    const finish = () => { finished = true; window.clearTimeout(inactivityTimer); window.clearTimeout(pollTimer); source?.close(); };
    const updateFromServer = async () => {
      try {
        const next = await getAudit(auditId);
        if (cancelled) return null;
        setAudit(next);
        if (!sourcesHydrated) {
          sourcesHydrated = true;
          const cachedIds = new Set(getAuditSources(next.source_ids).map((source) => source.source_id));
          const missingIds = next.source_ids.filter((sourceId) => !cachedIds.has(sourceId));
          if (missingIds.length) void Promise.all(missingIds.map((sourceId) => getSource(sourceId).catch(() => null))).then((sources) => saveAuditSources(sources.filter((source): source is Source => source !== null)));
        }
        if (next.status === "error") setError(next.error || "This audit could not be completed. Please try again.");
        if (next.status === "done" || next.status === "error") finish();
        return next;
      } catch (cause) {
        if (!cancelled && cause instanceof Error) setError(cause.message);
        return null;
      } finally { if (!cancelled) setLoading(false); }
    };
    const poll = async () => {
      if (cancelled || finished) return;
      await updateFromServer();
      if (!cancelled && !finished) pollTimer = window.setTimeout(() => { void poll(); }, 1000);
    };
    const switchToPolling = () => {
      if (cancelled || finished) return;
      source?.close();
      void poll();
    };
    const resetInactivity = () => {
      window.clearTimeout(inactivityTimer);
      inactivityTimer = window.setTimeout(switchToPolling, 5000);
    };

    void (async () => {
      const initial = await updateFromServer();
      if (cancelled || finished || !initial) return;
      if (initial.status === "running") {
        source = streamAudit(auditId, (eventName, _data) => {
          if (cancelled || finished) return;
          resetInactivity();
          // The API persists each SSE event before it is emitted. Re-fetching
          // keeps this screen on the same normalized representation as polling.
          void updateFromServer();
          if (eventName === "done" || eventName === "error") void updateFromServer();
        }, switchToPolling);
        resetInactivity();
      }
    })();
    return () => { cancelled = true; finish(); };
  }, [auditId]);

  return { audit, error, loading, setAudit };
}

export function parseAudit(value: unknown): AuditResult | null {
  const parsed = auditResultSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
