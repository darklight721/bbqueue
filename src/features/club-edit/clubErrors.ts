import { BackendError } from "../../backend/backend.ts";

/** What went wrong with a change to a Shared club, in plain words. */
export function clubErrorMessage(error: unknown): string {
  const code = error instanceof BackendError ? error.code : "failed";
  switch (code) {
    case "offline":
      return "You're offline. Connect to make this change.";
    case "forbidden":
      return "You can't change this Club. Only Organizers can.";
    case "last-organizer":
      return "A Club needs at least one Organizer.";
    case "unknown-account":
      return "No Account has that Account ID.";
    case "already-linked":
      return "That Account is already on this roster.";
    case "not-found":
      return "This Club or player is no longer there.";
    default:
      return "Couldn't save your changes. Try again.";
  }
}
