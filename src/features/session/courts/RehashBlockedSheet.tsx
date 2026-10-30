import { useId, useRef } from "react";
import { Modal } from "../../../components/Modal.tsx";
import { alsoChangesText } from "./rehashBlockedText.ts";

/** Why Rehash can't bring anyone else in (from `rehashBlock`). */
export type RehashBlockReason = "rest" | "fairness" | "waited" | "balance";

/** What `rehashBlock` says when Rehash has to ask first. */
export interface RehashBlock {
  reason: RehashBlockReason;
  /** Another balanced split of the same four exists: New Teams is offered. */
  newTeams: boolean;
}

const REASON_TEXT: Record<RehashBlockReason, string> = {
  rest: "Anyone else would play a third match in a row.",
  fairness: "The others have played more.",
  waited: "The players in this Lineup have sat out too long to wait again.",
  balance: "Anyone else would make unbalanced Teams.",
};

const NO_OTHER_TEAMS_TEXT = "No other balanced Teams for these four.";

/**
 * Bottom sheet for a Rehash that can't bring anyone else in without breaking a rule (Rest,
 * Rests in a row, Fairness or Team balance). Nothing changes until the organiser picks: New Teams
 * (same four, another balanced split, when there is one), Rehash all idle courts (when possible),
 * Swap anyway (on purpose, against the rules), or Cancel.
 *
 * The first offered of New Teams / Rehash all is the primary button. With neither, nothing looks
 * primary: Swap anyway breaks a rule and stays the quietest, and Cancel gets the focus.
 */
export function RehashBlockedSheet({
  open,
  block,
  rehashAll,
  onNewTeams,
  onRehashAll,
  onSwapAnyway,
  onCancel,
}: {
  open: boolean;
  block: RehashBlock;
  /**
   * Set when Rehash all is possible: the numbers of the other Idle Courts that hold a Lineup
   * (may be empty). Null hides the option.
   */
  rehashAll: readonly number[] | null;
  onNewTeams: () => void;
  onRehashAll: () => void;
  onSwapAnyway: () => void;
  onCancel: () => void;
}) {
  const alsoId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const also = rehashAll ? alsoChangesText(rehashAll) : null;
  const { newTeams } = block;
  const rehashAllPrimary = !newTeams;
  const anyMain = newTeams || rehashAll !== null;

  return (
    <Modal
      open={open}
      title="No one else can come in"
      description={
        <>
          {REASON_TEXT[block.reason]}
          {/* Why New Teams isn't offered: part of the explanation, not an action. */}
          {newTeams ? null : (
            <>
              {" "}
              <span className="mt-1.5 block">{NO_OTHER_TEAMS_TEXT}</span>
            </>
          )}
        </>
      }
      // Without a primary action, the safe default is Cancel (never Swap anyway).
      initialFocusRef={anyMain ? undefined : cancelRef}
      onClose={onCancel}
    >
      <div className="flex flex-col gap-3 pb-2">
        {newTeams ? (
          <button type="button" className="btn btn-lg btn-primary" onClick={onNewTeams}>
            New Teams
          </button>
        ) : null}

        {rehashAll ? (
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              className={`btn btn-lg ${rehashAllPrimary ? "btn-primary" : "btn-outline border-base-300"}`}
              aria-describedby={also ? alsoId : undefined}
              onClick={onRehashAll}
            >
              Rehash all idle courts
            </button>
            {also ? (
              <p id={alsoId} className="text-center text-sm text-base-content/60">
                {also}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Swap anyway breaks a rule on purpose: kept quiet, next to Cancel. */}
        <div
          className={`grid grid-cols-2 gap-3 ${anyMain ? "mt-2 border-t border-base-300 pt-4" : ""}`}
        >
          <button
            type="button"
            className="btn btn-lg font-semibold text-base-content/70 btn-ghost"
            onClick={onSwapAnyway}
          >
            Swap anyway
          </button>
          <button
            ref={cancelRef}
            type="button"
            className="btn btn-lg btn-outline border-base-300"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
