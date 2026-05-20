import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Share, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';

type Format = 'text' | 'markdown';

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

export default function ExportScreen() {
  const [format, setFormat] = useState<Format>('text');
  const [exporting, setExporting] = useState(false);
  const [entryCount, setEntryCount] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

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
      const content = format === 'markdown' ? buildMarkdown(enriched) : buildText(enriched);
      const filename = `journal-${new Date().toISOString().slice(0, 10)}.${format === 'markdown' ? 'md' : 'txt'}`;

      await Share.share({ message: content, title: filename });
    } catch (e) {
      console.error(e);
    }
    setExporting(false);
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#faf9f7' }} contentContainerStyle={{ paddingBottom: 48 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 64, paddingBottom: 20 }}>
        <Pressable onPress={() => router.back()} style={{ padding: 4, marginRight: 12 }}>
          <Feather name="arrow-left" size={22} color="#374151" />
        </Pressable>
        <Text style={{ fontFamily: 'PlayfairDisplay_700Bold', fontSize: 22, color: '#1c1917' }}>Share with therapist</Text>
      </View>

      <View style={{ paddingHorizontal: 24 }}>

        {/* Entry count pill */}
        {entryCount !== null && (
          <View style={{
            alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6,
            backgroundColor: '#eef2ff', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, marginBottom: 28,
          }}>
            <Text style={{ fontSize: 14 }}>📓</Text>
            <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: '#4f46e5' }}>
              {entryCount} {entryCount === 1 ? 'entry' : 'entries'} will be exported
            </Text>
          </View>
        )}

        {/* Format picker */}
        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: '#c4b9b0', marginBottom: 10 }}>
          Format
        </Text>

        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 28 }}>
          {([
            { id: 'text', label: 'Plain text', desc: 'Simple .txt file, works everywhere', emoji: '📄' },
            { id: 'markdown', label: 'Markdown', desc: 'Formatted .md file for notes apps', emoji: '✍️' },
          ] as const).map(opt => {
            const active = format === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => setFormat(opt.id)}
                style={{
                  flex: 1, backgroundColor: active ? '#eef2ff' : '#ffffff',
                  borderRadius: 16, padding: 16,
                  borderWidth: 1.5, borderColor: active ? '#4f46e5' : 'transparent',
                  shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
                }}>
                <Text style={{ fontSize: 20, marginBottom: 8 }}>{opt.emoji}</Text>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: active ? '#4f46e5' : '#1c1917', marginBottom: 4 }}>{opt.label}</Text>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: active ? '#818cf8' : '#a8a29e', lineHeight: 17 }}>{opt.desc}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* What's included */}
        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: '#c4b9b0', marginBottom: 10 }}>
          What's included
        </Text>
        <View style={{ backgroundColor: '#ffffff', borderRadius: 16, padding: 18, marginBottom: 32, gap: 12 }}>
          {[
            { icon: 'file-text', label: 'All journal entries' },
            { icon: 'clock', label: 'Date and time of each entry' },
            { icon: 'tag', label: 'Tags attached to each entry' },
          ].map(item => (
            <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Feather name={item.icon as any} size={16} color="#a8a29e" />
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#78716c' }}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* Export button */}
        <Pressable
          onPress={handleExport}
          disabled={exporting || entryCount === 0}
          style={{
            backgroundColor: exporting || entryCount === 0 ? '#c4b9b0' : '#4f46e5',
            borderRadius: 16, paddingVertical: 18,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}>
          {exporting
            ? <ActivityIndicator color="white" />
            : <>
                <Feather name="share" size={18} color="white" />
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#ffffff' }}>Share my journal</Text>
              </>}
        </Pressable>

      </View>
    </ScrollView>
  );
}
