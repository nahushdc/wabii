import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function NewEntryScreen() {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const wordCount = content.trim() === '' ? 0 : content.trim().split(/\s+/).length;

  async function handleSave() {
    setError('');
    if (!content.trim()) { setError('Write something before saving.'); return; }
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error: err } = await supabase
      .from('journal_entries')
      .insert({ user_id: user!.id, content: content.trim() });
    setLoading(false);
    if (err) setError(err.message);
    else {
      setContent('');
      router.replace('/(tabs)');
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View className="flex-row items-center justify-between px-6 pt-16 pb-4 border-b border-gray-100">
          <Text className="text-lg font-semibold text-gray-900">New entry</Text>
          <Pressable
            className="bg-indigo-600 rounded-xl px-5 py-2"
            onPress={handleSave}
            disabled={loading}>
            {loading
              ? <ActivityIndicator color="white" size="small" />
              : <Text className="text-white font-semibold text-sm">Save</Text>}
          </Pressable>
        </View>

        {error ? (
          <View className="mx-6 mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <Text className="text-red-600 text-sm">{error}</Text>
          </View>
        ) : null}

        {/* Writing area */}
        <TextInput
          className="flex-1 px-6 py-5 text-base text-gray-900 leading-relaxed"
          placeholder="What's on your mind?"
          placeholderTextColor="#9ca3af"
          value={content}
          onChangeText={setContent}
          multiline
          autoFocus
          textAlignVertical="top"
          style={{ minHeight: 400 }}
        />

        {/* Word count */}
        <View className="px-6 pb-8">
          <Text className="text-xs text-gray-400">{wordCount} {wordCount === 1 ? 'word' : 'words'}</Text>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}
