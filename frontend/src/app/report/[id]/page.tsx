"use client";

import Link from "next/link";
import { use, useMemo } from "react";
import { ArrowDown, ArrowLeft, Check, FileText, Printer, ShieldCheck } from "lucide-react";
import { useAudit } from "@/lib/useAudit";
import type { Claim, Verdict } from "@/lib/types";

const verdictInfo: Record<Verdict, { label: string; mark: string }> = {
  supported: { label: "Supported", mark: "✓" }, contradicted: { label: "Contradicted", mark: "×" },
  unsupported: { label: "Insufficient evidence", mark: "?" }, ambiguous: { label: "Ambiguous", mark: "~" },
};
function answerParts(text: string, claims: Claim[]) {
  const chars = Array.from(text);
  const spans = claims.flatMap((claim) => claim.answer_span && claim.answer_span.start >= 0 && claim.answer_span.end > claim.answer_span.start && claim.answer_span.end <= chars.length ? [{ claim, start: claim.answer_span.start, end: claim.answer_span.end }] : []).sort((a, b) => a.start - b.start);
  const parts: Array<{ text: string; claim?: Claim }> = [];
  let cursor = 0;
  for (const span of spans) { if (span.start < cursor) continue; if (span.start > cursor) parts.push({ text: chars.slice(cursor, span.start).join("") }); parts.push({ text: chars.slice(span.start, span.end).join(""), claim: span.claim }); cursor = span.end; }
  if (cursor < chars.length) parts.push({ text: chars.slice(cursor).join("") });
  return parts;
}

export default function AuditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: auditId } = use(params);
  const { audit, error, loading } = useAudit(auditId);
  const counts = useMemo(() => audit?.summary?.counts ?? audit?.claims.reduce((out, claim) => { if (claim.verdict) out[claim.verdict] += 1; return out; }, { supported: 0, contradicted: 0, unsupported: 0, ambiguous: 0 }), [audit?.summary, audit?.claims]);

  if (loading && !audit) return <main className="app-shell route-shell"><section className="route-content route-unavailable"><span className="eyebrow">LOADING REPORT</span><h1>Retrieving your audit…</h1></section></main>;
  if (!audit) return <main className="app-shell route-shell"><section className="route-content route-unavailable"><span className="eyebrow">REPORT UNAVAILABLE</span><h1>We couldn’t open this report.</h1><p>{error || "This audit may have expired or the backend is unavailable."}</p><Link className="primary-button" href="/">Start a new audit</Link></section></main>;
  if (audit.status === "error") return <main className="app-shell route-shell"><section className="route-content route-unavailable"><span className="eyebrow">AUDIT FAILED</span><h1>This report could not be completed.</h1><p>{audit.error || error || "The audit failed. Please start a new one."}</p><Link className="primary-button" href="/">Start a new audit</Link></section></main>;
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : audit.claims.length;

  return <main className="app-shell route-shell report-page-shell" data-page-route={`/report/${auditId}`}>
    <header className="topbar route-topbar"><Link href={`/audit/${encodeURIComponent(auditId)}`} className="route-back"><ArrowLeft size={16}/> Back to review</Link><div className="route-brand">SECOND OPINION <span>/</span> AUDIT REPORT</div><button className="route-report-link print-report-button" onClick={() => window.print()}><Printer size={14}/> Print or save PDF <ArrowDown size={14}/></button></header>
    <section className="route-content report-content">
      <div className="route-title-row report-title-row"><div><span className="eyebrow"><ShieldCheck size={14}/> {audit.status === "done" ? "AUDIT COMPLETE" : "AUDIT IN PROGRESS"}</span><h1>Audit report</h1><p>A source-grounded report generated from this audit.</p></div><span className="route-id">ID · {audit.audit_id}</span></div>
      <section className="route-card report-overview"><div className="report-overview-heading"><div><span className="eyebrow">REVIEW SUMMARY</span><h2>{audit.summary?.label === "contains_errors" ? "Contains errors" : audit.summary?.label === "partially_supported" ? "Partially supported" : audit.summary?.label === "reliable" ? "Reliable against supplied sources" : "Audit in progress"}</h2></div><span className="report-complete-tag">{audit.status === "done" ? <><Check size={14}/> Complete</> : "In progress"}</span></div><div className="summary-row route-summary report-summary"><div><span className="summary-total">{total}</span><span>claims reviewed</span></div><div className="summary-count supported-count"><i>✓</i>{counts?.supported ?? 0} supported</div><div className="summary-count contradicted-count"><i>×</i>{counts?.contradicted ?? 0} contradicted</div><div className="summary-count unsupported-count"><i>?</i>{counts?.unsupported ?? 0} insufficient</div><div className="summary-count ambiguous-count"><i>~</i>{counts?.ambiguous ?? 0} ambiguous</div></div><div className="report-meta-line"><span><FileText size={14}/> {audit.source_ids.length} source documents</span><span>{new Date(audit.created_at).toLocaleString()}</span></div></section>
      <section className="route-card report-answer-card"><div className="route-card-heading"><div><span className="eyebrow">ANSWER REVIEWED</span><h2>AI-generated answer</h2></div><Link href={`/audit/${encodeURIComponent(auditId)}`} className="text-button">Return to claims <ArrowDown className="report-return-icon" size={14}/></Link></div><p>{answerParts(audit.answer_text, audit.claims).map((part, index) => part.claim?.verdict ? <mark key={`${part.claim.claim_id}-${index}`} className={`claim-mark ${part.claim.verdict}`}>{part.text}</mark> : <span key={`text-${index}`}>{part.text}</span>)}</p></section>
      <section className="route-card report-findings"><div className="route-card-heading"><div><span className="eyebrow">FINDINGS</span><h2>Claim-by-claim results</h2></div><span className="route-count">{audit.claims.length} claims</span></div><div className="report-findings-list">{audit.claims.map((claim) => <article key={claim.claim_id} className="report-finding"><div className="report-finding-top"><span className={`verdict-pill ${claim.verdict ?? "pending"}`}><i>{claim.verdict ? verdictInfo[claim.verdict].mark : "…"}</i>{claim.verdict ? verdictInfo[claim.verdict].label : claim.status === "error" ? "Could not verify" : "Checking"}</span><span className="claim-type">{claim.error_type?.replaceAll("_", " ") ?? "Claim check"} · {claim.confidence_label} confidence</span></div><p className="report-finding-claim">{claim.text}</p><p className="report-finding-explanation">{claim.explanation || "No explanation was returned."}</p>{claim.evidence.filter((item) => item.quote_verified).map((evidence, index) => <div className="report-finding-evidence" key={`${evidence.source_id}-${evidence.page}-${index}`}><span><FileText size={13}/> {evidence.source_name} · page {evidence.page}</span><blockquote>“{evidence.quote}”</blockquote></div>)}</article>)}</div></section>
      {audit.answer_findings.length > 0 && <section className="route-card report-findings"><div className="route-card-heading"><div><span className="eyebrow">ANSWER-LEVEL FINDINGS</span><h2>Reasoning and safety</h2></div></div>{audit.answer_findings.map((finding, index) => <article className="report-finding" key={`${finding.type}-${index}`}><div className="report-finding-top"><span className="verdict-pill ambiguous">{finding.type} · {finding.severity}</span></div><p className="report-finding-explanation">{finding.explanation}</p></article>)}</section>}
      <p className="report-method-note"><ShieldCheck size={15}/> Findings are relative to the supplied sources. Unsupported does not mean false; this report does not independently establish real-world truth.</p>
      <div className="report-bottom-actions"><Link href={`/audit/${encodeURIComponent(auditId)}`} className="text-button"><ArrowLeft size={14}/> Back to audit review</Link><Link href="/" className="text-button">Start a new audit</Link><button className="primary-button" onClick={() => window.print()}><Printer size={15}/> Print or save PDF</button></div>
    </section>
  </main>;
}
