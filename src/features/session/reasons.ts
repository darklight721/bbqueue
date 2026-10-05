/** Plain sentences for engine rejection reasons. */
const REASON_MESSAGES: Record<string, string> = {
  "court-not-found": "That court no longer exists.",
  "court-busy": "That court is in use. End or remove the match first.",
  "no-lineup": "Not enough free players for this court yet.",
  "not-enough-idle-courts": "Rehash all needs at least 2 idle courts.",
  "match-not-found": "That match no longer exists.",
  "match-not-active": "That match has already ended.",
  "invalid-score": "Check the score and try again.",
  "max-courts": "You can have up to 10 courts.",
  "queue-not-found": "That queue no longer exists.",
  "queue-incomplete": "Fill all four places in the queue first.",
  "player-on-court": "A player in this queue is still on court.",
  "player-not-found": "That player is no longer in the session.",
  "duplicate-in-queue": "That player is already in this queue.",
  "player-in-active-match": "End or remove their match first.",
  "name-required": "Enter a name.",
  "duplicate-name": "That name is already used in this session.",
  "no-session": "There's no session in progress.",
  "not-host": "Only the session host can change this session.",
};

export function messageForReason(reason: string): string {
  return REASON_MESSAGES[reason] ?? "That didn't work. Please try again.";
}
