import type { CSSProperties } from "react";

/**
 * Gold / silver / bronze discs for Top winners; the place number is always printed on them
 * too. Other places get a plain base-200 disc.
 */
export const MEDAL: Record<number, { bg: string; ring: string }> = {
  1: { bg: "#e9b949", ring: "#b8871c" },
  2: { bg: "#c4ccd3", ring: "#8b959e" },
  3: { bg: "#d39a6a", ring: "#9c6436" },
};

/** Hours rounded to the nearest half hour: "2.5 h", "1 h"; never less than "0.5 h". */
export function formatSessionDuration(ms: number): string {
  const halfHours = Number.isFinite(ms) ? Math.round(ms / 1_800_000) : 0;
  return `${Math.max(halfHours, 1) / 2} h`;
}

/** 1 → "1st", 2 → "2nd", 3 → "3rd", 4 → "4th" … */
export function ordinal(place: number): string {
  const tens = place % 100;
  if (tens >= 11 && tens <= 13) return `${place}th`;
  switch (place % 10) {
    case 1:
      return `${place}st`;
    case 2:
      return `${place}nd`;
    case 3:
      return `${place}rd`;
    default:
      return `${place}th`;
  }
}

/** "Fri, 2 Oct · 18:00–20:15" in the device locale. */
export function sessionWhen(startedAt: number, endedAt: number): string {
  return `${sessionDay(startedAt)} · ${sessionTimes(startedAt, endedAt)}`;
}

/** "Fri, 2 Oct" in the device locale. */
export function sessionDay(startedAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(startedAt);
}

/** "18:00–20:15" in the device locale. */
export function sessionTimes(startedAt: number, endedAt: number): string {
  const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  return `${time.format(startedAt)}–${time.format(endedAt)}`;
}

export function countLabel(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Staggered rise-in delay for step `step` of a screen's entrance. */
export function rise(step: number): CSSProperties {
  return { animationDelay: `${120 + step * 70}ms` };
}
