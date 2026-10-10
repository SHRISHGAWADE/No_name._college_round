"use client";

import Link from "next/link";
import { use } from "react";
import { ArrowLeft, ArrowRight, Check, CircleHelp, FileText } from "lucide-react";

export default function AuditReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
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
          <p>Claims and evidence from this audit will appear here when available.</p>
        </div>
        <span className="route-id">ID · {id}</span>
      </div>

      <section className="route-card audit-review-summary" aria-label="Review summary">
        <div className="audit-review-total"><strong>0</strong><span>claims reviewed</span></div>
        <div className="audit-review-verdicts" aria-label="No claim verdicts yet">
          <span className="audit-verdict audit-verdict-supported"><Check size={11}/> 0 supported</span>
          <span className="audit-verdict audit-verdict-contradicted">× 0 contradicted</span>
          <span className="audit-verdict audit-verdict-insufficient">? 0 insufficient</span>
          <span className="audit-verdict audit-verdict-ambiguous">◦ 0 ambiguous</span>
        </div>
      </section>

      <div className="audit-review-grid">
        <div className="audit-review-main-column">
          <section className="route-card audit-answer-card">
            <div className="audit-card-heading">
              <div><span className="eyebrow">ANSWER</span><h2>AI-generated answer</h2></div>
              <span className="audit-empty-badge">Awaiting data</span>
            </div>
            <div className="audit-empty-answer"><FileText size={20}/><p>Answer content will appear here when a review is available.</p></div>
            <p className="audit-card-note">This review will show how each claim relates to its source evidence.</p>
          </section>

          <section className="route-card audit-claims-card">
            <div className="audit-card-heading">
              <div><span className="eyebrow">CLAIM FINDINGS</span><h2>Select a claim to inspect its evidence</h2></div>
              <span className="route-count">0 claims</span>
            </div>
            <div className="audit-empty-claims"><CircleHelp size={18}/><span>Claim findings will appear here when available.</span></div>
          </section>
        </div>

        <aside className="route-card audit-finding-card">
          <span className="eyebrow">SELECTED CLAIM</span>
          <h2>Finding details</h2>
          <div className="audit-empty-selection"><CircleHelp size={16}/><span>No claim selected</span></div>
          <p className="audit-selection-hint">Select a claim to see its verdict, explanation, and supporting source details.</p>
          <div className="audit-detail-placeholder"><span>CLAIM TYPE</span><strong>—</strong></div>
          <div className="audit-detail-placeholder"><span>CONFIDENCE</span><strong>—</strong></div>
          <div className="audit-source-placeholder"><FileText size={15}/><span>Source evidence will appear here when available.</span></div>
          <button className="primary-button audit-report-button" type="button" disabled>Open audit report <ArrowRight size={15}/></button>
        </aside>
      </div>

      <section className="route-card audit-reasoning-card">
        <CircleHelp size={17}/><div><strong>Reasoning and safety findings</strong><p>Any separate reasoning or safety findings will appear here when available.</p></div>
      </section>
    </section>
  </main>;
}
