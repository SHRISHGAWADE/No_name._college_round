"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { PanelLeftOpen } from "lucide-react";
import { RailHint, WorkspaceRail } from "@/components/WorkspaceRail";
import { WorkspaceSourcesPanel } from "@/components/WorkspaceSourcesPanel";

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const [sourcesOpen, setSourcesOpen] = useState(true);
  const [activeSourcesHint, setActiveSourcesHint] = useState<string | null>(null);

  return <div className={`workspace-root ${sourcesOpen ? "sources-open" : "sources-closed"}`}>
    <WorkspaceRail />
    <WorkspaceSourcesPanel open={sourcesOpen} onClose={() => setSourcesOpen(false)} />
    {!sourcesOpen && <RailHint id="workspace-sources" label="Sources" description="Browse source documents and claim coverage." open={activeSourcesHint === "workspace-sources"} onOpen={setActiveSourcesHint} onClose={() => setActiveSourcesHint(null)} cardWidth={336} className="sources-panel-hint">
      <button className="sources-panel-reopen" type="button" onClick={() => setSourcesOpen(true)} aria-label="Open sources panel" aria-expanded="false" aria-describedby={activeSourcesHint === "workspace-sources" ? "rail-hint-workspace-sources" : undefined}>
        <PanelLeftOpen size={16}/><span>Sources</span>
      </button>
    </RailHint>}
    <div className="workspace-main">{children}</div>
  </div>;
}
