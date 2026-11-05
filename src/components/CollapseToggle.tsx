import { ChevronDownIcon } from "./icons.tsx";

/**
 * Show/Hide button for a section header. Phones get just the chevron, so the detail next to
 * the title has room; "Show `subject`" is its accessible name at every width.
 */
export function CollapseToggle({
  open,
  subject,
  controls,
  onToggle,
}: {
  open: boolean;
  /** What it folds away, in lower case: "players" makes "Show players" and "Hide players". */
  subject: string;
  /** The id of the content it folds away. */
  controls: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="btn shrink-0 btn-square border-base-300 btn-outline sm:w-auto sm:px-4"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
    >
      <span className="sr-only sm:not-sr-only">{`${open ? "Hide" : "Show"} ${subject}`}</span>
      <ChevronDownIcon
        className={`size-6 transition-transform sm:size-5 ${open ? "rotate-180" : ""}`}
      />
    </button>
  );
}
