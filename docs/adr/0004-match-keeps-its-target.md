# Each Match keeps the Target it started with

The Point system can be changed during a Session, so each Match now stores its own Target: the Session's Point system at the moment the Match started. The Session's Point system only decides the Target of Matches started from then on. We chose this over applying a change to every Match straight away, because those players were told "to 21" when they started. Applying the change straight away would make the app reject a correct Score, such as 21–18 after a switch to 31. Scores are checked against the Match's Target, not the Session's Point system.
