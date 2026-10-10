import type { Metadata } from "next";
import type { ReactNode } from "react";
import { WorkspaceRail } from "@/components/WorkspaceRail";
import "./globals.css";

export const metadata: Metadata = { title: "Sourcewell — Answer audit", description: "Review AI answers against your source documents." };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body><div className="workspace-root"><WorkspaceRail/><div className="workspace-main">{children}</div></div></body></html>;
}
