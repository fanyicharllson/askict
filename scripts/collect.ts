/**
 * Step 1 of the RAG pipeline: COLLECT.
 *
 * Downloads ICT University's public content into data/raw/web/ as JSON:
 *  - every page and news post of ictuniversity.org (WordPress REST API, so we get
 *    clean structured content instead of scraping HTML layouts)
 *  - the Wikipedia article about ICT University (background facts)
 *
 * The site's robots.txt asks crawlers to wait 20 s between requests, so we do.
 * Run: npm run collect
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { htmlToText } from "../src/lib/rag/html";

const SITE = "https://ictuniversity.org";
const CRAWL_DELAY_MS = 20_000;
const USER_AGENT = "AskICT/0.1 (student RAG project; respects robots.txt)";
const OUT_DIR = path.join(process.cwd(), "data", "raw", "web");

type RawDoc = { id: string; title: string; url: string; date?: string; type: string; text: string };

let lastRequest = 0;
async function politeFetch(url: string): Promise<Response> {
  const wait = lastRequest + CRAWL_DELAY_MS - Date.now();
  if (wait > 0) {
    console.log(`  waiting ${Math.ceil(wait / 1000)}s (robots.txt crawl delay)...`);
    await new Promise((r) => setTimeout(r, wait));
  }
  lastRequest = Date.now();
  console.log(`GET ${url}`);
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res;
}

type WpItem = { id: number; link: string; date: string; title: { rendered: string }; content: { rendered: string } };

/** Fetch every item of a WordPress post type, following pagination. */
async function fetchWpType(type: "pages" | "posts"): Promise<RawDoc[]> {
  const docs: RawDoc[] = [];
  for (let page = 1; ; page++) {
    const res = await politeFetch(`${SITE}/wp-json/wp/v2/${type}?per_page=100&page=${page}&_fields=id,link,date,title,content`);
    const items = (await res.json()) as WpItem[];
    for (const item of items) {
      const text = htmlToText(item.content.rendered);
      if (text.length < 80) continue; // empty placeholders like "UnderConstruction"
      docs.push({
        id: `${type}-${item.id}`,
        title: htmlToText(item.title.rendered),
        url: item.link,
        date: item.date,
        type: type === "pages" ? "page" : "news",
        text,
      });
    }
    const totalPages = Number(res.headers.get("x-wp-totalpages") ?? "1");
    if (page >= totalPages) break;
  }
  return docs;
}

async function fetchWikipedia(): Promise<RawDoc> {
  const res = await politeFetch(
    "https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&format=json&titles=ICT_University",
  );
  const json = (await res.json()) as { query: { pages: Record<string, { extract: string }> } };
  const extract = Object.values(json.query.pages)[0]?.extract ?? "";
  return {
    id: "wikipedia-ict-university",
    title: "ICT University (Wikipedia)",
    url: "https://en.wikipedia.org/wiki/ICT_University",
    type: "reference",
    text: extract,
  };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const pages = await fetchWpType("pages");
  await writeFile(path.join(OUT_DIR, "pages.json"), JSON.stringify(pages, null, 2));
  console.log(`saved ${pages.length} pages`);

  const posts = await fetchWpType("posts");
  await writeFile(path.join(OUT_DIR, "news.json"), JSON.stringify(posts, null, 2));
  console.log(`saved ${posts.length} news posts`);

  const wiki = await fetchWikipedia();
  await writeFile(path.join(OUT_DIR, "wikipedia.json"), JSON.stringify([wiki], null, 2));
  console.log("saved Wikipedia article");

  console.log(`\nDone. Raw data is in ${OUT_DIR}. Next: npm run ingest`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
