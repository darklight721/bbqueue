import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";

export interface JumpTarget {
  /** Element id of the section wrapper. */
  id: string;
  label: string;
}

/*
 * Bar geometry. Everything below is derived from it, so change them together:
 *   buttons 2.75rem, padding 0.375rem all round, 1px border → ~3.6rem tall,
 *   floating max(0.75rem, bottom safe area + 0.5rem) above the bottom edge
 */

/** Offset so a section lands below the top bar (the jump bar floats at the bottom). */
export const SECTION_SCROLL_MARGIN = "scroll-mt-[calc(5rem+env(safe-area-inset-top))]";

/**
 * Space to leave at the end of the page so the floating jump bar never covers the last
 * thing on it (End session). The bar's height plus a little breathing room.
 */
export const JUMP_BAR_BOTTOM_SPACE = "h-[calc(4.5rem+env(safe-area-inset-bottom))]";

/** Bottom offset for pop-up messages: above the jump bar. */
export const NOTICE_BOTTOM = "bottom-[calc(5.25rem+env(safe-area-inset-bottom))]";

/** Input types that bring up the on-screen keyboard. */
const TYPING_INPUTS = new Set(["text", "search", "email", "tel", "url", "number", "password"]);

function isTypingField(element: EventTarget | null): boolean {
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement) return TYPING_INPUTS.has(element.type);
  return element instanceof HTMLElement && element.isContentEditable;
}

/**
 * True while a text field has focus. The bottom bar then gets out of the way of the
 * on-screen keyboard (iOS keeps fixed bars floating above it, over the page).
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
 * Where the current-section pill sits: under the current button, measured from the list.
 * Null until measured (and in jsdom, which has no layout), so it never slides in from 0.
 */
function usePill(
  listRef: RefObject<HTMLUListElement | null>,
  active: string | null,
  hidden: boolean,
): { left: number; width: number } | null {
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || hidden) return;
    const measure = () => {
      const item = list.querySelector<HTMLElement>(`[data-jump="${active}"]`);
      setPill(item?.offsetWidth ? { left: item.offsetLeft, width: item.offsetWidth } : null);
    };
    measure();
    // Labels can change width (fonts loading, narrow phones crossing a padding step).
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(list);
    return () => observer?.disconnect();
  }, [listRef, active, hidden]);
  return pill;
}

/**
 * Row of section shortcuts (Courts · Queues · Players · History) in a capsule floating at
 * the bottom of the screen, within thumb reach. A pill slides behind the current section.
 * Buttons (not hash links) so jumping doesn't add browser history entries.
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
  const listRef = useRef<HTMLUListElement>(null);
  const pill = usePill(listRef, active, typing);

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
    <div
      className={`px-safe pointer-events-none fixed inset-x-0 bottom-[max(0.75rem,calc(env(safe-area-inset-bottom)+0.5rem))] z-30 justify-center ${typing ? "hidden" : "flex"}`}
    >
      <nav
        aria-label="Sections"
        className="pointer-events-auto max-w-full rounded-full border border-base-300 bg-base-100/95 p-1.5 shadow-lg shadow-black/10 backdrop-blur supports-[backdrop-filter]:bg-base-100/85"
      >
        <ul ref={listRef} className="relative flex overflow-x-auto">
          {pill ? (
            <li
              aria-hidden="true"
              className="absolute inset-y-0 left-0 rounded-full bg-secondary transition-[translate,width] duration-300 ease-out"
              style={{ translate: `${pill.left}px 0`, width: pill.width }}
            />
          ) : null}
          {targets.map((target) => {
            const current = target.id === active;
            return (
              <li key={target.id} data-jump={target.id} className="relative flex-none">
                <button
                  type="button"
                  aria-current={current ? "true" : undefined}
                  className={`btn h-11 min-h-11 rounded-full border-0 px-2.5 shadow-none transition-colors min-[360px]:px-3.5 min-[400px]:px-5 ${
                    current
                      ? "bg-transparent text-secondary-content hover:bg-transparent"
                      : "btn-ghost text-base-content/70"
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
    </div>
  );
}
