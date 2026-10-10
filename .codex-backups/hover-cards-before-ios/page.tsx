"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cloneElement, isValidElement } from "react";
import type { ReactElement, ReactNode } from "react";
import { Activity, Archive, ArrowDown, ArrowLeft, ArrowRight, Bookmark, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, Copy, Database, FileText, FileUp, Filter, Folder, Grid2X2, History, Home, LayoutList, ListFilter, Menu, MessageSquareText, MoreHorizontal, PanelRight, Plus, Search, Settings, ShieldCheck, SlidersHorizontal, Sparkles, Upload, X, XCircle } from "lucide-react";

type Verdict = "supported" | "contradicted" | "unsupported" | "ambiguous";
type Claim = { id: number; verdict: Verdict; text: string; explanation: string; source: string; page: number; quote: string; type: string };

const demoAnswer = "Northstar’s annual revenue reached $48.2 million in 2024, representing 18% year-over-year growth. The company operates in 12 markets and serves more than 2,400 business customers. Its gross margin improved to 64% as operating expenses declined by 9%.";
const demoClaims: Claim[] = [
  { id: 1, verdict: "supported", text: "Northstar’s annual revenue reached $48.2 million in 2024", explanation: "The 2024 annual report states total revenue of $48.2 million.", source: "Northstar Annual Report 2024.pdf", page: 14, quote: "Total revenue for the year ended December 31, 2024 was $48.2 million, an increase from the prior year.", type: "Financial figure" },
  { id: 2, verdict: "supported", text: "representing 18% year-over-year growth", explanation: "The report describes revenue growth of 18% compared with 2023.", source: "Northstar Annual Report 2024.pdf", page: 14, quote: "Revenue increased 18% year over year, primarily driven by expansion in existing accounts.", type: "Growth rate" },
  { id: 3, verdict: "contradicted", text: "The company operates in 12 markets", explanation: "The strategy update lists 10 active markets, not 12.", source: "Strategy & Operations Update.docx", page: 27, quote: "Our current footprint spans 10 markets, with two additional launches planned for next year.", type: "Geographic scope" },
  { id: 4, verdict: "supported", text: "serves more than 2,400 business customers", explanation: "The customer overview reports 2,460 active business customers.", source: "Corporate Overview.xlsx", page: 8, quote: "Active business customers: 2,460 as of December 2024.", type: "Customer count" },
  { id: 5, verdict: "unsupported", text: "Its gross margin improved to 64% as operating expenses declined by 9%", explanation: "The uploaded sources support a 64% gross margin, but do not substantiate the claimed 9% decline in operating expenses.", source: "Northstar Annual Report 2024.pdf", page: 31, quote: "Gross margin increased to 64% in 2024. Operating expenses totaled $21.6 million.", type: "Financial performance" },
];
const folders = [
  { name: "All Sources", count: 842, icon: Database, tone: "neutral" }, { name: "Corporate Overview", count: 128, icon: FileText, tone: "gold" }, { name: "Strategy & Ops", count: 96, icon: FileText, tone: "blue" }, { name: "Research Reports", count: 210, icon: FileText, tone: "orange" }, { name: "Product Docs", count: 156, icon: FileText, tone: "rose" }, { name: "Legal & Compliance", count: 74, icon: FileText, tone: "slate" }, { name: "Finance", count: 88, icon: FileText, tone: "green" }, { name: "Archive", count: 90, icon: Archive, tone: "neutral" },
];
const verdictMeta: Record<Verdict, { label: string; mark: string }> = { supported: { label: "Supported", mark: "✓" }, contradicted: { label: "Contradicted", mark: "×" }, unsupported: { label: "Unsupported", mark: "?" }, ambiguous: { label: "Ambiguous", mark: "~" } };

function AppMark() { return <div className="brand-mark"><Sparkles size={21} strokeWidth={1.8} /></div>; }

function ContextCard({ title, description, evidence, children }: { title: string; description: string; evidence?: string; children: ReactNode }) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const closeTimerRef = useRef<number | null>(null);
  const tooltipId = `hint-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  useEffect(() => {
    const closeOnOtherCard = (event: Event) => {
      if ((event as CustomEvent<string>).detail === tooltipId) return;
      setOpen(false);
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = window.setTimeout(() => setMounted(false), 180);
    };
    window.addEventListener("context-card-open", closeOnOtherCard);
    return () => window.removeEventListener("context-card-open", closeOnOtherCard);
  }, [tooltipId]);
  const show = useCallback(() => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(280, window.innerWidth - 24);
    const height = evidence ? 150 : 92;
    const inRail = Boolean(anchorRef.current?.closest(".rail-nav"));
    const preferredLeft = inRail ? rect.right + 8 : rect.left;
    const left = Math.max(12, Math.min(preferredLeft, window.innerWidth - width - 12));
    const top = rect.bottom + height + 12 <= window.innerHeight ? rect.bottom + 8 : Math.max(12, rect.top - height - 8);
    window.dispatchEvent(new CustomEvent("context-card-open", { detail: tooltipId }));
    setPosition({ left, top });
    setMounted(true);
    window.requestAnimationFrame(() => setOpen(true));
  }, [evidence, tooltipId]);
  const hide = () => {
    setOpen(false);
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => setMounted(false), 180);
  };
  const content = isValidElement(children) ? cloneElement(children as ReactElement<{ "aria-describedby"?: string }>, { "aria-describedby": open ? tooltipId : undefined }) : children;
  return <span ref={anchorRef} className="context-hint" aria-describedby={open ? tooltipId : undefined} onPointerEnter={show} onPointerLeave={(event) => { if (!event.currentTarget.matches(":focus-within")) hide(); }} onFocus={show} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null) && !event.currentTarget.matches(":hover")) hide(); }} onTouchStart={() => { show(); window.setTimeout(hide, 3200); }}>
    {content}
    {mounted && <span id={tooltipId} role="tooltip" aria-hidden={!open} className={`context-card ${open ? "is-open" : ""}`} style={position}><strong>{title}</strong><span>{description}</span>{evidence && <small>{evidence}</small>}</span>}
  </span>;
}

export default function HomePage() {
  const [auditLoaded, setAuditLoaded] = useState(false);
  const [selected, setSelected] = useState(3);
  const [activeNav, setActiveNav] = useState("audit");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sourcePage, setSourcePage] = useState(1);
  const [toast, setToast] = useState("");
  const [followup, setFollowup] = useState("");
  const [showFollowup, setShowFollowup] = useState(false);
  const [sourceMode, setSourceMode] = useState<"grid" | "pages">("grid");
  const [reportOpen, setReportOpen] = useState(false);
  const [answer, setAnswer] = useState(demoAnswer);
  const [answerInput, setAnswerInput] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceDragging, setSourceDragging] = useState(false);
  const claim = demoClaims.find((item) => item.id === selected) ?? demoClaims[0];
  const counts = useMemo(() => demoClaims.reduce((result, item) => { result[item.verdict] += 1; return result; }, { supported: 0, contradicted: 0, unsupported: 0, ambiguous: 0 }), []);
  const filteredFolders = folders.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()));

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2400); };
  const loadDemo = () => { setAnswer(demoAnswer); setAnswerInput(demoAnswer); setSourceText("Northstar Annual Report 2024: Total revenue for the year ended December 31, 2024 was $48.2 million, an increase of 18% year over year. Gross margin increased to 64%. Our current footprint spans 10 markets. Active business customers: 2,460 as of December 2024."); setSourceName("Northstar Annual Report 2024.pdf"); setAuditLoaded(true); setSelected(3); notify("Demo audit loaded"); };
  const startAudit = () => { if (!answerInput.trim() || !sourceText.trim()) return; setAnswer(answerInput.trim()); setAuditLoaded(true); setSelected(1); notify("Audit ready · using sample evidence"); };
  const handleSourceFile = (file?: File) => {
    if (!file) return;
    setSourceName(file.name);
    setSourceText(file.name.toLowerCase().endsWith(".txt") ? "Uploaded source text" : `Uploaded PDF: ${file.name}`);
  };
  const selectClaim = (id: number) => { setSelected(id); setSourcePage(demoClaims.find((item) => item.id === id)?.page ?? 1); };
  const renderAnswer = () => {
    const chars = Array.from(answer);
    const spans = demoClaims.map((item) => { const target = Array.from(item.text); let start = -1; outer: for (let i = 0; i <= chars.length - target.length; i++) { for (let j = 0; j < target.length; j++) if (chars[i + j] !== target[j]) continue outer; start = i; break; } return { ...item, start, end: start < 0 ? -1 : start + target.length }; }).filter((item) => item.start >= 0).sort((a, b) => a.start - b.start);
    const pieces: ReactNode[] = []; let cursor = 0;
    spans.forEach((item) => { if (item.start < cursor) return; pieces.push(chars.slice(cursor, item.start).join("")); pieces.push(<ContextCard key={item.id} title={`Claim ${item.id} · ${verdictMeta[item.verdict].label}`} description={item.explanation} evidence={`${item.source} · p. ${item.page}: “${item.quote}”`}><mark role="button" tabIndex={0} aria-label={`Claim ${item.id}: ${verdictMeta[item.verdict].label}`} className={`claim-mark ${item.verdict} ${selected === item.id ? "is-selected" : ""}`} onClick={() => selectClaim(item.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectClaim(item.id); } }}>{chars.slice(item.start, item.end).join("")}<sup>{item.id}</sup></mark></ContextCard>); cursor = item.end; });
    pieces.push(chars.slice(cursor).join("")); return pieces;
  };
  return (
    <main className="app-shell">
      <aside className="rail">
        <div className="rail-top"><AppMark /></div>
        <nav className="rail-nav" aria-label="Main navigation">
          {[{ id: "home", icon: Home, label: "Home", help: "Return to the answer entry screen." }, { id: "audit", icon: MessageSquareText, label: "Audits", help: "Review claims against source evidence." }, { id: "sources", icon: FileText, label: "Sources", help: "Browse document sources and their details." }, { id: "library", icon: Database, label: "Library", help: "Your organized source collections." }, { id: "saved", icon: Bookmark, label: "Saved", help: "Items saved for quick reference." }, { id: "activity", icon: Activity, label: "Activity", help: "Recent audit and review activity." }].map(({ id, icon: Icon, label, help }, index) => <ContextCard key={id} title={label} description={help}><button aria-label={label} className={`rail-button ${activeNav === id ? "active" : ""} ${index === 4 ? "rail-divider" : ""}`} onClick={() => { setActiveNav(id); if (id === "home") setAuditLoaded(false); if (id === "audit") setAuditLoaded(true); }}><Icon size={19} strokeWidth={1.8} /></button></ContextCard>)}
        </nav>
        <div className="rail-bottom"><button className="rail-button" title="Settings"><Settings size={19} /></button><button className="avatar" title="Your account">S<span /></button></div>
      </aside>

      <header className="topbar">
        <div className="history-controls"><button aria-label="Back"><ChevronLeft size={17} /></button><button aria-label="Forward"><ChevronRight size={17} /></button></div>
        <div className="searchbox"><Search size={18} /><input aria-label="Search sources and answers" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your sources and answers" /><kbd>⌘ K</kbd><button className="search-submit" aria-label="Search"><ArrowRight size={17} /></button></div>
        <div className="top-actions"><ContextCard title="Filters" description="Narrow sources by file type, date, author, source type, or tags."><button aria-label="Filters"><ListFilter size={18} /></button></ContextCard><ContextCard title="Bookmarks" description="Keep important sources and claims close at hand."><button aria-label="Bookmarks"><Bookmark size={18} /></button></ContextCard><ContextCard title="Recent activity" description="Review recent audits and sources."><button aria-label="Recent activity"><Clock3 size={18} /></button></ContextCard><span className="top-separator" /><ContextCard title="List view" description="Review source results in a compact list."><button className="view-toggle active" aria-label="List view"><LayoutList size={17} /></button></ContextCard><ContextCard title="Grid view" description="Scan source results as visual cards."><button className="view-toggle" aria-label="Grid view"><Grid2X2 size={16} /></button></ContextCard><ContextCard title="Menu" description="Open the navigation menu."><button className="mobile-menu" aria-label="Menu"><Menu size={19} /></button></ContextCard></div>
      </header>

      {!auditLoaded ? <section className="welcome-page"><div className="welcome-kicker"><ShieldCheck size={15} /> SOURCE-GROUNDED ANSWER REVIEW</div><h1>Know what your answers<br />are built on.</h1><p>Check an AI answer against your documents. Review each claim, follow the evidence, and share a clear report.</p><div className="welcome-card"><label htmlFor="answer-input">AI-generated answer</label><textarea id="answer-input" value={answerInput} onChange={(event) => setAnswerInput(event.target.value)} placeholder="Paste the answer you want to check…"/><div className="welcome-card-bottom"><span>Use a sample answer</span><button className="text-button" onClick={() => setAnswerInput(demoAnswer)}>Northstar annual results</button><button className="text-button" onClick={loadDemo}><Sparkles size={15} /> Load demo example</button></div></div><div className="welcome-card source-entry"><label>Source documents</label><label className={`dropzone ${sourceDragging ? "is-dragging" : ""}`} htmlFor="source-file" onDragOver={(event) => { event.preventDefault(); setSourceDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSourceDragging(false); }} onDrop={(event) => { event.preventDefault(); setSourceDragging(false); handleSourceFile(event.dataTransfer.files?.[0]); }}><Upload size={19}/><span>{sourceName || "Drop PDF or TXT files here, or browse"}</span><small>{sourceName ? "File selected · Choose another file to replace it" : "PDF or plain text · Add one or more sources"}</small><input id="source-file" type="file" accept=".pdf,.txt,application/pdf,text/plain" onChange={(event) => { handleSourceFile(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label><label className="paste-source-label" htmlFor="source-text">Or paste source text</label><textarea id="source-text" className="source-textarea" value={sourceText} onChange={(event) => setSourceText(event.target.value)} placeholder="Paste relevant source text here…"/></div><div className="welcome-actions"><button className="primary-button" disabled={!answerInput.trim() || !sourceText.trim()} onClick={startAudit}>Start audit <ArrowRight size={16} /></button><span>Private by design · Evidence stays tied to your sources</span></div></section> : <>
        <aside className="sources-panel">
          <div className="panel-heading"><span>Sources</span><button className="icon-button small" aria-label="Add source" title="Add source" onClick={() => notify("Add a source from the home screen")}><Plus size={17} /></button></div>
          <div className="source-folders">{filteredFolders.map(({ name, count, icon: Icon, tone }) => <button key={name} className={`folder-row ${name === "All Sources" ? "folder-active" : ""}`} onClick={() => notify(`${name} selected`)}><Icon size={16} className={`folder-icon ${tone}`} /><span className="folder-name">{name}</span><span className="folder-count">{count}</span><MoreHorizontal size={15} className="folder-more" /></button>)}</div>
          <div className="panel-rule" /><div className="filter-heading"><span>Filters</span><ChevronDown size={15} /></div>
          <div className="filter-list">{[{ icon: SlidersHorizontal, label: "File Type", detail: "6" }, { icon: Clock3, label: "Date", detail: "›" }, { icon: CircleHelp, label: "Author", detail: "›" }, { icon: Database, label: "Source Type", detail: "›" }, { icon: Bookmark, label: "Tags", detail: "›" }].map(({ icon: Icon, label, detail }) => <button className="filter-row" key={label} onClick={() => notify(`${label} filters`)}><Icon size={16} /><span>{label}</span><span className="filter-detail">{detail}</span></button>)}</div>
          <button className="add-sources" onClick={() => notify("Choose PDF, TXT, or paste source text")}><Plus size={15} /> Add sources</button>
        </aside>

        <section className="answer-panel">
          <div className="answer-top"><div className="panel-heading answer-heading"><span>Answer</span><button className="report-button" onClick={() => setReportOpen(true)}><FileText size={14} /> View report <ArrowRight size={13} /></button></div><div className="confidence"><span>Confidence</span><div className="confidence-dots" aria-label="High confidence"><i/><i/><i/><i/><i/><i className="empty"/></div><span className="confidence-value">High</span></div></div>
          <div className="answer-content"><p className="answer-text">{renderAnswer()}</p><div className="answer-meta"><span><span className="live-dot"/> Checked against <b>4 sources</b></span><span>5 claims reviewed</span></div></div>
          <div className="summary-row"><div><span className="summary-total">5</span><span>claims reviewed</span></div><div className="summary-count supported-count"><i>✓</i>{counts.supported} supported</div><div className="summary-count contradicted-count"><i>×</i>{counts.contradicted} contradicted</div><div className="summary-count unsupported-count"><i>?</i>{counts.unsupported} unsupported</div><div className="summary-count ambiguous-count"><i>~</i>{counts.ambiguous} ambiguous</div></div>
          <div className="content-divider" />
          <div className="cited-heading"><span>Cited sources</span><div className="segmented"><button className={filter === "all" ? "selected" : ""} onClick={() => setFilter("all")}>Top</button><button className={filter === "all" ? "" : "selected"} onClick={() => setFilter("all")}>All</button></div></div>
          <div className="source-cards">{demoClaims.filter((item) => item.id !== 5).map((item) => <button key={item.id} className={`source-card ${selected === item.id ? "card-selected" : ""}`} onClick={() => selectClaim(item.id)}><div className="source-card-top"><span className={`file-badge ${item.id === 3 ? "blue" : item.id === 4 ? "green" : "red"}`}>{item.id === 3 ? "D" : item.id === 4 ? "X" : "P"}</span><strong>{item.id}</strong><span className="source-card-menu"><MoreHorizontal size={16}/></span></div><div className="source-title">{item.source}</div><div className="source-subtitle">Page {item.page} · {verdictMeta[item.verdict].label}</div><span className="source-progress"><i style={{ width: `${42 + item.id * 8}%` }} /></span></button>)}</div>
          <div className="followup-area"><div className="followup-heading">Continue exploring</div><div className="followup-chips"><button onClick={() => { setFollowup("Compare this figure across documents"); setShowFollowup(true); }}><SlidersHorizontal size={14}/> Compare across docs</button><button onClick={() => { setFollowup("Show the data supporting this answer"); setShowFollowup(true); }}><Activity size={14}/> Show supporting data</button><button onClick={() => { setFollowup("Summarize the differences between sources"); setShowFollowup(true); }}><FileText size={14}/> Summarize differences</button><button className="refresh-chip" aria-label="Refresh suggestions" onClick={() => notify("Suggestions refreshed")}><History size={15}/></button></div></div>
          {showFollowup && <div className="followup-result"><Sparkles size={14}/><span>{followup}: the annual report and strategy update agree on reported revenue, while market coverage differs.</span><button onClick={() => setShowFollowup(false)} aria-label="Dismiss"><X size={14}/></button></div>}
          <div className="composer"><button className="composer-sparkle" aria-label="Suggestions"><Sparkles size={16}/></button><input aria-label="Ask a follow-up" placeholder="Ask a follow-up about this answer…"/><button className="composer-send" aria-label="Send follow-up" onClick={() => { setFollowup("Your question is ready to check against the cited sources"); setShowFollowup(true); }}><ArrowRight size={18}/></button></div>
        </section>

        <aside className="evidence-panel">
          <div className="panel-heading evidence-heading"><span>Evidence</span><button className="icon-button small" aria-label="Expand evidence"><PanelRight size={16}/></button></div>
          <div className="evidence-list">{[demoClaims[2], demoClaims[0], demoClaims[3], demoClaims[4]].map((item) => <button key={item.id} onClick={() => selectClaim(item.id)} className={`evidence-row ${selected === item.id ? "evidence-active" : ""}`}><span className={`evidence-number ${item.verdict}`}>{item.id}</span><span className={`file-badge mini ${item.id === 3 ? "blue" : item.id === 4 ? "green" : "red"}`}>{item.id === 3 ? "D" : item.id === 4 ? "X" : "P"}</span><span className="evidence-line"><i/></span><span className="evidence-page">P. {item.page}</span></button>)}</div>
          <div className="evidence-divider" />
          <div className="preview-heading"><span>Document preview</span><button className="icon-button small" aria-label="Expand preview"><PanelRight size={16}/></button></div>
          <div className="preview-grid">{[1, 2, 3, 5].map((page) => <button key={page} className={`preview-card preview-${page} ${sourcePage === demoClaims.find((item) => item.id === page)?.page ? "preview-active" : ""}`} onClick={() => { selectClaim(page); setSourcePage(demoClaims.find((item) => item.id === page)?.page ?? page); }}><div className="preview-art">{page === 2 ? <div className="fake-chart"><i/><i/><i/><i/><i/></div> : page === 3 ? <div className="fake-pie"/> : page === 5 ? <div className="fake-table"><i/><i/><i/><i/></div> : <div className="fake-lines"><i/><i/><i/><i/><i/><i/><i/></div>}</div><span className="preview-index">{page}</span><span className="preview-caption">{page === 1 ? "Annual results" : page === 2 ? "Revenue by year" : page === 3 ? "Customer mix" : "Market summary"}</span></button>)}</div>
          <div className="preview-footer"><button aria-label="Previous page" onClick={() => setSourcePage((page) => Math.max(1, page - 1))}><ChevronLeft size={16}/></button><span>{sourcePage} <i/> 34</span><button aria-label="Next page" onClick={() => setSourcePage((page) => page + 1)}><ChevronRight size={16}/></button><span className="footer-spacer"/><button className={sourceMode === "grid" ? "mode-active" : ""} aria-label="Thumbnail view" onClick={() => setSourceMode("grid")}><Grid2X2 size={15}/></button><button className={sourceMode === "pages" ? "mode-active" : ""} aria-label="Text view" onClick={() => setSourceMode("pages")}><BookOpen size={15}/></button></div>
        </aside>
      </>}
      {auditLoaded && <div className="selected-claim" key={claim.id}><div className="selected-claim-top"><ContextCard title={`${verdictMeta[claim.verdict].label} · ${claim.type}`} description={claim.explanation} evidence={`${claim.source} · p. ${claim.page}: “${claim.quote}”`}><span tabIndex={0} className={`verdict-pill ${claim.verdict}`}><i>{verdictMeta[claim.verdict].mark}</i>{verdictMeta[claim.verdict].label}</span></ContextCard><span className="claim-type">{claim.type}</span></div><p>{claim.explanation}</p><div className="quote-box selected-evidence"><span>From {claim.source} · p. {claim.page}</span><blockquote>“{claim.quote}”</blockquote><button onClick={() => notify("Source quote copied")}><Copy size={13}/> Copy quote</button></div><div className="claim-actions"><button onClick={() => notify("Opening source at page " + claim.page)}><BookOpen size={14}/> View in source</button>{(claim.verdict === "contradicted" || claim.verdict === "unsupported") && <button className="correct-button" onClick={() => notify("Correction flow ready")}>Correct & re-audit <ArrowRight size={14}/></button>}</div></div>}
      {toast && <div className="toast"><Check size={15}/>{toast}</div>}
      {reportOpen && <div className="modal-backdrop" onClick={() => setReportOpen(false)}><section className="report-modal" onClick={(event) => event.stopPropagation()}><div className="report-modal-head"><div><span className="eyebrow">AUDIT REPORT</span><h2>Answer review</h2></div><button className="icon-button" aria-label="Close report" onClick={() => setReportOpen(false)}><X size={18}/></button></div><div className="report-stats"><b>5</b><span>claims reviewed</span><span className="report-good">3 supported</span><span className="report-bad">1 contradicted</span><span className="report-warn">1 unsupported</span></div><p className="report-answer">{answer}</p><h3>Claim findings</h3>{demoClaims.map((item) => <div className="report-item" key={item.id}><span className={`verdict-pill ${item.verdict}`}><i>{verdictMeta[item.verdict].mark}</i>{verdictMeta[item.verdict].label}</span><p>{item.text}</p><small>{item.source} · p. {item.page}</small></div>)}<p className="method-note">Methodology: verdicts are relative to the uploaded sources.</p><button className="primary-button print-button" onClick={() => window.print()}>Print or save as PDF <ArrowDown size={15}/></button></section></div>}
    </main>
  );
}
