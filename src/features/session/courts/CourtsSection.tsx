import { PlusIcon, RefreshIcon } from "../../../components/icons.tsx";
import { canRehashAll, MAX_COURTS } from "../../../domain/engine/index.ts";
import { useSessionActions, useSessionView } from "../context.ts";
import { SectionHeader } from "../SectionHeader.tsx";
import { CourtCard } from "./CourtCard.tsx";

export function CourtsSection() {
  const { session, readOnly } = useSessionView();
  const actions = useSessionActions();
  const courts = [...session.courts].sort((a, b) => a.number - b.number);
  const atMax = courts.length >= MAX_COURTS;
  const rehashAllEnabled = canRehashAll(session);
  const busyCount = courts.filter((court) => court.activeMatchId !== null).length;

  return (
    <section aria-labelledby="session-courts" className="flex flex-col gap-4">
      <SectionHeader
        id="session-courts"
        title="Courts"
        detail={`${busyCount} of ${courts.length} playing`}
        action={
          // With a single court there is nothing to rehash "all" of: hide it.
          !readOnly && courts.length >= 2 ? (
            <button
              type="button"
              className="btn btn-outline border-base-300"
              disabled={!rehashAllEnabled}
              title={rehashAllEnabled ? undefined : "Needs at least 2 idle courts"}
              onClick={() => actions.rehashAll()}
            >
              <RefreshIcon className="size-5" />
              Rehash all
            </button>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {courts.map((court) => (
          <CourtCard key={court.id} court={court} />
        ))}
      </div>

      {readOnly ? null : (
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            className="btn btn-lg w-full border-[1.5px] border-dashed border-base-300 bg-transparent shadow-none"
            disabled={atMax}
            onClick={() => actions.addCourt()}
          >
            <PlusIcon className="size-5" />
            Add court
          </button>
          {atMax ? (
            <p className="text-sm text-base-content/60">Up to {MAX_COURTS} courts.</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
