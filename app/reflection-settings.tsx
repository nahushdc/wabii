import { useState, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { WarmBackground } from '@/components/warm-background';
import { ReliableSwitch } from '@/components/reliable-switch';

export default function ReflectionSettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [weeklyEnabled, setWeeklyEnabled] = useState(true);
  const [monthlyEnabled, setMonthlyEnabled] = useState(true);
  const [weeklySaving, setWeeklySaving] = useState(false);
  const [monthlySaving, setMonthlySaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function fetchSettings() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }
        const { data } = await supabase
          .from('users')
          .select('weekly_reflections_enabled, monthly_reflections_enabled')
          .eq('id', user.id)
          .maybeSingle();
        if (cancelled) return;
        setWeeklyEnabled(data?.weekly_reflections_enabled ?? true);
        setMonthlyEnabled(data?.monthly_reflections_enabled ?? true);
        setLoading(false);
      }
      fetchSettings();
      return () => { cancelled = true; };
    }, [])
  );

  async function toggleWeekly(value: boolean) {
    setWeeklyEnabled(value);
    setWeeklySaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from('users').update({ weekly_reflections_enabled: value }).eq('id', user.id);
    setWeeklySaving(false);
  }

  async function toggleMonthly(value: boolean) {
    setMonthlyEnabled(value);
    setMonthlySaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from('users').update({ monthly_reflections_enabled: value }).eq('id', user.id);
    setMonthlySaving(false);
  }

  if (loading) {
    return (
      <WarmBackground style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#E85D2C" />
      </WarmBackground>
    );
  }

  return (
    <WarmBackground>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 48 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 64, paddingBottom: 20 }}>
          <Pressable onPress={() => router.back()} style={{ padding: 4, marginRight: 12 }}>
            <Feather name="arrow-left" size={22} color="#374151" />
          </Pressable>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 22, color: '#1c1917' }}>Reflection Settings</Text>
        </View>

        <View style={{ paddingHorizontal: 24 }}>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#a8a29e', lineHeight: 21, marginBottom: 24 }}>
            Choose which AI reflections get generated for you. Turning one off just stops new ones from being made — anything already generated stays put.
          </Text>

          <View style={{
            backgroundColor: '#ffffff', borderRadius: 16, marginBottom: 14,
            shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 18 }}>
              <View style={{
                width: 38, height: 38, borderRadius: 12, backgroundColor: '#E6F3E0',
                alignItems: 'center', justifyContent: 'center', marginRight: 14,
              }}>
                <Feather name="feather" size={17} color="#3F7A3F" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#1c1917', marginBottom: 2 }}>
                  Weekly reflections
                </Text>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12.5, color: '#a8a29e', lineHeight: 17 }}>
                  A short reflection generated every Sunday from that week's entries.
                </Text>
              </View>
              {weeklySaving
                ? <ActivityIndicator size="small" color="#E85D2C" style={{ marginLeft: 10 }} />
                : (
                  <ReliableSwitch
                    value={weeklyEnabled}
                    onValueChange={toggleWeekly}
                    trackColor={{ false: '#e7e5e4', true: '#B7DDA8' }}
                    thumbColor={weeklyEnabled ? '#3F7A3F' : '#ffffff'}
                  />
                )}
            </View>
          </View>

          <View style={{
            backgroundColor: '#ffffff', borderRadius: 16, marginBottom: 14,
            shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 18 }}>
              <View style={{
                width: 38, height: 38, borderRadius: 12, backgroundColor: '#EFE6FB',
                alignItems: 'center', justifyContent: 'center', marginRight: 14,
              }}>
                <Feather name="moon" size={17} color="#6D4CAD" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#1c1917', marginBottom: 2 }}>
                  Monthly reflections
                </Text>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12.5, color: '#a8a29e', lineHeight: 17 }}>
                  A deeper look back, generated on the last day of every month.
                </Text>
              </View>
              {monthlySaving
                ? <ActivityIndicator size="small" color="#E85D2C" style={{ marginLeft: 10 }} />
                : (
                  <ReliableSwitch
                    value={monthlyEnabled}
                    onValueChange={toggleMonthly}
                    trackColor={{ false: '#e7e5e4', true: '#D6C6EE' }}
                    thumbColor={monthlyEnabled ? '#6D4CAD' : '#ffffff'}
                  />
                )}
            </View>
          </View>
        </View>
      </ScrollView>
    </WarmBackground>
  );
}
