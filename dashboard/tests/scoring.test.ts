// Runnable with: npm test  (Node's built-in runner + native TS type-stripping).
// Lives outside src/ so the production build (tsconfig include: ["src"]) ignores it.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dimensionScores,
  overallScore,
  metOfY,
  bandColor,
  bandName,
  fmtDay,
} from "../src/lib/scoring.ts";

const sess = (criteria: unknown[]) => ({ criteria }) as never;

test("dimensionScores: met=1, partial=0.5, missed=0, na excluded", () => {
  const d = dimensionScores(
    sess([
      { dimension: "a", result: "met" },
      { dimension: "a", result: "partial" },
      { dimension: "b", result: "missed" },
      { dimension: "b", result: "na" },
    ]),
  );
  assert.equal(d.a, 0.75); // (1 + 0.5) / 2
  assert.equal(d.b, 0); // (0) / 1  — na excluded
});

test("overallScore = mean of the dimension means", () => {
  assert.equal(
    overallScore(sess([{ dimension: "a", result: "met" }, { dimension: "b", result: "missed" }])),
    0.5,
  );
});

test("overallScore is null when every criterion is na", () => {
  assert.equal(overallScore(sess([{ dimension: "a", result: "na" }])), null);
});

test("metOfY excludes na from both numerator and denominator", () => {
  assert.equal(
    metOfY(
      sess([
        { dimension: "a", result: "met" },
        { dimension: "a", result: "partial" },
        { dimension: "a", result: "na" },
      ]),
    ),
    "1 of 2 met",
  );
});

test("bands match the settled thresholds (<40 / <75 / >=75)", () => {
  assert.equal(bandName(0.39), "Emerging");
  assert.equal(bandName(0.4), "Developing");
  assert.equal(bandName(0.74), "Developing");
  assert.equal(bandName(0.75), "Proficient");
  assert.equal(bandColor(0.2), "#FF3B30");
  assert.equal(bandColor(0.5), "#FF9500");
  assert.equal(bandColor(0.9), "#34C759");
});

test("fmtDay uses the LOCAL calendar date (not the UTC slice)", () => {
  const d = new Date(2026, 6, 16, 12, 0, 0); // local noon, Jul 16 2026
  assert.equal(fmtDay(d.toISOString()), "2026-07-16");
});
