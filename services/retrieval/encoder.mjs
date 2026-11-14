import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadEncoder({ download = false } = {}) {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.cacheDir = path.resolve(process.env.MODEL_CACHE_DIR || '.cache/embeddings');
  env.allowLocalModels = true; env.allowRemoteModels = download;
  const pipe = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small', { dtype: 'q8', local_files_only: !download });
  return async (question) => {
    const output = await pipe(`query: ${question}`, { pooling: 'mean', normalize: true });
    const vector = Array.from(output.data);
    if (vector.length !== 384 || !vector.every(Number.isFinite)) throw new Error('invalid-query-vector');
    return vector;
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await loadEncoder({ download: process.argv.includes('--download') });
  console.log('E5 q8 model cache prepared. No student data was processed.');
}
