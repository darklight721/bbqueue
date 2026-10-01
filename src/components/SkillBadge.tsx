import { SKILL_LABEL, SKILL_VALUE, type SkillLevel } from "../domain/types.ts";

const SKILL_COLOR: Record<SkillLevel, string> = {
  beginner: "var(--color-skill-beginner)",
  intermediate: "var(--color-skill-intermediate)",
  advanced: "var(--color-skill-advanced)",
};

export interface SkillBadgeProps {
  skill: SkillLevel;
  /** Bars only (label kept for screen readers and as a tooltip). */
  compact?: boolean;
  className?: string;
}

/**
 * Skill level shown as rising bars (1–3 filled) plus colour and, unless compact, the label.
 * The bar count carries the meaning on its own, so it works without colour vision.
 */
export function SkillBadge({ skill, compact = false, className = "" }: SkillBadgeProps) {
  const color = SKILL_COLOR[skill];
  const label = SKILL_LABEL[skill];

  if (compact) {
    return (
      <span
        className={`inline-flex size-7 shrink-0 items-center justify-center rounded-md ${className}`}
        style={{ backgroundColor: `color-mix(in oklab, ${color} 16%, transparent)` }}
        title={label}
      >
        <SkillBars skill={skill} />
        <span className="sr-only">{label}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border-[1.5px] pr-2 pl-1.5 text-sm font-semibold whitespace-nowrap ${className}`}
      style={{
        borderColor: `color-mix(in oklab, ${color} 55%, transparent)`,
        backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)`,
      }}
    >
      <SkillBars skill={skill} />
      <span>{label}</span>
    </span>
  );
}

/** Three ascending bars; the first `SKILL_VALUE[skill]` are filled. */
export function SkillBars({ skill, className = "" }: { skill: SkillLevel; className?: string }) {
  const filled = SKILL_VALUE[skill];
  const color = SKILL_COLOR[skill];
  return (
    <svg
      viewBox="0 0 14 14"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      {[0, 1, 2].map((index) => {
        const height = 6 + index * 4;
        const on = index < filled;
        return (
          <rect
            key={index}
            x={on ? index * 5 : index * 5 + 0.5}
            y={on ? 14 - height : 14 - height + 0.5}
            width={on ? 4 : 3}
            height={on ? height : height - 1}
            rx="1"
            fill={on ? color : "none"}
            stroke={on ? "none" : "currentColor"}
            strokeOpacity={on ? undefined : 0.35}
            strokeWidth="1"
          />
        );
      })}
    </svg>
  );
}
