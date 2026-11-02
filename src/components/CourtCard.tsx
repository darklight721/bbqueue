import type { CSSProperties, ReactNode, Ref } from "react";
import { CourtLines } from "./CourtLines.tsx";
import { PencilIcon } from "./icons.tsx";

/** The glow and court lines: from the top left across the card (Account), or off its right edge. */
const LAYOUT = {
  across: {
    glow: "radial-gradient(110% 80% at 0% 0%, rgb(255 255 255 / 0.2), transparent 55%), linear-gradient(160deg, transparent 35%, var(--color-court-deep) 100%)",
    lines:
      "absolute top-1/2 left-[62%] -z-10 w-[150%] max-w-none -translate-x-1/2 -translate-y-1/2 -rotate-[24deg] text-line/20",
  },
  right: {
    glow: "radial-gradient(120% 120% at 100% 0%, rgb(255 255 255 / 0.18), transparent 55%), linear-gradient(200deg, transparent 40%, var(--color-court-deep) 100%)",
    lines:
      "absolute top-1/2 right-[-34%] -z-10 w-[85%] max-w-none -translate-y-1/2 rotate-[12deg] text-line/20",
  },
} as const;

/**
 * Court-green panel in the Home hero's style: glow, faint court lines, off-white text. The card at
 * the top of the Account page, Stats and the Club page.
 */
export function CourtCard({
  label,
  labelledBy,
  layout = "right",
  animate = true,
  style,
  children,
}: {
  label?: string;
  labelledBy?: string;
  layout?: keyof typeof LAYOUT;
  /** Rise in when it appears. Off when the page around it only changes mode. */
  animate?: boolean;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={label}
      aria-labelledby={labelledBy}
      className={`${animate ? "animate-rise" : ""} relative isolate overflow-hidden rounded-box bg-court text-line shadow-lg`}
      style={style}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{ background: LAYOUT[layout].glow }}
      />
      <CourtLines className={LAYOUT[layout].lines} />
      <div className="flex flex-col p-5">{children}</div>
    </section>
  );
}

/** Small all-caps caption above a value on the card. */
export function CourtCardCaption({ children }: { children: ReactNode }) {
  return <p className="text-xs font-bold tracking-[0.14em] text-line/70 uppercase">{children}</p>;
}

/** The pencil "Edit" pill in the card's top-right corner. */
export function CourtCardEditButton({
  buttonRef,
  label,
  describedBy,
  disabled = false,
  onClick,
}: {
  buttonRef?: Ref<HTMLButtonElement>;
  /** Accessible name, e.g. "Edit name". */
  label: string;
  describedBy?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className="btn h-10 min-h-10 shrink-0 gap-1.5 rounded-full border-line/35 bg-line/10 px-4 text-line shadow-none hover:border-line/60 hover:bg-line/20 disabled:border-line/15 disabled:bg-transparent disabled:text-line/45"
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={onClick}
    >
      <PencilIcon className="size-4" />
      Edit
    </button>
  );
}
