import { newId } from "../ids.ts";

/** Everything impure the engine needs, injected by the caller. */
export interface EngineContext {
  /** Current time, epoch ms. */
  now: number;
  /** Random source in [0, 1). Use `createRng(seed)` for deterministic runs. */
  rng: () => number;
  /** Id generator; defaults to `newId()` (a random v4 UUID). Inject a counter in tests. */
  newId?: () => string;
}

export function makeId(ctx: EngineContext): string {
  return (ctx.newId ?? newId)();
}
