"use client";

import Link from "next/link";
import { use, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CircleHelp, FileText } from "lucide-react";
import { useAudit } from "@/lib/useAudit";
import type { Verdict } from "@/lib/types";

const verdictLabel: Record<Verdict, string> = {
  supported: "Supported",
  contradicted: "Contradicted",
  unsupported: "Insufficient evidence",
  ambiguous: "Ambiguous",
};

export default function AuditReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { audit, error, loading } = useAudit(id);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const selectedClaim = audit?.claims.find((claim) => claim.claim_id === selectedClaimId) ?? audit?.claims[0] ?? null;
  const countVerdict = (verdict: Verdict) => audit?.claims.filter((claim) => claim.verdict === verdict).length ?? 0;
  const statusLabel = error ? "Unable to load" : loading ? "Loading audit" : audit?.status === "running" ? "Review in progress" : audit?.status === "error" ? "Review failed" : "Review complete";

  return <main className="app-shell route-shell audit-review-page" data-page-route={`/audit/${id}`}>
    <header className="topbar route-topbar">
      <Link href="/" className="route-back"><ArrowLeft size={16}/> New audit</Link>
      <div className="route-brand">SECOND OPINION <span>/</span> AUDIT REVIEW</div>
    </header>

    <section className="route-content audit-review-content">
      <div className="route-title-row audit-review-heading">
        <div>
          <span className="eyebrow"><Check size={13}/> AUDIT REVIEW</span>
          <h1>Answer review</h1>
          <p>{error || (loading ? "Loading the audit results…" : audit?.status === "running" ? "The audit is checking claims against your sources." : audit?.status === "error" ? audit.error || "The audit could not be completed." : "Claims and evidence from your audit are shown below.")}</p>
        </div>
        <span className="route-id">ID · {id}</span>
      </div>

      <section className="route-card audit-review-summary" aria-label="Review summary">
        <div className="audit-review-total"><strong>{audit?.claims.length ?? (loading ? "…" : 0)}</strong><span>claims reviewed</span></div>
        <div className="audit-review-verdicts" aria-label="Audit verdict counts">
          <span className="audit-verdict audit-verdict-supported"><Check size={11}/> {countVerdict("supported")} supported</span>
          <span className="audit-verdict audit-verdict-contradicted">× {countVerdict("contradicted")} contradicted</span>
          <span className="audit-verdict audit-verdict-insufficient">? {countVerdict("unsupported")} insufficient</span>
          <span className="audit-verdict audit-verdict-ambiguous">◦ {countVerdict("ambiguous")} ambiguous</span>
        </div>
        <span className="audit-empty-badge">{statusLabel}</span>
      </section>

      <div className="audit-review-grid">
        <div className="audit-review-main-column">
          <section className="route-card audit-answer-card">
            <div className="audit-card-heading">
              <div><span className="eyebrow">ANSWER</span><h2>AI-generated answer</h2></div>
              <span className="audit-empty-badge">{audit?.status === "done" ? "Reviewed" : statusLabel}</span>
            </div>
            {audit ? <p className="audit-answer-live">{audit.answer_text}</p> : <div className="audit-empty-answer"><FileText size={20}/><p>{error || (loading ? "Loading answer…" : "No audit data is available for this review.")}</p></div>}
            <p className="audit-card-note">Claims are checked against the source documents submitted with this audit.</p>
          </section>

          <section className="route-card audit-claims-card">
            <div className="audit-card-heading">
              <div><span className="eyebrow">CLAIM FINDINGS</span><h2>Select a claim to inspect its evidence</h2></div>
              <span className="route-count">{audit?.claims.length ?? 0} claims</span>
            </div>
            {audit?.claims.length ? <div className="audit-claim-list">
              {audit.claims.map((claim) => <button
                type="button"
                key={claim.claim_id}
                className={`audit-claim-row${selectedClaim?.claim_id === claim.claim_id ? " is-selected" : ""}`}
                onClick={() => setSelectedClaimId(claim.claim_id)}
              >
                <span className={`audit-verdict audit-verdict-${claim.verdict === "unsupported" ? "insufficient" : claim.verdict ?? "ambiguous"}`}>{claim.verdict ? verdictLabel[claim.verdict] : claim.status}</span>
                <span className="audit-claim-text">{claim.text}</span>
                <ArrowRight size={14}/>
              </button>)}
            </div> : <div className="audit-empty-claims"><CircleHelp size={18}/><span>{error || (loading ? "Waiting for claim findings…" : "No claim findings are available yet.")}</span></div>}
          </section>
        </div>

        <aside className="route-card audit-finding-card">
          <span className="eyebrow">SELECTED CLAIM</span>
          <h2>Finding details</h2>
          {selectedClaim ? <>
            <div className={`audit-verdict audit-verdict-${selectedClaim.verdict === "unsupported" ? "insufficient" : selectedClaim.verdict ?? "ambiguous"}`}>{selectedClaim.verdict ? verdictLabel[selectedClaim.verdict] : selectedClaim.status}</div>
            <p className="audit-selection-hint">{selectedClaim.text}</p>
            <div className="audit-detail-placeholder"><span>CONFIDENCE</span><strong>{selectedClaim.confidence_label}</strong></div>
            <p className="audit-selection-hint">{selectedClaim.explanation || "No explanation was provided."}</p>
            {selectedClaim.evidence.map((evidence, index) => <div className="audit-source-placeholder" key={`${evidence.source_id}-${index}`}>
              <FileText size={15}/><span><strong>{evidence.source_name}</strong><br/>Page {evidence.page}: “{evidence.quote}”</span>
            </div>)}
          </> : <>
            <div className="audit-empty-selection"><CircleHelp size={16}/><span>{error ? "Audit unavailable" : loading ? "Loading audit" : "No claim selected"}</span></div>
            <p className="audit-selection-hint">{error || "Claim verdicts, explanations, and source evidence will appear here when available."}</p>
          </>}
          <button className="primary-button audit-report-button" type="button" disabled>Open audit report <ArrowRight size={15}/></button>
        </aside>
      </div>

      <section className="route-card audit-reasoning-card">
        <CircleHelp size={17}/><div><strong>Reasoning and safety findings</strong>
          {audit?.answer_findings.length ? audit.answer_findings.map((finding, index) => <p key={`${finding.type}-${index}`}>{finding.type}: {finding.explanation}</p>) : <p>{loading ? "Checking for separate reasoning or safety findings…" : "No separate reasoning or safety findings were returned for this audit."}</p>}
        </div>
      </section>
    </section>
  </main>;
}
