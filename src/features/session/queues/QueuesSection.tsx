import { useId, useMemo, useState } from "react";
import { ChevronDownIcon, PlusIcon } from "../../../components/icons.tsx";
import { addQueue, upNext } from "../../../domain/engine/index.ts";
import { useSessionActions, useSessionView } from "../context.ts";
import { SectionHeader } from "../SectionHeader.tsx";
import { QueueCard } from "./QueueCard.tsx";
import { UpNext } from "./UpNext.tsx";

const HEADING_ID = "session-queues";

/**
 * Hand-built next matches. Queues don't hold players; a player can be in several.
 * Open by default; collapsed shows only the header. Pass `open` / `onOpenChange` to control it
 * from outside (the jump bar opens it before scrolling to it).
 */
export function QueuesSection({
  open: openProp,
  onOpenChange,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const { session, asOf, readOnly } = useSessionView();
  const actions = useSessionActions();
  const [ownOpen, setOwnOpen] = useState(true);
  const open = openProp ?? ownOpen;
  const setOpen = (value: boolean) => {
    setOwnOpen(value);
    onOpenChange?.(value);
  };
  const bodyId = useId();
  const queuedHeadingId = useId();
  const count = session.queues.length;
  // Worked out at `asOf`, not the clock, so every device shows the same four.
  const forecast = useMemo(() => upNext(session, asOf), [session, asOf]);
  const add = () => actions.run((s, ctx) => ({ ok: true as const, session: addQueue(s, ctx) }));

  return (
    <section aria-labelledby={HEADING_ID} className="flex flex-col gap-4">
      <SectionHeader
        id={HEADING_ID}
        title="Queues"
        detail={count > 0 ? `${count} ${count === 1 ? "queue" : "queues"}` : undefined}
        action={
          <button
            type="button"
            className="btn shrink-0 btn-square border-base-300 btn-outline sm:w-auto sm:px-4"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen(!open)}
          >
            {/* Phones: just the chevron, like Players. */}
            <span className="sr-only sm:not-sr-only">{open ? "Hide queues" : "Show queues"}</span>
            <ChevronDownIcon
              className={`size-6 transition-transform sm:size-5 ${open ? "rotate-180" : ""}`}
            />
          </button>
        }
      />

      {open ? (
        <div id={bodyId} className="flex flex-col gap-6">
          {forecast ? <UpNext forecast={forecast} /> : null}
          {/* The Queued subheading only matters next to Up next (from the first Match on). */}
          <section
            aria-labelledby={forecast ? queuedHeadingId : undefined}
            className="flex flex-col gap-3"
          >
            {forecast ? (
              <h3 id={queuedHeadingId} className="font-display text-2xl uppercase">
                Queued
              </h3>
            ) : null}
            {count === 0 && readOnly ? (
              <p className="rounded-box border-[1.5px] border-dashed border-base-300 px-4 py-5 text-center text-base-content/70">
                No queues right now.
              </p>
            ) : count === 0 ? (
              <div className="flex flex-col items-center gap-4 rounded-box border-[1.5px] border-dashed border-base-300 px-6 py-6 text-center">
                <p className="max-w-sm text-base-content/70">
                  Pick the next four players by hand, then move them onto a free court.
                </p>
                <AddQueueButton onClick={add} />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {session.queues.map((queue, index) => (
                    <QueueCard key={queue.id} queue={queue} number={index + 1} />
                  ))}
                </div>
                {readOnly ? null : <AddQueueButton onClick={add} dashed />}
              </>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}

function AddQueueButton({ onClick, dashed = false }: { onClick: () => void; dashed?: boolean }) {
  return (
    <button
      type="button"
      className={
        dashed
          ? "btn btn-lg w-full border-[1.5px] border-dashed border-base-300 bg-transparent shadow-none"
          : "btn btn-lg btn-outline border-base-300"
      }
      onClick={onClick}
    >
      <PlusIcon className="size-5" />
      Add queue
    </button>
  );
}
