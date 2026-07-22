import { useEffect, useState } from "react";
import { publicApi } from "./api";
import type { Rubric } from "./types";

// Cross-render cache of historical rubric snapshots:
//   `${id}@${version}` -> Rubric (snapshot) | null (fetched, no snapshot exists).
const cache = new Map<string, Rubric | null>();
const inflight = new Map<string, Promise<void>>();

// Resolve the rubric a session was actually scored against (by rubricVersion),
// so an old session renders that version's prompts/labels — not the current,
// possibly-edited rubric. Returns the current rubric immediately as a fallback,
// then re-renders with the historical snapshot once fetched. No fetch happens
// when the current rubric already matches the version, or for versions that
// predate history (the snapshot 404s and we keep the fallback).
export function useRubricAt(
  rubricId: string,
  version: string,
  fallback: Rubric | undefined,
): Rubric | undefined {
  const key = `${rubricId}@${version}`;
  const matchesCurrent = fallback?.version === version;
  const [resolved, setResolved] = useState<Rubric | null | undefined>(
    matchesCurrent ? fallback : cache.get(key),
  );

  useEffect(() => {
    if (matchesCurrent) return setResolved(fallback);
    if (cache.has(key)) return setResolved(cache.get(key));

    let alive = true;
    if (!inflight.has(key)) {
      inflight.set(
        key,
        publicApi<{ rubric: Rubric }>(
          `/v1/rubrics/${rubricId}/versions/${encodeURIComponent(version)}`,
        )
          .then((r) => void cache.set(key, r.rubric))
          .catch(() => void cache.set(key, null)) // pre-history -> fall back
          .finally(() => void inflight.delete(key)),
      );
    }
    void inflight.get(key)!.then(() => {
      if (alive) setResolved(cache.get(key));
    });
    return () => {
      alive = false;
    };
  }, [key, matchesCurrent, rubricId, version, fallback]);

  return resolved ?? fallback;
}
