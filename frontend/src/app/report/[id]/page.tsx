"use client";

import Link from "next/link";
import { use, useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, Check, Copy, FileText, MessageSquareText, Printer, ShieldCheck } from "lucide-react";
import { demoAnswer, demoAuditId, demoClaims, demoSources, type DemoVerdict } from "@/lib/demo-audit";

const verdictInfo: Record<DemoVerdict, { label: string; mark: string }> = {
  supported: { label: "Supported", mark: "✓" },
  contradicted: { label: "Contradicted", mark: "×" },
  unsupported: { label: "Insufficient evidence", mark: "?" },
  ambiguous: { label: "Ambiguous", mark: "~" },
};

export default function AuditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: auditId } = use(params);
  const [linkCopied, setLinkCopied] = useState(false);
  const counts = useMemo(() => demoClaims.reduce((result, claim) => {
    result[claim.verdict] += 1;
    return result;
  }, { supported: 0, contradicted: 0, unsupported: 0, ambiguous: 0 }), []);
  const copyReportLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1800);
    } catch {
      setLinkCopied(false);
    }
  };
  if (auditId !== demoAuditId) return <main className="app-shell route-shell"><section className="route-content route-unavailable"><span className="eyebrow">REPORT NOT FOUND</span><h1>This report isn’t available in this demo.</h1><p>Open the Northstar demo audit to view its report.</p><Link className="primary-button" href={`/audit/${demoAuditId}`}>Open demo audit <MessageSquareText size={15}/></Link></section></main>;

  return <main className="app-shell route-shell report-page-shell">
    <header className="topbar route-topbar"><Link href={`/audit/${demoAuditId}`} className="route-back"><ArrowLeft size={16}/> Back to review</Link><div className="route-brand">SECOND OPINION <span>/</span> AUDIT REPORT</div><button className="route-report-link print-report-button" onClick={() => window.print()}><Printer size={14}/> Print or save PDF <ArrowDown size={14}/></button></header>
    <section className="route-content report-content">
      <div className="route-title-row report-title-row"><div><span className="eyebrow"><ShieldCheck size={14}/> SAMPLE AUDIT · COMPLETED</span><h1>Audit report</h1><p>A source-grounded summary of the Northstar example review.</p></div><span className="route-id">ID · {demoAuditId}</span></div>
      <section className="route-card report-overview"><div className="report-overview-heading"><div><span className="eyebrow">REVIEW SUMMARY</span><h2>Answer checked against its supplied sources</h2></div><span className="report-complete-tag"><Check size={14}/> Complete</span></div><div className="summary-row route-summary report-summary"><div><span className="summary-total">{demoClaims.length}</span><span>claims reviewed</span></div><div className="summary-count supported-count"><i>✓</i>{counts.supported} supported</div><div className="summary-count contradicted-count"><i>×</i>{counts.contradicted} contradicted</div><div className="summary-count unsupported-count"><i>?</i>{counts.unsupported} insufficient</div><div className="summary-count ambiguous-count"><i>~</i>{counts.ambiguous} ambiguous</div></div><div className="report-meta-line"><span><FileText size={14}/> {demoSources.length} example sources</span><span>Northstar annual results</span><span>Demo review</span></div></section>
      <section className="route-card report-answer-card"><div className="route-card-heading"><div><span className="eyebrow">ANSWER REVIEWED</span><h2>AI-generated answer</h2></div><Link href={`/audit/${demoAuditId}`} className="text-button">Return to claims <ArrowDown className="report-return-icon" size={14}/></Link></div><p>{demoAnswer}</p></section>
      <section className="route-card report-findings"><div className="route-card-heading"><div><span className="eyebrow">FINDINGS</span><h2>Claim-by-claim results</h2></div><span className="route-count">{demoClaims.length} findings</span></div><div className="report-findings-list">{demoClaims.map((claim) => <article key={claim.id} className="report-finding"><div className="report-finding-top"><span className={`verdict-pill ${claim.verdict}`}><i>{verdictInfo[claim.verdict].mark}</i>{verdictInfo[claim.verdict].label}</span><span className="claim-type">{claim.type} · {claim.confidence} confidence</span></div><p className="report-finding-claim">{claim.text}</p><p className="report-finding-explanation">{claim.explanation}</p><div className="report-finding-evidence"><span><FileText size={13}/> {claim.source} · page {claim.page}</span><blockquote>“{claim.quote}”</blockquote></div></article>)}</div></section>
      <p className="report-method-note"><ShieldCheck size={15}/> Findings are relative to the supplied sources. This report does not independently establish real-world truth. Evidence shown here is part of the Northstar demo.</p>
      <div className="report-bottom-actions"><Link href={`/audit/${demoAuditId}`} className="text-button"><ArrowLeft size={14}/> Back to audit review</Link><button className="text-button report-copy-link" onClick={() => void copyReportLink()}><Copy size={14}/>{linkCopied ? "Link copied" : "Copy report link"}</button><button className="primary-button" onClick={() => window.print()}><Printer size={15}/> Print or save PDF</button></div>
    </section>
  </main>;
}
