import { readFile } from "node:fs/promises";
import path from "node:path";
import { RAW_DIR } from "@/lib/rag/config";

export const runtime = "nodejs";

/** Serves the PDFs in data/raw/pdf so citations like "Tuition Fee Plan (page 2)" open the document. */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const name = path.basename(decodeURIComponent((await params).file));
  if (!name.toLowerCase().endsWith(".pdf")) return new Response("Not found", { status: 404 });
  try {
    const data = await readFile(path.join(RAW_DIR, "pdf", name));
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}"` },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
