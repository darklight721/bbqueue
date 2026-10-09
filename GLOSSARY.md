# Badminton Doubles Queueing

Organising doubles play at a club night: who plays on which court, with whom, and when — fairly, with balanced teams.

## People and groups

**Club**:
A named group of people who regularly play together. Holds the roster of Club players.
_Avoid_: Group, team, roster

**Club player**:
A person on a Club's roster, with a name and a Skill level. May be linked to an Account.
_Avoid_: Member, user

**Local club**:
A Club that exists only on one device, created while no Account was signed in there. Only that device can see it. It stays a Local club after an Account is created, until it is turned into a Shared club.
_Avoid_: Offline club, private club

**Shared club**:
A Club kept on the server and visible to every Account that has a Role in it. Every Club created while an Account is signed in, or that an Account is added to, is a Shared club.
_Avoid_: Online club, synced club, public club

## Accounts

**Account**:
A person's identity in the app, with a Name and an Account ID. Bound to the device it was created on. Using the app without an Account is allowed and keeps everything on the device.
_Avoid_: User, profile, login

**Account ID**:
The short, readable, never-changing identifier given to an Account when it is created (derived from its Name). Shared with an Organizer so they can add the Account to a Club.
_Avoid_: Username, handle, user id, invite code

**Role**:
What an Account may do in a Shared club: Organizer or Player.
_Avoid_: Permission, access level

**Organizer**:
A Role that may change the Club, its roster and Roles, start Sessions, run them, and delete its Ended sessions. A Shared club always has at least one Organizer; there is no separate owner.
_Avoid_: Owner, admin, manager

**Player**:
A Role that may view the Club, its Active session and its Ended sessions, and in an Active session may only make themselves Sitting out or leave. Not to be confused with Club player or Session player, which are about the roster and taking part, not about what an Account may do.
_Avoid_: Member, viewer, guest

**Session player**:
A person taking part in a Session. A snapshot of a Club player taken when they join the Session, or a Guest.
_Avoid_: Participant, attendee

**Guest**:
A Session player who was not on the Session's Club roster when the Session started (every Session player, when the Session has no Club).
_Avoid_: Extra player, additional player

**Skill level**:
A player's ability: Beginner (1), Intermediate (2), or Advanced (3). The number is the player's Skill value.
_Avoid_: Rank, grade, rating

## Sessions

**Session**:
One evening of play, for one Club or for no Club (guests only), from Start to End. Keeps the Club's name as it was at Start. A Shared club has at most one Active session at a time; a device has at most one Active session that has no Club or is for a Local club.
_Avoid_: Event, game night

**Session host**:
The one Organizer, on one device, who runs an Active session of a Shared club. Only the Session host changes the Session; everyone else sees it live and can only ask for changes. Can be taken over by another Organizer.
_Avoid_: Runner, controller, master device

**Ended session**:
A Session that has been ended and kept, with its Session players and Ended matches, for looking back on. A Session ended without any Ended match is not kept. On a device, only the 50 most recently ended are kept; older ones are dropped. A Shared club keeps every Ended session, and the 50 most recently ended are shown. An Ended session can be deleted: one of a Shared club only by an Organizer, and then it is gone for everyone on the Club; any other by whoever holds the device. The app labels the list of Ended sessions "Past sessions"; that is UI copy only, not a separate term.
_Avoid_: Past session, archived session, old session

**Session summary**:
The recap of one Ended session: its totals and Top winners. Can be shared as an image.
_Avoid_: Recap, results, report

**Point system**:
The Target given to each new Match in a Session: 21 or 31. Can be changed during the Session; Matches already being played keep their Target.
_Avoid_: Game format, scoring mode

**Target**:
The score a Match is played to: the Session's Point system at the moment the Match started.
_Avoid_: Match point system, game length

**Court**:
A numbered playing area in a Session. Either Idle or Busy (has an Active match).

**Match**:
Four Session players split into two Teams of two, playing on a Court. Active until Ended or Removed.
_Avoid_: Game, rally

**Team**:
The two Session players on one side of a Match.
_Avoid_: Pair, side

**Partner**:
The other Session player on your Team.

**Ended match**:
A Match that finished and counts toward history, Streaks and fairness. May have a Score; a Match ended without a Score has no winner.

**Removed match**:
A Match discarded as if it never happened. Leaves no trace in history or counts.
_Avoid_: Cancelled match

**Score**:
The points each Team reached in an Ended match, checked against that Match's Target. The Team with more points wins.

**Standings**:
Every Session player who played at least one Ended match in a Session, in place order. Ranked by most wins, then fewest losses, then most Ended matches played. Players level on all three share a place. Only Ended matches with a Score produce a win or a loss. Session players who never played are not in the Standings.
_Avoid_: Rankings, leaderboard, table

**Win rate**:
Wins divided by wins plus losses, over some set of Ended matches. Ended matches without a Score count as played but not toward the Win rate. With no win or loss there is no Win rate.
_Avoid_: Win ratio, win percentage

**Play record**:
What one person has played across Ended sessions: their Ended matches, wins, losses, Win rate and Partners. Either a Club player's, within one Club, or an Account's own, across every Club player linked to it. Guests have no Play record. The app labels it "Stats"; that is UI copy only.
_Avoid_: Player stats, profile, career, history

**Top winners**:
The Session players in 1st to 3rd place in a Session's Standings who have at least one win.
_Avoid_: Leaderboard, champions

## Queueing

**Lineup**:
The four Session players (already split into Teams) proposed by the app for an Idle Court. Lineups on different Courts never share a player.
_Avoid_: Suggestion, available players

**Rehash**:
Asking the app for a different Lineup for one Court.
_Avoid_: Shuffle, reroll

**Rehash all**:
Asking the app to pick fresh Lineups for every Idle Court at once, spreading players across those Courts and Teams together.
_Avoid_: Global shuffle, reset lineups

**Queue**:
A hand-built pair of Teams (four Session players) waiting to be moved onto an Idle Court, overriding that Court's Lineup. A Queue does not hold its players: they can still appear in Lineups and other Queues.
_Avoid_: Manual match, waiting list

**Sitting out**:
A Session player temporarily not available to be picked for Lineups, while staying in the Session.
_Avoid_: Paused, inactive, benched

**Streak**:
The number of Matches a Session player has played back-to-back without a Rest.

**Rest**:
A Match starting without a Session player while that player was free to play. Resets their Streak to zero.

**Fairness window**:
The recent stretch of time used to judge who has played least: 15 minutes while the Session's Point system is 21, 30 minutes while it is 31.

**Team balance**:
The difference between the two Teams' total Skill values. Balanced means a difference of at most 1.
