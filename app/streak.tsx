import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { WarmBackground } from '@/components/warm-background';

const CELL = 22;
const GAP = 5;
const GUTTER = 32;
const MONTHS_VISIBLE = 2;
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const COLOR_SCALE = ['#e7e2d9', '#a8d4c8', '#4c9484', '#1f6b5c'];

function toKey(d: Date) {
  return d.toLocaleDateString('en-CA'); // YYYY-MM-DD, local time
}

function startOfWeek(d: Date) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
}

export default function StreakScreen() {
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [pageOffset, setPageOffset] = useState(0); // 2-month pages back from the current one

  useEffect(() => {
    supabase.from('journal_entries').select('created_at').then(({ data }) => {
      const map: Record<string, number> = {};
      for (const row of data ?? []) {
        const key = toKey(new Date(row.created_at));
        map[key] = (map[key] ?? 0) + 1;
      }
      setCounts(map);
      setLoading(false);
    });
  }, []);

  const { streak, longestStreak } = useMemo(() => {
    const days = Object.keys(counts).sort();
    if (days.length === 0) return { streak: 0, longestStreak: 0 };

    const daySet = new Set(days);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let current = 0;
    const cursor = new Date(today);
    if (!daySet.has(toKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    while (daySet.has(toKey(cursor))) {
      current++;
      cursor.setDate(cursor.getDate() - 1);
    }

    let longest = 0;
    let run = 0;
    let prev: Date | null = null;
    for (const key of days) {
      const d = new Date(`${key}T00:00:00`);
      run = prev && Math.round((d.getTime() - prev.getTime()) / 864e5) === 1 ? run + 1 : 1;
      longest = Math.max(longest, run);
      prev = d;
    }
    return { streak: current, longestStreak: longest };
  }, [counts]);

  const maxCount = useMemo(() => Math.max(1, ...Object.values(counts)), [counts]);

  function colorFor(count: number) {
    if (count === 0) return COLOR_SCALE[0];
    const ratio = count / maxCount;
    if (ratio > 0.66) return COLOR_SCALE[3];
    if (ratio > 0.33) return COLOR_SCALE[2];
    return COLOR_SCALE[1];
  }

  const today = useMemo(() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }, []);
  const streakStart = useMemo(() => {
    const s = new Date(today);
    s.setDate(s.getDate() - (streak - 1));
    return s;
  }, [today, streak]);

  function isInCurrentStreak(d: Date) {
    return streak > 0 && d >= streakStart && d <= today;
  }

  // Two calendar months per page, week-aligned so month labels land cleanly at
  // the start of a column instead of drifting mid-week like a rolling window would.
  const weeks = useMemo(() => {
    const endMonth = new Date(today.getFullYear(), today.getMonth() - pageOffset * MONTHS_VISIBLE, 1);
    const startMonth = new Date(endMonth.getFullYear(), endMonth.getMonth() - (MONTHS_VISIBLE - 1), 1);
    const rangeStart = startOfWeek(startMonth);
    const lastDayOfEndMonth = new Date(endMonth.getFullYear(), endMonth.getMonth() + 1, 0);

    const cols: Date[][] = [];
    let colStart = new Date(rangeStart);
    while (colStart <= lastDayOfEndMonth) {
      const col: Date[] = [];
      for (let d = 0; d < 7; d++) {
        const day = new Date(colStart);
        day.setDate(day.getDate() + d);
        col.push(day);
      }
      cols.push(col);
      colStart = new Date(colStart);
      colStart.setDate(colStart.getDate() + 7);
    }
    return cols;
  }, [today, pageOffset]);

  const monthLabels = useMemo(() => {
    const labels: string[] = [];
    let lastMonth = -1;
    for (const col of weeks) {
      const m = col[0].getMonth();
      labels.push(m !== lastMonth ? MONTH_LABELS[m] : '');
      lastMonth = m;
    }
    return labels;
  }, [weeks]);

  const canGoForward = pageOffset > 0;

  return (
    <WarmBackground>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 64, paddingBottom: 16 }}>
        <Pressable onPress={() => router.back()} style={{ padding: 4, marginRight: 12 }}>
          <Feather name="arrow-left" size={22} color="#374151" />
        </Pressable>
        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 22, color: '#1c1917' }}>Streak</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#E85D2C" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 60 }}>
          <View style={{
            backgroundColor: '#ffffff', borderRadius: 20, padding: 18,
            shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 22, color: '#1c1917' }}>
                {streak} day{streak === 1 ? '' : 's'} streak
              </Text>
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 0.8, color: '#a8a29e', marginTop: 5 }}>
                LONGEST STREAK | {longestStreak} DAYS
              </Text>
            </View>

            {/* Month navigation */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <Pressable onPress={() => setPageOffset(o => o + 1)} hitSlop={8}>
                <Feather name="chevron-left" size={18} color="#a8a29e" />
              </Pressable>
              <View style={{ flexDirection: 'row', flex: 1, marginLeft: GUTTER + 8 }}>
                {weeks.map((col, i) => (
                  <View key={i} style={{ width: CELL, marginRight: GAP }}>
                    {monthLabels[i] ? (
                      <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 10, color: '#a8a29e' }} numberOfLines={1}>
                        {monthLabels[i]}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
              <Pressable onPress={() => canGoForward && setPageOffset(o => Math.max(0, o - 1))} hitSlop={8}>
                <Feather name="chevron-right" size={18} color={canGoForward ? '#a8a29e' : '#e7e2d9'} />
              </Pressable>
            </View>

            {/* Grid */}
            {DAY_LABELS.map((label, d) => (
              <View key={label} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: GAP }}>
                <View style={{ width: GUTTER }}>
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: '#a8a29e' }}>{label}</Text>
                </View>
                {weeks.map((col, w) => {
                  const day = col[d];
                  const future = day > today;
                  const count = counts[toKey(day)] ?? 0;
                  return (
                    <View
                      key={w}
                      style={{
                        width: CELL, height: CELL, borderRadius: 6, marginRight: GAP,
                        backgroundColor: future ? 'transparent' : colorFor(count),
                        borderWidth: isInCurrentStreak(day) ? 2 : 0,
                        borderColor: '#1f6b5c',
                      }}
                    />
                  );
                })}
              </View>
            ))}

            {/* Legend */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: '#a8a29e' }}>More</Text>
                {[...COLOR_SCALE].reverse().map(c => (
                  <View key={c} style={{ width: 13, height: 13, borderRadius: 4, backgroundColor: c }} />
                ))}
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: '#a8a29e' }}>Less</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 13, height: 13, borderRadius: 4, borderWidth: 2, borderColor: '#1f6b5c' }} />
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: '#a8a29e' }}>Current streak</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      )}
    </WarmBackground>
  );
}
