import { useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Modal } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { TagCategory, PRESET_TAGS, CATEGORY_LABELS } from '@/lib/preset-tags';

export type SelectedTag = {
  name: string;
  category: TagCategory;
};

type Props = {
  selected: SelectedTag[];
  onChange: (tags: SelectedTag[]) => void;
};

const CATEGORIES: TagCategory[] = ['life_area', 'emotion', 'fear', 'custom'];

const CATEGORY_COLORS: Record<TagCategory, { bg: string; text: string; activeBg: string; activeText: string }> = {
  life_area:  { bg: '#f0f6fd', text: '#5b8fc9', activeBg: '#3b7dd8', activeText: '#ffffff' },
  emotion:    { bg: '#fdf0f8', text: '#c96ba0', activeBg: '#c2478a', activeText: '#ffffff' },
  fear:       { bg: '#fdf4ec', text: '#c9823b', activeBg: '#d4692a', activeText: '#ffffff' },
  custom:     { bg: '#f0fdf4', text: '#4a9e6b', activeBg: '#2d8a56', activeText: '#ffffff' },
};

export function TagPicker({ selected, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<TagCategory>('life_area');
  const [customInput, setCustomInput] = useState('');

  function isSelected(name: string, category: TagCategory) {
    return selected.some(t => t.name === name && t.category === category);
  }

  function toggle(name: string, category: TagCategory) {
    if (isSelected(name, category)) {
      onChange(selected.filter(t => !(t.name === name && t.category === category)));
    } else {
      onChange([...selected, { name, category }]);
    }
  }

  function addCustom() {
    const name = customInput.trim();
    if (!name) return;
    if (!isSelected(name, 'custom')) {
      onChange([...selected, { name, category: 'custom' }]);
    }
    setCustomInput('');
  }

  const colors = CATEGORY_COLORS[activeCategory];

  return (
    <>
      {/* Selected tag chips + Add button */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 24, paddingBottom: 8, alignItems: 'center' }}>
        {selected.map(tag => {
          const c = CATEGORY_COLORS[tag.category];
          return (
            <Pressable
              key={`${tag.category}-${tag.name}`}
              onPress={() => toggle(tag.name, tag.category)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: c.activeBg }}>
              <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: '#ffffff' }}>{tag.name}</Text>
              <Feather name="x" size={11} color="#ffffff" />
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => setOpen(true)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f0ebe3' }}>
          <Feather name="tag" size={12} color="#a8a29e" />
          <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: '#a8a29e' }}>Add tag</Text>
        </Pressable>
      </View>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: '#faf9f7' }}>

          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16 }}>
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 22, color: '#1c1917' }}>Add tags</Text>
            <Pressable
              onPress={() => setOpen(false)}
              style={{ backgroundColor: '#E85D2C', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#ffffff' }}>Done</Text>
            </Pressable>
          </View>

          {/* Category tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 20 }} contentContainerStyle={{ alignItems: 'flex-start' }}>
            <View style={{ flexDirection: 'row', paddingHorizontal: 24, gap: 0, borderBottomWidth: 1, borderBottomColor: '#ede8e0' }}>
              {CATEGORIES.map(cat => {
                const isActive = activeCategory === cat;
                const c = CATEGORY_COLORS[cat];
                return (
                  <Pressable
                    key={cat}
                    onPress={() => setActiveCategory(cat)}
                    style={{
                      paddingHorizontal: 14,
                      paddingBottom: 10,
                      paddingTop: 4,
                      borderBottomWidth: 2,
                      borderBottomColor: isActive ? c.activeBg : 'transparent',
                      marginBottom: -1,
                    }}>
                    <Text style={{
                      fontFamily: isActive ? 'Inter_600SemiBold' : 'Inter_400Regular',
                      fontSize: 13,
                      color: isActive ? c.activeBg : '#a8a29e',
                    }}>
                      {CATEGORY_LABELS[cat]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 48 }}>

            {/* Custom input */}
            {activeCategory === 'custom' && (
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                <TextInput
                  style={{
                    flex: 1, backgroundColor: '#ffffff', borderRadius: 14,
                    paddingHorizontal: 16, paddingVertical: 12,
                    fontFamily: 'Inter_400Regular', fontSize: 15, color: '#1c1917',
                    borderWidth: 1, borderColor: '#e8e0d4',
                  }}
                  placeholder="Type a custom tag…"
                  placeholderTextColor="#c4b9b0"
                  value={customInput}
                  onChangeText={setCustomInput}
                  onSubmitEditing={addCustom}
                  returnKeyType="done"
                />
                <Pressable
                  onPress={addCustom}
                  style={{ backgroundColor: colors.activeBg, borderRadius: 14, paddingHorizontal: 16, justifyContent: 'center' }}>
                  <Feather name="plus" size={20} color="white" />
                </Pressable>
              </View>
            )}

            {/* Tag chips */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {[
                ...PRESET_TAGS[activeCategory],
                ...(activeCategory === 'custom' ? selected.filter(t => t.category === 'custom').map(t => t.name) : []),
              ].map(name => {
                const active = isSelected(name, activeCategory);
                return (
                  <Pressable
                    key={name}
                    onPress={() => toggle(name, activeCategory)}
                    style={{
                      paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24,
                      backgroundColor: active ? colors.activeBg : colors.bg,
                    }}>
                    <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 14, color: active ? colors.activeText : colors.text }}>
                      {name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
