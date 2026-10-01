import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

export interface JumpTarget {
  /** Element id of the section wrapper. */
  id: string;
  label: string;
}

/*
 * Bar geometry. Everything below is derived from it, so change them together:
 *   buttons 2.75rem, padding 0.625rem top and bottom, 1px border
 *   → phones (fixed at the bottom): ~3.5rem + max(0.625rem, bottom safe area)
 *   → sm and up (sticky under the 4rem top bar): ~4.1rem
 */

/**
 * Offset so a section lands below the bars at the top of the screen.
 * Phones: only the top bar (the jump bar sits at the bottom). `sm` and up: top bar + jump bar.
 */
export const SECTION_SCROLL_MARGIN =
  "scroll-mt-[calc(5rem+env(safe-area-inset-top))] sm:scroll-mt-[calc(8.5rem+env(safe-area-inset-top))]";

/**
 * Space to leave at the end of the page on phones so the fixed jump bar never covers the
 * last thing on it (End session). The bar's height plus a little breathing room.
 */
export const JUMP_BAR_BOTTOM_SPACE = "h-[calc(4.5rem+env(safe-area-inset-bottom))] sm:hidden";

/** Bottom offset for pop-up messages: above the jump bar on phones, near the edge otherwise. */
export const NOTICE_BOTTOM =
  "bottom-[calc(5rem+env(safe-area-inset-bottom))] sm:bottom-[max(1rem,env(safe-area-inset-bottom))]";

/** Input types that bring up the on-screen keyboard. */
const TYPING_INPUTS = new Set(["text", "search", "email", "tel", "url", "number", "password"]);

function isTypingField(element: EventTarget | null): boolean {
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement) return TYPING_INPUTS.has(element.type);
  return element instanceof HTMLElement && element.isContentEditable;
}

/**
 * True while a text field has focus. On phones the bottom bar then gets out of the way of
 * the on-screen keyboard (iOS keeps fixed bars floating above it, over the page).
 */
function useTyping(): boolean {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => setTyping(isTypingField(event.target));
    const onFocusOut = (event: FocusEvent) => setTyping(isTypingField(event.relatedTarget));
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);
  return typing;
}

/** True when the page has been scrolled and can't scroll any further down. */
function isScrolledToBottom(): boolean {
  const root = document.documentElement;
  const scrolled = window.scrollY;
  return scrolled > 0 && scrolled + window.innerHeight >= root.scrollHeight - 2;
}

/**
 * Row of section shortcuts (Courts · Queues · Players · History).
 * Phones: fixed to the bottom of the screen, within thumb reach. `sm` and up: sticky under
 * the top bar. Buttons (not hash links) so jumping doesn't add browser history entries.
 *
 * `onJump` runs before scrolling, so a collapsed section can open first and the page can
 * scroll all the way to it.
 */
export function SectionJumpBar({
  targets,
  onJump,
}: {
  targets: readonly JumpTarget[];
  onJump?: (id: string) => void;
}) {
  const [active, setActive] = useState<string | null>(targets[0]?.id ?? null);
  const typing = useTyping();

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
        // A band in the upper part of the screen decides which section is "current".
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
      className={`px-safe fixed inset-x-0 bottom-0 z-30 border-t border-base-300 bg-base-100/95 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-6px_20px_-12px_rgb(0_0_0/0.25)] backdrop-blur sm:sticky sm:top-[calc(4rem+env(safe-area-inset-top))] sm:bottom-auto sm:z-10 sm:-mx-4 sm:-mt-5 sm:border-t-0 sm:border-b sm:px-4 sm:py-2.5 sm:shadow-none ${typing ? "max-sm:hidden" : ""}`}
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
                  // Open a collapsed section and let it render before measuring the scroll.
                  if (onJump) flushSync(() => onJump(target.id));
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
