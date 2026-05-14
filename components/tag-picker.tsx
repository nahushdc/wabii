import { useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Modal } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { TagCategory, PRESET_TAGS, CATEGORY_LABELS, CATEGORY_COLORS } from '@/lib/preset-tags';

export type SelectedTag = {
  name: string;
  category: TagCategory;
};

type Props = {
  selected: SelectedTag[];
  onChange: (tags: SelectedTag[]) => void;
};

const CATEGORIES: TagCategory[] = ['life_area', 'emotion', 'fear', 'custom'];

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
      {/* Tag chips shown below the writing area */}
      <View className="flex-row flex-wrap gap-2 px-6 pb-2">
        {selected.map(tag => {
          const c = CATEGORY_COLORS[tag.category];
          return (
            <Pressable
              key={`${tag.category}-${tag.name}`}
              className={`flex-row items-center gap-1 px-3 py-1 rounded-full ${c.activeBg}`}
              onPress={() => toggle(tag.name, tag.category)}>
              <Text className={`text-xs font-medium ${c.activeText}`}>{tag.name}</Text>
              <Feather name="x" size={11} color="white" />
            </Pressable>
          );
        })}
        <Pressable
          className="flex-row items-center gap-1 px-3 py-1 rounded-full border border-gray-200"
          onPress={() => setOpen(true)}>
          <Feather name="tag" size={12} color="#9ca3af" />
          <Text className="text-xs text-gray-400 font-medium">Add tag</Text>
        </Pressable>
      </View>

      {/* Tag picker modal */}
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet">
        <View className="flex-1 bg-white">
          {/* Modal header */}
          <View className="flex-row items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
            <Text className="text-lg font-semibold text-gray-900">Add tags</Text>
            <Pressable onPress={() => setOpen(false)} className="p-1">
              <Feather name="check" size={22} color="#4f46e5" />
            </Pressable>
          </View>

          {/* Category tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="border-b border-gray-100">
            <View className="flex-row px-4 py-3 gap-2">
              {CATEGORIES.map(cat => (
                <Pressable
                  key={cat}
                  className={`px-4 py-2 rounded-full ${activeCategory === cat ? CATEGORY_COLORS[cat].activeBg : CATEGORY_COLORS[cat].bg}`}
                  onPress={() => setActiveCategory(cat)}>
                  <Text className={`text-sm font-medium ${activeCategory === cat ? CATEGORY_COLORS[cat].activeText : CATEGORY_COLORS[cat].text}`}>
                    {CATEGORY_LABELS[cat]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <ScrollView className="flex-1 px-6 pt-4">
            {/* Custom input */}
            {activeCategory === 'custom' && (
              <View className="flex-row gap-2 mb-4">
                <TextInput
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900"
                  placeholder="Type a custom tag..."
                  placeholderTextColor="#9ca3af"
                  value={customInput}
                  onChangeText={setCustomInput}
                  onSubmitEditing={addCustom}
                  returnKeyType="done"
                />
                <Pressable
                  className="bg-indigo-600 rounded-xl px-4 justify-center"
                  onPress={addCustom}>
                  <Feather name="plus" size={20} color="white" />
                </Pressable>
              </View>
            )}

            {/* Preset tags */}
            <View className="flex-row flex-wrap gap-2 pb-8">
              {PRESET_TAGS[activeCategory].map(name => {
                const active = isSelected(name, activeCategory);
                return (
                  <Pressable
                    key={name}
                    className={`px-4 py-2 rounded-full border ${active ? `${colors.activeBg} border-transparent` : `${colors.bg} border-transparent`}`}
                    onPress={() => toggle(name, activeCategory)}>
                    <Text className={`text-sm font-medium ${active ? colors.activeText : colors.text}`}>
                      {name}
                    </Text>
                  </Pressable>
                );
              })}
              {activeCategory === 'custom' && selected.filter(t => t.category === 'custom').map(tag => (
                <Pressable
                  key={tag.name}
                  className={`px-4 py-2 rounded-full ${colors.activeBg}`}
                  onPress={() => toggle(tag.name, 'custom')}>
                  <Text className={`text-sm font-medium ${colors.activeText}`}>{tag.name}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
