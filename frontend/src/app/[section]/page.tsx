"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, Bookmark, ChevronRight, Clock3, Database, ExternalLink, FileText, Filter, LoaderCircle, Search, Settings, ShieldCheck, SlidersHorizontal, Sparkles, UserRound } from "lucide-react";
import { getSource, getSourceFileUrl, listAudits, listSources } from "@/lib/api";
import type { Source } from "@/lib/types";
import { getSupabase } from "@/lib/supabase";

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

function LoadingState({ children }: { children: string }) {
  return <div className="prototype-empty-state"><LoaderCircle className="spin" size={20}/><strong>{children}</strong></div>;
}

function ErrorState({ message }: { message: string }) {
  return <div className="prototype-empty-state"><strong>Couldn’t load this page</strong><p>{message}</p></div>;
}

function HistoryPreview() {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listAudits>>["audits"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    void listAudits()
      .then((result) => { if (alive) setRows(result.audits); })
      .catch((cause: unknown) => { if (alive) setError(cause instanceof Error ? cause.message : "Could not load audit history."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const q = query.toLowerCase();
  const filteredRows = rows.filter((row) => row.answer_preview.toLowerCase().includes(q) || row.source_names.some((name) => name.toLowerCase().includes(q)));
  const latest = rows[0];

  return <>
    <div className="prototype-summary-grid"><div className="route-card prototype-stat"><span>Audits shown</span><strong>{rows.length ? rows.length.toString().padStart(2, "0") : "—"}</strong><small>{rows.length ? "In your account" : "No stored audits"}</small></div><div className="route-card prototype-stat"><span>Latest review</span><strong>{latest ? new Date(latest.created_at).toLocaleDateString() : "—"}</strong><small>{latest ? latest.status : "No review data"}</small></div><div className="route-card prototype-stat"><span>Storage</span><strong>{rows.length ? "Database" : "—"}</strong><small>{rows.length ? "Account-scoped history" : "No stored data"}</small></div></div>
    <section className="route-card prototype-list-card"><div className="prototype-list-toolbar"><div><span className="eyebrow">AUDIT LOG</span><h2>All reviews</h2></div><label className="prototype-search"><Search size={15}/><input aria-label="Search audits" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search audits"/></label></div>
      {loading ? <LoadingState>Loading your audit history…</LoadingState> : error ? <ErrorState message={error}/> : filteredRows.length ? <div className="prototype-history-cards">{filteredRows.map((row) => <Link href={`/report/${encodeURIComponent(row.audit_id)}`} className="preview-card prototype-history-card" key={row.audit_id}><div className="prototype-history-card-top"><span className="prototype-file-icon"><FileText size={16}/></span><span className={`prototype-status ${row.status === "done" ? "complete" : "preview"}`}><i/>{row.status === "done" ? "Complete" : row.status === "running" ? "In progress" : "Failed"}</span></div><strong className="prototype-history-title">{row.answer_preview || "Untitled audit"}</strong><span className="prototype-history-source">{row.source_names.join(" · ") || "No source names"}</span><div className="prototype-history-footer"><span>{row.claim_count} claim{row.claim_count === 1 ? "" : "s"}</span><span>{new Date(row.created_at).toLocaleString()}</span><span className="prototype-history-open"><ChevronRight size={15}/></span></div></Link>)}</div> : <EmptyState>{query ? "No matching audits" : "No audits available"}</EmptyState>}
      <p className="prototype-footnote"><Clock3 size={13}/> Audit history will appear here when available.</p></section>
  </>;
}

function SourcesPreview() {
  const [query, setQuery] = useState("");
  const [sources, setSources] = useState<Awaited<ReturnType<typeof listSources>>["sources"]>([]);
  const [selected, setSelected] = useState<Source | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    void listSources()
      .then((data) => { if (alive) setSources(data.sources); })
      .catch((cause: unknown) => { if (alive) setError(cause instanceof Error ? cause.message : "Could not load sources."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const visibleSources = sources.filter((source) => source.name.toLowerCase().includes(query.toLowerCase()));

  const readPdf = async (id: string) => {
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    try {
      const result = await getSourceFileUrl(id);
      if (tab) tab.location.href = result.url; else window.location.assign(result.url);
    } catch (cause) {
      tab?.close();
      setError(cause instanceof Error ? cause.message : "Could not open this PDF.");
    }
  };
  const readText = async (id: string) => {
    try { setSelected(await getSource(id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load this source."); }
  };

  return <>
    <div className="prototype-summary-grid"><div className="route-card prototype-stat"><span>Documents</span><strong>{sources.length ? sources.length.toString().padStart(2, "0") : "—"}</strong><small>{sources.length ? "Saved in your account" : "No source records"}</small></div><div className="route-card prototype-stat"><span>Referenced claims</span><strong>—</strong><small>No claim records</small></div><div className="route-card prototype-stat"><span>Storage status</span><strong>{sources.length ? "Private" : "—"}</strong><small>{sources.length ? "Only your account can open files" : "No stored files"}</small></div></div>
    <section className="route-card prototype-list-card"><div className="prototype-list-toolbar"><div><span className="eyebrow">SOURCE LIBRARY</span><h2>Documents</h2></div><label className="prototype-search"><Search size={15}/><input aria-label="Search sources" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sources"/></label></div>
      {loading ? <LoadingState>Loading your documents…</LoadingState> : error ? <ErrorState message={error}/> : visibleSources.length ? <div className="prototype-source-list">{visibleSources.map((source) => <article className="prototype-source-row" key={source.source_id}><span className="prototype-doc-icon red"><FileText size={18}/></span><div className="prototype-source-copy"><strong>{source.name}</strong><small>{source.mime_type.split("/").pop()?.toUpperCase()} · {source.page_count} page{source.page_count === 1 ? "" : "s"} · {new Date(source.created_at).toLocaleDateString()}</small></div>{source.storage_path ? <button className="prototype-open-link" type="button" aria-label={`Open PDF ${source.name}`} onClick={() => void readPdf(source.source_id)}><ExternalLink size={16}/></button> : <button className="prototype-open-link" type="button" aria-label={`Read text ${source.name}`} onClick={() => void readText(source.source_id)}><ChevronRight size={16}/></button>}</article>)}</div> : <EmptyState>{query ? "No matching sources" : "No sources available"}</EmptyState>}
      <p className="prototype-footnote"><Database size={13}/> Source records will appear here when available.</p></section>
    {selected && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section className="report-modal" role="dialog" aria-modal="true" aria-label={selected.name}><div className="report-modal-head"><div><span className="eyebrow">SOURCE DOCUMENT</span><h2>{selected.name}</h2></div><button className="icon-button" onClick={() => setSelected(null)} aria-label="Close source">×</button></div><div className="source-viewer-body">{selected.pages.map((page) => <article key={page.page}><h3>Page {page.page}</h3><pre className="source-library-text">{page.text}</pre></article>)}</div></section></div>}
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
  const supabase = getSupabase();
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      const user = data.user;
      const meta = user?.user_metadata as { full_name?: string; name?: string } | undefined;
      setEmail(user?.email ?? null);
      setName(meta?.full_name ?? meta?.name ?? user?.email?.split("@")[0] ?? null);
    });
    return () => { alive = false; };
  }, [supabase]);

  const signedIn = Boolean(email);
  const signOut = () => {
    if (!supabase) return;
    void supabase.auth.signOut().then(() => { setEmail(null); setName(null); });
  };

  return <div className="prototype-account-layout"><section className="route-card prototype-settings-card account-profile-card"><div className="account-profile-heading"><span className="account-avatar">{email ? email.slice(0, 1).toUpperCase() : "?"}</span><div><span className="eyebrow">PROFILE</span><h2>Account details</h2><p>{email ?? "Profile information"}</p></div></div><div className="account-detail-list"><div className="prototype-setting-row"><div><strong>Display name</strong><p>Name shown in this workspace.</p></div><span className="prototype-setting-value">{name ?? "—"}</span></div><div className="prototype-setting-row"><div><strong>Email address</strong><p>Account email address.</p></div><span className="prototype-setting-value">{email ?? "—"}</span></div><div className="prototype-setting-row"><div><strong>Workspace</strong><p>Current review environment.</p></div><span className="prototype-setting-value">{signedIn ? "Second Opinion" : "—"}</span></div></div></section><section className="route-card prototype-settings-card account-access-card"><div className="prototype-list-toolbar"><div><span className="eyebrow">ACCOUNT STATUS</span><h2>Connection</h2></div><UserRound size={17}/></div><div className="account-status-row"><span className="account-status-dot"/><div><strong>{signedIn ? "Signed in" : "No account connected"}</strong><p>{signedIn ? "Your audits and source files are scoped to this account." : "Account information is not available."}</p></div></div><p className="prototype-footnote"><ShieldCheck size={13}/> {signedIn ? "Your audits and sources are private to this account." : "Account details are unavailable."}</p><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Link href="/settings" className="route-back account-settings-link"><Settings size={14}/> Open workspace settings</Link>{signedIn && <button type="button" className="route-back account-settings-link" onClick={signOut}>Sign out</button>}</div></section></div>;
}
