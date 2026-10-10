"use client";

import Link from "next/link";
import { use } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

export default function AuditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <main className="app-shell route-shell report-page-shell" data-page-route={`/report/${id}`}>
    <header className="topbar route-topbar">
      <Link href={`/audit/${id}`} className="route-back"><ArrowLeft size={16}/> Back to review</Link>
      <div className="route-brand">SECOND OPINION <span>/</span> AUDIT REPORT</div>
    </header>
    <section className="route-content route-unavailable">
      <span className="eyebrow">AUDIT REPORT</span>
      <h1>No report data available</h1>
      <p>This audit has no report data to display.</p>
      <Link className="primary-button" href={`/audit/${id}`}>Return to review <ArrowRight size={15}/></Link>
    </section>
  </main>;
}
