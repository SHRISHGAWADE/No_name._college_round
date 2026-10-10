"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Database, FileText, LoaderCircle, PanelLeftClose, Quote } from "lucide-react";
import { listSources, getSource } from "@/lib/api";
import type { Source } from "@/lib/types";

type SourceRow = Awaited<ReturnType<typeof listSources>>["sources"][number];

export function WorkspaceSourcesPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [selected, setSelected] = useState<Source | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const refresh = () => void listSources().then((data) => { if (alive) setSources(data.sources); })
      .catch((cause: unknown) => { if (alive) setError(cause instanceof Error ? cause.message : "Could not load your sources."); })
      .finally(() => { if (alive) setLoading(false); });
    refresh();
    window.addEventListener("second-opinion:sources", refresh);
    return () => { alive = false; window.removeEventListener("second-opinion:sources", refresh); };
  }, []);

  const openSource = async (row: SourceRow) => {
    setError("");
    try { setSelected(await getSource(row.source_id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open this document."); }
  };

  return <aside className={`workspace-sources-panel ${open ? "is-open" : "is-closed"}`} aria-label="Your source documents" aria-hidden={!open}>
    <div className="workspace-sources-header"><div><span className="workspace-sources-eyebrow">PRIVATE LIBRARY</span><h2>Your sources</h2><p>Documents saved with your audits.</p></div><button className="sources-panel-close" type="button" onClick={onClose} aria-label="Close sources panel" tabIndex={open ? 0 : -1}><PanelLeftClose size={16}/></button></div>
    <div className="workspace-sources-list">
      <div className="workspace-source-row is-active"><Database size={17} className="workspace-source-all-icon"/><span className="workspace-source-name">All documents</span><span className="workspace-source-count">{sources.length}</span></div>
      {sources.map((source) => <button key={source.source_id} type="button" className="workspace-source-row" onClick={() => void openSource(source)} tabIndex={open ? 0 : -1}><span className="workspace-source-type pdf"><FileText size={14}/></span><span className="workspace-source-name" title={source.name}>{source.name}</span><span className="workspace-source-count">{source.page_count}p</span></button>)}
    </div>
    <div className="workspace-sources-divider"/>
    {loading ? <div className="workspace-current-evidence"><LoaderCircle className="spin" size={16}/> Loading library…</div> : error ? <div className="workspace-current-evidence"><strong>Library unavailable</strong><p>{error}</p></div> : selected ? <section className="workspace-current-evidence"><span className="workspace-current-label"><Quote size={12}/> Page {selected.pages[0]?.page ?? 1}</span><strong title={selected.name}>{selected.name}</strong><p>{selected.pages[0]?.text.slice(0, 460) || "No extracted text on this page."}</p><Link href="/sources" className="text-button">Open source library →</Link></section> : <div className="workspace-current-evidence"><span className="workspace-current-label"><Quote size={12}/> Documents stay private</span><p>Choose a source to preview its extracted text, or open your library to read the PDF.</p><Link href="/sources" className="text-button">Open source library →</Link></div>}
    <div className="workspace-sources-footer"><span className="workspace-footer-dot"/>{sources.length} document{sources.length === 1 ? "" : "s"} in your account</div>
  </aside>;
}
