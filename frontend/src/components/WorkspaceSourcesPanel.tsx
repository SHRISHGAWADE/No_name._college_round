"use client";

import { useState } from "react";
import { ChevronDown, Database, FileText, Filter, PanelLeftClose } from "lucide-react";

type VerdictFilter = "all" | "supported" | "contradicted" | "unsupported" | "ambiguous";
const verdictOptions: Array<{ value: VerdictFilter; label: string }> = [
  { value: "all", label: "All verdicts" },
  { value: "supported", label: "Supported" },
  { value: "contradicted", label: "Contradicted" },
  { value: "unsupported", label: "Insufficient evidence" },
  { value: "ambiguous", label: "Ambiguous" },
];

export function WorkspaceSourcesPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [filter, setFilter] = useState<VerdictFilter>("all");
  const [filtersExpanded, setFiltersExpanded] = useState(true);

  return <aside className={`workspace-sources-panel ${open ? "is-open" : "is-closed"}`} aria-label="Workspace sources" aria-hidden={!open}>
    <div className="workspace-sources-header">
      <div><span className="workspace-sources-eyebrow">WORKSPACE</span><h2>Sources</h2><p>Source records will appear here when available.</p></div>
      <button className="sources-panel-close" type="button" onClick={onClose} aria-label="Close sources panel" tabIndex={open ? 0 : -1}><PanelLeftClose size={16}/></button>
    </div>
    <div className="workspace-sources-list">
      <div className="workspace-source-row is-active" aria-current="true"><Database size={17} className="workspace-source-all-icon"/><span className="workspace-source-name">All Sources</span><span className="workspace-source-count">0</span></div>
      <p className="workspace-sources-empty">No sources available.</p>
    </div>
    <div className="workspace-sources-divider"/>
    <button type="button" className="workspace-filter-toggle" aria-expanded={filtersExpanded} tabIndex={open ? 0 : -1} onClick={() => setFiltersExpanded((expanded) => !expanded)}><span><Filter size={14}/> Filters</span><ChevronDown size={15} className={filtersExpanded ? "is-expanded" : ""}/></button>
    {filtersExpanded && <div className="workspace-source-filters">
      {verdictOptions.map(({ value, label }) => <button key={value} type="button" className={`workspace-source-filter ${filter === value ? "is-active" : ""}`} aria-pressed={filter === value} tabIndex={open ? 0 : -1} onClick={() => setFilter(value)}><span>{label}</span><span>0</span></button>)}
    </div>}
    <div className="workspace-source-insights">
      <div className="workspace-sources-divider"/>
      <div className="workspace-insights-heading"><span>Source coverage</span><span>0 claims</span></div>
      <div className="workspace-current-evidence"><FileText size={14}/><span>No evidence available.</span></div>
    </div>
    <div className="workspace-sources-footer"><span className="workspace-footer-dot"/> Source and claim counts update when records are available.</div>
  </aside>;
}
