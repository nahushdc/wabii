import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/lib/supabase';
import { getRememberedUserId, rememberUserId } from '@/lib/offline-session';

// Offline-first journaling. A new entry is written to a small JSON file on the
// phone first and uploaded in the background, so saving never depends on a
// connection and nothing typed is lost. Recent entries are also cached so
// Home and the entry page still work with no signal.

const DIR = FileSystem.documentDirectory;
const PENDING_PATH = `${DIR}pending-entries.json`;
const DRAFT_PATH = `${DIR}entry-draft.json`;
const CACHE_PATH = `${DIR}entries-cache.json`;
const CACHE_LIMIT = 300;

export type PendingTag = { name: string; category: string };

export type PendingEntry = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  prompt_theme_id: string | null;
  tags: PendingTag[];
};

export type CachedEntry = { id: string; content: string; created_at: string };

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await FileSystem.readAsStringAsync(path)) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(path: string, value: unknown) {
  await FileSystem.writeAsStringAsync(path, JSON.stringify(value));
}

// Read-modify-write on the pending file must not interleave.
let writeChain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.catch(() => {});
  return run;
}

// A client-made id lets an entry exist before the server has seen it, and
// makes a retried upload harmless (the server ignores a duplicate id).
export function newEntryId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// getSession reads the stored session, so unlike getUser it needs no network.
// But once the access token has expired it has to refresh it first, which
// can't happen offline, and then it reports no session. Fall back to the
// account remembered from the last time we saw one, so saving still works.
export async function currentUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user?.id) {
    rememberUserId(session.user.id);
    return session.user.id;
  }
  return getRememberedUserId();
}

// ---------- Pending entries ----------

export async function getPendingEntries(): Promise<PendingEntry[]> {
  return readJson<PendingEntry[]>(PENDING_PATH, []);
}

export function queueEntry(entry: PendingEntry): Promise<void> {
  return serial(async () => {
    const pending = await getPendingEntries();
    await writeJson(PENDING_PATH, [...pending.filter(p => p.id !== entry.id), entry]);
  });
}

function removePending(id: string): Promise<void> {
  return serial(async () => {
    const pending = await getPendingEntries();
    await writeJson(PENDING_PATH, pending.filter(p => p.id !== id));
  });
}

// ---------- Sync ----------

type Listener = () => void;
const listeners = new Set<Listener>();
export function onEntriesSynced(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

let syncing: Promise<void> | null = null;

async function runSync() {
  const userId = await currentUserId();
  if (!userId) return;
  // Only this account's entries: someone else signing in on the same phone
  // must never upload another account's writing under their own name.
  const pending = (await getPendingEntries()).filter(p => p.user_id === userId);
  let uploaded = false;

  for (const entry of pending) {
    const { error } = await supabase.from('journal_entries').upsert(
      {
        id: entry.id,
        user_id: userId,
        content: entry.content,
        created_at: entry.created_at,
        prompt_theme_id: entry.prompt_theme_id,
      },
      { onConflict: 'id', ignoreDuplicates: true }
    );
    if (error) break; // offline or the server is unhappy: keep it queued, retry later

    for (const tag of entry.tags) {
      const { data: tagRow, error: tagErr } = await supabase
        .from('tags')
        .upsert({ user_id: userId, name: tag.name, category: tag.category }, { onConflict: 'user_id,name' })
        .select('id')
        .single();
      if (tagErr || !tagRow) continue;
      await supabase.from('entry_tags').insert({ entry_id: entry.id, tag_id: tagRow.id });
    }

    supabase.functions
      .invoke('embed-entry', { body: { entry_id: entry.id, content: entry.content } })
      .catch(() => {});

    await removePending(entry.id);
    uploaded = true;
  }

  if (uploaded) listeners.forEach(l => l());
}

// One upload run at a time; callers can fire this freely.
export function syncPendingEntries(): Promise<void> {
  purgeExpiredDraft().catch(() => {});
  if (!syncing) syncing = runSync().catch(() => {}).finally(() => { syncing = null; });
  return syncing;
}

// ---------- Draft ----------

// A draft left behind (say, by closing the app) is kept for two days from the
// last edit, then removed.
const DRAFT_LIFETIME_MS = 2 * 24 * 60 * 60 * 1000;

export async function saveDraft(content: string): Promise<void> {
  if (!content.trim()) {
    await FileSystem.deleteAsync(DRAFT_PATH, { idempotent: true }).catch(() => {});
    return;
  }
  await writeJson(DRAFT_PATH, { content, updated_at: new Date().toISOString() }).catch(() => {});
}

export type Draft = { content: string; savedAt: string };

export async function loadDraft(): Promise<Draft | null> {
  const draft = await readJson<{ content?: string; updated_at?: string }>(DRAFT_PATH, {});
  if (!draft.content?.trim()) return null;
  // A draft saved before timestamps existed starts its two days now.
  const savedAt = draft.updated_at ?? new Date().toISOString();
  if (Date.now() - new Date(savedAt).getTime() > DRAFT_LIFETIME_MS) {
    await FileSystem.deleteAsync(DRAFT_PATH, { idempotent: true }).catch(() => {});
    return null;
  }
  return { content: draft.content, savedAt };
}

// Runs whenever the app syncs (launch, foreground), so an expired draft is
// removed even if the writing screen is never opened again.
export async function purgeExpiredDraft(): Promise<void> {
  await loadDraft();
}

export async function clearDraft(): Promise<void> {
  await FileSystem.deleteAsync(DRAFT_PATH, { idempotent: true }).catch(() => {});
}

// ---------- Cache of recent entries ----------

export async function cacheEntries(entries: CachedEntry[]): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  await writeJson(CACHE_PATH, { user_id: userId, entries: entries.slice(0, CACHE_LIMIT) }).catch(() => {});
}

export async function loadCachedEntries(): Promise<CachedEntry[]> {
  const userId = await currentUserId();
  const cache = await readJson<{ user_id?: string; entries?: CachedEntry[] }>(CACHE_PATH, {});
  return userId && cache.user_id === userId ? cache.entries ?? [] : [];
}

// Deleting an account removes everything kept on the phone for it.
export async function clearLocalJournalData(): Promise<void> {
  await Promise.all([PENDING_PATH, DRAFT_PATH, CACHE_PATH].map(p =>
    FileSystem.deleteAsync(p, { idempotent: true }).catch(() => {})
  ));
}
