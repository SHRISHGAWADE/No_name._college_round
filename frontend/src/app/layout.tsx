import type { Metadata } from "next";
import type { ReactNode } from "react";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import "./globals.css";

export const metadata: Metadata = { title: "Sourcewell — Answer audit", description: "Review AI answers against your source documents." };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body><WorkspaceShell>{children}</WorkspaceShell></body></html>;
}
