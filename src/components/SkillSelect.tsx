import { useId } from "react";
import { DEFAULT_SKILL, SKILL_LABEL, SKILL_LEVELS, type SkillLevel } from "../domain/types.ts";

export interface SkillSelectProps {
  /** Defaults to DEFAULT_SKILL (Intermediate). */
  value?: SkillLevel;
  onChange: (skill: SkillLevel) => void;
  /** Accessible label, e.g. "Skill level" or "Skill level for Sam". */
  label?: string;
  /** Keep the label for screen readers only (for compact rows). */
  hideLabel?: boolean;
  id?: string;
  className?: string;
}

export function SkillSelect({
  value = DEFAULT_SKILL,
  onChange,
  label = "Skill level",
  hideLabel = false,
  id,
  className = "",
}: SkillSelectProps) {
  const fallbackId = useId();
  const selectId = id ?? fallbackId;
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label
        htmlFor={selectId}
        className={hideLabel ? "sr-only" : "text-sm font-semibold text-base-content/80"}
      >
        {label}
      </label>
      <select
        id={selectId}
        className="select w-full text-base"
        value={value}
        onChange={(event) => onChange(event.target.value as SkillLevel)}
      >
        {SKILL_LEVELS.map((skill) => (
          <option key={skill} value={skill}>
            {SKILL_LABEL[skill]}
          </option>
        ))}
      </select>
    </div>
  );
}
