# DRAFT — Private cloud backup (cross-device session history)

Status: **proposal, awaiting Bilal's sign-off.** Joint build (cloud endpoints +
iOS). Not yet in PLAN.md as a milestone.

## Problem

Today a trainee's session history is device-only unless they *share* a session
with a mentor. So: lose/replace the phone → all unshared history is gone; sign
in on a second device → history doesn't follow. And logout keeps another user's
data hidden-but-resident on the device (weak on shared hardware).

## Proposal

Automatically back up each trainee's **own** session results to a private,
per-user cloud space that **only they** can read — invisible to the org/mentor
until (and unless) they explicitly share a session the existing way.

### The hard line: what is NEVER backed up

- ❌ Audio (already deleted after analysis)
- ❌ Verbatim transcript / speaker turns — **stays device-only, always.**

Backing up the transcript would weaken the core promise. The private backup is
your *scorecard history*, not your conversations.

### What IS backed up (per session)

Same Tier-2 shape as a shared session, minus the org:
`{ clientSessionId, recordedAt, location, rubricId, rubricVersion, summary,
   criteria:[{id, dimension, result, evidence, tip}] }`

Evidence quotes + summary run through the **automated** redaction pass
(NLTagger + regex) before upload — the human review gate is skipped here
because nobody but the owner ever sees it, but the automated scrub still runs.

### Decisions to confirm

| # | Question | Recommended |
|---|---|---|
| D1 | Backup scope | **Scores + redacted quotes + summary. No transcript.** |
| D2 | Automatic or opt-in? | **On by default**, clear consent at sign-up, opt-out toggle in Settings |
| D3 | Consent copy | "Your feedback history (scores and redacted highlights — never the recording or transcript) is saved to your private account so it's on all your devices. Only you can see it unless you choose to share a session with a mentor." |
| D4 | Sign-out behavior | Sign-out **hides only, never deletes** (no risk of losing an un-backed-up session on an offline logout). Un-backed records stay owner-tagged and back up when that user next signs in online. Shared-device wiping is a **separate explicit "Remove my data from this device" button** that warns if anything isn't backed up yet (remove-anyway vs keep-until-online). Key constraint: **backup requires the user's auth token, so nothing can upload while logged out** — un-backed data uploads on next sign-in, not during logout. |
| D5 | Retention / delete | A session can live in 3 places: (1) device, (2) your private backup, (3) mentor's dashboard (if shared). **Delete (default) removes YOUR copies — device + private backup.** The mentor's copy is untouched by default; **"Delete everywhere"** additionally removes the mentor's copy (+ retraction marker). Keep backups indefinitely otherwise. |

## Cloud contract (for the cloud chat to settle in PLAN.md)

Firestore: `users/{uid}/backupSessions/{clientSessionId}` — same shape as above,
server-only access, deny-by-default rules (a user's backup is theirs alone; no
org can query it).

- `PUT /v1/me/backup/sessions/{clientSessionId}` (Bearer) — upsert one backed-up
  session (idempotent). Validation mirrors `/v1/sessions` minus org/anchor.
- `GET /v1/me/backup/sessions?since=` → the caller's backed-up sessions
  (cross-device restore + merge, like `/v1/me/sessions`).
- `DELETE /v1/me/backup/sessions/{clientSessionId}` — owner-only, idempotent.
- Independent of the org `sessions` collection: sharing and private backup are
  separate copies (a session can be backed-up-only, shared-only, or both).

## iOS behavior

- **Back up right after each analysis** (when online) — NOT deferred to logout.
  This keeps the un-backed backlog empty in the normal flow, so logout rarely
  has anything pending. A `backedUpAt` field on `ConsultationRecord` records
  success. (Constraint: uploads need the auth token, so a backlog can only be
  drained while signed in — the post-analysis timing minimizes when that bites.)
- Offline: queue — retry the backup upload on next foreground/sign-in (this is
  the ONE place an automatic retry queue is appropriate, because there's no
  per-upload consent gate — consent was given once).
- On sign-in: `GET /v1/me/backup/sessions` → merge into FeedbackStore (reuses
  the existing `mergeRestored`; restored records have no transcript).
- Settings: "Back up my history to my private account" toggle (default on);
  turning off stops future backups (existing ones remain until deleted).
- Sign-out: **hide only, no deletion.** Un-backed records (no `backedUpAt`)
  persist owner-tagged and upload on the next authenticated online session.
- Settings: separate "Remove my data from this device" button — checks backup
  status, warns before destroying anything not yet backed up. This is the only
  path that deletes local records on purpose.

## Logout & wipe prompts (exact UX)

**Sign out while sessions are still un-backed** (has `backedUpAt == nil` records):
- Online → "N sessions haven't finished backing up. Wait for them to finish, or
  sign out now — they'll stay on this device and back up next time you sign in."
  Buttons: **Wait** (runs the queue, spinner, then signs out) · **Sign out anyway**.
- Offline → "N sessions aren't backed up yet. They'll stay on this device and
  back up when you next sign in on wifi." Button: **Sign out**.
- Neither wording says "lose data" — logout never deletes.

**"Remove my data from this device"** (the only destructive path):
- If everything is backed up → "Your history is safely backed up. Remove it from
  this device?" · **Remove** / Cancel.
- If some sessions aren't backed up → RED: "N sessions aren't backed up —
  removing them is permanent and can't be undone." · **Remove anyway** /
  **Keep until backed up** / Cancel.

## Open risk

Even scores + redacted quotes are potential PHI if redaction slips — so this
still lives under the Google BAA, same as shared sessions. The transcript-stays-
local rule keeps the incremental exposure small (it's the same class of data
already syncing when a session is shared, minus the human review).
