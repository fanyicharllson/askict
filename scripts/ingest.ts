/**
 * Step 2 of the RAG pipeline: INDEX.
 *
 * Reads everything in data/raw/, cuts it into passages (chunks), turns each
 * passage into a vector with the local embedding model, and saves
 * text + vector + metadata into the LanceDB vector database in data/index/.
 *
 * Sources:
 *   data/raw/web/*.json    from `npm run collect`
 *   data/raw/pdf/*.pdf     documents you drop in (tuition plan, timetable...)
 *   data/raw/notes/*.md    hand-written notes with a small front-matter header
 *
 * Run: npm run ingest
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import { chunkText } from "../src/lib/rag/chunk";
import { RAW_DIR } from "../src/lib/rag/config";
import { embedPassages } from "../src/lib/rag/embed";
import { writeIndex, type ChunkRow } from "../src/lib/rag/store";

type Doc = { id: string; title: string; url: string; type: string; audience: string; date: string; text: string };

async function listFiles(dir: string, ext: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((f) => f.toLowerCase().endsWith(ext)).map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

async function loadWeb(): Promise<Doc[]> {
  const docs: Doc[] = [];
  for (const file of await listFiles(path.join(RAW_DIR, "web"), ".json")) {
    const items = JSON.parse(await readFile(file, "utf8")) as Omit<Doc, "audience">[];
    for (const it of items) docs.push({ ...it, audience: "all", date: it.date ?? "" });
  }
  return docs;
}

/** PDFs: one document per page, so citations can say which page. */
async function loadPdfs(): Promise<Doc[]> {
  const docs: Doc[] = [];
  for (const file of await listFiles(path.join(RAW_DIR, "pdf"), ".pdf")) {
    const pdf = await getDocumentProxy(new Uint8Array(await readFile(file)));
    const { text } = await extractText(pdf, { mergePages: false });
    const name = path.basename(file, ".pdf");
    const title = name.replace(/[-_]+/g, " ").replace(/\s*\(\d+\)/g, "").trim();
    const empty = text.filter((t) => t.trim().length < 40).length;
    if (empty === text.length) {
      console.warn(`  ! ${name}.pdf is a scanned image with no text layer - skipped (transcribe it into data/raw/notes/)`);
      continue;
    }
    text.forEach((pageText, i) => {
      const clean = pageText.replace(/[ \t]+/g, " ").trim();
      if (clean.length < 40) return; // blank or image-only page
      docs.push({
        id: `pdf-${name}-p${i + 1}`,
        title: `${title} (page ${i + 1})`,
        url: `/docs/${encodeURIComponent(path.basename(file))}#page=${i + 1}`,
        type: "pdf",
        audience: "all",
        date: "",
        text: clean,
      });
    });
  }
  return docs;
}

/** Notes: markdown with a `---` front-matter block (title, url, audience, date). */
async function loadNotes(): Promise<Doc[]> {
  const docs: Doc[] = [];
  for (const file of await listFiles(path.join(RAW_DIR, "notes"), ".md")) {
    const raw = await readFile(file, "utf8");
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    const meta: Record<string, string> = {};
    for (const line of (match?.[1] ?? "").split(/\r?\n/)) {
      const i = line.indexOf(":");
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    const name = path.basename(file, ".md");
    docs.push({
      id: `note-${name}`,
      title: meta.title ?? name,
      url: meta.url ?? "",
      type: "note",
      audience: meta.audience ?? "all",
      date: meta.date ?? "",
      text: (match?.[2] ?? raw).trim(),
    });
  }
  return docs;
}

async function main() {
  const docs = [...(await loadWeb()), ...(await loadPdfs()), ...(await loadNotes())];
  if (docs.length === 0) throw new Error("No raw data found. Run `npm run collect` first.");
  console.log(`Loaded ${docs.length} documents`);

  // 1. CHUNK: each passage starts with its document title so it carries context on its own
  const chunks = docs.flatMap((doc) =>
    chunkText(doc.text).map((text, i) => ({ doc, i, text: `${doc.title}\n\n${text}` })),
  );
  console.log(`Split into ${chunks.length} chunks. Embedding (first run downloads the model)...`);

  // 2. EMBED: text -> 384-number vector
  const started = Date.now();
  const vectors = await embedPassages(chunks.map((c) => c.text));
  console.log(`Embedded in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  // 3. STORE: write rows into the vector database
  const rows: ChunkRow[] = chunks.map((c, n) => ({
    id: `${c.doc.id}#${c.i}`,
    text: c.text,
    vector: vectors[n],
    title: c.doc.title,
    url: c.doc.url,
    source_type: c.doc.type,
    audience: c.doc.audience,
    date: c.doc.date,
  }));
  await writeIndex(rows);

  const byType = rows.reduce<Record<string, number>>((acc, r) => ((acc[r.source_type] = (acc[r.source_type] ?? 0) + 1), acc), {});
  console.log("Chunks per source type:", byType);
  console.log("Vector database written to data/index. Try: npm run ask -- \"When do exams start?\"");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
