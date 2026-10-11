/**
 * Shared filename corpus for subprocess ownership tests in land, accept and
 * cleanup. Expected owners are explicit test data, independent of CLI matching.
 * Each extension is tested separately by accept so deduplication cannot hide
 * missing formats. Includes exact names, legacy/rework suffixes and collisions.
 */
export const recordExtensions = [
  "",
  ".progress.log",
  ".events.jsonl",
  ".json",
  ".jsonl",
  ".md",
  ".log",
];

type RecordFixture = {
  name: string;
  ticket?: number;
  spec?: number;
};

const names: RecordFixture[] = [
  { name: "gh-2", ticket: 2 },
  { name: "gh-2-2", ticket: 2 },
  { name: "gh-2-20261012", ticket: 2 },
  { name: "gh-21", ticket: 21 },
  { name: "gh-21-2", ticket: 21 },
  { name: "gh-18", ticket: 18 },
  { name: "gh-18-refactor", ticket: 18 },
  { name: "gh-18-2", ticket: 18 },
  { name: "gh-210", ticket: 210 },
  { name: "gh-180", ticket: 180 },
  { name: "gh-2other" },
  { name: "gh-2.other" },
  { name: "gh-21other" },
  { name: "gh-21.other" },
  { name: "gh-18other" },
  { name: "gh-18.other" },
  { name: "review-17", spec: 17 },
  { name: "review-17-2", spec: 17 },
  { name: "review-17-batch-2", spec: 17 },
  { name: "review-170", spec: 170 },
  { name: "review-17other" },
  { name: "review-17.other" },
  { name: "smoke-test" },
];

export const recordFixtures = recordExtensions.flatMap((extension) =>
  names.map((record) => ({
    ...record,
    extension,
    file: `${record.name}${extension}`,
  })),
);
