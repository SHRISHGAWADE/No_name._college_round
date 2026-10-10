import { z } from "zod";
import type { AuditCreateResponse, AuditResult, CorrectionResponse, Source, SourcesResponse } from "./types";
import { accessToken } from "./supabase";

const spanSchema = z.object({ start: z.number().int().nonnegative(), end: z.number().int().nonnegative() });
const evidenceSchema = z.object({ source_id: z.string(), source_name: z.string(), page: z.number(), quote: z.string(), start: z.number(), end: z.number(), quote_verified: z.boolean() });
const claimSchema = z.object({
  claim_id: z.string(), text: z.string(), answer_span: spanSchema.nullable(), status: z.enum(["pending", "done", "error"]),
  verdict: z.enum(["supported", "contradicted", "unsupported", "ambiguous"]).nullable(),
  error_type: z.enum(["wrong_number", "contradiction", "fabricated_fact", "unsupported_addition", "logical_leap", "unsafe_advice"]).nullable(),
  flags: z.array(z.string()), confidence: z.number(), confidence_label: z.enum(["high", "medium", "low"]),
  explanation: z.string(), evidence: z.array(evidenceSchema), signals: z.object({
    quote_verified: z.boolean().nullable().optional(), retrieval_score: z.number().nullable().optional(),
    agreement: z.string().nullable().optional(), jev: z.unknown().optional(), hhem: z.unknown().optional(),
  }).nullable().optional(),
});
const findingSchema = z.object({ type: z.enum(["reasoning", "safety"]), answer_span: spanSchema, severity: z.enum(["low", "medium", "high"]), explanation: z.string() });
const summarySchema = z.object({ label: z.enum(["reliable", "partially_supported", "contains_errors"]), counts: z.object({ supported: z.number(), contradicted: z.number(), unsupported: z.number(), ambiguous: z.number() }), supported_ratio: z.number() });
const traceSchema = z.object({ model: z.string(), total_ms: z.number(), stages: z.array(z.object({ name: z.string(), ms: z.number() })) });
export const auditResultSchema = z.object({
  audit_id: z.string(), status: z.enum(["running", "done", "error"]), created_at: z.string(), answer_text: z.string(), source_ids: z.array(z.string()),
  claims: z.array(claimSchema), answer_findings: z.array(findingSchema), summary: summarySchema.nullable(), trace: traceSchema.nullable(), error: z.string().nullable().optional(),
});
const sourcesSchema = z.object({ sources: z.array(z.object({ source_id: z.string(), name: z.string(), pages: z.array(z.object({ page: z.number(), text: z.string() })) })) });
const createAuditSchema = z.object({ audit_id: z.string() });
const correctionSchema = z.object({ claim_id: z.string(), original: z.string(), corrected: z.string().nullable(), evidence: z.array(evidenceSchema), recheck: claimSchema.nullable() });
const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });
const mockAuditSchema = z.object({ answer_text: z.string() });
const auditListSchema = z.object({ audits: z.array(z.object({ audit_id: z.string(), created_at: z.string(), status: z.enum(["running", "done", "error"]), answer_preview: z.string(), source_names: z.array(z.string()), claim_count: z.number(), summary: summarySchema.nullable() })) });
const sourceLibrarySchema = z.object({ sources: z.array(z.object({ source_id: z.string(), name: z.string(), mime_type: z.string(), page_count: z.number(), created_at: z.string(), storage_path: z.string().nullable() })) });
const fileUrlSchema = z.object({ url: z.string().url(), expires_in: z.number() });

export class ApiError extends Error {
  constructor(message: string, readonly status?: number, readonly code?: string, readonly requestId?: string) { super(message); this.name = "ApiError"; }
}

export function apiBaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_API_BASE?.trim();
  if (!value) throw new ApiError("The backend address is not configured. Set NEXT_PUBLIC_API_BASE and restart the frontend.");
  return value.replace(/\/+$/, "");
}

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { window.clearTimeout(timer); }
}

async function checkedJson<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    const headers = new Headers(init?.headers);
    const token = await accessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    response = await fetchWithTimeout(`${apiBaseUrl()}${path}`, { ...init, headers });
  }
  catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(error instanceof Error && error.name === "AbortError" ? "The request timed out. Please try again." : "Could not reach the backend. Check your connection and try again.");
  }
  const requestId = response.headers.get("X-Request-ID") ?? undefined;
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsedError = errorSchema.safeParse(payload);
    throw new ApiError(parsedError.success ? parsedError.data.error.message : `The backend returned an error (${response.status}).`, response.status, parsedError.success ? parsedError.data.error.code : undefined, requestId);
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new ApiError("The backend response was incomplete or invalid. Please try again.", response.status, "invalid_response", requestId);
  return parsed.data;
}

export async function waitForBackend(onWaking?: () => void, maxWaitMs = 75000): Promise<void> {
  const base = apiBaseUrl();
  const started = Date.now();
  let delay = 1000;
  while (Date.now() - started < maxWaitMs) {
    try {
      const response = await fetchWithTimeout(`${base}/health`, undefined, 7000);
      if (response.ok) return;
    } catch { /* Render free instances can take a while to wake. */ }
    onWaking?.();
    await new Promise((resolve) => window.setTimeout(resolve, delay));
    delay = Math.min(Math.round(delay * 1.5), 8000);
  }
  throw new ApiError("The backend is still unavailable. Please try again in a moment.");
}

export async function uploadFiles(files: File[]): Promise<SourcesResponse> {
  const form = new FormData();
  files.forEach((file) => form.append("files[]", file));
  return checkedJson("/api/sources", sourcesSchema, { method: "POST", body: form });
}

export async function uploadPastedSource(name: string, text: string): Promise<SourcesResponse> {
  return checkedJson("/api/sources", sourcesSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, text }) });
}

export async function createAudit(answer: string, sourceIds: string[]): Promise<AuditCreateResponse> {
  return checkedJson("/api/audit", createAuditSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answer, source_ids: sourceIds }) });
}

export async function getAudit(auditId: string): Promise<AuditResult> {
  return checkedJson(`/api/audit/${encodeURIComponent(auditId)}`, auditResultSchema);
}

export async function correctClaim(auditId: string, claimId: string): Promise<CorrectionResponse> {
  return checkedJson(`/api/audit/${encodeURIComponent(auditId)}/claims/${encodeURIComponent(claimId)}/correct`, correctionSchema, { method: "POST" });
}

export async function loadMockExample(): Promise<{ answer: string; sources: Source[] }> {
  const [audit, sources] = await Promise.all([
    checkedJson("/api/mock/audit", mockAuditSchema),
    checkedJson("/api/mock/sources", sourcesSchema),
  ]);
  return { answer: audit.answer_text, sources: sources.sources };
}

export async function listAudits() {
  return checkedJson("/api/audits", auditListSchema);
}

export async function listSources() {
  return checkedJson("/api/sources", sourceLibrarySchema);
}

export async function getSource(sourceId: string): Promise<Source> {
  return checkedJson(`/api/sources/${encodeURIComponent(sourceId)}`, sourcesSchema.shape.sources.element);
}

export async function getSourceFileUrl(sourceId: string) {
  return checkedJson(`/api/sources/${encodeURIComponent(sourceId)}/file-url`, fileUrlSchema);
}

export type AuditEventStream = { close: () => void };
export function streamAudit(auditId: string, onEvent: (event: string, data: unknown) => void, onFailure: () => void): AuditEventStream {
  const controller = new AbortController();
  let closed = false;
  void (async () => {
    try {
      const headers = new Headers({ Accept: "text/event-stream" });
      const token = await accessToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
      const response = await fetch(`${apiBaseUrl()}/api/audit/${encodeURIComponent(auditId)}/stream`, { headers, signal: controller.signal });
      if (!response.ok || !response.body) throw new Error("Audit stream unavailable");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const schemas: Record<string, z.ZodType<unknown>> = {
        claims: z.object({ claims: z.array(claimSchema) }), claim: claimSchema,
        findings: z.object({ answer_findings: z.array(findingSchema) }),
        done: z.object({ summary: summarySchema.nullable().optional() }),
        error: z.object({ error: z.object({ code: z.string().optional(), message: z.string().optional() }).optional() }).passthrough(),
      };
      while (!closed) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
          const eventName = frame.split("\n").find((line) => line.startsWith("event:"))?.slice(6).trim() ?? "message";
          const dataText = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
          const schema = schemas[eventName];
          if (schema && dataText) {
            const parsed = schema.safeParse(JSON.parse(dataText));
            if (!parsed.success) throw new Error("Invalid audit event");
            onEvent(eventName, parsed.data);
            if (eventName === "done" || eventName === "error") { closed = true; controller.abort(); break; }
          }
          boundary = buffer.indexOf("\n\n");
        }
      }
    } catch {
      if (!closed) onFailure();
    }
  })();
  return { close: () => { closed = true; controller.abort(); } };
}

export type { AuditResult, Source };
