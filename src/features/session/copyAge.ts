/** A viewer's copy older than this gets an "Updated … ago" note even when the device is online. */
export const STALE_AFTER_MS = 2 * 60_000;

/** "just now", "5 min ago", "1 h 5 min ago". Negative ages (clock skew) count as just now. */
export function formatAge(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours >= 24) return `${Math.floor(hours / 24)} d ago`;
  return rest === 0 ? `${hours} h ago` : `${hours} h ${rest} min ago`;
}

/**
 * What to tell a viewer about how fresh their copy is, or null when it is live enough not to
 * say anything. `updatedAt` is the time of the host's last upload that reached the server.
 */
export function copyNote(args: {
  updatedAt: number;
  now: number;
  online: boolean | null;
}): { offline: boolean; text: string } | null {
  const age = args.now - args.updatedAt;
  if (args.online === false) {
    return {
      offline: true,
      text: `You're offline. Showing the last copy, updated ${formatAge(age)}.`,
    };
  }
  if (age >= STALE_AFTER_MS) return { offline: false, text: `Updated ${formatAge(age)}.` };
  return null;
}
