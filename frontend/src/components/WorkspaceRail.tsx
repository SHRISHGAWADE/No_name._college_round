"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, MessageSquareText, Sparkles } from "lucide-react";

const navigation = [
  { href: "/", label: "Home", description: "Start a new source-grounded review.", icon: Home },
];

export function RailHint({ id, label, description, open, onOpen, onClose, children, className = "", cardWidth = 224 }: { id: string; label: string; description: string; open: boolean; onOpen: (id: string) => void; onClose: (id: string) => void; children: ReactNode; className?: string; cardWidth?: number }) {
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
    const visibleCardWidth = Math.min(cardWidth, window.innerWidth - 24);
    const placeRight = rect.right + visibleCardWidth + 12 <= window.innerWidth;
    const left = placeRight ? rect.right + 10 : Math.max(12, rect.left - visibleCardWidth - 10);
    const top = Math.max(12, Math.min(rect.top + rect.height / 2 - 38, window.innerHeight - 88));
    setPosition({ left, top, originX: placeRight ? "0px" : "100%" });
    setMounted(true);
    window.requestAnimationFrame(() => onOpen(id));
  };
  const hide = () => {
    if (!anchorRef.current?.matches(":focus-within")) scheduleClose();
  };

  return <span ref={anchorRef} className={`rail-hint ${className}`} onPointerEnter={show} onPointerLeave={hide} onFocus={show} onBlur={hide}>
    {children}
    {mounted && typeof document !== "undefined" && createPortal(<div role="tooltip" id={`rail-hint-${id}`} aria-hidden={!open} className={`rail-tooltip${open ? " is-open" : ""}`} style={{ left: position.left, top: position.top, transformOrigin: `${position.originX} center`, "--tooltip-shift": `${position.originX === "0px" ? -7 : 7}px`, "--hint-width": `${cardWidth}px` } as CSSProperties} onPointerEnter={show} onPointerLeave={hide}>
      <strong>{label}</strong><span>{description}</span>
    </div>, document.body)}
  </span>;
}

function activeRoute(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href.startsWith("/audit/")) return pathname.startsWith("/audit/") || pathname.startsWith("/report/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

type NativeViewTransition = { finished: Promise<void>; skipTransition: () => void };
type ViewTransitionDocument = Document & { startViewTransition?: (update: () => Promise<void>) => NativeViewTransition };
type PendingRouteTransition = {
  target: string;
  timer: number;
  resolveUpdate: () => void;
  transition?: NativeViewTransition;
};

export function WorkspaceRail() {
  const pathname = usePathname();
  const router = useRouter();
  const navRef = useRef<HTMLElement>(null);
  const flipRef = useRef<PendingRouteTransition | null>(null);
  const [marker, setMarker] = useState({ x: 0, y: 0, ready: false });
  const [activeHint, setActiveHint] = useState<string | null>(null);
  const [latestAudit, setLatestAudit] = useState("");
  useEffect(() => {
    const update = () => { try { setLatestAudit(sessionStorage.getItem("second-opinion-current-audit") ?? ""); } catch { setLatestAudit(""); } };
    update();
    window.addEventListener("second-opinion:audit", update);
    window.addEventListener("storage", update);
    return () => { window.removeEventListener("second-opinion:audit", update); window.removeEventListener("storage", update); };
  }, []);
  const items = latestAudit ? [...navigation, { href: `/audit/${encodeURIComponent(latestAudit)}`, label: "Current audit", description: "Return to the latest audit review.", icon: MessageSquareText }] : navigation;
  const selectedHref = items.find((item) => activeRoute(pathname, item.href))?.href;
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

  const navigateTo = useCallback((href: string) => {
    if (href === pathname) return;
    const destinationItem = items.find((item) => activeRoute(href, item.href));
    const destinationLink = destinationItem
      ? Array.from(navRef.current?.querySelectorAll<HTMLAnchorElement>(".rail-button") ?? []).find((link) => link.getAttribute("href") === destinationItem.href)
      : null;
    // Move the single rail marker as soon as the destination is chosen; the rail itself stays fixed.
    if (destinationLink) updateMarker(destinationLink);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      router.push(href);
      return;
    }
    const liveMain = document.querySelector<HTMLElement>(".workspace-main");
    const transitionDocument = document as ViewTransitionDocument;
    if (!liveMain || !transitionDocument.startViewTransition) {
      router.push(href);
      return;
    }
    if (flipRef.current) {
      const previous = flipRef.current;
      window.clearTimeout(previous.timer);
      previous.transition?.skipTransition();
      previous.resolveUpdate();
      document.documentElement.classList.remove("is-route-transitioning");
      flipRef.current = null;
    }
    document.documentElement.classList.add("is-route-transitioning");
    let resolveUpdate = () => {};
    const updateComplete = new Promise<void>((resolve) => { resolveUpdate = resolve; });
    const pending: PendingRouteTransition = {
      target: href,
      timer: 0,
      resolveUpdate,
    };
    flipRef.current = pending;

    try {
      const transition = transitionDocument.startViewTransition(async () => {
        if (flipRef.current !== pending) return;
        router.push(href);
        await updateComplete;
      });
      pending.transition = transition;
      pending.timer = window.setTimeout(() => {
        if (flipRef.current !== pending) return;
        // Keep a slow dev compile from trapping the old screen in a transition.
        transition.skipTransition();
        pending.resolveUpdate();
      }, 7000);
      const cleanup = () => {
        window.clearTimeout(pending.timer);
        if (flipRef.current === pending) {
          document.documentElement.classList.remove("is-route-transitioning");
          document.documentElement.classList.add("has-route-transitioned");
          flipRef.current = null;
        }
      };
      void transition.finished.then(cleanup, cleanup);
    } catch {
      document.documentElement.classList.remove("is-route-transitioning");
      flipRef.current = null;
      router.push(href);
    }
  }, [items, pathname, router, updateMarker]);

  const navigateWithFlip = useCallback((event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || href === pathname) return;
    event.preventDefault();
    setActiveHint(null);
    navigateTo(href);
  }, [navigateTo, pathname]);

  useEffect(() => {
    const handleWorkspaceNavigation = (event: Event) => {
      const href = (event as CustomEvent<string>).detail;
      if (typeof href !== "string" || !href.startsWith("/")) return;
      setActiveHint(null);
      navigateTo(href);
    };
    window.addEventListener("workspace:navigate", handleWorkspaceNavigation);
    return () => window.removeEventListener("workspace:navigate", handleWorkspaceNavigation);
  }, [navigateTo]);

  useLayoutEffect(() => {
    const pendingFlip = flipRef.current;
    const currentPage = document.querySelector<HTMLElement>(".workspace-main [data-page-route]");
    if (pendingFlip && pendingFlip.target === pathname && currentPage?.dataset.pageRoute === pathname) {
      pendingFlip.resolveUpdate();
    }
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
    <div className="rail-top"><div className="brand-mark" aria-hidden="true"><Sparkles size={21} strokeWidth={1.8}/></div></div>
    <nav ref={navRef} className="rail-nav" aria-label="Main navigation">
      <span aria-hidden="true" className="rail-active-indicator" style={{ "--indicator-x": `${marker.x}px`, "--indicator-y": `${marker.y}px`, opacity: marker.ready ? 1 : 0 } as CSSProperties}/>
      {items.map(({ href, label, description, icon: Icon }) => <RailHint key={href} id={href} label={label} description={description} open={activeHint === href} onOpen={setActiveHint} onClose={(id) => setActiveHint((current) => current === id ? null : current)}><Link href={href} prefetch aria-label={label} aria-describedby={activeHint === href ? `rail-hint-${href}` : undefined} onPointerEnter={() => router.prefetch(href)} onFocus={() => router.prefetch(href)} onClick={(event) => { setActiveHint(null); navigateWithFlip(event, href); }} className={`rail-button ${selectedHref === href ? "active" : ""}`}><Icon size={19} strokeWidth={1.8}/></Link></RailHint>)}
    </nav>
    <div className="rail-bottom" />
  </aside>;
}
