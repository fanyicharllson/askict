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
