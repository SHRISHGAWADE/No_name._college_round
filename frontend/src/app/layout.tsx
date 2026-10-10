import type { Metadata } from "next";
import type { ReactNode } from "react";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { AuthGate } from "@/components/AuthGate";
import "./globals.css";

export const metadata: Metadata = { title: "Second Opinion", description: "Review AI answers against your source documents." };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body><AuthGate><WorkspaceShell>{children}</WorkspaceShell></AuthGate></body></html>;
}
