"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, CircleHelp, FileText, X } from "lucide-react";
import { demoAnswer, demoAuditId, demoClaims, demoSources, splitAnswerByClaims, type DemoClaim, type DemoVerdict } from "@/lib/demo-audit";

const verdictInfo: Record<DemoVerdict, { label: string; mark: string }> = {
  supported: { label: "Supported", mark: "✓" },
  contradicted: { label: "Contradicted", mark: "×" },
  unsupported: { label: "Insufficient evidence", mark: "?" },
  ambiguous: { label: "Ambiguous", mark: "~" },
};

export default function AuditReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: auditId } = use(params);
  const [selectedId, setSelectedId] = useState(1);
  const [sourceOpen, setSourceOpen] = useState(false);
  const sourceTrigger = useRef<HTMLButtonElement>(null);
  const sourceDialog = useRef<HTMLElement>(null);
  const counts = useMemo(() => demoClaims.reduce((result, claim) => {
    result[claim.verdict] += 1;
    return result;
  }, { supported: 0, contradicted: 0, unsupported: 0, ambiguous: 0 }), []);
  const selectedClaim = demoClaims.find((claim) => claim.id === selectedId) ?? demoClaims[0];

  const closeSource = useCallback(() => {
    setSourceOpen(false);
    window.setTimeout(() => sourceTrigger.current?.focus(), 0);
  }, []);
  useEffect(() => {
    if (!sourceOpen) return;
    sourceDialog.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSource();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sourceOpen, closeSource]);
  const openSource = (claim: DemoClaim) => {
    setSelectedId(claim.id);
    setSourceOpen(true);
  };
  const answerParts = useMemo(() => splitAnswerByClaims(demoAnswer), []);

  if (auditId !== demoAuditId) return <main className="app-shell route-shell"><section className="route-content route-unavailable"><span className="eyebrow">AUDIT NOT FOUND</span><h1>This audit isn’t available in this demo.</h1><p>Start with the Northstar demo example to see the review and report screens.</p><Link className="primary-button" href="/">Return home <ArrowRight size={15}/></Link></section></main>;

  return <main className="app-shell route-shell">
    <header className="topbar route-topbar"><Link href="/" className="route-back"><ArrowLeft size={16}/> New audit</Link><div className="route-brand">SECOND OPINION <span>/</span> AUDIT REVIEW</div><Link className="route-report-link" href={`/report/${demoAuditId}`}>View report <ArrowRight size={14}/></Link></header>
    <section className="route-content audit-content">
      <div className="route-title-row"><div><span className="eyebrow"><Check size={14}/> SAMPLE AUDIT · COMPLETED</span><h1>Answer review</h1><p>Claims are checked against the sources provided in this example.</p></div><span className="route-id">ID · {demoAuditId}</span></div>
      <div className="summary-row route-summary"><div><span className="summary-total">{demoClaims.length}</span><span>claims reviewed</span></div><div className="summary-count supported-count"><i>✓</i>{counts.supported} supported</div><div className="summary-count contradicted-count"><i>×</i>{counts.contradicted} contradicted</div><div className="summary-count unsupported-count"><i>?</i>{counts.unsupported} insufficient</div><div className="summary-count ambiguous-count"><i>~</i>{counts.ambiguous} ambiguous</div></div>
      <div className="audit-review-grid">
        <div className="audit-main-column">
          <section className="route-card answer-review-card"><div className="route-card-heading"><div><span className="eyebrow">ANSWER</span><h2>AI-generated answer</h2></div><span className="route-mini-status"><Check size={13}/> Reviewed</span></div><p className="review-answer-text">{answerParts.map((part, index) => part.claim ? <mark key={`${part.claim.id}-${index}`} role="button" tabIndex={0} aria-pressed={selectedId === part.claim.id} aria-label={`Claim ${part.claim.id}: ${verdictInfo[part.claim.verdict].label}`} className={`claim-mark ${part.claim.verdict} ${selectedId === part.claim.id ? "is-selected" : ""}`} onClick={() => setSelectedId(part.claim!.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(part.claim!.id); } }}>{part.text}<sup>{part.claim.id}</sup></mark> : <span key={`text-${index}`}>{part.text}</span>)}</p><p className="route-footnote">Findings are relative to the supplied sources; this review does not independently establish real-world truth.</p></section>
          <section className="route-card claims-review-card"><div className="route-card-heading"><div><span className="eyebrow">CLAIM FINDINGS</span><h2>Select a claim to inspect its evidence</h2></div><span className="route-count">{demoClaims.length} claims</span></div><div className="claim-review-list">{demoClaims.map((claim) => <button key={claim.id} className={`claim-review-item ${selectedId === claim.id ? "is-current" : ""}`} onClick={() => setSelectedId(claim.id)} aria-pressed={selectedId === claim.id}><span className={`verdict-pill ${claim.verdict}`}><i>{verdictInfo[claim.verdict].mark}</i>{verdictInfo[claim.verdict].label}</span><span className="claim-review-copy"><strong>{claim.text}</strong><small>{claim.type} · {claim.confidence} confidence</small></span><ChevronRight size={16}/></button>)}</div></section>
          <section className="route-card safety-note"><CircleHelp size={16}/><div><strong>Reasoning and safety findings</strong><p>This sample audit does not include separate reasoning or safety findings.</p></div></section>
        </div>
        <aside className="route-card claim-evidence-card" aria-live="polite"><div className="route-card-heading"><div><span className="eyebrow">SELECTED CLAIM · {selectedClaim.id}</span><h2>Finding details</h2></div></div><span className={`verdict-pill ${selectedClaim.verdict}`}><i>{verdictInfo[selectedClaim.verdict].mark}</i>{verdictInfo[selectedClaim.verdict].label}</span><p className="detail-claim-text">{selectedClaim.text}</p><div className="detail-meta-grid"><div><span>Claim type</span><strong>{selectedClaim.type}</strong></div><div><span>Confidence</span><strong>{selectedClaim.confidence}</strong></div><div><span>Sources in example</span><strong>{demoSources.length} documents</strong></div></div><div className="detail-explanation"><span>Explanation</span><p>{selectedClaim.explanation}</p></div><div className="verified-evidence"><div className="evidence-source-heading"><FileText size={15}/><span>{selectedClaim.source}</span></div><span className="evidence-page-label">Page {selectedClaim.page} · sample evidence</span><blockquote>“{selectedClaim.quote}”</blockquote><button ref={sourceTrigger} className="source-open-button" onClick={() => openSource(selectedClaim)}><BookOpen size={14}/> View in source</button></div><Link href={`/report/${demoAuditId}`} className="primary-button evidence-report-link">Open audit report <ArrowRight size={15}/></Link></aside>
      </div>
    </section>
    {sourceOpen && <div className="modal-backdrop source-viewer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeSource(); }}><section ref={sourceDialog} className="report-modal source-viewer-modal" role="dialog" aria-modal="true" aria-labelledby="source-viewer-title" tabIndex={-1}><div className="report-modal-head"><div><span className="eyebrow">SOURCE VIEWER · PAGE {selectedClaim.page}</span><h2 id="source-viewer-title">{selectedClaim.source}</h2></div><button className="icon-button" aria-label="Close source viewer" onClick={closeSource}><X size={18}/></button></div><div className="source-viewer-body"><div className="source-viewer-page-label"><FileText size={15}/> Page {selectedClaim.page}</div><p className="source-context-unavailable">The demo includes the verified quote below. Surrounding page text isn’t available in this example.</p><blockquote className="source-viewer-quote">{selectedClaim.quote}</blockquote><span className="source-viewer-status"><Check size={14}/> Quote associated with claim {selectedClaim.id}</span></div></section></div>}
  </main>;
}
