# Session players are snapshots of Club players

When a Session starts, each chosen Club player is copied into the Session (keeping a link back to the Club player's id). Editing or deleting a Club afterwards never changes a running Session. Guests exist only in the Session unless the organiser chooses to also save them to the Club. We chose copies over references so a mid-session roster edit can't silently rebalance or break live Matches and history.
