import type { StatusTone } from "./playerStatus.ts";

/** Pill styles for player status: solid on court, outlined in a Lineup, dashed sitting out. */
export const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  "on-court": "bg-primary text-primary-content border-primary",
  "in-lineup": "bg-primary/10 text-primary border-primary/35",
  "sitting-out": "border-dashed border-base-content/35 text-base-content/75",
  free: "bg-base-200 text-base-content/75 border-transparent",
};
