import { useEffect, useState } from "react";

export interface JumpTarget {
  /** Element id of the section wrapper. */
  id: string;
  label: string;
}

/** Offset so a section lands below the sticky top bar + this bar. */
export const SECTION_SCROLL_MARGIN = "scroll-mt-[calc(8rem+env(safe-area-inset-top))]";

/** True when the page has been scrolled and can't scroll any further down. */
function isScrolledToBottom(): boolean {
  const root = document.documentElement;
  const scrolled = window.scrollY;
  return scrolled > 0 && scrolled + window.innerHeight >= root.scrollHeight - 2;
}

/**
 * Sticky row of section shortcuts under the top bar (Courts · Queues · Players · History).
 * Buttons (not hash links) so jumping doesn't add browser history entries.
 */
export function SectionJumpBar({ targets }: { targets: readonly JumpTarget[] }) {
  const [active, setActive] = useState<string | null>(targets[0]?.id ?? null);

  useEffect(() => {
    const last = targets.at(-1);
    const visible = new Map<string, boolean>();

    // The last section often can't scroll up into the observer band (the page ends first),
    // so once the page is scrolled to the very bottom, the last section is current.
    const update = () => {
      if (last && isScrolledToBottom()) {
        setActive(last.id);
        return;
      }
      const first = targets.find((target) => visible.get(target.id));
      if (first) setActive(first.id);
    };

    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting);
          update();
        },
        // A band just under the sticky bars decides which section is "current".
        { rootMargin: "-30% 0px -60% 0px" },
      );
      for (const target of targets) {
        const element = document.getElementById(target.id);
        if (element) observer.observe(element);
      }
    }

    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, [targets]);

  return (
    <nav
      aria-label="Sections"
      className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-10 -mx-4 -mt-5 border-b border-base-300 bg-base-100/95 px-4 py-1.5 backdrop-blur"
    >
      <ul className="flex gap-1 overflow-x-auto sm:gap-2">
        {targets.map((target) => {
          const current = target.id === active;
          return (
            <li key={target.id} className="flex-1 sm:flex-none">
              <button
                type="button"
                aria-current={current ? "true" : undefined}
                className={`btn h-11 min-h-11 w-full rounded-full px-1.5 min-[360px]:px-3 sm:px-5 ${
                  current ? "btn-secondary" : "btn-ghost text-base-content/70"
                }`}
                onClick={() => {
                  setActive(target.id);
                  const element = document.getElementById(target.id);
                  if (element && typeof element.scrollIntoView === "function") {
                    element.scrollIntoView({ behavior: "smooth", block: "start" });
                  }
                }}
              >
                {target.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
