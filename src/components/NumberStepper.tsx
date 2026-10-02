import { useId, useState } from "react";
import { MinusIcon, PlusIcon } from "./icons.tsx";

export interface NumberStepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Optional unit/help text shown after the label, e.g. "hours". */
  hint?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Round to the step's precision to avoid 0.1 + 0.2 style drift. */
function roundToStep(value: number, step: number): number {
  const decimals = (String(step).split(".")[1] ?? "").length;
  return Number(value.toFixed(decimals));
}

/** Number field with large − / + buttons. Typed values are clamped on blur. */
export function NumberStepper({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  hint,
}: NumberStepperProps) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    // Parent changed the value (e.g. via − / +): show it.
    setSynced(value);
    setDraft(String(value));
  }

  function commit(next: number) {
    const safe = roundToStep(clamp(next, min, max), step);
    setDraft(String(safe));
    if (safe !== value) onChange(safe);
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold text-base-content/80">
        {label}
        {hint ? <span className="font-normal text-base-content/60"> · {hint}</span> : null}
      </label>
      <div className="join w-full">
        <button
          type="button"
          className="btn join-item btn-square border-base-300 bg-base-200"
          aria-label={`Decrease ${label}`}
          disabled={value <= min}
          onClick={() => commit(value - step)}
        >
          <MinusIcon className="size-6" />
        </button>
        <input
          id={id}
          type="number"
          inputMode={Number.isInteger(step) ? "numeric" : "decimal"}
          className="input join-item min-w-0 flex-1 text-center font-display text-2xl font-bold tabular-nums"
          value={draft}
          min={min}
          max={max}
          step={step}
          onChange={(event) => {
            setDraft(event.target.value);
            const parsed = event.target.valueAsNumber;
            // Only live-commit values that already fit the step; others round on blur.
            if (
              Number.isFinite(parsed) &&
              parsed >= min &&
              parsed <= max &&
              roundToStep(parsed, step) === parsed
            ) {
              onChange(parsed);
            }
          }}
          onBlur={() => {
            const parsed = Number(draft);
            commit(draft.trim() === "" || !Number.isFinite(parsed) ? value : parsed);
          }}
        />
        <button
          type="button"
          className="btn join-item btn-square border-base-300 bg-base-200"
          aria-label={`Increase ${label}`}
          disabled={value >= max}
          onClick={() => commit(value + step)}
        >
          <PlusIcon className="size-6" />
        </button>
      </div>
    </div>
  );
}
