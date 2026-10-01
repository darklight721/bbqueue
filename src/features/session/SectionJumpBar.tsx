import { useEffect, useState } from "react";

export interface JumpTarget {
  /** Element id of the section wrapper. */
  id: string;
  label: string;
}

/** Offset so a section lands below the sticky top bar + this bar. */
export const SECTION_SCROLL_MARGIN = "scroll-mt-[calc(8rem+env(safe-area-inset-top))]";

/**
 * Sticky row of section shortcuts under the top bar (Courts · Queues · Players · History).
 * Buttons (not hash links) so jumping doesn't add browser history entries.
 */
export function SectionJumpBar({ targets }: { targets: readonly JumpTarget[] }) {
  const [active, setActive] = useState<string | null>(targets[0]?.id ?? null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting);
        const first = targets.find((target) => visible.get(target.id));
        if (first) setActive(first.id);
      },
      // A band just under the sticky bars decides which section is "current".
      { rootMargin: "-30% 0px -60% 0px" },
    );
    for (const target of targets) {
      const element = document.getElementById(target.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [targets]);

  return (
    <nav
      aria-label="Sections"
      className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-10 -mx-4 -mt-5 border-b border-base-300 bg-base-100/95 px-4 py-1.5 backdrop-blur"
    >
      <ul className="flex gap-2 overflow-x-auto">
        {targets.map((target) => {
          const current = target.id === active;
          return (
            <li key={target.id}>
              <button
                type="button"
                aria-current={current ? "true" : undefined}
                className={`btn h-11 min-h-11 rounded-full px-5 ${
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
