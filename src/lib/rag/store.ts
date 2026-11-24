import * as lancedb from "@lancedb/lancedb";
import { INDEX_DIR, TABLE_NAME, TOP_K } from "./config";
import { embedQuery } from "./embed";

/** One row of the vector database. */
export type ChunkRow = {
  id: string;
  text: string;
  vector: number[];
  title: string;
  url: string;
  source_type: string; // page | news | pdf | note | kb | reference
  audience: string; // all | staff
  date: string;
};

export type Hit = Omit<ChunkRow, "vector"> & { score: number; vectorRank?: number; keywordRank?: number };

export async function writeIndex(rows: ChunkRow[]) {
  const db = await lancedb.connect(INDEX_DIR);
  const t = await db.createTable(TABLE_NAME, rows as unknown as Record<string, unknown>[], { mode: "overwrite" });
  // keyword index (BM25) on the passage text, used by the hybrid search below
  await t.createIndex("text", { config: lancedb.Index.fts(), replace: true });
  // drop old versions so the index folder stays small (it is committed to git)
  await t.optimize({ cleanupOlderThan: new Date() });
}

let table: Promise<lancedb.Table> | null = null;
function getTable() {
  table ??= lancedb.connect(INDEX_DIR).then((db) => db.openTable(TABLE_NAME));
  return table;
}

const RRF_K = 60; // standard Reciprocal Rank Fusion constant
const CANDIDATES = 25; // how many results each search method proposes
const OLD_NEWS_PENALTY = 0.7; // news older than 2 years is rarely what students mean

function stripVector<T extends { vector?: unknown }>(row: T): Omit<T, "vector"> {
  const { vector, ...rest } = row;
  void vector;
  return rest;
}

/**
 * RETRIEVAL (hybrid):
 *  1. vector search: embed the question, find passages with the closest meaning (cosine distance)
 *  2. keyword search: BM25 full-text search, finds exact words (course codes, "Year 3", "ERP")
 *  3. merge both rankings with Reciprocal Rank Fusion: score = Σ 1 / (60 + rank)
 */
/** Optional live report of each retrieval step (used by the chat's progress panel). */
export type SearchStep = {
  id: "embed" | "vector" | "keyword" | "rank";
  state: "active" | "done";
  ms?: number;
  detail?: string;
};

let rowCount: number | null = null;

export async function search(
  question: string,
  k = TOP_K,
  audience: "student" | "teacher" = "student",
  onStep?: (step: SearchStep) => void,
): Promise<Hit[]> {
  const t = await getTable();
  rowCount ??= await t.countRows();
  const filter = audience === "student" ? "audience = 'all'" : undefined;
  const timed = async <T>(id: SearchStep["id"], run: () => Promise<T>, detail: (r: T) => string): Promise<T> => {
    onStep?.({ id, state: "active" });
    const started = Date.now();
    const result = await run();
    onStep?.({ id, state: "done", ms: Date.now() - started, detail: detail(result) });
    return result;
  };

  const queryVector = await timed("embed", () => embedQuery(question), (v) => `${v.length} numbers · multilingual-e5-small, on this computer`);

  const vectorRows = await timed(
    "vector",
    async () => {
      const q = t.vectorSearch(queryVector).distanceType("cosine").limit(CANDIDATES);
      return (await (filter ? q.where(filter) : q).toArray()) as (ChunkRow & { _distance: number })[];
    },
    (rows) => `${rows.length} closest of ${rowCount} passages (cosine similarity)`,
  );

  const keywords = question.replace(/[^\p{L}\p{N}\s-]/gu, " ");
  const keywordRows = await timed(
    "keyword",
    async () => {
      try {
        const q = t.query().fullTextSearch(keywords).limit(CANDIDATES);
        return (await (filter ? q.where(filter) : q).toArray()) as ChunkRow[];
      } catch {
        return [] as ChunkRow[]; // no keyword index yet (old index): vector search only
      }
    },
    (rows) => {
      const words = [...new Set(keywords.toLowerCase().split(/\s+/).filter((w) => w.length > 2))].slice(0, 6);
      return `${rows.length} matches for: ${words.join(", ")}`;
    },
  );
  onStep?.({ id: "rank", state: "active" });
  const rankStarted = Date.now();

  const merged = new Map<string, Hit>();
  const twoYearsAgo = new Date(Date.now() - 2 * 365 * 86_400_000).toISOString();
  vectorRows.forEach((row, i) => {
    merged.set(row.id, { ...stripVector(row), score: 1 / (RRF_K + i + 1), vectorRank: i + 1 } as Hit);
    delete (merged.get(row.id) as Hit & { _distance?: number })._distance;
  });
  keywordRows.forEach((row, i) => {
    const existing = merged.get(row.id);
    const add = 1 / (RRF_K + i + 1);
    if (existing) {
      existing.score += add;
      existing.keywordRank = i + 1;
    } else merged.set(row.id, { ...stripVector(row), score: add, keywordRank: i + 1 } as Hit);
  });
  for (const hit of merged.values()) {
    delete (hit as Hit & { _score?: number })._score;
    if (hit.source_type === "news" && hit.date && hit.date < twoYearsAgo) hit.score *= OLD_NEWS_PENALTY;
  }

  const top = [...merged.values()].sort((a, b) => b.score - a.score).slice(0, k);
  const both = top.filter((h) => h.vectorRank && h.keywordRank).length;
  onStep?.({
    id: "rank",
    state: "done",
    ms: Date.now() - rankStarted,
    detail: `${merged.size} candidates → kept the best ${top.length} (${both} found by both methods)`,
  });
  return top;
}
