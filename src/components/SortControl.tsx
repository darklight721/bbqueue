import { useId } from "react";

export interface SortOption<T extends string> {
  value: T;
  label: string;
}

/** "SORT BY" and a pill of radios, one per option; the chosen one is filled. */
export function SortControl<T extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  /** What is being sorted, for screen readers ("Sort players"). */
  legend: string;
  options: readonly SortOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const groupName = useId();
  return (
    <fieldset className="flex items-center justify-between gap-3">
      <legend className="sr-only">{legend}</legend>
      <span
        aria-hidden="true"
        className="text-xs font-bold tracking-[0.14em] text-base-content/60 uppercase"
      >
        Sort by
      </span>
      <div className="flex gap-1 rounded-full bg-base-200 p-1">
        {options.map((option) => {
          const on = option.value === value;
          return (
            <label
              key={option.value}
              className={`btn h-10 min-h-10 rounded-full border-0 px-3.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-primary min-[380px]:px-4 ${
                on ? "btn-secondary" : "btn-ghost text-base-content/70"
              }`}
            >
              <input
                type="radio"
                className="sr-only"
                name={groupName}
                value={option.value}
                checked={on}
                onChange={() => onChange(option.value)}
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
