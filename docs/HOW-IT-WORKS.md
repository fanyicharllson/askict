# How AskICT works behind the scenes

This walks through exactly what happens when a student types **"What is the ERP?"**, then defines every term you might be asked about.

## The two models (this is the part that confuses people)

AskICT uses **two different AI models**, for two different jobs:

| | Embedding model | Chat model (LLM) |
|---|---|---|
| Name | `multilingual-e5-small` | `LFM3-1.7B` by Liquid AI (4-bit GGUF, 1.1 GB) |
| Where it runs | **On this laptop** (downloaded once into `data/models/`, about 130 MB) | **On this laptop** too, served by llama.cpp (`npm run llm`) at `localhost:8080` |
| Job | Turns text into a vector (a list of 384 numbers that captures its meaning) | Reads the passages we found and writes the answer |
| Does it write answers? | No, never | Yes |
| Cost | Free, works offline | Free, works offline, **no API key** |

Think of a **librarian** and a **writer**. The embedding model is the librarian: it only *finds* the right passages and never talks to the student. The LLM is the writer: it reads those passages and writes the answer. **Both run on this laptop**, so nothing leaves the machine and no API key is needed. (A cloud model on Groq can be switched on with `LLM_PROVIDER=groq` for a faster demo, but it is optional.)

### Why LFM3-1.7B?

The laptop has a 2-core CPU and no GPU, so the model must be small. LFM3-1.7B (Liquid AI, 2026) fits in about 1 GB at 4-bit, speaks French, follows instructions very well for its size (IFEval 96.7) and was trained to "answer from retrieved documents, or decline", which is exactly RAG. Its "thinking" mode is turned off (`--reasoning off`) so it answers directly. **llama.cpp** is the engine that runs GGUF models efficiently on CPUs; its `llama-server` exposes an OpenAI-compatible API on localhost that AskICT calls.

## Phase 1: building the knowledge base (done once, before anyone asks)

```
ictuniversity.org ──┐
fee plan (note) ────┤                                   ┌──────────────────────────┐
ERP notice (note) ──┼─► 1 COLLECT ─► 2 CHUNK ─► 3 EMBED ─► 4 STORE in LanceDB       │
ictukb (46 pages) ──┘    data/raw     ~1000 chars  384 numbers  data/index (≈650 rows)│
                                                            └──────────────────────────┘
```

1. **Collect** (`npm run collect`, `npm run import:ictukb`): download the university website through its WordPress API, import the verified pages of the open ICTU knowledge base, and add our hand-written notes. Everything is saved as text in `data/raw/`.
2. **Chunk** (`npm run ingest`): cut every document into passages of about 1,000 characters.
   - Markdown is cut at headings, and every chunk keeps its heading. A piece of the course table still says "ICT, Year 3, Fall 2026".
   - Long tables are split by rows and repeat their header row.
   - Each table chunk gets a one-line summary in front, for example "ICT, Year 3 – Course: Cyber Security; Ccna 1; …". This is *contextual enrichment*.
3. **Embed**: the local embedding model turns each chunk into a vector of 384 numbers.
4. **Store**: each chunk is saved as one row in **LanceDB**, our vector database (`data/index/`), with its text, vector, title, link, type and date. A **keyword index (BM25)** is also built on the text.

## Phase 2: answering "What is the ERP?" (every question, about 2–5 seconds)

```
"What is the ERP?"
      │
      ├─► A. embed the question (local model) ──► vector search in LanceDB ──► top 25 by meaning
      │
      ├─► B. keyword search (BM25) in LanceDB ─────────────────────────────► top 25 by exact words
      │
      ▼
   C. merge both lists with Reciprocal Rank Fusion ──► best 4 passages
      │
   D. build the prompt: rules + the 8 numbered passages + the conversation
      │
   E. send to the local LLM (llama.cpp) ──► answer streams back word by word, with [1] [2] citations
      │
   F. the website shows the answer, clickable citations and the source list
```

Step by step:

- **A. Vector search (semantic):** the question becomes a vector with the same local model (prefixed `query:`). LanceDB compares it with all ~650 stored vectors using **cosine similarity** and returns the 25 closest. This finds "ERP system overview" even if the student had written "the new student platform".
- **B. Keyword search (lexical):** BM25 looks for the exact words "ERP". It's good at codes and names (`CSC 4121`, "Year 3", a lecturer's name) that vectors can miss.
- **C. Fusion:** each passage gets `1/(60 + rank)` from each list, and the two are added. Passages that rank well in **both** lists rise to the top. News older than two years is slightly down-weighted. We keep the top 4 (the local model reads every token on the CPU, so fewer passages means a faster answer).
- **D. Augmentation:** the 4 passages are pasted into the system prompt, numbered `[1]`…`[8]`, with rules: answer only from them, cite them, be detailed, say "I don't know" if they don't contain the answer, never give passwords.
- **E. Generation:** the prompt goes to LFM3-1.7B running in llama.cpp on the laptop. It first *reads* the prompt (prefill, the slow part on a CPU), then *writes* the answer token by token (decode), streamed to the browser.
- **F. Display:** `[2]` becomes a link to source 2, and the source list shows the pages actually cited. If the student is signed in, the conversation is saved in `data/app.db`.

To see steps A to C yourself, without the LLM:

```bash
npm run ask -- "What is the ERP?"
```

Each line shows `vec#` (rank in the vector search) and `kw#` (rank in the keyword search).

## Where each thing is stored

| Folder / file | What | On GitHub? |
|---|---|---|
| `data/raw/web/` | website pages and news (JSON) | yes |
| `data/raw/notes/` | our notes: fee plan transcription, ERP notice | yes |
| `data/raw/ictukb/` | 46 verified pages from the open ICTU knowledge base | yes |
| `data/index/` | **the vector database** (LanceDB): chunks + vectors + keyword index | yes |
| `data/models/` | the downloaded embedding model | no (130 MB, re-downloaded automatically) |
| `data/app.db` | user accounts (hashed PINs) and saved chats | no (private) |
| `data/raw/pdf/` | the original fee PDF | no (contains bank account numbers) |

## Definitions

- **RAG (Retrieval-Augmented Generation):** instead of trusting what an LLM memorized, we *retrieve* relevant passages from our own data, *augment* the prompt with them, and let the LLM *generate* an answer from them.
- **LLM (Large Language Model):** a model trained to predict the next word. It writes fluent text but doesn't know ICTU facts unless we give them in the prompt.
- **Embedding:** a vector (list of numbers) that represents the meaning of a text. Similar meanings give vectors that point in similar directions.
- **Vector:** here, a list of 384 decimal numbers, for example `[0.021, -0.113, 0.087, …]`.
- **Vector database:** a database that stores vectors and quickly finds the nearest ones to a query vector. Ours is **LanceDB**, which runs inside the app and saves to files.
- **Cosine similarity:** the angle between two vectors. 1 means the same direction (same meaning), 0 means unrelated.
- **Chunk:** a small passage of a document (about 1,000 characters). We search chunks, not whole documents, so the LLM gets only the relevant part.
- **Chunk overlap:** consecutive chunks share about 200 characters, so a fact on a boundary isn't lost.
- **BM25:** the classic keyword-ranking formula used by search engines. It rewards rare words that appear in a passage.
- **Hybrid search:** vector search and keyword search combined.
- **Reciprocal Rank Fusion (RRF):** a simple way to merge ranked lists: `score = Σ 1/(60 + rank)`.
- **Top-k:** how many passages we send to the LLM (k = 4 locally, 8 in cloud mode).
- **Prompt / system prompt:** the instructions and context sent to the LLM before the question.
- **Context window:** the maximum amount of text the LLM can read at once. LFM3 supports 256K tokens; we run it with 8,192 to save memory.
- **GGUF / quantization:** GGUF is the file format llama.cpp uses. "Q4_K_M" means the weights are stored with about 4 bits each instead of 16, so the 1.7B model shrinks from 3.5 GB to 1.1 GB with little quality loss.
- **llama.cpp:** open-source C/C++ engine that runs LLMs on ordinary CPUs. `llama-server` is its local web server.
- **Prefill and decode:** prefill = the model reading the whole prompt; decode = generating the answer one token at a time.
- **Token:** a piece of a word. LLMs read and write tokens.
- **Temperature:** randomness of the LLM. We use 0.1 (very low, as Liquid AI recommends), so answers stick to the facts.
- **Hallucination:** when an LLM invents facts. RAG plus "answer only from context" plus citations reduce it.
- **Citation:** the `[n]` that links an answer sentence to the passage it came from.
- **Streaming:** sending the answer word by word as it's generated, instead of waiting for the whole text.
- **Groq:** a cloud company that runs open LLMs very fast. Optional in AskICT, off by default.
- **Multilingual:** the embedding model maps French and English into the same vector space, so a French question finds English passages.

## Questions you may be asked

1. *Is the model trained on ICTU data?* No. Nothing is trained or fine-tuned. The knowledge lives in the vector database and is given to the LLM at question time. To update the bot, update `data/raw/` and run `npm run ingest`.
2. *Why not just ask ChatGPT?* It doesn't know ICTU's fees, timetable or ERP, and it would guess. RAG makes it answer from official sources and show them.
3. *Why two search methods?* Vectors understand meaning but can miss exact codes and names. Keywords match exact words but miss synonyms. Hybrid search gets both.
4. *What if the answer isn't in the data?* The prompt tells the model to say so and point to the university contacts.
5. *Where does the data come from?* ictuniversity.org (WordPress API, respecting robots.txt's 20 s delay), Wikipedia, the bursar's fee plan, the ERP notice, and the class's open knowledge base `ictukb` (MIT licence, verified pages only).
