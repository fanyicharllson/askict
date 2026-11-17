import path from "node:path";

export const DATA_DIR = path.join(process.cwd(), "data");
export const RAW_DIR = path.join(DATA_DIR, "raw");
/** The vector database lives here (LanceDB files). */
export const INDEX_DIR = path.join(DATA_DIR, "index");
export const TABLE_NAME = "chunks";

/**
 * Embedding model: turns text into a 384-number vector that represents its meaning.
 * Multilingual, so a question in French still finds an English passage.
 * Runs locally (downloaded once to data/models), free, no API key.
 */
export const EMBEDDING_MODEL = "Xenova/multilingual-e5-small";
export const EMBEDDING_DIM = 384;
export const MODELS_DIR = path.join(DATA_DIR, "models");

/** Chunking: target size of one passage, and how much consecutive chunks overlap. */
export const CHUNK_SIZE = 1000; // characters (~170 words)
export const CHUNK_OVERLAP = 200;

/** How many passages we retrieve per question. */
export const TOP_K = 6;
