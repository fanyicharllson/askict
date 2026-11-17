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
  source_type: string; // page | news | pdf | note | reference
  audience: string; // all | staff
  date: string;
};

export type Hit = Omit<ChunkRow, "vector"> & { score: number };

export async function writeIndex(rows: ChunkRow[]) {
  const db = await lancedb.connect(INDEX_DIR);
  await db.createTable(TABLE_NAME, rows as unknown as Record<string, unknown>[], { mode: "overwrite" });
}

let table: Promise<lancedb.Table> | null = null;
function getTable() {
  table ??= lancedb.connect(INDEX_DIR).then((db) => db.openTable(TABLE_NAME));
  return table;
}

/**
 * RETRIEVAL: embed the question, then ask LanceDB for the passages whose
 * vectors are closest to it (cosine distance). score = 1 - distance, so 1 is a perfect match.
 */
export async function search(question: string, k = TOP_K, audience: "student" | "teacher" = "student"): Promise<Hit[]> {
  const vector = await embedQuery(question);
  const t = await getTable();
  let query = t.vectorSearch(vector).distanceType("cosine").limit(k);
  if (audience === "student") query = query.where("audience = 'all'");
  const rows = (await query.toArray()) as (ChunkRow & { _distance: number })[];
  return rows.map(({ vector: _v, _distance, ...rest }) => ({ ...rest, score: 1 - _distance }));
}
