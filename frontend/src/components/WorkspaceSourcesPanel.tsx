"use client";

import { useEffect, useState } from "react";
import { FileText, PanelLeftClose } from "lucide-react";
import type { Source } from "@/lib/types";

const SOURCE_STORAGE_KEY = "second-opinion-audit-sources";
function readSources(): Source[] {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(SOURCE_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Source => typeof item === "object" && item !== null && "source_id" in item && "name" in item && "pages" in item);
  } catch { return []; }
}

export function WorkspaceSourcesPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [sources, setSources] = useState<Source[]>([]);
  useEffect(() => {
    const update = () => setSources(readSources());
    update();
    window.addEventListener("second-opinion:sources", update);
    window.addEventListener("storage", update);
    return () => { window.removeEventListener("second-opinion:sources", update); window.removeEventListener("storage", update); };
  }, []);

  return <aside className={`workspace-sources-panel ${open ? "is-open" : "is-closed"}`} aria-label="Audit sources" aria-hidden={!open}>
    <div className="workspace-sources-header"><div><span className="workspace-sources-eyebrow">CURRENT AUDIT</span><h2>Sources</h2><p>Documents supplied for this review.</p></div><button className="sources-panel-close" type="button" onClick={onClose} aria-label="Close sources panel" tabIndex={open ? 0 : -1}><PanelLeftClose size={16}/></button></div>
    <div className="workspace-sources-list">{sources.length ? sources.map((source) => <div key={source.source_id} className="workspace-source-row"><span className="workspace-source-type" aria-hidden="true"><FileText size={14}/></span><span className="workspace-source-name" title={source.name}>{source.name}</span><span className="workspace-source-count" title="Pages">{source.pages.length}</span></div>) : <p className="workspace-source-empty">Your uploaded documents will appear here while you review an audit.</p>}</div>
    {sources.length > 0 && <><div className="workspace-sources-divider"/><div className="workspace-source-insights"><div className="workspace-insights-heading"><span>Source pages</span><span>{sources.reduce((sum, source) => sum + source.pages.length, 0)}</span></div>{sources.map((source) => source.pages.map((page) => <div className="workspace-coverage-row" key={`${source.source_id}-${page.page}`}><span>{source.name} · p. {page.page}</span></div>))}</div></>}
    <div className="workspace-sources-footer"><span className="workspace-footer-dot"/> Findings are relative to these sources.</div>
  </aside>;
}
