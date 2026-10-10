"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Database, FileText, Filter, PanelLeftClose, Quote, ShieldCheck } from "lucide-react";
import { demoClaims, demoSources, type DemoClaim, type DemoVerdict } from "@/lib/demo-audit";

type VerdictFilter = DemoVerdict | "all";
type ClaimEvent = { claimId: number; source: string };

const verdictOptions: Array<{ value: VerdictFilter; label: string }> = [
  { value: "all", label: "All verdicts" },
  { value: "supported", label: "Supported" },
  { value: "contradicted", label: "Contradicted" },
  { value: "unsupported", label: "Insufficient evidence" },
  { value: "ambiguous", label: "Ambiguous" },
];

const verdictCounts: Record<DemoVerdict, number> = demoClaims.reduce((counts, claim) => {
  counts[claim.verdict] += 1;
  return counts;
}, { supported: 0, contradicted: 0, unsupported: 0, ambiguous: 0 });

export function WorkspaceSourcesPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [filter, setFilter] = useState<VerdictFilter>("all");
  const [activeSource, setActiveSource] = useState("all");
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [selectedClaimId, setSelectedClaimId] = useState(demoClaims[0].id);
  const selectedClaim = demoClaims.find((claim) => claim.id === selectedClaimId) ?? demoClaims[0];
  const sources = useMemo(() => demoSources.map((name) => {
    const claims = demoClaims.filter((claim) => claim.source === name);
    const visibleClaims = claims.filter((claim) => filter === "all" || claim.verdict === filter);
    return { name, type: name.split(".").pop()?.toUpperCase() ?? "FILE", claims, visibleClaims };
  }).filter((source) => source.visibleClaims.length > 0), [filter]);

  useEffect(() => {
    const handleClaimSelection = (event: Event) => {
      const detail = (event as CustomEvent<ClaimEvent>).detail;
      if (!detail || !demoClaims.some((claim) => claim.id === detail.claimId)) return;
      setSelectedClaimId(detail.claimId);
      setActiveSource(detail.source);
    };
    window.addEventListener("workspace:claim-select", handleClaimSelection);
    return () => window.removeEventListener("workspace:claim-select", handleClaimSelection);
  }, []);

  const selectClaim = (claim: DemoClaim) => {
    setSelectedClaimId(claim.id);
    setActiveSource(claim.source);
    window.dispatchEvent(new CustomEvent<ClaimEvent>("workspace:source-select", { detail: { claimId: claim.id, source: claim.source } }));
  };
  const selectSource = (sourceName: string) => {
    setFilter("all");
    if (sourceName === "all") {
      setActiveSource("all");
      selectClaim(demoClaims[0]);
      setActiveSource("all");
      return;
    }
    const source = demoSources.find((name) => name === sourceName);
    const firstClaim = demoClaims.find((claim) => claim.source === source);
    if (firstClaim) selectClaim(firstClaim);
  };
  const setVerdictFilter = (nextFilter: VerdictFilter) => {
    setFilter(nextFilter);
    if (nextFilter === "all") {
      setActiveSource("all");
      return;
    }
    const firstClaim = demoClaims.find((claim) => claim.verdict === nextFilter);
    if (firstClaim) selectClaim(firstClaim);
    else setActiveSource("all");
  };

  return <aside className={`workspace-sources-panel ${open ? "is-open" : "is-closed"}`} aria-label="Workspace sources" aria-hidden={!open}>
    <div className="workspace-sources-header">
      <div><span className="workspace-sources-eyebrow">WORKSPACE</span><h2>Sources</h2><p>Sample documents available across sections.</p></div>
      <button className="sources-panel-close" type="button" onClick={onClose} aria-label="Close sources panel" tabIndex={open ? 0 : -1}><PanelLeftClose size={16}/></button>
    </div>
    <div className="workspace-sources-list">
      <button type="button" className={`workspace-source-row ${activeSource === "all" ? "is-active" : ""}`} aria-pressed={activeSource === "all"} tabIndex={open ? 0 : -1} onClick={() => selectSource("all")}>
        <Database size={17} className="workspace-source-all-icon"/><span className="workspace-source-name">All Sources</span><span className="workspace-source-count">{demoSources.length}</span>
      </button>
      {sources.map((source) => <button key={source.name} type="button" className={`workspace-source-row ${activeSource === source.name ? "is-active" : ""}`} aria-pressed={activeSource === source.name} tabIndex={open ? 0 : -1} onClick={() => selectSource(source.name)}>
        <span className={`workspace-source-type ${source.type.toLowerCase()}`} aria-hidden="true"><FileText size={14}/></span><span className="workspace-source-name" title={source.name}>{source.name}</span><span className="workspace-source-count" title="Cited claims">{source.visibleClaims.length}</span>
      </button>)}
    </div>
    <div className="workspace-sources-divider"/>
    <button type="button" className="workspace-filter-toggle" aria-expanded={filtersExpanded} tabIndex={open ? 0 : -1} onClick={() => setFiltersExpanded((expanded) => !expanded)}><span><Filter size={14}/> Filters</span><ChevronDown size={15} className={filtersExpanded ? "is-expanded" : ""}/></button>
    {filtersExpanded && <div className="workspace-source-filters">
      {verdictOptions.map(({ value, label }) => {
        const count = value === "all" ? demoClaims.length : verdictCounts[value];
        return <button key={value} type="button" className={`workspace-source-filter ${filter === value ? "is-active" : ""}`} aria-pressed={filter === value} tabIndex={open ? 0 : -1} onClick={() => setVerdictFilter(value)}><span>{label}</span><span>{count}</span></button>;
      })}
    </div>}
    <div className="workspace-source-insights">
      <div className="workspace-sources-divider"/>
      <div className="workspace-insights-heading"><span>Source coverage</span><span>{demoClaims.length} claims</span></div>
      {demoSources.map((source) => {
        const count = demoClaims.filter((claim) => claim.source === source).length;
        return <div className="workspace-coverage-row" key={source}><span title={source}>{source.replace(/\.(pdf|docx|xlsx)$/i, "")}</span><i><b style={{ width: `${(count / demoClaims.length) * 100}%` }}/></i><small>{count}</small></div>;
      })}
      <section className="workspace-current-evidence" aria-live="polite">
        <span className="workspace-current-label"><Quote size={12}/> Selected evidence · p. {selectedClaim.page}</span>
        <strong title={selectedClaim.source}>{selectedClaim.source}</strong>
        <p>“{selectedClaim.quote}”</p>
        <span className={`workspace-evidence-verdict ${selectedClaim.verdict}`}><ShieldCheck size={12}/>{selectedClaim.verdict === "unsupported" ? "Insufficient evidence" : selectedClaim.verdict}</span>
      </section>
    </div>
    <div className="workspace-sources-footer"><span className="workspace-footer-dot"/> Counts reflect claims cited in this sample workspace.</div>
  </aside>;
}
