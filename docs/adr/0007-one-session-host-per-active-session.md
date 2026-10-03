# One Session host per Active session

An Active session of a Shared club is changed by only one device: the Session host, the Organizer who started it or later took it over. The host keeps running the Session fully offline exactly as before and uploads its latest copy of the Session when online; everyone else sees it live, read-only. Players ask for their own Sitting out or leaving through separate requests that the host applies in order, skipping any that no longer make sense. We chose this over letting any Organizer change the Session, because the queueing engine uses randomness and offline changes from two devices would conflict (two Matches started on one Court) with no sensible merge.

## Consequences

- Another Organizer can take over at once; changes the old host made offline and never uploaded are lost, and the old host's device becomes read-only.
- A Player's request waits ("Waiting for host") while the host is offline.
- Moving to "any Organizer can change it" later means replaying named operations on the server with a seeded random source per operation.
