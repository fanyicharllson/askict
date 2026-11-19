import { CHUNK_OVERLAP, CHUNK_SIZE } from "./config";

/**
 * Splits a document into overlapping passages of about CHUNK_SIZE characters.
 * Breaks on paragraph, then line, then sentence boundaries so a passage
 * never stops in the middle of an idea. The overlap keeps facts that sit
 * on a boundary findable from both sides.
 */
export function chunkText(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const pieces = splitToFit(text, size);
  const chunks: string[] = [];
  let current = "";

  for (const piece of pieces) {
    if (current && current.length + piece.length + 1 > size) {
      chunks.push(current.trim());
      // start the next chunk with the tail of this one
      const tail = current.slice(-overlap);
      const cut = tail.search(/[\n.!?]\s/);
      current = (cut >= 0 ? tail.slice(cut + 1) : tail).trimStart();
    }
    current += (current ? "\n" : "") + piece;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function splitToFit(text: string, size: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n{2,}/)) {
    if (para.length <= size) {
      out.push(para);
      continue;
    }
    for (const line of para.split("\n")) {
      if (line.length <= size) {
        out.push(line);
        continue;
      }
      // very long line: split into sentences, then hard-split as a last resort
      for (const sentence of line.match(/[^.!?]+[.!?]*\s*/g) ?? [line]) {
        for (let i = 0; i < sentence.length; i += size) out.push(sentence.slice(i, i + size));
      }
    }
  }
  return out.filter((p) => p.trim().length > 0);
}

/**
 * Markdown-aware chunking for notes and knowledge-base pages.
 * Splits by heading, prefixes every chunk with its heading (e.g. "ICT, Year 2, Fall 2026")
 * and, when a long table must be split, repeats the table's header row in each piece,
 * so a chunk of course rows still says which program, year and columns it belongs to.
 */
export function chunkMarkdown(text: string, size = CHUNK_SIZE): string[] {
  const sections: { heading: string; body: string }[] = [];
  let heading = "";
  let lines: string[] = [];
  const flush = () => {
    const body = lines.join("\n").trim();
    if (body) sections.push({ heading, body });
    lines = [];
  };
  for (const line of text.split(/\r?\n/)) {
    const h = line.match(/^#{1,4}\s+(.*)$/);
    if (h) {
      flush();
      heading = h[1].trim();
    } else lines.push(line);
  }
  flush();

  const chunks: string[] = [];
  for (const { heading: head, body } of sections) {
    const prefix = head ? `${head}\n\n` : "";
    const budget = Math.max(300, size - prefix.length);
    if (body.length <= budget) {
      const lead = body.trimStart().startsWith("|") ? `${describeTable(head, body)}\n\n` : "";
      chunks.push(prefix + lead + body);
      continue;
    }
    // split the section into blocks: tables stay together, prose goes through chunkText
    const blocks = body.split(/\n{2,}/);
    let current = "";
    const push = () => {
      if (current.trim()) chunks.push(prefix + current.trim());
      current = "";
    };
    for (const block of blocks) {
      const isTable = block.trimStart().startsWith("|");
      if (isTable && block.length > budget) {
        push();
        const rows = block.split("\n");
        const header = rows.slice(0, 2).join("\n");
        let group: string[] = [];
        const emit = () => {
          const piece = `${header}\n${group.join("\n")}`;
          chunks.push(`${prefix}${describeTable(head, piece)}\n\n${piece}`);
          group = [];
        };
        for (const row of rows.slice(2)) {
          if (header.length + group.join("\n").length + row.length > budget && group.length) emit();
          group.push(row);
        }
        if (group.length) emit();
      } else if (!isTable && block.length > budget) {
        push();
        for (const piece of chunkText(block, budget)) chunks.push(prefix + piece);
      } else {
        if (current && current.length + block.length + 2 > budget) push();
        current += (current ? "\n\n" : "") + block;
      }
    }
    push();
  }
  return chunks;
}

/**
 * Contextual enrichment for table chunks: a plain sentence in front of the table
 * ("ICT, Year 3, Fall 2026 – Course: Cyber Security; Ccna 1; ...") so the embedding
 * model and the keyword index can match natural questions to rows of codes and times.
 */
export function describeTable(heading: string, table: string): string {
  const rows = table.split("\n").filter((r) => r.trim().startsWith("|"));
  if (rows.length < 3) return "";
  const cells = (row: string) => row.split("|").slice(1, -1).map((c) => c.trim());
  const header = cells(rows[0]);
  let col = header.findIndex((h) => /course|name|title|program|service|fee|item|subject/i.test(h));
  if (col < 0) col = 0;
  const values = [...new Set(rows.slice(2).map((r) => cells(r)[col]).filter(Boolean))];
  return `${heading ? `${heading} – ` : ""}${header[col]}: ${values.join("; ")}.`;
}
