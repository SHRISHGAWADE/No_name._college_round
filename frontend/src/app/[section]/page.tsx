"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, Bookmark, Check, ChevronRight, Clock3, Database, ExternalLink, FileText, Filter, LoaderCircle, Search, Settings, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, UserRound } from "lucide-react";
import { demoAuditId, demoClaims, demoSources, type DemoVerdict } from "@/lib/demo-audit";
import { getSource, getSourceFileUrl, listAudits, listSources } from "@/lib/api";
import type { Source } from "@/lib/types";
import { getSupabase } from "@/lib/supabase";

type SectionKey = "history" | "sources" | "saved" | "activity" | "settings" | "account";
const titles: Record<SectionKey, string> = { history: "Recent audits", sources: "Source library", saved: "Saved", activity: "Activity", settings: "Settings", account: "Account" };
const verdictInfo: Record<DemoVerdict, { label: string; mark: string }> = { supported: { label: "Supported", mark: "✓" }, contradicted: { label: "Contradicted", mark: "×" }, unsupported: { label: "Insufficient evidence", mark: "?" }, ambiguous: { label: "Ambiguous", mark: "~" } };

function PrototypeTag() { return <span className="prototype-tag"><Sparkles size={12}/> PAGE STRUCTURE PREVIEW · SAMPLE DATA</span>; }

export default function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section: rawSection } = use(params);
  const section = rawSection as SectionKey;
  if (!(section in titles)) return <main className="app-shell route-shell"><section className="route-content route-unavailable"><span className="eyebrow">PAGE NOT FOUND</span><h1>This page isn’t available.</h1><Link className="primary-button" href="/">Return home <ArrowRight size={15}/></Link></section></main>;
  const preview = !["history", "sources", "account"].includes(section);

  return <main className="app-shell route-shell prototype-page-shell" data-page-route={`/${section}`}>
    <header className="topbar route-topbar"><Link href="/" className="route-back"><ArrowRight className="route-home-arrow" size={15}/> New audit</Link><div className="route-brand">SECOND OPINION <span>/</span> {titles[section].toUpperCase()}</div>{preview && <PrototypeTag/>}</header>
    <section className="route-content prototype-content">
      <div className="route-title-row"><div><span className="eyebrow"><Sparkles size={14}/> WORKSPACE</span><h1>{titles[section]}</h1><p>{sectionDescription[section]}</p></div>{preview && <span className="route-id">PROTOTYPE PAGE</span>}</div>
      {preview && <PrototypeTag />}
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
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listAudits>>["audits"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    void listAudits().then((result) => { if (alive) setRows(result.audits); })
      .catch((cause: unknown) => { if (alive) setError(cause instanceof Error ? cause.message : "Could not load audit history."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  const filteredRows = rows.filter((row) => row.answer_preview.toLowerCase().includes(query.toLowerCase()) || row.source_names.some((name) => name.toLowerCase().includes(query.toLowerCase())));
  const latest = rows[0];
  return <>
    <div className="prototype-summary-grid"><div className="route-card prototype-stat"><span>Audits saved</span><strong>{rows.length.toString().padStart(2, "0")}</strong><small>In your account</small></div><div className="route-card prototype-stat"><span>Latest review</span><strong>{latest ? new Date(latest.created_at).toLocaleDateString() : "—"}</strong><small>{latest ? latest.status : "No audits yet"}</small></div><div className="route-card prototype-stat"><span>Storage</span><strong>Database</strong><small>Account-scoped history</small></div></div>
    <section className="route-card prototype-list-card"><div className="prototype-list-toolbar"><div><span className="eyebrow">AUDIT LOG</span><h2>All reviews</h2></div><label className="prototype-search"><Search size={15}/><input aria-label="Search audits" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search audits or sources"/></label></div>
      {loading ? <div className="prototype-empty-state"><LoaderCircle className="spin" size={20}/>Loading your audit history…</div> : error ? <div className="prototype-empty-state"><strong>History couldn’t load</strong><p>{error}</p></div> : filteredRows.length ? <div className="prototype-history-cards">{filteredRows.map((row) => <Link href={`/report/${encodeURIComponent(row.audit_id)}`} className="preview-card prototype-history-card" key={row.audit_id}><div className="prototype-history-card-top"><span className="prototype-file-icon"><FileText size={16}/></span><span className={`prototype-status ${row.status === "done" ? "complete" : "preview"}`}><i/>{row.status === "done" ? "Complete" : row.status === "running" ? "In progress" : "Failed"}</span></div><strong className="prototype-history-title">{row.answer_preview || "Untitled audit"}</strong><span className="prototype-history-source">{row.source_names.join(" · ") || "No source names"}</span><div className="prototype-history-footer"><span>{row.claim_count} claim{row.claim_count === 1 ? "" : "s"}</span><span>{new Date(row.created_at).toLocaleString()}</span><span className="prototype-history-open"><ChevronRight size={15}/></span></div></Link>)}</div> : <div className="prototype-empty-state"><Clock3 size={21}/><strong>{query ? "No matching audits" : "No saved audits yet"}</strong><p>{query ? "Try a different search." : "Your completed audits will appear here."}</p><Link href="/" className="text-button">Start a new audit <ArrowRight size={14}/></Link></div>}
    </section>
  </>;
}

function SourcesPreview() {
  const [query, setQuery] = useState("");
  const [sources, setSources] = useState<Awaited<ReturnType<typeof listSources>>["sources"]>([]);
  const [selected, setSelected] = useState<Source | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { let alive = true; void listSources().then((data) => { if (alive) setSources(data.sources); }).catch((cause: unknown) => { if (alive) setError(cause instanceof Error ? cause.message : "Could not load sources."); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, []);
  const visibleSources = sources.filter((source) => source.name.toLowerCase().includes(query.toLowerCase()));
  const readPdf = async (id: string) => { const tab = window.open("about:blank", "_blank"); if (tab) tab.opener = null; try { const result = await getSourceFileUrl(id); if (tab) tab.location.href = result.url; else window.location.assign(result.url); } catch (cause) { tab?.close(); setError(cause instanceof Error ? cause.message : "Could not open this PDF."); } };
  const readText = async (id: string) => { try { setSelected(await getSource(id)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load this source."); } };
  return <>
    <div className="prototype-summary-grid"><div className="route-card prototype-stat"><span>Documents</span><strong>{sources.length.toString().padStart(2, "0")}</strong><small>Saved in your account</small></div><div className="route-card prototype-stat"><span>PDFs</span><strong>{sources.filter((source) => source.mime_type === "application/pdf").length.toString().padStart(2, "0")}</strong><small>Private file storage</small></div><div className="route-card prototype-stat"><span>Storage status</span><strong>Private</strong><small>Only your account can open files</small></div></div>
    <section className="route-card prototype-list-card"><div className="prototype-list-toolbar"><div><span className="eyebrow">SOURCE LIBRARY</span><h2>Your documents</h2></div><label className="prototype-search"><Search size={15}/><input aria-label="Search sources" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sources"/></label></div>
      {error && <p className="auth-message" role="alert">{error}</p>}
      {loading ? <div className="prototype-empty-state"><LoaderCircle className="spin" size={20}/>Loading your documents…</div> : visibleSources.length ? <div className="prototype-source-list">{visibleSources.map((source) => <article className="prototype-source-row" key={source.source_id}><span className="prototype-doc-icon red"><FileText size={18}/></span><div className="prototype-source-copy"><strong>{source.name}</strong><small>{source.mime_type.split("/").pop()?.toUpperCase()} · {source.page_count} page{source.page_count === 1 ? "" : "s"} · {new Date(source.created_at).toLocaleDateString()}</small></div>{source.storage_path ? <button className="prototype-open-link" type="button" aria-label={`Open PDF ${source.name}`} onClick={() => void readPdf(source.source_id)}><ExternalLink size={16}/></button> : <button className="prototype-open-link" type="button" aria-label={`Read text ${source.name}`} onClick={() => void readText(source.source_id)}><ChevronRight size={16}/></button>}</article>)}</div> : <div className="prototype-empty-state"><Database size={21}/><strong>{query ? "No matching documents" : "No saved documents yet"}</strong><p>Upload PDFs or paste source text when you start an audit. They’ll be available here afterward.</p><Link href="/" className="text-button">Start a new audit <ArrowRight size={14}/></Link></div>}
    </section>
    {selected && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section className="report-modal" role="dialog" aria-modal="true" aria-label={selected.name}><div className="report-modal-head"><div><span className="eyebrow">SOURCE DOCUMENT</span><h2>{selected.name}</h2></div><button className="icon-button" onClick={() => setSelected(null)} aria-label="Close source">×</button></div><div className="source-viewer-body">{selected.pages.map((page) => <article key={page.page}><h3>Page {page.page}</h3><pre className="source-library-text">{page.text}</pre></article>)}</div></section></div>}
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
  const [email, setEmail] = useState("Loading account…");
  const supabase = getSupabase();
  useEffect(() => { if (!supabase) { setEmail("Local development account"); return; } void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? "Signed-in account")); }, [supabase]);
  const signOut = () => { if (supabase) void supabase.auth.signOut(); };
  return <div className="prototype-account-layout">
    <section className="route-card prototype-settings-card account-profile-card">
      <div className="account-profile-heading"><span className="account-avatar">{email.slice(0, 1).toUpperCase()}</span><div><span className="eyebrow">PROFILE</span><h2>Workspace member</h2><p>{email}</p></div></div>
      <div className="account-detail-list">
        <div className="prototype-setting-row"><div><strong>Display name</strong><p>Name shown in this workspace.</p></div><span className="prototype-setting-value">Demo member</span></div>
        <div className="prototype-setting-row"><div><strong>Email address</strong><p>Signed-in account for audit ownership.</p></div><span className="prototype-setting-value">{email}</span></div>
        <div className="prototype-setting-row"><div><strong>Workspace</strong><p>Current review environment.</p></div><span className="prototype-setting-value">Second Opinion</span></div>
      </div>
    </section>
    <section className="route-card prototype-settings-card account-access-card">
      <div className="prototype-list-toolbar"><div><span className="eyebrow">ACCOUNT STATUS</span><h2>Private workspace</h2></div><UserRound size={17}/></div>
      <div className="account-status-row"><span className="account-status-dot"/><div><strong>Signed in</strong><p>Your audits and source files are scoped to this account.</p></div></div>
      {supabase && <button type="button" className="route-back account-settings-link" onClick={signOut}><Settings size={14}/> Sign out</button>}
    </section>
  </div>;
}
