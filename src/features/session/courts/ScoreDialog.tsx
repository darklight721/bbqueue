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

  function field(index: 0 | 1, id: string) {
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={id} className="line-clamp-2 min-h-10 text-sm leading-tight font-semibold">
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
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-3">
        {field(0, idA)}
        <span aria-hidden="true" className="pb-4 font-display text-2xl text-base-content/40">
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
            className="btn btn-outline border-base-300"
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
