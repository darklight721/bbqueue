import { accountIdsEqual } from "../domain/accountId.ts";
import type { ActiveSessionsReport } from "../backend/backend.ts";
import type { ActiveSession } from "../domain/types.ts";

const hostedBy = (entry: ActiveSession, me: string) => accountIdsEqual(entry.hostAccountId, me);

/**
 * What the device holds for the Active sessions of Shared clubs after the Backend reports what the
 * server has (ADR-0007). Everyone's copy comes from the server, except the Session host's own: the
 * host's device is the source of truth, so a report never overwrites the Session it is running
 * (or has changes on that the server hasn't received yet), nor drops it.
 *
 * - A reported session replaces the device's copy, unless this Account hosts both: then the
 *   device's copy stays.
 * - A session that isn't reported is dropped (it ended, or the Account left the Club), unless it
 *   is hosted by this Account, or its Club is in `report.unknown` (nothing is known yet, so the
 *   cached copy stays).
 * - A reported session in `ended` (ended on this device, its delete still on the way or not yet
 *   confirmed) is ignored.
 * - Without an Account there is nobody to tell the host's copy from the others: nothing changes.
 */
export function mergeActiveSessions(args: {
  current: readonly ActiveSession[];
  report: ActiveSessionsReport;
  me: string | null | undefined;
  ended?: { has(sessionId: string): boolean };
}): ActiveSession[] {
  const { current, report, me, ended } = args;
  if (!me) return [...current];

  const merged: ActiveSession[] = [];
  const reported = new Set<string>();
  for (const incoming of report.sessions) {
    if (ended?.has(incoming.session.id)) continue;
    reported.add(incoming.clubId);
    const own = current.find((entry) => entry.clubId === incoming.clubId);
    const keepOwn =
      own && hostedBy(own, me) && hostedBy(incoming, me) && own.session.id === incoming.session.id;
    merged.push(keepOwn ? own : incoming);
  }
  for (const entry of current) {
    if (reported.has(entry.clubId)) continue;
    if (hostedBy(entry, me) || report.unknown.includes(entry.clubId)) merged.push(entry);
  }
  return merged.sort((a, b) => a.clubId.localeCompare(b.clubId));
}
