import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { NormalizedListing } from './types.js';

export interface IngestResult {
  new: number;
  changed: number;
  offline: number;
  closed: number;
}

export interface ClaimedNotification {
  match_id: number;
  user_id: string;
  whatsapp_phone: string;
  callmebot_apikey: string;
  listing: NormalizedListing & { id: number };
}

export interface Db {
  lastFingerprint(sourceId: string): Promise<string | null>;
  ingest(sourceId: string, items: NormalizedListing[], fp: string, complete: boolean, startedAt: Date): Promise<IngestResult>;
  recordRun(sourceId: string, startedAt: Date, ok: boolean, error?: string, items?: number): Promise<number>;
  claimNotifications(limit: number): Promise<ClaimedNotification[]>;
  releaseNotifications(matchIds: number[], error: string): Promise<void>;
}

export function createDb(url: string, secretKey: string): Db {
  const sb: SupabaseClient = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw new Error(`Supabase ${fn}: ${error.message}`);
    return data as T;
  }

  return {
    async lastFingerprint(sourceId) {
      const { data, error } = await sb.from('sources').select('last_fingerprint').eq('id', sourceId).single();
      if (error) throw new Error(`Supabase sources: ${error.message}`);
      return data.last_fingerprint as string | null;
    },
    ingest: (sourceId, items, fp, complete, startedAt) =>
      rpc<IngestResult>('ingest_listings', {
        p_source: sourceId,
        p_items: items,
        p_fingerprint: fp,
        p_complete: complete,
        p_started_at: startedAt.toISOString(),
      }),
    recordRun: (sourceId, startedAt, ok, error, items) =>
      rpc<number>('record_run', {
        p_source: sourceId,
        p_started_at: startedAt.toISOString(),
        p_ok: ok,
        p_error: error ?? null,
        p_items: items ?? null,
      }),
    claimNotifications: (limit) => rpc<ClaimedNotification[]>('claim_notifications', { p_limit: limit }),
    releaseNotifications: async (matchIds, error) => {
      await rpc('release_notification', { p_match_ids: matchIds, p_error: error });
    },
  };
}
