import { countLabel } from "../session-summary/summaryFormat.ts";

/** Win rate as a whole percentage ("67%"); "–" when there is none (no win or loss). */
export function formatWinRate(rate: number | null): string {
  return rate === null ? "–" : `${Math.round(rate * 100)}%`;
}

/** "3–1": wins, then losses. */
export function winLoss(wins: number, losses: number): string {
  return `${wins}–${losses}`;
}

/** "3 wins, 1 loss": the same, spelled out for screen readers. */
export function winLossWords(wins: number, losses: number): string {
  return `${countLabel(wins, "win", "wins")}, ${countLabel(losses, "loss", "losses")}`;
}

/** "Fri, 2 Oct" → "2 Oct": a short day for chart axis labels. */
export function shortDay(at: number): string {
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(at);
}
