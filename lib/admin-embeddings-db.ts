import { isSupabaseServiceConfigured, supabaseRpc } from '@/lib/supabase-rest';

export interface EmbeddingCoverageRow {
  class_level: number;
  subject: string;
  total_chunks: number;
  with_embedding: number;
}

export async function getEmbeddingCoverageStats(): Promise<EmbeddingCoverageRow[]> {
  try {
    if (!isSupabaseServiceConfigured()) return [];
    return await supabaseRpc<EmbeddingCoverageRow[]>('get_embedding_coverage_stats', {});
  } catch {
    return [];
  }
}
