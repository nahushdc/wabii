import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';

export type PursuitOverview = {
  pursuit: { id: string; name: string; focus: string | null; motivation: string | null };
  total: number;
  weekly: { week_start: string; count: number }[];
  patterns: { title: string; entry_count: number; first_date: string | null; last_date: string | null }[];
  entries: { id: string; created_at: string; snippet: string }[];
  updated_at: string | null;
};

export async function fetchPursuitOverview(pursuitId: string): Promise<PursuitOverview> {
  const { data, error } = await supabase.functions.invoke('pursuit-overview', { body: { pursuit_id: pursuitId } });
  if (error || data?.error) throw new Error(data?.error ?? error?.message ?? 'Could not load this pursuit.');
  return data as PursuitOverview;
}

// How many journal entries relate to each pursuit; null if it couldn't be loaded.
export async function fetchPursuitCounts(): Promise<Record<string, number> | null> {
  const { data, error } = await supabase.functions.invoke('pursuit-overview', { body: { counts: true } });
  if (error || data?.error || !data?.counts) return null;
  return data.counts as Record<string, number>;
}

// The explanation of what a pursuit is shows the first time someone adds one.
const INTRO_KEY = 'pursuit_intro_seen';
let seenThisSession = false;

export async function hasSeenPursuitIntro(): Promise<boolean> {
  if (seenThisSession) return true;
  try {
    return (await SecureStore.getItemAsync(INTRO_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function markPursuitIntroSeen(): Promise<void> {
  seenThisSession = true;
  try {
    await SecureStore.setItemAsync(INTRO_KEY, '1');
  } catch {
    // Kept for this launch only; it will simply show once more next time.
  }
}

export async function startPursuit() {
  const seen = await hasSeenPursuitIntro();
  router.push(seen ? '/pursuit-start?step=pick' : '/pursuit-start');
}
