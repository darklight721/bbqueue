# Badminton Doubles Queueing

Organising doubles play at a club night: who plays on which court, with whom, and when — fairly, with balanced teams.

## People and groups

**Club**:
A named group of people who regularly play together. Holds the roster of Club players.
_Avoid_: Group, team, roster

**Club player**:
A person on a Club's roster, with a name and a Skill level.
_Avoid_: Member, user

**Session player**:
A person taking part in a Session. A snapshot of a Club player taken when they join the Session, or a Guest.
_Avoid_: Participant, attendee

**Guest**:
A Session player who was not on the Club roster when the Session started.
_Avoid_: Extra player, additional player

**Skill level**:
A player's ability: Beginner (1), Intermediate (2), or Advanced (3). The number is the player's Skill value.
_Avoid_: Rank, grade, rating

## Sessions

**Session**:
One evening of play for one Club, from Start to End. Only one Session exists at a time.
_Avoid_: Event, game night

**Point system**:
The target score for every Match in a Session: 21 or 31. Fixed for the whole Session.
_Avoid_: Game format, scoring mode

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
The points each Team reached in an Ended match. The Team with more points wins.

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
The recent stretch of time used to judge who has played least: 15 minutes for a 21-point Session, 30 minutes for a 31-point Session.

**Team balance**:
The difference between the two Teams' total Skill values. Balanced means a difference of at most 1.
