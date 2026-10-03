---
status: accepted (supersedes ADR-0001 for Shared clubs)
---

# Anonymous Accounts and Shared clubs on Firebase

People can now create an Account by entering only a Name, and Clubs created while signed in become Shared clubs that every Account with a Role in them can see. We use Firebase (Firestore + Anonymous Auth) because it is free without being paused for inactivity, has an offline cache and write queue built in, can later link an anonymous Account to an email without changing it, and enforces Organizer/Player Roles with Security Rules. An Account is bound to the device it was created on: clearing site data or switching devices loses it, until email linking is added.

Everything that is not a Shared club keeps the local-only model of ADR-0001: using the app without an Account, Local clubs (which stay Local after sign-up until an Organizer shares one), and Sessions with no Club all stay in localStorage on the device.

## Considered Options

- **Supabase**: Postgres and self-hostable, but the free tier pauses after a week of no activity and has no offline write queue.
- **PowerSync / Zero**: best-in-class offline sync, but more moving parts or not free, and not needed once only the Session host writes a Session (ADR-0007).

## Consequences

- No server code (Cloud Functions need the paid Blaze plan): the readable Account ID is reserved in a client transaction, and deleting an Account deletes its records from the client.
- Lock-in to Firestore's data model and Security Rules.
