"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { PanelLeftOpen } from "lucide-react";
import { RailHint, WorkspaceRail } from "@/components/WorkspaceRail";
import { WorkspaceSourcesPanel } from "@/components/WorkspaceSourcesPanel";

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const entranceStartedRef = useRef(false);
  const [sourcesOpen, setSourcesOpen] = useState(true);
  const [activeSourcesHint, setActiveSourcesHint] = useState<string | null>(null);

  useLayoutEffect(() => {
    const compactViewport = window.matchMedia("(max-width: 980px), (max-width: 1180px) and (max-aspect-ratio: 4/3)");
    const closeSourcesOnCompactViewport = () => {
      if (compactViewport.matches) setSourcesOpen(false);
    };

    closeSourcesOnCompactViewport();
    compactViewport.addEventListener("change", closeSourcesOnCompactViewport);
    return () => compactViewport.removeEventListener("change", closeSourcesOnCompactViewport);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || !event.isPrimary || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const { clientX, clientY } = event;
      const ripple = document.createElement("span");
      ripple.className = "click-water-ripple";
      ripple.setAttribute("aria-hidden", "true");
      ripple.style.left = `${clientX}px`;
      ripple.style.top = `${clientY}px`;
      for (let index = 0; index < 4; index += 1) ripple.appendChild(document.createElement("i"));
      document.body.appendChild(ripple);
      // The four staggered waves finish by 614ms; leave a short paint buffer.
      window.setTimeout(() => ripple.remove(), 700);
    };

    root.addEventListener("pointerdown", handlePointerDown);
    return () => root.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const page = root?.querySelector<HTMLElement>(".workspace-main");
    if (!root || !page) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const bounceTimers = new WeakMap<HTMLElement, number>();
    const bouncedAtBottom = new WeakSet<HTMLElement>();
    let touchStart: { target: EventTarget | null; y: number } | null = null;

    const bounce = (element: HTMLElement) => {
      if (reducedMotion.matches || bouncedAtBottom.has(element) || element.classList.contains("overscroll-bounce-bottom")) return;
      bouncedAtBottom.add(element);
      element.classList.add("overscroll-bounce-bottom");
      const timer = window.setTimeout(() => {
        element.classList.remove("overscroll-bounce-bottom");
        bounceTimers.delete(element);
      }, 460);
      bounceTimers.set(element, timer);
    };

    const nearestScroller = (target: EventTarget | null) => {
      let element = target instanceof Element ? target : null;
      while (element && element !== root) {
        const style = window.getComputedStyle(element);
        const canScroll = /^(auto|scroll|overlay)$/.test(style.overflowY);
        if (canScroll && element.scrollHeight > element.clientHeight + 1) return element as HTMLElement;
        element = element.parentElement;
      }
      return null;
    };

    const isAtBottom = (element: HTMLElement) => element.scrollTop + element.clientHeight >= element.scrollHeight - 2;
    const bounceAtBottom = (target: EventTarget | null) => {
      const scroller = nearestScroller(target);
      if (scroller) {
        if (isAtBottom(scroller)) bounce(scroller);
        return;
      }

      const documentScroller = document.scrollingElement;
      if (documentScroller && documentScroller.scrollHeight > window.innerHeight + 1 && documentScroller.scrollTop + window.innerHeight >= documentScroller.scrollHeight - 2) {
        bounce(page);
      }
    };

    const rearmAfterLeavingBottom = (target: EventTarget | null) => {
      const scroller = nearestScroller(target);
      if (scroller) {
        if (!isAtBottom(scroller)) bouncedAtBottom.delete(scroller);
        return;
      }

      const documentScroller = document.scrollingElement;
      if (documentScroller && (documentScroller.scrollHeight <= window.innerHeight + 1 || documentScroller.scrollTop + window.innerHeight < documentScroller.scrollHeight - 2)) {
        bouncedAtBottom.delete(page);
      }
    };

    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY > 0) {
        const target = event.target;
        // Check after the browser applies this wheel delta, so the gesture that
        // reaches the bottom also triggers the rebound without needing another tick.
        window.requestAnimationFrame(() => bounceAtBottom(target));
      }
    };
    const handleTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch) touchStart = { target: event.target, y: touch.clientY };
    };
    const handleTouchEnd = (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      if (touchStart && touch && touchStart.y - touch.clientY > 12) bounceAtBottom(touchStart.target);
      touchStart = null;
    };
    const handleScroll = (event: Event) => rearmAfterLeavingBottom(event.target);

    document.addEventListener("wheel", handleWheel, { passive: true });
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    document.addEventListener("scroll", handleScroll, { passive: true, capture: true });
    return () => {
      document.removeEventListener("wheel", handleWheel);
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("scroll", handleScroll, true);
      root.querySelectorAll<HTMLElement>(".overscroll-bounce-bottom").forEach((element) => {
        const timer = bounceTimers.get(element);
        if (timer !== undefined) window.clearTimeout(timer);
        element.classList.remove("overscroll-bounce-bottom");
      });
    };
  }, []);

  useEffect(() => {
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (!finePointer.matches) return;

    const orb = document.createElement("span");
    orb.className = "glass-orb-cursor";
    orb.setAttribute("aria-hidden", "true");
    document.body.appendChild(orb);
    document.documentElement.classList.add("glass-orb-enabled");

    const moveOrb = (event: PointerEvent) => {
      orb.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0) translate(-50%, -50%)`;
      orb.classList.add("is-visible");
    };
    const hideOrb = () => orb.classList.remove("is-visible");
    const pressOrb = (event: PointerEvent) => {
      orb.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0) translate(-50%, -50%)`;
      orb.classList.add("is-visible", "is-pressed");
    };
    const releaseOrb = () => orb.classList.remove("is-pressed");

    document.addEventListener("pointermove", moveOrb, { passive: true });
    document.documentElement.addEventListener("pointerleave", hideOrb);
    document.addEventListener("pointerdown", pressOrb, { passive: true });
    window.addEventListener("pointerup", releaseOrb, { passive: true });
    window.addEventListener("blur", hideOrb);

    return () => {
      document.removeEventListener("pointermove", moveOrb);
      document.documentElement.removeEventListener("pointerleave", hideOrb);
      document.removeEventListener("pointerdown", pressOrb);
      window.removeEventListener("pointerup", releaseOrb);
      window.removeEventListener("blur", hideOrb);
      document.documentElement.classList.remove("glass-orb-enabled");
      orb.remove();
    };
  }, []);

  useLayoutEffect(() => {
    if (entranceStartedRef.current) return;
    entranceStartedRef.current = true;
    const root = rootRef.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const entranceGroups: Array<[string, string]> = [
      ["workspace-enter-left", ".rail, .workspace-sources-panel"],
      ["workspace-enter-support", ".home-topbar, .route-topbar, .welcome-card, .welcome-actions"],
    ];
    const entering: HTMLElement[] = [];

    root.querySelector<HTMLElement>(".workspace-main > .app-shell:not(.route-shell) > .welcome-page")?.classList.add("workspace-enter-main");
    entranceGroups.forEach(([className, selector]) => {
      root.querySelectorAll<HTMLElement>(selector).forEach((element, index) => {
        element.classList.add(className);
        if (className === "workspace-enter-support") {
          element.style.setProperty("--entrance-delay", `${Math.min(index, 5) * 60}ms`);
        }
        entering.push(element);
      });
    });

    window.setTimeout(() => {
      entering.forEach((element) => {
        element.classList.remove("workspace-enter-left", "workspace-enter-support");
        element.style.removeProperty("--entrance-delay");
      });
    }, 1100);
  }, []);

  return <div ref={rootRef} className={`workspace-root ${sourcesOpen ? "sources-open" : "sources-closed"}`}>
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
