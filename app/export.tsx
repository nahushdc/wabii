import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Share, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/lib/supabase';
import { WarmBackground } from '@/components/warm-background';
import { COLORS } from '@/constants/colors';

type Format = 'text' | 'markdown' | 'csv' | 'json';
type Mode = 'export' | 'import';

type ImportEntry = { content: string; created_at: string };
type PendingImport = { entries: ImportEntry[]; skipped: number; fileName: string };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function buildText(entries: any[]): string {
  const lines: string[] = ['MY JOURNAL', '==========', ''];
  for (const entry of entries) {
    lines.push(`${formatDate(entry.created_at)} — ${formatTime(entry.created_at)}`);
    if (entry.tags?.length) {
      lines.push(`Tags: ${entry.tags.join(', ')}`);
    }
    lines.push('');
    lines.push(entry.content);
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  return lines.join('\n');
}

function csvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildCSV(entries: any[]): string {
  const lines: string[] = ['Date,Time,Tags,Content'];
  for (const entry of entries) {
    lines.push([
      csvField(formatDate(entry.created_at)),
      csvField(formatTime(entry.created_at)),
      csvField((entry.tags ?? []).join('; ')),
      csvField(entry.content),
    ].join(','));
  }
  return lines.join('\n');
}

function buildMarkdown(entries: any[]): string {
  const lines: string[] = ['# My Journal', ''];
  for (const entry of entries) {
    lines.push(`## ${formatDate(entry.created_at)}`);
    lines.push(`*${formatTime(entry.created_at)}*`);
    if (entry.tags?.length) {
      lines.push('');
      lines.push(`**Tags:** ${entry.tags.map((t: string) => `\`${t}\``).join(' ')}`);
    }
    lines.push('');
    lines.push(entry.content);
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  return lines.join('\n');
}

function buildJSON(entries: any[]): string {
  return JSON.stringify({
    app: 'wabii',
    version: 1,
    exported_at: new Date().toISOString(),
    entries: entries.map(e => ({ content: e.content, created_at: e.created_at, tags: e.tags ?? [] })),
  }, null, 2);
}

const MAX_IMPORT_ENTRIES = 2000;

// Only the JSON backup this screen produces is reliably re-importable — the
// txt/md/csv formats are meant for humans and don't carry structured dates
// back in cleanly, so we don't try to parse them.
function parseBackup(raw: string): { entries: ImportEntry[]; skipped: number } {
  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("That doesn't look like a valid Wabii backup file — it isn't valid JSON.");
  }

  const rawEntries = Array.isArray(json) ? json : json?.entries;
  if (!Array.isArray(rawEntries)) {
    throw new Error("This file doesn't look like a Wabii backup. Only .json backups exported from this screen can be imported.");
  }
  if (rawEntries.length === 0) {
    throw new Error('That backup has no entries to import.');
  }

  const overflow = Math.max(0, rawEntries.length - MAX_IMPORT_ENTRIES);
  const capped = rawEntries.slice(0, MAX_IMPORT_ENTRIES);

  let skipped = overflow;
  const entries: ImportEntry[] = [];
  for (const e of capped) {
    const content = typeof e?.content === 'string' ? e.content.trim() : '';
    const createdAtValid = typeof e?.created_at === 'string' && !isNaN(new Date(e.created_at).getTime());
    if (!content || !createdAtValid) {
      skipped++;
      continue;
    }
    entries.push({ content, created_at: e.created_at });
  }

  if (entries.length === 0) {
    throw new Error("None of the entries in that file could be read — make sure it's an unmodified Wabii backup.");
  }

  return { entries, skipped };
}

export default function ExportScreen() {
  const [mode, setMode] = useState<Mode>('export');

  // Export state
  const [format, setFormat] = useState<Format>('text');
  const [exporting, setExporting] = useState(false);
  const [entryCount, setEntryCount] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Import state
  const [picking, setPicking] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importResult, setImportResult] = useState<{ count: number; skipped: number } | null>(null);

  async function loadCount() {
    if (loaded) return;
    const { count } = await supabase
      .from('journal_entries')
      .select('*', { count: 'exact', head: true });
    setEntryCount(count ?? 0);
    setLoaded(true);
  }

  useState(() => { loadCount(); });

  async function handleExport() {
    setExporting(true);
    try {
      const { data: entries } = await supabase
        .from('journal_entries')
        .select('id, content, created_at')
        .order('created_at', { ascending: false });

      if (!entries || entries.length === 0) {
        setExporting(false);
        return;
      }

      // Fetch tags for each entry
      const { data: tagLinks } = await supabase
        .from('entry_tags')
        .select('entry_id, tags(name)')
        .in('entry_id', entries.map(e => e.id));

      const tagMap: Record<string, string[]> = {};
      for (const link of tagLinks ?? []) {
        if (!tagMap[link.entry_id]) tagMap[link.entry_id] = [];
        const name = (link.tags as any)?.name;
        if (name) tagMap[link.entry_id].push(name);
      }

      const enriched = entries.map(e => ({ ...e, tags: tagMap[e.id] ?? [] }));
      const content =
        format === 'markdown' ? buildMarkdown(enriched)
        : format === 'csv' ? buildCSV(enriched)
        : format === 'json' ? buildJSON(enriched)
        : buildText(enriched);
      const extension = format === 'markdown' ? 'md' : format === 'csv' ? 'csv' : format === 'json' ? 'json' : 'txt';
      const filename = `journal-${new Date().toISOString().slice(0, 10)}.${extension}`;

      await Share.share({ message: content, title: filename });
    } catch (e) {
      console.error(e);
    }
    setExporting(false);
  }

  async function handlePickFile() {
    setImportError('');
    setImportResult(null);
    setPendingImport(null);
    setPicking(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/*', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) { setPicking(false); return; }
      const asset = result.assets?.[0];
      if (!asset) { setPicking(false); return; }

      const raw = await FileSystem.readAsStringAsync(asset.uri);
      const { entries, skipped } = parseBackup(raw);
      setPendingImport({ entries, skipped, fileName: asset.name });
    } catch (e: any) {
      setImportError(e?.message ?? 'Could not read that file.');
    }
    setPicking(false);
  }

  async function handleConfirmImport() {
    if (!pendingImport) return;
    Alert.alert(
      'Import entries',
      `This adds ${pendingImport.entries.length} ${pendingImport.entries.length === 1 ? 'entry' : 'entries'} to your journal. Importing the same backup twice will create duplicates. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Import', onPress: runImport },
      ]
    );
  }

  async function runImport() {
    if (!pendingImport) return;
    setImporting(true);
    setImportError('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setImportError('You need to be signed in to import.'); setImporting(false); return; }

    const { data: inserted, error } = await supabase
      .from('journal_entries')
      .insert(pendingImport.entries.map(e => ({ user_id: user.id, content: e.content, created_at: e.created_at })))
      .select('id, content');

    if (error) {
      setImportError(error.message || 'Import failed. Please try again.');
      setImporting(false);
      return;
    }

    // Best-effort: makes imported entries searchable too. Not required for
    // the import itself to be considered successful.
    await Promise.allSettled(
      (inserted ?? []).map(row =>
        supabase.functions.invoke('embed-entry', { body: { entry_id: row.id, content: row.content } })
      )
    );

    setImportResult({ count: inserted?.length ?? 0, skipped: pendingImport.skipped });
    setPendingImport(null);
    setImporting(false);
    setLoaded(false);
    loadCount();
  }

  return (
    <WarmBackground>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 48 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 64, paddingBottom: 20 }}>
        <Pressable onPress={() => router.back()} style={{ padding: 4, marginRight: 12 }}>
          <Feather name="arrow-left" size={22} color="#374151" />
        </Pressable>
        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 22, color: '#1c1917' }}>Export & Import</Text>
      </View>

      <View style={{ paddingHorizontal: 24 }}>

        {/* Mode switcher */}
        <View style={{
          flexDirection: 'row', backgroundColor: '#ffffff', borderRadius: 16, padding: 6, marginBottom: 24,
          shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
        }}>
          {([{ id: 'export', label: 'Export', icon: 'upload' }, { id: 'import', label: 'Import', icon: 'download' }] as const).map(opt => {
            const active = mode === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => setMode(opt.id)}
                style={{
                  flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  backgroundColor: active ? COLORS.primary : 'transparent',
                  borderRadius: 11, paddingVertical: 10,
                }}>
                <Feather name={opt.icon} size={14} color={active ? '#ffffff' : '#a8a29e'} />
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: active ? '#ffffff' : '#a8a29e' }}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {mode === 'export' ? (
          <>
            {/* What's included, combined with entry count */}
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: '#c4b9b0', marginBottom: 10 }}>
              What's included
            </Text>
            <View style={{ backgroundColor: '#ffffff', borderRadius: 16, padding: 18, marginBottom: 28, gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Feather name="book-open" size={16} color="#E85D2C" />
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#1c1917' }}>
                  {entryCount === null ? 'Loading entries…' : `${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}`}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Feather name="clock" size={16} color="#a8a29e" />
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#78716c' }}>Date and time of each entry</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Feather name="tag" size={16} color="#a8a29e" />
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#78716c' }}>Tags attached to each entry</Text>
              </View>
            </View>

            {/* Format picker */}
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: '#c4b9b0', marginBottom: 10 }}>
              Format
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 28 }}>
              {([
                { id: 'text', label: 'Plain text', desc: 'A .txt file', emoji: '📄' },
                { id: 'markdown', label: 'Markdown', desc: 'A .md file', emoji: '✍️' },
                { id: 'csv', label: 'Excel / CSV', desc: 'A .csv file', emoji: '📊' },
                { id: 'json', label: 'Wabii Backup', desc: 'Re-importable .json', emoji: '💾' },
              ] as const).map(opt => {
                const active = format === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => setFormat(opt.id)}
                    style={{
                      width: '47%', backgroundColor: active ? '#FDE6DB' : '#ffffff',
                      borderRadius: 16, paddingVertical: 14, paddingHorizontal: 10,
                      borderWidth: 1.5, borderColor: active ? '#E85D2C' : 'transparent',
                      shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
                    }}>
                    <Text style={{ fontSize: 20, marginBottom: 8 }}>{opt.emoji}</Text>
                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: active ? '#E85D2C' : '#1c1917', marginBottom: 4 }}>{opt.label}</Text>
                    <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: active ? '#C2410C' : '#a8a29e', lineHeight: 17 }}>{opt.desc}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Export button */}
            <Pressable
              onPress={handleExport}
              disabled={exporting || entryCount === 0}
              style={{
                backgroundColor: exporting || entryCount === 0 ? '#c4b9b0' : '#E85D2C',
                borderRadius: 16, paddingVertical: 18,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
              }}>
              {exporting
                ? <ActivityIndicator color="white" />
                : <>
                    <Feather name="share" size={18} color="white" />
                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#ffffff' }}>Export</Text>
                  </>}
            </Pressable>
          </>
        ) : (
          <>
            {/* Import explainer */}
            <View style={{ backgroundColor: '#ffffff', borderRadius: 16, padding: 18, marginBottom: 24, gap: 10 }}>
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#1c1917' }}>What can be imported</Text>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#78716c', lineHeight: 19 }}>
                Only a <Text style={{ fontFamily: 'Inter_600SemiBold' }}>Wabii Backup (.json)</Text> file — the kind you get from
                Export above — can be imported reliably. Plain text, Markdown, and CSV exports are meant for reading, not
                re-importing, since we can't tell entries and dates apart in freeform text.
              </Text>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#78716c', lineHeight: 19 }}>
                Tags aren't restored on import yet, and importing the same file twice will create duplicate entries.
              </Text>
            </View>

            {importError ? (
              <View style={{ marginBottom: 16, backgroundColor: '#fff1f0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#ef4444' }}>{importError}</Text>
              </View>
            ) : null}

            {importResult ? (
              <View style={{ marginBottom: 16, backgroundColor: '#E6F3E0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#3F7A3F', marginBottom: importResult.skipped > 0 ? 4 : 0 }}>
                  Imported {importResult.count} {importResult.count === 1 ? 'entry' : 'entries'}.
                </Text>
                {importResult.skipped > 0 && (
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#3F7A3F' }}>
                    Skipped {importResult.skipped} {importResult.skipped === 1 ? 'entry that was' : 'entries that were'} invalid or unreadable.
                  </Text>
                )}
              </View>
            ) : null}

            {pendingImport ? (
              <View style={{
                backgroundColor: '#ffffff', borderRadius: 16, padding: 18, marginBottom: 20,
                shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <Feather name="file-text" size={16} color="#78716c" />
                  <Text style={{ flex: 1, fontFamily: 'Inter_500Medium', fontSize: 14, color: '#1c1917' }} numberOfLines={1}>
                    {pendingImport.fileName}
                  </Text>
                </View>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#78716c', marginBottom: 16 }}>
                  {pendingImport.entries.length} {pendingImport.entries.length === 1 ? 'entry' : 'entries'} found
                  {pendingImport.skipped > 0 ? `, ${pendingImport.skipped} skipped` : ''}.
                </Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Pressable
                    onPress={() => setPendingImport(null)}
                    disabled={importing}
                    style={{ flex: 1, backgroundColor: '#f5f0eb', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}>
                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#78716c' }}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleConfirmImport}
                    disabled={importing}
                    style={{
                      flex: 1, backgroundColor: importing ? '#c4b9b0' : '#E85D2C', borderRadius: 14, paddingVertical: 14,
                      alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
                    }}>
                    {importing
                      ? <ActivityIndicator color="white" size="small" />
                      : <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#ffffff' }}>Import</Text>}
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={handlePickFile}
                disabled={picking}
                style={{
                  backgroundColor: picking ? '#c4b9b0' : '#E85D2C', borderRadius: 16, paddingVertical: 18,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                }}>
                {picking
                  ? <ActivityIndicator color="white" />
                  : <>
                      <Feather name="upload" size={18} color="white" />
                      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#ffffff' }}>Choose backup file</Text>
                    </>}
              </Pressable>
            )}
          </>
        )}
      </View>
    </ScrollView>
    </WarmBackground>
  );
}
