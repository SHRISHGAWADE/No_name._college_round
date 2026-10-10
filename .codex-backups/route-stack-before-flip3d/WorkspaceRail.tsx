"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Activity, Bookmark, Clock3, Database, FileText, Home, MessageSquareText, Settings, Sparkles } from "lucide-react";

const navigation = [
  { href: "/", label: "Home", description: "Start a new source-grounded review.", icon: Home },
  { href: "/audit/northstar-demo", label: "Audits", description: "Open the sample claim review.", icon: MessageSquareText },
  { href: "/history", label: "History", description: "Browse recent audit sessions.", icon: Clock3 },
  { href: "/sources", label: "Sources", description: "Browse documents in the sample workspace.", icon: FileText },
  { href: "/saved", label: "Saved", description: "Review saved sample findings.", icon: Bookmark, divider: true },
  { href: "/activity", label: "Activity", description: "See the sample review timeline.", icon: Activity },
];

function RailHint({ id, label, description, open, onOpen, onClose, children }: { id: string; label: string; description: string; open: boolean; onOpen: (id: string) => void; onClose: (id: string) => void; children: ReactNode }) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ left: 80, top: 12, originX: "0px" });

  useEffect(() => {
    if (open) { setMounted(true); return; }
    const timer = window.setTimeout(() => setMounted(false), 240);
    return () => window.clearTimeout(timer);
  }, [open]);

  const clearClose = () => { if (closeTimer.current !== null) window.clearTimeout(closeTimer.current); closeTimer.current = null; };
  const scheduleClose = () => {
    clearClose();
    closeTimer.current = window.setTimeout(() => {
      if (!anchorRef.current?.matches(":focus-within")) onClose(id);
    }, 110);
  };
  const show = () => {
    clearClose();
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cardWidth = Math.min(224, window.innerWidth - 24);
    const placeRight = rect.right + cardWidth + 12 <= window.innerWidth;
    const left = placeRight ? rect.right + 10 : Math.max(12, rect.left - cardWidth - 10);
    const top = Math.max(12, Math.min(rect.top + rect.height / 2 - 38, window.innerHeight - 88));
    setPosition({ left, top, originX: placeRight ? "0px" : "100%" });
    setMounted(true);
    window.requestAnimationFrame(() => onOpen(id));
  };
  const hide = () => {
    if (!anchorRef.current?.matches(":focus-within")) scheduleClose();
  };

  return <span ref={anchorRef} className="rail-hint" onPointerEnter={show} onPointerLeave={hide} onFocus={show} onBlur={hide}>
    {children}
    {mounted && typeof document !== "undefined" && createPortal(<div role="tooltip" id={`rail-hint-${id}`} aria-hidden={!open} className={`rail-tooltip${open ? " is-open" : ""}`} style={{ left: position.left, top: position.top, transformOrigin: `${position.originX} center`, "--tooltip-shift": `${position.originX === "0px" ? -7 : 7}px` } as CSSProperties} onPointerEnter={show} onPointerLeave={hide}>
      <strong>{label}</strong><span>{description}</span>
    </div>, document.body)}
  </span>;
}

function activeRoute(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href.startsWith("/audit/")) return pathname.startsWith("/audit/") || pathname.startsWith("/report/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function WorkspaceRail() {
  const pathname = usePathname();
  const router = useRouter();
  const navRef = useRef<HTMLElement>(null);
  const [marker, setMarker] = useState({ x: 0, y: 0, ready: false });
  const [activeHint, setActiveHint] = useState<string | null>(null);
  const selectedHref = pathname === "/settings" ? "/settings" : navigation.find((item) => activeRoute(pathname, item.href))?.href;
  const updateMarker = useCallback((target?: HTMLElement | null) => {
    const nav = navRef.current;
    const active = target ?? nav?.querySelector<HTMLElement>(".rail-button.active");
    if (!nav || !active) return;
    const navRect = nav.getBoundingClientRect();
    const buttonRect = active.getBoundingClientRect();
    const mobile = window.matchMedia("(max-width: 760px)").matches;
    setMarker({
      x: mobile ? buttonRect.left - navRect.left + (buttonRect.width - 28) / 2 : 0,
      y: mobile ? 0 : buttonRect.top - navRect.top + (buttonRect.height - 29) / 2,
      ready: true,
    });
  }, []);

  const navigateWithFlip = useCallback((event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || href === pathname) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const viewTransitionDocument = document as Document & {
      startViewTransition?: (update: () => void) => { finished: Promise<void> };
    };
    if (!viewTransitionDocument.startViewTransition) return;

    event.preventDefault();
    document.documentElement.classList.add("route-view-transition");
    const transition = viewTransitionDocument.startViewTransition(() => router.push(href));
    const clearTransitionState = () => document.documentElement.classList.remove("route-view-transition");
    void transition.finished.then(clearTransitionState, clearTransitionState);
  }, [pathname, router]);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    updateMarker();
    const refreshMarker = () => updateMarker();
    const observer = new ResizeObserver(refreshMarker);
    observer.observe(nav);
    window.addEventListener("resize", refreshMarker);
    return () => { observer.disconnect(); window.removeEventListener("resize", refreshMarker); };
  }, [pathname, updateMarker]);

  return <aside className="rail">
    <div className="rail-top"><Link href="/" className="brand-mark" aria-label="Second Opinion home"><Sparkles size={21} strokeWidth={1.8}/></Link></div>
    <nav ref={navRef} className="rail-nav" aria-label="Main navigation">
      <span aria-hidden="true" className="rail-active-indicator" style={{ "--indicator-x": `${marker.x}px`, "--indicator-y": `${marker.y}px`, opacity: marker.ready ? 1 : 0 } as CSSProperties}/>
      {navigation.map(({ href, label, description, icon: Icon, divider }) => <RailHint key={href} id={href} label={label} description={description} open={activeHint === href} onOpen={setActiveHint} onClose={(id) => setActiveHint((current) => current === id ? null : current)}><Link href={href} prefetch aria-label={label} aria-describedby={activeHint === href ? `rail-hint-${href}` : undefined} onPointerEnter={() => router.prefetch(href)} onFocus={() => router.prefetch(href)} onClick={(event) => { setActiveHint(null); navigateWithFlip(event, href); }} className={`rail-button ${selectedHref === href ? "active" : ""} ${divider ? "rail-divider" : ""}`}><Icon size={19} strokeWidth={1.8}/></Link></RailHint>)}
    </nav>
    <div className="rail-bottom"><RailHint id="/settings" label="Settings" description="Adjust preview display preferences." open={activeHint === "/settings"} onOpen={setActiveHint} onClose={(id) => setActiveHint((current) => current === id ? null : current)}><Link href="/settings" prefetch aria-label="Settings" aria-describedby={activeHint === "/settings" ? "rail-hint-/settings" : undefined} onPointerEnter={() => router.prefetch("/settings")} onFocus={() => router.prefetch("/settings")} onClick={(event) => { setActiveHint(null); navigateWithFlip(event, "/settings"); }} className={`rail-button ${pathname === "/settings" ? "active" : ""}`}><Settings size={19}/></Link></RailHint><RailHint id="/account" label="Account" description="View account and workspace details." open={activeHint === "/account"} onOpen={setActiveHint} onClose={(id) => setActiveHint((current) => current === id ? null : current)}><Link href="/account" prefetch aria-label="Account" aria-describedby={activeHint === "/account" ? "rail-hint-/account" : undefined} onPointerEnter={() => router.prefetch("/account")} onFocus={() => router.prefetch("/account")} onClick={(event) => { setActiveHint(null); navigateWithFlip(event, "/account"); }} className={`avatar ${pathname === "/account" ? "active" : ""}`}>S<span/></Link></RailHint></div>
  </aside>;
}
