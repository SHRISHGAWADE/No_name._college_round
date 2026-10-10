/** Types matching the FastAPI response models in docs/01_API_CONTRACT.md. */
export type Verdict = "supported" | "contradicted" | "unsupported" | "ambiguous";
export type ErrorType = "wrong_number" | "contradiction" | "fabricated_fact" | "unsupported_addition" | "logical_leap" | "unsafe_advice";
export interface AnswerSpan { start: number; end: number }
export interface Evidence { source_id: string; source_name: string; page: number; quote: string; start: number; end: number; quote_verified: boolean }
export interface Signals { quote_verified?: boolean | null; retrieval_score?: number | null; agreement?: string | null; jev?: unknown; hhem?: unknown }
export interface Claim {
  claim_id: string; text: string; answer_span: AnswerSpan | null; status: "pending" | "done" | "error";
  verdict: Verdict | null; error_type: ErrorType | null; flags: string[]; confidence: number;
  confidence_label: "high" | "medium" | "low"; explanation: string; evidence: Evidence[]; signals?: Signals | null;
}
export interface Finding { type: "reasoning" | "safety"; answer_span: AnswerSpan; severity: "low" | "medium" | "high"; explanation: string }
export interface SummaryCounts { supported: number; contradicted: number; unsupported: number; ambiguous: number }
export interface Summary { label: "reliable" | "partially_supported" | "contains_errors"; counts: SummaryCounts; supported_ratio: number }
export interface TraceStage { name: string; ms: number }
export interface Trace { model: string; total_ms: number; stages: TraceStage[] }
export interface AuditResult {
  audit_id: string; status: "running" | "done" | "error"; created_at: string; answer_text: string; source_ids: string[];
  claims: Claim[]; answer_findings: Finding[]; summary: Summary | null; trace: Trace | null; error?: string | null;
}
export interface AuditCreateResponse { audit_id: string }
export interface Page { page: number; text: string }
export interface Source { source_id: string; name: string; pages: Page[] }
export interface SourcesResponse { sources: Source[] }
export interface CorrectionResponse { claim_id: string; original: string; corrected: string | null; evidence: Evidence[]; recheck: Claim | null }
