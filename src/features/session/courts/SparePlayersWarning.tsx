import { useEffect, useId, useRef, useState } from "react";
import { WarningIcon } from "../../../components/icons.tsx";
import { spareNotice, spareNoticeText, type SpareNotice } from "../../../domain/engine/index.ts";
import { useSessionView } from "../context.ts";

/**
 * Warning icon in the Courts header while the Session has few Spare players (see GLOSSARY:
 * Spare players). It says what will happen, it isn't an error, so it stays small: tapping it opens
 * a popover with the explanation. Recomputed on every render, so it comes and goes as Courts,
 * players or Sitting out change. Only whoever can change the Session sees it.
 */
export function SparePlayersWarning() {
  const { session, readOnly } = useSessionView();
  const notice = spareNotice(session);
  if (readOnly || notice === null) return null;
  // Mounted only while there is a notice, so the popover starts closed each time it comes back.
  return <WarningButton notice={notice} />;
}

function WarningButton({ notice }: { notice: SpareNotice }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  // While open: a tap anywhere else or Escape closes it. A tap on the icon itself toggles it.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative -my-1 -mr-1 shrink-0">
      <button
        type="button"
        className="group grid size-11 cursor-pointer place-items-center rounded-full"
        aria-label="Few spare players"
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <span
          // Keyed by the count so a new case rises in again rather than silently swapping.
          key={notice.key}
          aria-hidden="true"
          // Solid amber badge, the same as the install tip's warning. A soft halo while open ties
          // it to its popover.
          className={`animate-rise grid size-9 place-items-center rounded-full bg-warning text-warning-content shadow-sm transition-[box-shadow,scale] duration-150 group-active:scale-90 ${
            open ? "ring-4 ring-warning/30" : ""
          }`}
        >
          <WarningIcon className="-mt-px size-5" />
        </span>
      </button>

      {open ? (
        <div
          id={popoverId}
          role="note"
          aria-label="Few spare players"
          // Hangs from the icon's right edge, so on a phone it opens leftwards across the header
          // and never runs off screen.
          className="animate-pop absolute top-full right-0 z-30 mt-1.5 w-[min(19rem,calc(100vw-2rem))] origin-top-right"
        >
          {/* Small tip pointing up at the badge's centre. */}
          <span
            aria-hidden="true"
            className="absolute -top-[5px] right-4 size-3 rotate-45 rounded-tl-[3px] border-t-[1.5px] border-l-[1.5px] border-base-300 bg-base-200"
          />
          <p className="rounded-box border-[1.5px] border-base-300 bg-base-200 px-4 py-3 text-sm leading-snug text-pretty text-base-content/85 shadow-xl">
            {spareNoticeText(notice)}
          </p>
        </div>
      ) : null}
    </div>
  );
}
