import { accountIdsEqual } from "../../domain/accountId.ts";
import type { SessionPlayer } from "../../domain/types.ts";

/** The Account's own Session player, while watching a Shared club's Session: it gets requests. */
export function isOwnWhileWatching(
  player: SessionPlayer,
  { readOnly, sharedClubId }: { readOnly: boolean; sharedClubId: string | null },
  account: { accountId: string } | null,
): boolean {
  return (
    readOnly &&
    sharedClubId !== null &&
    !!player.accountId &&
    !!account &&
    accountIdsEqual(player.accountId, account.accountId)
  );
}
