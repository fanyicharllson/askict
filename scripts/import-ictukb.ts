/**
 * Imports the open ICT University Knowledge Base (github.com/Egbemichel/ictukb, MIT licence)
 * into our dataset: data/raw/ictukb/*.md
 *
 * - only pages marked `status: verified` (drafts are empty "[[TO FILL]]" placeholders)
 * - keeps title, category and verification date; links each page back to its source
 *   (the university page when known, otherwise the file in the ictukb repo) so citations credit it
 *
 * Run: npm run import:ictukb   (then npm run ingest)
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const REPO = "https://github.com/Egbemichel/ictukb.git";
const BLOB = "https://github.com/Egbemichel/ictukb/blob/main/";
const CLONE_DIR = path.join(process.cwd(), "data", "external", "ictukb");
const OUT_DIR = path.join(process.cwd(), "data", "raw", "ictukb");

function syncRepo() {
  if (existsSync(path.join(CLONE_DIR, ".git"))) {
    console.log("Updating ictukb...");
    execFileSync("git", ["-C", CLONE_DIR, "pull", "--ff-only", "-q"], { stdio: "inherit" });
  } else {
    console.log("Cloning ictukb...");
    execFileSync("git", ["clone", "-q", "--depth", "1", REPO, CLONE_DIR], { stdio: "inherit" });
  }
  return execFileSync("git", ["-C", CLONE_DIR, "rev-parse", "--short", "HEAD"]).toString().trim();
}

async function listMarkdown(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue; // _extracted raw dumps
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listMarkdown(full)));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

/** Reads the simple `key: value` lines of a YAML front matter block (lists are ignored). */
function parseFrontMatter(raw: string): { meta: Record<string, string>; body: string } | null {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;
  const meta: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^([a-z_]+):\s*(.*)$/);
    if (m) meta[m[1]] = m[2].replace(/^['"]|['"]$/g, "").trim();
  }
  return { meta, body: match[2].trim() };
}

async function main() {
  const commit = syncRepo();
  const contentDir = path.join(CLONE_DIR, "content");
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  let kept = 0;
  const skipped: string[] = [];
  for (const file of await listMarkdown(contentDir)) {
    const parsed = parseFrontMatter(await readFile(file, "utf8"));
    const rel = path.relative(CLONE_DIR, file).split(path.sep).join("/");
    if (!parsed || parsed.meta.status !== "verified" || parsed.body.includes("[[TO FILL]]")) {
      skipped.push(rel);
      continue;
    }
    const { meta, body } = parsed;
    const url = meta.source_url && meta.source_url !== "null" ? meta.source_url : BLOB + rel;
    const header = [
      "---",
      `title: ${meta.title ?? path.basename(file, ".md")}`,
      `url: ${url}`,
      "audience: all",
      `date: ${meta.last_verified ?? ""}`,
      `category: ${meta.category ?? ""}`,
      `origin: ictukb ${BLOB}${rel} (MIT, commit ${commit})`,
      "---",
      "",
    ].join("\n");
    await writeFile(path.join(OUT_DIR, `${meta.id ?? path.basename(file, ".md")}.md`), header + body + "\n");
    kept++;
  }

  console.log(`Imported ${kept} verified pages into data/raw/ictukb (ictukb commit ${commit}).`);
  console.log(`Skipped ${skipped.length} drafts / empty pages.`);
  console.log("Next: npm run ingest");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
