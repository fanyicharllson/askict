/**
 * Debug tool: shows what the RETRIEVAL step finds for a question, without calling the LLM.
 * Run: npm run ask -- "How much is the tuition for a bachelor?"
 */
import { search } from "../src/lib/rag/store";

const question = process.argv.slice(2).join(" ");
if (!question) {
  console.error('Usage: npm run ask -- "your question"');
  process.exit(1);
}

search(question).then((hits) => {
  console.log(`\nQ: ${question}\n`);
  hits.forEach((h, i) => {
    console.log(`#${i + 1}  score ${h.score.toFixed(3)}  [${h.source_type}] ${h.title}`);
    console.log(`    ${h.url}`);
    console.log(`    ${h.text.replace(/\s+/g, " ").slice(0, 220)}...\n`);
  });
});
