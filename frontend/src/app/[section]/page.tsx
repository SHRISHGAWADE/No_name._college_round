"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, Bookmark, Check, ChevronRight, Clock3, Database, FileText, Filter, Search, Settings, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, UserRound } from "lucide-react";
import { demoAuditId, demoClaims, demoSources, type DemoVerdict } from "@/lib/demo-audit";

type SectionKey = "history" | "sources" | "saved" | "activity" | "settings" | "account";
const titles: Record<SectionKey, string> = { history: "Recent audits", sources: "Source library", saved: "Saved", activity: "Activity", settings: "Settings", account: "Account" };
const verdictInfo: Record<DemoVerdict, { label: string; mark: string }> = { supported: { label: "Supported", mark: "✓" }, contradicted: { label: "Contradicted", mark: "×" }, unsupported: { label: "Insufficient evidence", mark: "?" }, ambiguous: { label: "Ambiguous", mark: "~" } };

function PrototypeTag() { return <span className="prototype-tag"><Sparkles size={12}/> PAGE STRUCTURE PREVIEW · SAMPLE DATA</span>; }

export default function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section: rawSection } = use(params);
  const section = rawSection as SectionKey;
  if (!(section in titles)) return <main className="app-shell route-shell"><section className="route-content route-unavailable"><span className="eyebrow">PAGE NOT FOUND</span><h1>This page isn’t available.</h1><Link className="primary-button" href="/">Return home <ArrowRight size={15}/></Link></section></main>;

  return <main className="app-shell route-shell prototype-page-shell">
    <header className="topbar route-topbar"><Link href="/" className="route-back"><ArrowRight className="route-home-arrow" size={15}/> New audit</Link><div className="route-brand">SECOND OPINION <span>/</span> {titles[section].toUpperCase()}</div><PrototypeTag/></header>
    <section className="route-content prototype-content">
      <div className="route-title-row"><div><span className="eyebrow"><Sparkles size={14}/> WORKSPACE</span><h1>{titles[section]}</h1><p>{sectionDescription[section]}</p></div><span className="route-id">PROTOTYPE PAGE</span></div>
      <PrototypeTag />
      {section === "history" && <HistoryPreview/>}
      {section === "sources" && <SourcesPreview/>}
      {section === "saved" && <SavedPreview/>}
      {section === "activity" && <ActivityPreview/>}
      {section === "settings" && <SettingsPreview/>}
      {section === "account" && <AccountPreview/>}
    </section>
  </main>;
}

const sectionDescription: Record<SectionKey, string> = {
  history: "Reopen an audit and continue from its findings.",
  sources: "Browse the documents used in your answer reviews.",
  saved: "Keep useful claims and reports close at hand.",
  activity: "Follow the key steps in your audit reviews.",
  settings: "Manage your workspace preferences.",
  account: "View the account and workspace details for this preview.",
};

function HistoryPreview() {
  const [query, setQuery] = useState("");
  const rows = [
    { title: "Northstar annual results", date: "Current demo session", status: "Complete", count: "5 claims", id: demoAuditId },
    { title: "Quarterly product update", date: "Sample entry", status: "Preview", count: "8 claims", id: "sample-product" },
    { title: "Vendor security summary", date: "Sample entry", status: "Preview", count: "4 claims", id: "sample-security" },
  ].filter((row) => row.title.toLowerCase().includes(query.toLowerCase()));
  return <>
    <div className="prototype-summary-grid"><div className="route-card prototype-stat"><span>Audits shown</span><strong>03</strong><small>Includes sample rows</small></div><div className="route-card prototype-stat"><span>Latest review</span><strong>Northstar</strong><small>Current demo session</small></div><div className="route-card prototype-stat"><span>Storage</span><strong>Preview</strong><small>Not saved between sessions</small></div></div>
    <section className="route-card prototype-list-card"><div className="prototype-list-toolbar"><div><span className="eyebrow">AUDIT LOG</span><h2>All reviews</h2></div><label className="prototype-search"><Search size={15}/><input aria-label="Search audits" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search audits"/></label></div><div className="prototype-history-cards">{rows.map((row) => <Link href={row.id === demoAuditId ? `/audit/${demoAuditId}` : "#prototype"} onClick={(event) => { if (row.id !== demoAuditId) event.preventDefault(); }} className="preview-card prototype-history-card" key={row.id}><div className="prototype-history-card-top"><span className="prototype-file-icon"><FileText size={16}/></span><span className={`prototype-status ${row.status === "Complete" ? "complete" : "preview"}`}><i/>{row.status}</span></div><strong className="prototype-history-title">{row.title}</strong><span className="prototype-history-source">{row.id === demoAuditId ? "Northstar Annual Report 2024.pdf" : "Sample audit · prototype data"}</span><div className="prototype-history-footer"><span>{row.count}</span><span>{row.date}</span><span className="prototype-history-open"><ChevronRight size={15}/></span></div></Link>)}</div><p className="prototype-footnote"><Clock3 size={13}/> History persistence is shown as a layout preview.</p></section>
  </>;
}

function SourcesPreview() {
  const [query, setQuery] = useState("");
  const sources = demoSources.map((name, index) => ({ name, type: ["PDF", "DOCX", "XLSX"][index], pages: [34, 48, 12][index], cited: [3, 1, 1][index], color: ["red", "blue", "green"][index] })).filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));
  return <>
    <div className="prototype-summary-grid"><div className="route-card prototype-stat"><span>Documents</span><strong>03</strong><small>Files in Northstar sample</small></div><div className="route-card prototype-stat"><span>Referenced claims</span><strong>05</strong><small>Across this demo audit</small></div><div className="route-card prototype-stat"><span>Storage status</span><strong>Preview</strong><small>No reusable file storage</small></div></div>
    <section className="route-card prototype-list-card"><div className="prototype-list-toolbar"><div><span className="eyebrow">SOURCE LIBRARY</span><h2>Documents in the example audit</h2></div><label className="prototype-search"><Search size={15}/><input aria-label="Search sources" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sources"/></label></div><div className="prototype-source-list">{sources.map((source) => <article className="prototype-source-row" key={source.name}><span className={`prototype-doc-icon ${source.color}`}><FileText size={18}/></span><div className="prototype-source-copy"><strong>{source.name}</strong><small>{source.type} · {source.pages} pages · Northstar demo</small></div><span className="prototype-citation-count">{source.cited} cited claims</span><Link href={`/audit/${demoAuditId}`} className="prototype-open-link" aria-label={`View claims in ${source.name}`}><ChevronRight size={16}/></Link></article>)}</div><p className="prototype-footnote"><Database size={13}/> Source storage and upload management are shown as a layout preview.</p></section>
  </>;
}

function SavedPreview() {
  const [saved, setSaved] = useState(() => demoClaims.slice(0, 3).map((claim) => claim.id));
  const savedClaims = demoClaims.filter((claim) => saved.includes(claim.id));
  return <section className="route-card prototype-list-card"><div className="prototype-list-toolbar"><div><span className="eyebrow">BOOKMARKS</span><h2>Saved findings</h2></div><span className="route-count">{savedClaims.length} saved in this preview</span></div>{savedClaims.length ? <div className="prototype-saved-list">{savedClaims.map((claim) => <article className="prototype-saved-card" key={claim.id}><div className="prototype-saved-top"><span className={`verdict-pill ${claim.verdict}`}><i>{verdictInfo[claim.verdict].mark}</i>{verdictInfo[claim.verdict].label}</span><button className="prototype-remove-button" onClick={() => setSaved((current) => current.filter((id) => id !== claim.id))} aria-label={`Remove saved claim ${claim.id}`}><Trash2 size={14}/></button></div><strong>{claim.text}</strong><p>{claim.explanation}</p><span className="prototype-source-ref"><FileText size={13}/>{claim.source} · p. {claim.page}</span></article>)}</div> : <div className="prototype-empty-state"><Bookmark size={21}/><strong>No saved findings in this preview</strong><p>Save claims from an audit review to collect them here.</p><Link href={`/audit/${demoAuditId}`} className="text-button">Open sample audit <ArrowRight size={14}/></Link></div>}<p className="prototype-footnote"><Bookmark size={13}/> Save and remove actions are temporary page previews.</p></section>;
}

function ActivityPreview() {
  const events = [
    { icon: Check, title: "Sample audit completed", detail: "Northstar annual results · 5 claims reviewed", group: "Review" },
    { icon: FileText, title: "Source evidence reviewed", detail: "Northstar Annual Report 2024.pdf · pages 14 and 31", group: "Evidence" },
    { icon: Activity, title: "Conflicting detail found", detail: "The strategy update reports 10 active markets.", group: "Finding" },
    { icon: ShieldCheck, title: "Report prepared", detail: "A printable report is available for the sample audit.", group: "Report" },
  ];
  return <div className="prototype-activity-layout"><section className="route-card prototype-list-card"><div className="prototype-list-toolbar"><div><span className="eyebrow">RECENT EVENTS</span><h2>Northstar demo session</h2></div><button className="prototype-filter-button"><Filter size={14}/> All activity</button></div><div className="prototype-timeline">{events.map(({ icon: Icon, title, detail, group }, index) => <article className="prototype-timeline-item" key={title}><span className={`prototype-timeline-icon ${index === 2 ? "finding" : ""}`}><Icon size={15}/></span><span className="prototype-timeline-line"/><div><span className="prototype-event-group">{group} · sample</span><strong>{title}</strong><p>{detail}</p></div><span className="prototype-event-time">Demo</span></article>)}</div><p className="prototype-footnote"><Activity size={13}/> Activity records are illustrative and do not persist.</p></section><aside className="route-card prototype-activity-aside"><span className="eyebrow">SESSION OVERVIEW</span><h2>One sample review</h2><p>Use this page layout to explore how audit events could be grouped and scanned.</p><Link href={`/audit/${demoAuditId}`} className="text-button">Open the audit <ArrowRight size={14}/></Link></aside></div>;
}

function SettingsPreview() {
  const [toggles, setToggles] = useState({ evidence: true, report: true, motion: true });
  const toggle = (key: keyof typeof toggles) => setToggles((current) => ({ ...current, [key]: !current[key] }));
  return <div className="prototype-settings-layout"><section className="route-card prototype-settings-card"><div className="prototype-list-toolbar"><div><span className="eyebrow">PREFERENCES</span><h2>Review experience</h2></div><SlidersHorizontal size={17}/></div><div className="prototype-setting-row"><div><strong>Show evidence context</strong><p>Keep the selected source excerpt beside a claim.</p></div><button role="switch" aria-checked={toggles.evidence} className={`prototype-switch ${toggles.evidence ? "on" : ""}`} onClick={() => toggle("evidence")}><i/></button></div><div className="prototype-setting-row"><div><strong>Include claim findings in reports</strong><p>Show verdicts, explanations, and cited quotes.</p></div><button role="switch" aria-checked={toggles.report} className={`prototype-switch ${toggles.report ? "on" : ""}`} onClick={() => toggle("report")}><i/></button></div><div className="prototype-setting-row"><div><strong>Interface motion</strong><p>Use the subtle transitions throughout this preview.</p></div><button role="switch" aria-checked={toggles.motion} className={`prototype-switch ${toggles.motion ? "on" : ""}`} onClick={() => toggle("motion")}><i/></button></div></section><section className="route-card prototype-settings-card"><div className="prototype-list-toolbar"><div><span className="eyebrow">WORKSPACE</span><h2>Local preview</h2></div><ShieldCheck size={17}/></div><div className="prototype-setting-row"><div><strong>Account</strong><p>Unauthenticated demo workspace</p></div><span className="prototype-setting-value">Local</span></div><div className="prototype-setting-row"><div><strong>Data retention</strong><p>Prototype preferences reset when the page reloads.</p></div><span className="prototype-setting-value">Session only</span></div><p className="prototype-footnote"><Settings size={13}/> Controls are interactive previews and are not persisted.</p></section></div>;
}

function AccountPreview() {
  return <div className="prototype-account-layout">
    <section className="route-card prototype-settings-card account-profile-card">
      <div className="account-profile-heading"><span className="account-avatar">S</span><div><span className="eyebrow">PROFILE</span><h2>Workspace member</h2><p>Local preview account</p></div><span className="prototype-tag">PREVIEW</span></div>
      <div className="account-detail-list">
        <div className="prototype-setting-row"><div><strong>Display name</strong><p>Name shown in this workspace.</p></div><span className="prototype-setting-value">Demo member</span></div>
        <div className="prototype-setting-row"><div><strong>Email address</strong><p>Sign-in is not connected in this preview.</p></div><span className="prototype-setting-value">Not connected</span></div>
        <div className="prototype-setting-row"><div><strong>Workspace</strong><p>Current review environment.</p></div><span className="prototype-setting-value">Second Opinion</span></div>
      </div>
    </section>
    <section className="route-card prototype-settings-card account-access-card">
      <div className="prototype-list-toolbar"><div><span className="eyebrow">ACCOUNT STATUS</span><h2>Local preview access</h2></div><UserRound size={17}/></div>
      <div className="account-status-row"><span className="account-status-dot"/><div><strong>No account connected</strong><p>Authentication and profile syncing are not enabled in this frontend preview.</p></div></div>
      <p className="prototype-footnote"><ShieldCheck size={13}/> Account details are examples and are not stored.</p>
      <Link href="/settings" className="route-back account-settings-link"><Settings size={14}/> Open workspace settings</Link>
    </section>
  </div>;
}
