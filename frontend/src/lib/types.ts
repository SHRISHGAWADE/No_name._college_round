/**
 * Types corresponding to docs/01_API_CONTRACT.md v1.1
 */

export type Verdict = "supported" | "contradicted" | "unsupported" | "ambiguous";

export type ErrorType =
  | "wrong_number"
  | "contradiction"
  | "fabricated_fact"
  | "unsupported_addition"
  | "logical_leap"
  | "unsafe_advice";

export type Flag =
  | "evidence_unverified"
  | "span_not_located"
  | "reasoning"
  | "unsafe"
  | "low_retrieval";

export interface AnswerSpan {
  start: number;
  end: number;
}

export interface Evidence {
  source_id: string;
  source_name: string;
  page: number;
  quote: string;
  start: number;
  end: number;
  quote_verified: boolean;
}

export interface Signals {
  quote_verified?: boolean | null;
  retrieval_score?: number | null;
  agreement?: string | null;
  jev?: unknown;
  hhem?: unknown;
}

export interface Claim {
  claim_id: string;
  text: string;
  answer_span: AnswerSpan | null;
  status: "pending" | "done" | "error";
  verdict: Verdict | null;
  error_type: ErrorType | null;
  flags: Flag[];
  confidence: number;
  confidence_label: "high" | "medium" | "low";
  explanation: string;
  evidence: Evidence[];
  signals: Signals;
}

export interface Finding {
  finding_id: string;
  type: "reasoning_gap" | "safety_warning";
  claim_id: string | null;
  span: AnswerSpan | null;
  explanation: string;
  suggestion: string;
}

export interface SummaryCounts {
  supported: number;
  contradicted: number;
  unsupported: number;
  ambiguous: number;
}

export interface Summary {
  counts: SummaryCounts;
  total_claims: number;
  supported_ratio: number;
  verdict: "supported" | "needs_review" | "unreliable";
}

export interface TraceStage {
  name: string;
  ms: number;
}

export interface Trace {
  total_ms: number;
  stages: TraceStage[];
  model: string;
  cache_hit: boolean;
}

export interface AuditResult {
  audit_id: string;
  status: "running" | "done" | "error";
  created_at: string;
  answer_text: string;
  source_ids: string[];
  claims: Claim[];
  answer_findings: Finding[];
  summary: Summary | null;
  trace: Trace | null;
  /** Short, safe error message present when status is "error" */
  error?: string | null;
}

export interface AuditCreateResponse {
  audit_id: string;
}

export interface Page {
  page: number;
  text: string;
}

export interface Source {
  source_id: string;
  name: string;
  pages: Page[];
}

export interface SourcesResponse {
  sources: Source[];
}
