# MedAdvisor — System Architecture

Whole-system reference: the iOS app (on-device AI), the Cloud Run API,
Firestore, auth, push, and model delivery. Two repos: `medadvisor` (app) and
`medadvisor-cloud` (this — server + dashboard).

## Core principle

**The AI never leaves the phone. Only redacted, user-approved results sync.**
Recording, transcription, speaker attribution, PHI redaction, and rubric
scoring all run on-device with the Qwen 7B model. What can travel to the cloud
is exactly the Tier-2 payload: per-criterion scores + short **redacted**
evidence quotes — never audio, never the transcript.

## Component / data-flow diagram

```mermaid
flowchart TB
    subgraph Phone["📱 iOS app (on-device — offline-capable)"]
        Rec["Record + live transcript<br/>(Apple SpeechAnalyzer)"]
        LLM["Qwen 7B via llama.cpp<br/>attribution · redaction · scoring"]
        FS["FeedbackStore<br/>Documents/feedback/*.json<br/>(encrypted at rest, ownerUid-scoped)"]
        Gate["Share-with-mentor gate<br/>2nd redaction pass + user review"]
        Rec --> LLM --> FS
        FS --> Gate
    end

    subgraph GCP["☁️ Google Cloud (dev + production projects)"]
        API["Cloud Run: Express API<br/>medadvisor-api"]
        IDP["Identity Platform<br/>(email · Apple · Google)"]
        Store[("Firestore<br/>rubrics · orgs · sessions<br/>notes · pushTokens")]
        FCM["Firebase Cloud Messaging → APNs"]
        API --> Store
    end

    subgraph Edge["🌐 Other hosts"]
        R2["Cloudflare R2<br/>Qwen 7B GGUF (4.4 GB)"]
        Dash["Mentor dashboard<br/>(served by API at /admin)"]
    end

    Phone -. "sign in (SDK, direct)" .-> IDP
    Gate -- "POST /v1/sessions<br/>(scores + redacted quotes)" --> API
    API -- "GET /v1/me/sessions<br/>(cross-device restore)" --> Phone
    Phone -- "GET /v1/rubrics<br/>(cloud-editable rubric)" --> API
    R2 -- "one-time model download" --> Phone
    Mentor["👤 Mentor"] --> Dash --> API
    API -- "note/reply → FCM" --> FCM -- "push" --> Phone
    Phone -- "register FCM token" --> API
```

## Record → share → mentor → push (sequence)

```mermaid
sequenceDiagram
    participant T as Trainee (phone)
    participant L as On-device LLM
    participant API as Cloud Run API
    participant DB as Firestore
    participant M as Mentor (dashboard)
    participant P as Push (FCM→APNs)

    T->>L: record consultation (works offline)
    L->>L: transcribe · attribute · redact · score
    L-->>T: feedback saved locally (FeedbackStore)
    Note over T: auto full-screen share prompt
    T->>T: review gate — 2nd redaction pass, edit/approve quotes
    T->>API: POST /v1/sessions (scores + redacted quotes)
    API->>DB: upsert orgs/{org}/sessions/{uid__clientId}
    M->>API: GET /v1/orgs/{org}/sessions?uid=
    API-->>M: session (dashboard + native cohort tab)
    M->>API: POST note (optionally anchored to session/criterion)
    API->>DB: write note
    API->>P: sendPushToUser(traineeUid)
    P-->>T: "New note from your mentor"
    T->>API: POST reply
    API->>P: sendPushToUser(mentor)
```

## Storage model — who holds what

| Data | On device | In cloud (Firestore) |
|---|---|---|
| Audio | deleted after analysis | never |
| Transcript / turns | yes (encrypted, never leaves) | **never** |
| Scores + redacted quotes | yes | only if shared (`orgs/{org}/sessions`) |
| Chat (notes + replies) | pulled from cloud, not persisted | yes (`orgs/{org}/notes`) |
| Rubrics | bundled + cached copy | source of truth (`rubrics`) |
| Accounts / org membership | token only | Identity Platform + `orgs/{org}/members` |

- **Local is primary** for a trainee's own history; cloud holds only shared
  sessions (and without the transcript).
- Records are **owner-scoped** on device (`ownerUid`): after sign-out they stay
  on disk but are filtered from view; they reappear when that user signs back
  in. Another user only ever sees their own + anonymous records.
- **Restore** (lost/new phone): a trainee signing in pulls their shared sessions
  back via `GET /v1/me/sessions`. Unshared sessions are device-only and are not
  recoverable — see "open questions" in PLAN.md re: a private backup tier.

## Firestore collections

```
rubrics/{rubricId}                      the pristine rubric document (cloud-editable)
inviteCodes/{CODE}                      { orgId, role, active, maxUses, uses, expiresAt }
orgs/{orgId}                            { name, createdAt, createdBy }
  members/{uid}                         { role, email, displayName, joinedAt }
  sessions/{uid__clientSessionId}       { uid, recordedAt, receivedAt, location,
                                          rubricId, rubricVersion, summary,
                                          criteria:[{id,dimension,result,evidence,tip}] }
  notes/{noteId}                        { traineeUid, sessionId?, criterionId?,
                                          authorUid, text, createdAt, replies:[…] }
  retractions/{sessionId}               { traineeUid, recordedAt, retractedAt }  (contentless)
users/{uid}/pushTokens/{token}          { platform, lastSeenAt }
```

Firestore is a document (NoSQL) store — each `{…}` above is a JSON-like
document (typed fields, nested maps, arrays, server timestamps). Client access
is deny-by-default; only the API (Firebase Admin SDK) reads/writes.
