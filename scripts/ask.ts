/**
 * Demo / debug tool: shows what the RETRIEVAL part of the RAG does, without calling the LLM.
 *
 *  1. the question turned into 384 numbers (its vector) by the local embedding model
 *  2. the passages found by hybrid search (vector + keywords, merged with RRF)
 *  3. for each passage: its own vector and its cosine similarity with the question
 *
 * Run: npm run ask -- "What is the ERP?"
 */
import { embedPassages, embedQuery } from "../src/lib/rag/embed";
import { search } from "../src/lib/rag/store";

const question = process.argv.slice(2).join(" ");
if (!question) {
  console.error('Usage: npm run ask -- "your question"');
  process.exit(1);
}

const fmt = (v: number[], n = 8) => `[${v.slice(0, n).map((x) => x.toFixed(4)).join(", ")}, … ]`;
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
const line = "─".repeat(78);

async function main() {
  console.log(`\n${line}\nQUESTION: ${question}\n${line}`);

  // 1. the question as numbers
  let t = Date.now();
  const q = await embedQuery(question);
  console.log(`\n1) The embedding model (multilingual-e5-small, on this computer) turned the question into`);
  console.log(`   ${q.length} numbers in ${Date.now() - t} ms. The first 8:`);
  console.log(`   ${fmt(q)}`);
  console.log(`   (vector length = ${Math.sqrt(dot(q, q)).toFixed(3)}: vectors are normalised to 1)`);

  // 2. hybrid search
  t = Date.now();
  const hits = await search(question, Number(process.env.LOCAL_TOP_K ?? 4)); // same as the offline app
  console.log(`\n2) LanceDB searched ${hits.length ? "the passages" : ""} by meaning (vector) and by keywords (BM25),`);
  console.log(`   merged both rankings (Reciprocal Rank Fusion) in ${Date.now() - t} ms and kept the best ${hits.length}:\n`);

  // 3. each passage, its vector and its similarity with the question
  const vectors = await embedPassages(hits.map((h) => h.text));
  hits.forEach((h, i) => {
    const cos = dot(q, vectors[i]);
    console.log(`#${i + 1}  [${h.source_type}] ${h.title}`);
    console.log(`    cosine similarity with the question: ${cos.toFixed(3)}   (1.000 = same meaning)`);
    console.log(`    rank by meaning: ${h.vectorRank ?? "-"}   rank by keywords: ${h.keywordRank ?? "-"}   fused score: ${h.score.toFixed(4)}`);
    console.log(`    passage vector: ${fmt(vectors[i], 6)}`);
    console.log(`    text: ${h.text.replace(/\s+/g, " ").slice(0, 160)}…\n`);
  });

  console.log(`3) In the app, the TEXT of these passages (not the numbers) is given to the local LLM,`);
  console.log(`   which writes the answer and cites them as [1], [2]…\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
