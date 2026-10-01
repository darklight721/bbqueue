import { PlusIcon } from "../../../components/icons.tsx";
import { addQueue } from "../../../domain/engine/index.ts";
import { useSessionActions, useSessionView } from "../context.ts";
import { SectionHeader } from "../SectionHeader.tsx";
import { QueueCard } from "./QueueCard.tsx";

const HEADING_ID = "session-queues";

/** Hand-built next matches. Queues don't hold players; a player can be in several. */
export function QueuesSection() {
  const { session } = useSessionView();
  const actions = useSessionActions();
  const count = session.queues.length;
  const add = () => actions.run((s, ctx) => ({ ok: true as const, session: addQueue(s, ctx) }));

  return (
    <section aria-labelledby={HEADING_ID} className="flex flex-col gap-4">
      <SectionHeader
        id={HEADING_ID}
        title="Queues"
        detail={count > 0 ? `${count} ${count === 1 ? "queue" : "queues"}` : undefined}
      />

      {count === 0 ? (
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
          <AddQueueButton onClick={add} dashed />
        </>
      )}
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
