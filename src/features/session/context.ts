import { createContext, useContext } from "react";
import type { EngineContext, PlayerStats, Result } from "../../domain/engine/index.ts";
import type { Session, SessionPlayer } from "../../domain/types.ts";

/** Read-only view of the Session for this render (stats computed once). */
export interface SessionView {
  session: Session;
  /** Every player (including removed) → stats, from `allPlayerStats`. */
  stats: ReadonlyMap<string, PlayerStats>;
  playerById: ReadonlyMap<string, SessionPlayer>;
  /** The time `stats` were computed for (latest timestamp in the Session). Pass as `now` to
   *  other engine read helpers (e.g. queueWarnings) so they agree with `stats`. */
  asOf: number;
  /**
   * True for anyone who isn't the Session host (ADR-0007): they watch, and every control that
   * would change the Session is hidden or turned off.
   */
  readOnly: boolean;
}

export type EngineOperation = (session: Session, ctx: EngineContext) => Result<string>;

/** Engine operations that save on success and show a short message on rejection. */
export interface SessionActions {
  /** Run any engine operation against the latest saved Session. Returns true on success. */
  run: (operation: EngineOperation) => boolean;
  /** Show a brief, non-blocking message. */
  notify: (message: string) => void;
  startMatch: (courtId: string) => boolean;
  endMatch: (matchId: string, score: [number, number] | null) => boolean;
  removeMatch: (matchId: string) => boolean;
  rehashCourt: (courtId: string) => boolean;
  rehashAll: () => boolean;
  addCourt: () => boolean;
  removeCourt: (courtId: string) => boolean;
}

export const SessionViewContext = createContext<SessionView | null>(null);
export const SessionActionsContext = createContext<SessionActions | null>(null);

export function useSessionView(): SessionView {
  const view = useContext(SessionViewContext);
  if (!view) throw new Error("useSessionView must be used inside SessionProvider");
  return view;
}

export function useSessionActions(): SessionActions {
  const actions = useContext(SessionActionsContext);
  if (!actions) throw new Error("useSessionActions must be used inside SessionProvider");
  return actions;
}
