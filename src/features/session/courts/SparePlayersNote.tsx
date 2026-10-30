import { CloseIcon, WarningIcon } from "../../../components/icons.tsx";
import { spareNotice, spareNoticeText } from "../../../domain/engine/index.ts";
import { setSpareNoticeDismissed, useSpareNoticeDismissed } from "../../../storage/store.ts";
import { useSessionView } from "../context.ts";

/**
 * Inline note under the Courts header when the Session has few Spare players (see GLOSSARY:
 * Spare players): it says what will happen, it isn't an error. Recomputed on every render, so it
 * comes and goes as Courts, players or Sitting out change. Only whoever can change the Session
 * sees it. ✕ hides it for this exact count of players and Courts, remembered per Session on this
 * device; another count that shows the note brings it back.
 */
export function SparePlayersNote() {
  const { session, readOnly } = useSessionView();
  const dismissedKey = useSpareNoticeDismissed(session.id);
  const notice = spareNotice(session);
  if (readOnly || notice === null || notice.key === dismissedKey) return null;

  return (
    <div
      // Keyed by the count so a new case rises in again rather than silently swapping text.
      key={notice.key}
      role="note"
      aria-label="Few spare players"
      className="animate-rise flex items-start gap-3 rounded-box border-[1.5px] border-base-300 bg-base-200/60 py-2.5 pr-1.5 pl-3"
    >
      <span
        aria-hidden="true"
        // Solid amber badge, the same as the install tip's warning: carries the tone on its own,
        // so the card stays neutral and the text easy to read.
        className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-warning text-warning-content"
      >
        <WarningIcon className="-mt-px size-5" />
      </span>
      <p className="min-w-0 flex-1 self-center py-0.5 text-sm leading-snug text-pretty text-base-content/80">
        {spareNoticeText(notice)}
      </p>
      <button
        type="button"
        className="btn -my-1 btn-circle size-10 shrink-0 text-base-content/60 btn-ghost"
        aria-label="Dismiss"
        onClick={() => setSpareNoticeDismissed(session.id, notice.key)}
      >
        <CloseIcon className="size-5" />
      </button>
    </div>
  );
}
