import { useNow, formatDuration } from "../clock.ts";

/** Live mm:ss since `startedAt`, driven by the shared clock (survives reloads). */
export function MatchTimer({
  startedAt,
  className = "",
}: {
  startedAt: number;
  className?: string;
}) {
  const now = useNow();
  return (
    <span role="timer" aria-label="Match time" className={`tabular-nums ${className}`}>
      {formatDuration(now - startedAt)}
    </span>
  );
}
