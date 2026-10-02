import { useId, useRef, useState } from "react";
import { Modal } from "../../../components/Modal.tsx";
import type { PointSystem } from "../../../domain/types.ts";
import { checkScore, scoreMessage } from "./score.ts";

export interface ScoreDialogProps {
  open: boolean;
  courtNumber: number;
  /** Labels for the two inputs, e.g. ["Ana & Ben", "Cat & Dan"]. */
  teamLabels: [string, string];
  pointSystem: PointSystem;
  onSave: (score: [number, number]) => void;
  onEndWithoutScore: () => void;
  onCancel: () => void;
}

/** "End match — Court N": enter the score, or end without one. */
export function ScoreDialog(props: ScoreDialogProps) {
  return (
    <Modal
      open={props.open}
      title={`End match — Court ${props.courtNumber}`}
      focusTitle
      onClose={props.onCancel}
    >
      {props.open ? <ScoreForm {...props} /> : null}
    </Modal>
  );
}

function ScoreForm({
  teamLabels,
  pointSystem,
  onSave,
  onEndWithoutScore,
  onCancel,
}: ScoreDialogProps) {
  const [raw, setRaw] = useState<[string, string]>(["", ""]);
  const [attempted, setAttempted] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const idA = useId();
  const idB = useId();

  const check = checkScore(raw, pointSystem);
  const problem = attempted ? check.problem : null;

  function save() {
    if (check.problem === null) onSave(check.score);
    else {
      setAttempted(true);
      firstRef.current?.focus();
    }
  }

  // Each field spans both rows of the parent grid (subgrid), so the two names share
  // one row: each name hugs the top of its own input, and the inputs stay level when
  // only one name wraps to two lines.
  function field(index: 0 | 1, id: string) {
    return (
      <div
        className={`${index === 0 ? "col-start-1" : "col-start-3"} row-span-2 row-start-1 grid min-w-0 grid-rows-subgrid`}
      >
        <label
          htmlFor={id}
          className="line-clamp-2 self-end text-center text-sm leading-tight font-semibold break-words"
        >
          {teamLabels[index]}
        </label>
        <input
          ref={index === 0 ? firstRef : undefined}
          id={id}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          enterKeyHint={index === 0 ? "next" : "done"}
          className={`input input-xl h-16 w-full text-center font-display text-4xl font-bold tabular-nums ${problem ? "input-error" : ""}`}
          value={raw[index]}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? errorId : undefined}
          onChange={(event) => {
            const next: [string, string] = [...raw];
            next[index] = event.target.value;
            setRaw(next);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (index === 0) document.getElementById(idB)?.focus();
            else save();
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] grid-rows-[auto_auto] gap-x-3 gap-y-1.5">
        {field(0, idA)}
        <span
          aria-hidden="true"
          className="col-start-2 row-start-2 self-center font-display text-2xl text-base-content/40"
        >
          –
        </span>
        {field(1, idB)}
      </div>
      {problem ? (
        <p id={errorId} className="text-sm font-semibold text-error">
          {scoreMessage(problem, pointSystem)}
        </p>
      ) : (
        <p className="text-sm text-base-content/60">Winner needs at least {pointSystem} points.</p>
      )}
      <div className="flex flex-col gap-2 pb-2">
        <button type="button" className="btn btn-lg btn-primary w-full" onClick={save}>
          Save
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="btn btn-outline border-base-300 px-3"
            onClick={onEndWithoutScore}
          >
            End without score
          </button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
