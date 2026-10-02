import { useId, useMemo, useState } from "react";
import { MatchList, MatchRow } from "../../../components/MatchRow.tsx";
import { usesMixedTargets } from "../../../components/matchTargets.ts";
import { formatDuration } from "../clock.ts";
import { useSessionView } from "../context.ts";
import { SectionHeader } from "../SectionHeader.tsx";

const HEADING_ID = "session-history";

/**
 * Ended matches, newest first. Collapsed by default to keep the screen short.
 * Pass `open` / `onOpenChange` to control it from outside (the jump bar opens it).
 */
export function HistorySection({
  open: openProp,
  onOpenChange,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const { session, playerById } = useSessionView();
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = (value: boolean) => {
    setOwnOpen(value);
    onOpenChange?.(value);
  };
  const listId = useId();

  const ended = useMemo(
    () =>
      session.matches
        .filter((match) => match.status === "ended")
        .sort((a, b) => (b.number ?? 0) - (a.number ?? 0) || (b.endedAt ?? 0) - (a.endedAt ?? 0)),
    [session.matches],
  );
  const count = ended.length;
  // Points are only worth showing once the Session has used both 21 and 31.
  const showPoints = usesMixedTargets(ended);

  return (
    <section aria-labelledby={HEADING_ID} className="flex flex-col gap-3">
      <SectionHeader
        id={HEADING_ID}
        title="History"
        detail={`${count} ${count === 1 ? "match" : "matches"}`}
        action={
          count > 0 ? (
            <button
              type="button"
              className="btn btn-outline border-base-300"
              aria-expanded={open}
              aria-controls={listId}
              onClick={() => setOpen(!open)}
            >
              {open ? "Hide history" : "Show history"}
              <svg
                viewBox="0 0 24 24"
                className={`size-5 transition-transform ${open ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={2.25}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          ) : null
        }
      />

      {count === 0 ? (
        <p className="rounded-box border-[1.5px] border-dashed border-base-300 px-4 py-5 text-center text-base-content/70">
          No matches played yet.
        </p>
      ) : open ? (
        <MatchList id={listId} label="Match history">
          {ended.map((match) => (
            <MatchRow
              key={match.id}
              match={match}
              duration={
                match.endedAt !== null ? formatDuration(match.endedAt - match.startedAt) : ""
              }
              showTarget={showPoints}
              playerById={playerById}
            />
          ))}
        </MatchList>
      ) : null}
    </section>
  );
}
