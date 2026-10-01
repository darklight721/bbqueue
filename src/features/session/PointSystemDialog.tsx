import { useId } from "react";
import { Modal } from "../../components/Modal.tsx";
import { setPointSystem, suggestPointSystemForTimeLeft } from "../../domain/engine/index.ts";
import type { PointSystem, Session } from "../../domain/types.ts";
import { useNow } from "./clock.ts";
import { useSessionActions, useSessionView } from "./context.ts";
import { playingLine, suggestionLine } from "./pointSystemText.ts";

const POINT_SYSTEMS: readonly PointSystem[] = [21, 31];

/**
 * Change the Session's Point system mid-session. One tap switches it; it applies to matches
 * started from now on. Matches being played keep the points they started with.
 */
export function PointSystemDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      title="Point system"
      description="For matches started from now on."
      onClose={onClose}
    >
      {open ? <PointSystemForm onClose={onClose} /> : null}
    </Modal>
  );
}

function PointSystemForm({ onClose }: { onClose: () => void }) {
  const { session } = useSessionView();
  const actions = useSessionActions();
  const groupName = useId();
  const value = session.pointSystem;
  const playing = playingLine(session);
  const suggestion = useTimeLeftSuggestion(session);

  return (
    <div className="flex flex-col gap-4 pb-2">
      <fieldset>
        <legend className="sr-only">Points to win</legend>
        <div className="grid grid-cols-2 gap-3">
          {POINT_SYSTEMS.map((points) => {
            const on = value === points;
            return (
              <label
                key={points}
                className={`btn h-16 btn-lg has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${
                  on ? "btn-primary" : "border-base-300 bg-base-100 btn-outline"
                }`}
              >
                <input
                  type="radio"
                  className="sr-only"
                  name={groupName}
                  value={points}
                  aria-label={`${points} points`}
                  checked={on}
                  onChange={() => actions.run((s, ctx) => setPointSystem(s, points, ctx))}
                />
                <span className="font-display text-3xl font-bold">{points}</span>
                <span className="text-sm font-semibold opacity-80">points</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {playing || suggestion ? (
        <ul className="flex flex-col gap-1.5 text-sm text-base-content/75">
          {playing ? <li>{playing}</li> : null}
          {suggestion ? <li>{suggestion}</li> : null}
        </ul>
      ) : null}

      <button type="button" className="btn w-full border-base-300 btn-outline" onClick={onClose}>
        Done
      </button>
    </div>
  );
}

/** "Suggested: 21 — about 2 more games each", for the time left. Null when there's none. */
function useTimeLeftSuggestion(session: Session): string | null {
  const now = useNow();
  const suggestion = suggestPointSystemForTimeLeft({
    players: session.players.filter((player) => !player.removed).length,
    courts: session.courts.length,
    plannedHours: session.plannedHours,
    startedAt: session.startedAt,
    now,
  });
  if (!suggestion) return null;
  return suggestionLine(suggestion);
}
