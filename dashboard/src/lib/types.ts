// Mirrors PLAN.md contracts (MC1–MC8). Keep in sync with the API.

export interface Me {
  uid: string;
  email: string | null;
  displayName: string | null;
  org: { orgId: string; name: string | null; role: "admin" | "trainee" } | null;
}

export interface Member {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: "admin" | "trainee";
  joinedAt: string | null;
}

export interface Criterion {
  id: string;
  dimension: string;
  result: "met" | "partial" | "missed" | "na";
  evidence: string | null;
  tip: string | null;
}

export interface Session {
  sessionId: string;
  uid: string;
  clientSessionId: string;
  recordedAt: string | null;
  receivedAt: string | null;
  location: string | null;
  rubricId: string;
  rubricVersion: string;
  summary: string | null;
  criteria: Criterion[];
}

export interface Reply {
  replyId: string;
  parentNoteId: string;
  authorUid: string;
  authorEmail: string | null;
  authorDisplayName: string | null;
  authorRole: "admin" | "trainee";
  text: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface Note {
  noteId: string;
  sessionId: string | null;
  criterionId: string | null;
  traineeUid: string;
  authorUid: string;
  authorEmail: string | null;
  authorDisplayName: string | null;
  authorRole: "admin" | "trainee";
  text: string;
  createdAt: string | null;
  updatedAt: string | null;
  replies: Reply[];
}

export interface Retraction {
  traineeUid: string;
  recordedAt: string | null;
  receivedAt: string | null;
  retractedAt: string | null;
}

export interface Invite {
  code: string;
  role: "admin" | "trainee";
  uses: number;
  maxUses: number | null;
  createdAt: string | null;
  expiresAt: string | null;
}

export interface RubricDimension {
  id: string;
  label: string;
  description?: string;
  [k: string]: unknown;
}

export interface RubricCriterion {
  id: string;
  dimension: string;
  prompt: string;
  responseType: string;
  weight: number;
  whatGoodLooksLike?: string;
  [k: string]: unknown;
}

export interface Rubric {
  id: string;
  name: string;
  version: string;
  dimensions: RubricDimension[];
  criteria: RubricCriterion[];
  [k: string]: unknown;
}

export interface RubricItem {
  id: string;
  version: string;
  updatedAt: string;
  rubric: Rubric;
}
