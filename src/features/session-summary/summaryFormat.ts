import type { CSSProperties } from "react";

/** "2 h 15 min", "45 min", "1 h"; whole minutes (rounded); under a minute → "Under 1 min". */
export function formatSessionDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 60_000) return "Under 1 min";
  const totalMinutes = Math.round(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
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
