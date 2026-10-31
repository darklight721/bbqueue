import { useRef } from "react";
import { Modal } from "../../../components/Modal.tsx";
import { RehashAllOption } from "./RehashBlockedSheet.tsx";

/**
 * Bottom sheet for a Rehash when Rehash all idle courts is also possible (another Idle Court holds
 * a Lineup). Just this court leads; Rehash all idle courts says which other Lineups it changes too.
 * Nothing changes until the organiser picks.
 */
export function RehashChoiceSheet({
  open,
  courtNumber,
  otherLineups,
  onJustThisCourt,
  onRehashAll,
  onCancel,
}: {
  open: boolean;
  courtNumber: number;
  /** Numbers of the other Idle Courts that hold a Lineup (not empty). */
  otherLineups: readonly number[];
  onJustThisCourt: () => void;
  onRehashAll: () => void;
  onCancel: () => void;
}) {
  const justThisRef = useRef<HTMLButtonElement>(null);

  return (
    <Modal
      open={open}
      title={`Rehash Court ${courtNumber}`}
      initialFocusRef={justThisRef}
      onClose={onCancel}
    >
      <div className="flex flex-col gap-3 pb-2">
        <button
          ref={justThisRef}
          type="button"
          className="btn btn-lg btn-primary"
          onClick={onJustThisCourt}
        >
          Just this court
        </button>

        <RehashAllOption otherLineups={otherLineups} primary={false} onClick={onRehashAll} />

        <div className="mt-2 border-t border-base-300 pt-4">
          <button
            type="button"
            className="btn w-full btn-outline border-base-300"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
