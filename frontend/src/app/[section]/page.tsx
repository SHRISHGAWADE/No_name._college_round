"use client";

import { use, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, Bookmark, Clock3, Database, FileText, Filter, Search, Settings, ShieldCheck, SlidersHorizontal, Sparkles, UserRound } from "lucide-react";

type SectionKey = "history" | "sources" | "saved" | "activity" | "settings" | "account";
const titles: Record<SectionKey, string> = { history: "Recent audits", sources: "Source library", saved: "Saved", activity: "Activity", settings: "Settings", account: "Account" };

function PrototypeTag() { return <span className="prototype-tag"><Sparkles size={12}/> WORKSPACE PREVIEW</span>; }

export default function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section: rawSection } = use(params);
  if (!(rawSection in titles)) return <main className="app-shell route-shell"><section className="route-content route-unavailable"><span className="eyebrow">PAGE NOT FOUND</span><h1>This page isn’t available.</h1><Link className="primary-button" href="/">Return home <ArrowRight size={15}/></Link></section></main>;
  const section = rawSection as SectionKey;
  return <main className="app-shell route-shell prototype-page-shell" data-page-route={`/${section}`}>
    <header className="topbar route-topbar"><Link href="/" className="route-back"><ArrowRight className="route-home-arrow" size={15}/> New audit</Link><div className="route-brand">SECOND OPINION <span>/</span> {titles[section].toUpperCase()}</div><PrototypeTag/></header>
    <section className="route-content prototype-content">
      <div className="route-title-row"><div><span className="eyebrow"><Sparkles size={14}/> WORKSPACE</span><h1>{titles[section]}</h1><p>{sectionDescription[section]}</p></div><span className="route-id">WORKSPACE</span></div>
      <PrototypeTag/>
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
  account: "View account and workspace details.",
};

function EmptyState({ children }: { children: string }) {
  return <div className="prototype-empty-state"><Database size={21}/><strong>{children}</strong></div>;
}

function HistoryPreview() {
  const [query, setQuery] = useState("");
  return <>
    <div className="prototype-summary-grid"><div className="route-card prototype-stat"><span>Audits shown</span><strong>—</strong><small>No stored audits</small></div><div className="route-card prototype-stat"><span>Latest review</span><strong>—</strong><small>No review data</small></div><div className="route-card prototype-stat"><span>Storage</span><strong>—</strong><small>No stored data</small></div></div>
    <section className="route-card prototype-list-card"><div className="prototype-list-toolbar"><div><span className="eyebrow">AUDIT LOG</span><h2>All reviews</h2></div><label className="prototype-search"><Search size={15}/><input aria-label="Search audits" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search audits"/></label></div><EmptyState>{query ? "No matching audits" : "No audits available"}</EmptyState><p className="prototype-footnote"><Clock3 size={13}/> Audit history will appear here when available.</p></section>
  </>;
}

function SourcesPreview() {
  const [query, setQuery] = useState("");
  return <>
    <div className="prototype-summary-grid"><div className="route-card prototype-stat"><span>Documents</span><strong>—</strong><small>No source records</small></div><div className="route-card prototype-stat"><span>Referenced claims</span><strong>—</strong><small>No claim records</small></div><div className="route-card prototype-stat"><span>Storage status</span><strong>—</strong><small>No stored files</small></div></div>
    <section className="route-card prototype-list-card"><div className="prototype-list-toolbar"><div><span className="eyebrow">SOURCE LIBRARY</span><h2>Documents</h2></div><label className="prototype-search"><Search size={15}/><input aria-label="Search sources" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sources"/></label></div><EmptyState>{query ? "No matching sources" : "No sources available"}</EmptyState><p className="prototype-footnote"><Database size={13}/> Source records will appear here when available.</p></section>
  </>;
}

function SavedPreview() {
  return <section className="route-card prototype-list-card"><div className="prototype-list-toolbar"><div><span className="eyebrow">BOOKMARKS</span><h2>Saved findings</h2></div><span className="route-count">—</span></div><EmptyState>No saved findings</EmptyState><p className="prototype-footnote"><Bookmark size={13}/> Saved findings will appear here when available.</p></section>;
}

function ActivityPreview() {
  return <div className="prototype-activity-layout"><section className="route-card prototype-list-card"><div className="prototype-list-toolbar"><div><span className="eyebrow">RECENT EVENTS</span><h2>Activity</h2></div><button className="prototype-filter-button"><Filter size={14}/> All activity</button></div><EmptyState>No activity available</EmptyState><p className="prototype-footnote"><Activity size={13}/> Activity records will appear here when available.</p></section><aside className="route-card prototype-activity-aside"><span className="eyebrow">SESSION OVERVIEW</span><h2>No session data</h2><p>Session details will appear here when available.</p></aside></div>;
}

function SettingsPreview() {
  const [toggles, setToggles] = useState({ evidence: true, report: true, motion: true });
  const toggle = (key: keyof typeof toggles) => setToggles((current) => ({ ...current, [key]: !current[key] }));
  return <div className="prototype-settings-layout"><section className="route-card prototype-settings-card"><div className="prototype-list-toolbar"><div><span className="eyebrow">PREFERENCES</span><h2>Review experience</h2></div><SlidersHorizontal size={17}/></div><div className="prototype-setting-row"><div><strong>Show evidence context</strong><p>Keep the selected source excerpt beside a claim.</p></div><button role="switch" aria-checked={toggles.evidence} className={`prototype-switch ${toggles.evidence ? "on" : ""}`} onClick={() => toggle("evidence")}><i/></button></div><div className="prototype-setting-row"><div><strong>Include claim findings in reports</strong><p>Show verdicts, explanations, and cited quotes.</p></div><button role="switch" aria-checked={toggles.report} className={`prototype-switch ${toggles.report ? "on" : ""}`} onClick={() => toggle("report")}><i/></button></div><div className="prototype-setting-row"><div><strong>Interface motion</strong><p>Use the subtle transitions throughout the workspace.</p></div><button role="switch" aria-checked={toggles.motion} className={`prototype-switch ${toggles.motion ? "on" : ""}`} onClick={() => toggle("motion")}><i/></button></div></section><section className="route-card prototype-settings-card"><div className="prototype-list-toolbar"><div><span className="eyebrow">WORKSPACE</span><h2>Workspace details</h2></div><ShieldCheck size={17}/></div><div className="prototype-setting-row"><div><strong>Account</strong><p>Account connection status.</p></div><span className="prototype-setting-value">—</span></div><div className="prototype-setting-row"><div><strong>Data retention</strong><p>Storage configuration.</p></div><span className="prototype-setting-value">—</span></div></section></div>;
}

function AccountPreview() {
  return <div className="prototype-account-layout"><section className="route-card prototype-settings-card account-profile-card"><div className="account-profile-heading"><span className="account-avatar">?</span><div><span className="eyebrow">PROFILE</span><h2>Account details</h2><p>Profile information</p></div></div><div className="account-detail-list"><div className="prototype-setting-row"><div><strong>Display name</strong><p>Name shown in this workspace.</p></div><span className="prototype-setting-value">—</span></div><div className="prototype-setting-row"><div><strong>Email address</strong><p>Account email address.</p></div><span className="prototype-setting-value">—</span></div><div className="prototype-setting-row"><div><strong>Workspace</strong><p>Current review environment.</p></div><span className="prototype-setting-value">—</span></div></div></section><section className="route-card prototype-settings-card account-access-card"><div className="prototype-list-toolbar"><div><span className="eyebrow">ACCOUNT STATUS</span><h2>Connection</h2></div><UserRound size={17}/></div><div className="account-status-row"><span className="account-status-dot"/><div><strong>No account connected</strong><p>Account information is not available.</p></div></div><p className="prototype-footnote"><ShieldCheck size={13}/> Account details are unavailable.</p><Link href="/settings" className="route-back account-settings-link"><Settings size={14}/> Open workspace settings</Link></section></div>;
}
