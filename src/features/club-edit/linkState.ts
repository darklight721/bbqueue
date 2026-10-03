import type { Role } from "../../domain/types.ts";

/** Where a row's Account ID stands. */
export type LinkState =
  /** Linked to an Account. `exists` is false once a lookup shows it is gone, null while unknown. */
  | { kind: "linked"; accountId: string; role: Role; isYou: boolean; exists: boolean | null }
  /** Nothing typed. */
  | { kind: "empty" }
  | { kind: "invalid" }
  | { kind: "duplicate" }
  | { kind: "checking" }
  | { kind: "unknown" }
  | { kind: "offline" }
  /** The typed Account ID belongs to this Account. */
  | { kind: "found"; name: string; role: Role };

/** The messages that stop a Save. */
export function linkBlocksSave(state: LinkState): boolean {
  return ["invalid", "duplicate", "checking", "unknown", "offline"].includes(state.kind);
}
