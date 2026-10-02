import { useId, useState } from "react";
import { CloseIcon, PlusIcon, TrashIcon, WarningIcon } from "../../../components/icons.tsx";
import {
  canMoveQueue,
  moveQueueToCourt,
  queueWarnings,
  removeQueue,
  setQueueSlot,
} from "../../../domain/engine/index.ts";
import type { Queue } from "../../../domain/types.ts";
import { useSessionActions, useSessionView } from "../context.ts";
import { SessionPlayerChip } from "../PlayerViews.tsx";
import { PlayerPicker } from "./PlayerPicker.tsx";
import { moveBlockedReason, warningLabel } from "./queueText.ts";

type SlotRef = { team: 0 | 1; slot: 0 | 1 };
const TEAM_LABEL = ["Team A", "Team B"] as const;

/** A hand-built next match: Team A vs Team B, warnings, and Move to court buttons. */
export function QueueCard({ queue, number }: { queue: Queue; number: number }) {
  const { session, playerById, asOf } = useSessionView();
  const actions = useSessionActions();
  const [picking, setPicking] = useState<SlotRef | null>(null);
  const headingId = useId();
  const moveCaptionId = useId();
  const queueReasonId = useId();

  const filled = queue.slots.flat().filter((id): id is string => id !== null);
  const warnings = [
    ...new Set(
      queueWarnings(session, queue, asOf)
        .map((warning) => warningLabel(warning, queue, playerById))
        .filter((label): label is string => label !== null),
    ),
  ];

  const courts = [...session.courts].sort((a, b) => a.number - b.number);
  const checks = courts.map((court) => ({ court, check: canMoveQueue(session, queue, court) }));
  // A problem with the Queue itself (not a busy Court) is shown once for all Courts.
  const queueProblem = checks.find(({ check }) => !check.ok && check.reason !== "court-busy");
  const queueReason = queueProblem ? moveBlockedReason(queueProblem.check) : null;

  function setSlot(ref: SlotRef, playerId: string | null) {
    return actions.run((s) => setQueueSlot(s, queue.id, ref.team, ref.slot, playerId));
  }

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col overflow-hidden rounded-box border-2 border-dashed border-base-300 bg-base-100"
    >
      <header className="flex items-center gap-3 py-2 pr-2 pl-4">
        <h3 id={headingId} className="font-display text-2xl uppercase">
          Queue {number}
        </h3>
        <span className="text-sm font-semibold text-base-content/60 tabular-nums">
          {filled.length} of 4
        </span>
        <button
          type="button"
          className="btn -my-2 -mr-2 ml-auto btn-square size-11 btn-ghost text-base-content/60 hover:text-error"
          aria-label={`Remove queue ${number}`}
          title="Remove queue"
          onClick={() => actions.run((s) => removeQueue(s, queue.id))}
        >
          <TrashIcon className="size-6" />
        </button>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-3 px-4">
        <TeamSlots team={0} queue={queue} onPick={setPicking} onClear={setSlot} />
        <div aria-hidden="true" className="flex flex-col items-center pt-6">
          <span className="w-0 flex-1 border-l-2 border-dashed border-base-content/20" />
          <span className="py-1 font-display text-sm font-bold tracking-widest text-base-content/50">
            VS
          </span>
          <span className="w-0 flex-1 border-l-2 border-dashed border-base-content/20" />
        </div>
        <TeamSlots team={1} queue={queue} onPick={setPicking} onClear={setSlot} />
      </div>

      {warnings.length > 0 ? (
        <ul aria-label="Warnings" className="flex flex-wrap gap-1.5 px-4 pt-3">
          {warnings.map((label) => (
            <li
              key={label}
              className="inline-flex items-center gap-1 rounded-full border-[1.5px] border-warning bg-warning/15 px-2 py-0.5 text-xs font-semibold"
            >
              <WarningIcon className="size-3.5 shrink-0" />
              {label}
            </li>
          ))}
        </ul>
      ) : null}

      <div
        role="group"
        aria-labelledby={moveCaptionId}
        className="mt-3 flex flex-col gap-2 border-t border-base-300 bg-base-200/50 px-4 py-3"
      >
        <p
          id={moveCaptionId}
          className="text-xs font-bold tracking-[0.14em] text-base-content/60 uppercase"
        >
          Move to court
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {checks.map(({ court, check }) => {
            const busy = court.activeMatchId !== null;
            const hintId = `${moveCaptionId}-${court.id}`;
            return (
              <div key={court.id} className="flex flex-col gap-0.5">
                <button
                  type="button"
                  className={`btn ${check.ok ? "btn-primary" : "btn-outline border-base-300"}`}
                  disabled={!check.ok}
                  aria-describedby={
                    check.ok ? undefined : busy ? hintId : queueReason ? queueReasonId : undefined
                  }
                  onClick={() => {
                    const moved = actions.run((s, ctx) =>
                      moveQueueToCourt(s, queue.id, court.id, ctx),
                    );
                    if (moved) actions.notify(`Match started on court ${court.number}`);
                  }}
                >
                  Court {court.number} · {busy ? "Playing" : "Idle"}
                </button>
                {busy ? (
                  <span id={hintId} className="text-center text-xs text-base-content/60">
                    {moveBlockedReason({ ok: false, reason: "court-busy" })}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
        {queueReason ? (
          <p id={queueReasonId} className="text-sm font-semibold text-base-content/75">
            {queueReason}
          </p>
        ) : null}
      </div>

      <PlayerPicker
        open={picking !== null}
        title={picking ? `${TEAM_LABEL[picking.team]} · spot ${picking.slot + 1}` : ""}
        exclude={filled}
        onPick={(playerId) => {
          if (picking && setSlot(picking, playerId)) setPicking(null);
        }}
        onClose={() => setPicking(null)}
      />
    </section>
  );
}

function TeamSlots({
  team,
  queue,
  onPick,
  onClear,
}: {
  team: 0 | 1;
  queue: Queue;
  onPick: (ref: SlotRef) => void;
  onClear: (ref: SlotRef, playerId: null) => void;
}) {
  const { playerById } = useSessionView();
  const label = TEAM_LABEL[team];
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-xs font-bold tracking-[0.14em] text-base-content/55 uppercase">
        {label}
      </span>
      <ul aria-label={label} className="flex flex-col gap-2">
        {queue.slots[team].map((playerId, index) => {
          const slot = index as 0 | 1;
          const spot = `${label}, spot ${slot + 1}`;
          if (playerId === null) {
            return (
              <li key={slot}>
                <button
                  type="button"
                  aria-label={`Pick player for ${spot}`}
                  className="flex min-h-16 w-full items-center justify-center gap-1.5 rounded-field border-[1.5px] border-dashed border-base-content/25 text-sm font-semibold text-base-content/60 hover:border-primary hover:text-primary"
                  onClick={() => onPick({ team, slot })}
                >
                  <PlusIcon className="size-4" />
                  Pick player
                </button>
              </li>
            );
          }
          const name = playerById.get(playerId)?.name ?? "player";
          return (
            <li
              key={slot}
              className="flex min-h-16 items-center gap-1 rounded-field bg-base-200/70 py-1.5 pl-2.5"
            >
              <span className="min-w-0 flex-1">
                <SessionPlayerChip playerId={playerId} />
              </span>
              <button
                type="button"
                aria-label={`Clear ${name}`}
                className="btn btn-ghost btn-circle size-11 shrink-0 text-base-content/60"
                onClick={() => onClear({ team, slot }, null)}
              >
                <CloseIcon className="size-5" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
