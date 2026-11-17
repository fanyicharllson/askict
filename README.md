# AskICT

A RAG chatbot that answers student and teacher questions about **The ICT University** (Yaoundé, Cameroon). It retrieves facts from a knowledge base built from the university's official website, documents and notices, and cites its sources.

Built for the Artificial Intelligence course (CA), ICT University, 2026.

## How the RAG works

```
              INDEXING (once, on this laptop)                         ANSWERING (every question)

 ictuniversity.org ─┐                                           question ──► embed ──► query vector
 tuition PDF ───────┼─► collect ─► chunk ─► embed ─► LanceDB                               │
 notices (.md) ─────┘   (raw)     (~1000   (384-dim  (data/index)   ◄── nearest 6 chunks ──┘
                                   chars)   vectors)                         │
                                                                             ▼
                                                     LLM prompt = rules + 6 passages + question
                                                                             │
                                                                             ▼
                                                           answer with [1] [2] citations
```

1. **Retrieval**: a local embedding model (`multilingual-e5-small`) turns the question into a vector, and LanceDB returns the passages whose vectors are closest (cosine similarity).
2. **Augmentation**: those passages are inserted, numbered, into the prompt.
3. **Generation**: the LLM (Gemini) answers using only those passages, cites them, and says when it does not know.

## Stack

| Part | Tool |
|---|---|
| Web app | Next.js 15, React 19, Tailwind, shadcn/ui, AI Elements |
| Chat streaming | Vercel AI SDK |
| Vector database | LanceDB (embedded, files in `data/index/`) |
| Embeddings | `Xenova/multilingual-e5-small` via transformers.js (runs locally, free) |
| LLM | Google Gemini (`gemini-2.5-flash`) |

## Run it

```bash
npm install
cp .env.example .env.local      # add your GOOGLE_GENERATIVE_AI_API_KEY
npm run collect                 # download the website (≈2 min, polite 20 s delay)
npm run ingest                  # chunk + embed + build the vector DB
npm run ask -- "When do exams start?"   # test retrieval only
npm run dev                     # http://localhost:3000
```

Add documents by dropping PDFs in `data/raw/pdf/` or markdown notes in `data/raw/notes/`, then run `npm run ingest` again.

`data/` is git-ignored: the collected data and the vector database stay on the machine that builds them.
