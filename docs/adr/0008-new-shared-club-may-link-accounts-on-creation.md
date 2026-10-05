# A new Shared club may link other Accounts when it is created

The Security Rules used to require a new Shared club's first batch to list only its creator as member and Organizer, so other Accounts could only be linked after a second save. We now let that first batch also link other Accounts, with any Role. Each link gets the same check as a later link: the Account ID must be reserved by that uid, and the member and Organizer lists, as they will be after the batch, must agree with every link. This lets the New club screen link people by `@Account ID` just like the Edit club screen does, and the Club and all its links are saved in one atomic batch.

This adds no new risk. A creator could already link anyone one save later, and an Organizer can already write any uid to the lists.

## Considered Options

- **Create the Club, then link in a second batch**: rejected. If the second batch fails, the Club exists with some links missing.
- **No linking on New club; open Edit club after the first save**: rejected. Creating a Club and setting up who's in it would take two steps, and the two screens would behave differently.
