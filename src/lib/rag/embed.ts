import { env, pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";
import { EMBEDDING_MODEL, MODELS_DIR } from "./config";

env.cacheDir = MODELS_DIR;

let extractor: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor() {
  extractor ??= pipeline("feature-extraction", EMBEDDING_MODEL, { dtype: "q8" }) as Promise<FeatureExtractionPipeline>;
  return extractor;
}

/**
 * E5 models are trained with prefixes: "passage: " for stored text, "query: " for questions.
 * Vectors are normalised, so cosine similarity = dot product.
 */
async function embed(texts: string[]): Promise<number[][]> {
  const model = await getExtractor();
  const output = await model(texts, { pooling: "mean", normalize: true });
  return output.tolist() as number[][];
}

export async function embedPassages(texts: string[], batchSize = 16): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    vectors.push(...(await embed(texts.slice(i, i + batchSize).map((t) => `passage: ${t}`))));
  }
  return vectors;
}

export async function embedQuery(question: string): Promise<number[]> {
  const [vector] = await embed([`query: ${question}`]);
  return vector;
}
