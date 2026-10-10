"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, CircleHelp, FileText, RefreshCw, X } from "lucide-react";
import { correctClaim } from "@/lib/api";
import { useAudit, getAuditSources } from "@/lib/useAudit";
import type { Claim, Evidence, Source, Verdict } from "@/lib/types";

const verdictInfo: Record<Verdict, { label: string; mark: string }> = {
  supported: { label: "Supported", mark: "✓" }, contradicted: { label: "Contradicted", mark: "×" },
  unsupported: { label: "Insufficient evidence", mark: "?" }, ambiguous: { label: "Ambiguous", mark: "~" },
};
const severity: Record<Verdict, number> = { contradicted: 4, unsupported: 3, ambiguous: 2, supported: 1 };
function errorMessage(error: string) {
  const known: Record<string, string> = { no_text_layer: "This PDF has no readable text layer. Scanned PDFs are not supported.", file_too_large: "That file is over the upload size limit.", too_many_pages: "That document has too many pages to audit.", answer_too_long: "The answer is longer than the supported limit.", rate_limited: "Too many requests. Please wait a moment and try again." };
  return known[error] ?? error;
}
function answerParts(text: string, claims: Claim[]) {
  const chars = Array.from(text);
  const spans = claims.flatMap((claim) => {
    const span = claim.answer_span;
    if (!span || span.start < 0 || span.end <= span.start || span.end > chars.length) return [];
    return [{ claim, start: span.start, end: span.end }];
  }).sort((a, b) => a.start - b.start || severity[b.claim.verdict ?? "ambiguous"] - severity[a.claim.verdict ?? "ambiguous"]);
  const result: Array<{ text: string; claim?: Claim }> = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor) continue;
    if (span.start > cursor) result.push({ text: chars.slice(cursor, span.start).join("") });
    result.push({ text: chars.slice(span.start, span.end).join(""), claim: span.claim });
    cursor = span.end;
  }
  if (cursor < chars.length) result.push({ text: chars.slice(cursor).join("") });
  return result;
}
function quoteParts(pageText: string, evidence: Evidence) {
  const chars = Array.from(pageText);
  let start = evidence.start;
  let end = evidence.end;
  if (start < 0 || end <= start || end > chars.length || chars.slice(start, end).join("") !== evidence.quote) {
    const quote = Array.from(evidence.quote);
    start = -1;
    outer: for (let i = 0; i <= chars.length - quote.length; i += 1) {
      for (let j = 0; j < quote.length; j += 1) if (chars[i + j] !== quote[j]) continue outer;
      start = i; break;
    }
    end = start < 0 ? -1 : start + quote.length;
  }
  if (start < 0) return <p>{pageText}</p>;
  return <p>{chars.slice(0, start).join("")}<mark className="source-viewer-quote">{chars.slice(start, end).join("")}</mark>{chars.slice(end).join("")}</p>;
}

export default function AuditReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: auditId } = use(params);
  const { audit, error, loading, setAudit } = useAudit(auditId);
  const [selectedId, setSelectedId] = useState("");
  const [sourceOpen, setSourceOpen] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [correctionText, setCorrectionText] = useState("");
  const [correctionError, setCorrectionError] = useState("");
  const [source, setSource] = useState<Source | null>(null);
  const selectedClaim = audit?.claims.find((claim) => claim.claim_id === selectedId) ?? audit?.claims[0];
  const sources = useMemo(() => audit ? getAuditSources(audit.source_ids) : [], [audit?.audit_id, audit?.source_ids]);
  const counts = audit?.summary?.counts ?? audit?.claims.reduce((out, claim) => { if (claim.verdict) out[claim.verdict] += 1; return out; }, { supported: 0, contradicted: 0, unsupported: 0, ambiguous: 0 });
  useEffect(() => { if (audit?.claims.length && !audit.claims.some((claim) => claim.claim_id === selectedId)) setSelectedId(audit.claims[0].claim_id); }, [audit?.claims, selectedId]);
  useEffect(() => { if (!sourceOpen) return; const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setSourceOpen(false); }; window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown); }, [sourceOpen]);

  const runCorrection = async () => {
    if (!selectedClaim || !audit) return;
    setCorrecting(true); setCorrectionError(""); setCorrectionText("");
    try {
      const result = await correctClaim(audit.audit_id, selectedClaim.claim_id);
      setCorrectionText(result.corrected ? `${result.corrected}${result.recheck?.verdict === "supported" ? "\n\nRe-verified: supported." : result.recheck?.verdict ? `\n\nRe-check: ${result.recheck.verdict}.` : "\n\nThis suggestion was not re-verified."}` : "No source-grounded correction was available. The claim may need to be removed or checked against another source.");
      if (result.recheck) setAudit({ ...audit, claims: audit.claims.map((claim) => claim.claim_id === result.claim_id ? result.recheck! : claim) });
    } catch (cause) { setCorrectionError(cause instanceof Error ? cause.message : "Could not generate a correction. Please try again."); }
    finally { setCorrecting(false); }
  };
  const openSource = (evidence: Evidence) => { setSource(sources.find((item) => item.source_id === evidence.source_id) ?? null); setSourceOpen(true); };

  if (loading && !audit) return <main className="app-shell route-shell"><section className="route-content route-unavailable"><span className="eyebrow">AUDIT IN PROGRESS</span><h1>Loading your audit…</h1><p>Connecting to the backend and retrieving the latest results.</p></section></main>;
  if (!audit) return <main className="app-shell route-shell"><section className="route-content route-unavailable"><span className="eyebrow">AUDIT UNAVAILABLE</span><h1>We couldn’t open this audit.</h1><p>{error || "This audit may have expired or the backend is unavailable."}</p><Link className="primary-button" href="/">Return home <ArrowRight size={15}/></Link></section></main>;
  const isDone = audit.status === "done";
  const summaryLabel = audit.summary?.label === "contains_errors" ? "Contains errors" : audit.summary?.label === "partially_supported" ? "Partially supported" : audit.summary?.label === "reliable" ? "Reliable" : "Audit in progress";

  return <main className="app-shell route-shell audit-page-shell" data-page-route={`/audit/${auditId}`}>
    <header className="topbar route-topbar"><Link href="/" className="route-back"><ArrowLeft size={16}/> New audit</Link><div className="route-brand">SECOND OPINION <span>/</span> AUDIT REVIEW</div>{isDone && <Link className="route-report-link" href={`/report/${encodeURIComponent(auditId)}`}>View report <ArrowRight size={14}/></Link>}</header>
    <aside className="audit-sources-sidebar"><div className="audit-sources-heading"><span>Sources</span><small>{sources.length} uploaded</small></div><div className="audit-source-list">{sources.map((item) => <div className="audit-source-row" key={item.source_id}><FileText size={15}/><span className="audit-source-name" title={item.name}>{item.name}</span><span className="audit-source-count">{item.pages.length}p</span></div>)}</div><div className="audit-source-divider"/><p className="audit-source-note">Findings are relative to the supplied sources. Unsupported does not mean false.</p></aside>
    <section className="route-content audit-content">
      <div className="route-title-row"><div><span className="eyebrow"><Check size={14}/> {isDone ? "AUDIT COMPLETE" : audit.status === "error" ? "AUDIT FAILED" : "AUDIT IN PROGRESS"}</span><h1>Answer review</h1><p>{summaryLabel} · Results are grounded in the sources you provided.</p></div><span className="route-id">ID · {audit.audit_id}</span></div>
      {audit.status === "error" && <div role="alert" className="audit-error-banner">{errorMessage(audit.error || error || "This audit could not be completed. Please try again.")}</div>}
      <div className="summary-row route-summary"><div><span className="summary-total">{audit.summary ? Object.values(audit.summary.counts).reduce((a, b) => a + b, 0) : audit.claims.length}</span><span>claims reviewed</span></div><div className="summary-count supported-count"><i>✓</i>{counts?.supported ?? 0} supported</div><div className="summary-count contradicted-count"><i>×</i>{counts?.contradicted ?? 0} contradicted</div><div className="summary-count unsupported-count"><i>?</i>{counts?.unsupported ?? 0} insufficient</div><div className="summary-count ambiguous-count"><i>~</i>{counts?.ambiguous ?? 0} ambiguous</div></div>
      {!audit.claims.length && audit.status === "running" && <p className="audit-progress-note"><RefreshCw size={14}/> Extracting claims from the answer…</p>}
      <div className="audit-review-grid"><div className="audit-main-column">
        <section className="route-card answer-review-card"><div className="route-card-heading"><div><span className="eyebrow">ANSWER</span><h2>AI-generated answer</h2></div><span className="route-mini-status">{isDone ? <><Check size={13}/> Reviewed</> : <><RefreshCw size={13}/> Processing</>}</span></div><p className="review-answer-text">{answerParts(audit.answer_text, audit.claims).map((part, index) => part.claim ? <mark key={`${part.claim.claim_id}-${index}`} role="button" tabIndex={0} aria-pressed={selectedClaim?.claim_id === part.claim.claim_id} aria-label={`Claim ${part.claim.claim_id}: ${part.claim.verdict ? verdictInfo[part.claim.verdict].label : part.claim.status}`} className={`claim-mark ${part.claim.verdict ?? "pending"} ${selectedClaim?.claim_id === part.claim.claim_id ? "is-selected" : ""}`} onClick={() => setSelectedId(part.claim!.claim_id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(part.claim!.claim_id); } }}>{part.text}<sup>{part.claim.claim_id}</sup></mark> : <span key={`text-${index}`}>{part.text}</span>)}</p><p className="route-footnote">Findings are relative to the supplied sources; this review does not independently establish real-world truth.</p></section>
        <section className="route-card claims-review-card"><div className="route-card-heading"><div><span className="eyebrow">CLAIM FINDINGS</span><h2>Select a claim to inspect its evidence</h2></div><span className="route-count">{audit.claims.length} claims</span></div><div className="claim-review-list">{audit.claims.map((claim) => <button key={claim.claim_id} className={`claim-review-item ${selectedClaim?.claim_id === claim.claim_id ? "is-current" : ""}`} onClick={() => setSelectedId(claim.claim_id)} aria-pressed={selectedClaim?.claim_id === claim.claim_id}><span className={`verdict-pill ${claim.verdict ?? "pending"}`}><i>{claim.verdict ? verdictInfo[claim.verdict].mark : "…"}</i>{claim.verdict ? verdictInfo[claim.verdict].label : claim.status === "error" ? "Could not verify" : "Checking"}</span><span className="claim-review-copy"><strong>{claim.text}</strong><small>{claim.error_type?.replaceAll("_", " ") ?? "Claim check"} · {claim.confidence_label} confidence</small></span><ChevronRight size={16}/></button>)}</div></section>
        {audit.answer_findings.length > 0 && <section className="route-card safety-note"><CircleHelp size={16}/><div><strong>Reasoning and safety findings</strong>{audit.answer_findings.map((finding, index) => <p key={`${finding.type}-${index}`}><b>{finding.type === "safety" ? "Safety" : "Reasoning"} · {finding.severity}:</b> {finding.explanation}</p>)}</div></section>}
      </div>
      <aside className="route-card claim-evidence-card" aria-live="polite"><div className="route-card-heading"><div><span className="eyebrow">{selectedClaim ? `SELECTED CLAIM · ${selectedClaim.claim_id}` : "CLAIM DETAILS"}</span><h2>Finding details</h2></div></div>{selectedClaim ? <>
        <span className={`verdict-pill ${selectedClaim.verdict ?? "pending"}`}><i>{selectedClaim.verdict ? verdictInfo[selectedClaim.verdict].mark : "…"}</i>{selectedClaim.verdict ? verdictInfo[selectedClaim.verdict].label : selectedClaim.status === "error" ? "Could not verify" : "Checking"}</span><p className="detail-claim-text">{selectedClaim.text}</p>
        <div className="detail-meta-grid"><div><span>Error category</span><strong>{selectedClaim.error_type?.replaceAll("_", " ") ?? "—"}</strong></div><div><span>Confidence</span><strong>{selectedClaim.confidence_label}</strong></div><div><span>Evidence</span><strong>{selectedClaim.evidence.filter((item) => item.quote_verified).length} verified quotes</strong></div></div>
        <div className="detail-explanation"><span>Explanation</span><p>{selectedClaim.explanation || (selectedClaim.status === "error" ? "This claim could not be verified." : "Verification is in progress.")}</p>{selectedClaim.flags.length > 0 && <small>{selectedClaim.flags.map((flag) => flag.replaceAll("_", " ")).join(" · ")}</small>}</div>
        {selectedClaim.evidence.filter((item) => item.quote_verified).map((evidence, index) => <div className="verified-evidence" key={`${evidence.source_id}-${evidence.page}-${index}`}><div className="evidence-source-heading"><FileText size={15}/><span>{evidence.source_name}</span></div><span className="evidence-page-label">Page {evidence.page} · verified quote</span><blockquote>“{evidence.quote}”</blockquote><button className="source-open-button" onClick={() => openSource(evidence)}><BookOpen size={14}/> View in source</button></div>)}
        {selectedClaim.status === "done" && (selectedClaim.verdict === "contradicted" || selectedClaim.verdict === "unsupported") && <div className="correction-area"><button className="correct-button" disabled={correcting} onClick={() => void runCorrection()}>{correcting ? "Generating correction…" : "Correct & re-audit"} <ArrowRight size={14}/></button>{correctionText && <p className="correction-result">{correctionText}</p>}{correctionError && <p role="alert" className="audit-error-banner">{correctionError}</p>}</div>}
      </> : <p>No claim is selected yet. The backend may still be extracting the answer.</p>}</aside></div>
      {audit.trace && <details className="route-card trace-details"><summary>How this was checked · {audit.trace.model} · {(audit.trace.total_ms / 1000).toFixed(1)}s</summary><div>{audit.trace.stages.map((stage) => <span key={stage.name}>{stage.name.replaceAll("_", " ")}: {stage.ms} ms</span>)}</div></details>}
    </section>
    {sourceOpen && <div className="modal-backdrop source-viewer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSourceOpen(false); }}><section className="report-modal source-viewer-modal" role="dialog" aria-modal="true" aria-labelledby="source-viewer-title"><div className="report-modal-head"><div><span className="eyebrow">SOURCE VIEWER</span><h2 id="source-viewer-title">{source?.name ?? "Source text unavailable"}</h2></div><button className="icon-button" aria-label="Close source viewer" onClick={() => setSourceOpen(false)}><X size={18}/></button></div>{selectedClaim?.evidence.filter((item) => item.quote_verified).map((evidence, index) => { const page = source?.pages.find((item) => item.page === evidence.page); return <div className="source-viewer-body" key={`${evidence.page}-${index}`}><div className="source-viewer-page-label"><FileText size={15}/> Page {evidence.page}</div>{page ? quoteParts(page.text, evidence) : <><p className="source-context-unavailable">Source page text is not available in this browser session. The backend verified this exact quote:</p><blockquote className="source-viewer-quote">{evidence.quote}</blockquote></>}</div>; })}</section></div>}
  </main>;
}
