import type { UpNextReason } from "../../../domain/engine/index.ts";

/**
 * Tag for why a player is where they are in Up next; null when there is nothing worth saying.
 * `sinceAsOf` is how long ago Up next was worked out, so Waiting keeps counting.
 */
export function upNextReasonLabel(reason: UpNextReason, sinceAsOf: number): string | null {
  switch (reason.kind) {
    case "resting":
      return "Resting";
    case "sat-out":
      return `Sat out ${reason.count} in a row`;
    case "played-fewer":
      return `Played ${reason.count} fewer`;
    case "waiting": {
      const minutes = Math.floor((reason.ms + Math.max(0, sinceAsOf)) / 60_000);
      return minutes >= 1 ? `Waiting ${minutes} min` : null;
    }
  }
}
