export type TagCategory = 'life_area' | 'emotion' | 'fear' | 'custom';

export const PRESET_TAGS: Record<TagCategory, string[]> = {
  life_area: [
    'Work', 'Health', 'Relationships', 'Family', 'Finances',
    'Personal growth', 'Creativity', 'Spirituality', 'Travel', 'Home',
  ],
  emotion: [
    'Grateful', 'Anxious', 'Hopeful', 'Frustrated', 'Content',
    'Excited', 'Sad', 'Overwhelmed', 'Proud', 'Confused', 'Calm', 'Angry',
  ],
  fear: [
    'Failure', 'Rejection', 'Not being enough', 'Losing control',
    'Being alone', 'Missing out', 'Change', 'Vulnerability', 'Success',
  ],
  custom: [],
};

export const CATEGORY_LABELS: Record<TagCategory, string> = {
  life_area: 'Life area',
  emotion: 'Emotion',
  fear: 'Fear',
  custom: 'Custom',
};

export const CATEGORY_COLORS: Record<TagCategory, { bg: string; text: string; activeBg: string; activeText: string }> = {
  life_area: { bg: 'bg-blue-50', text: 'text-blue-600', activeBg: 'bg-blue-600', activeText: 'text-white' },
  emotion:   { bg: 'bg-purple-50', text: 'text-purple-600', activeBg: 'bg-purple-600', activeText: 'text-white' },
  fear:      { bg: 'bg-orange-50', text: 'text-orange-600', activeBg: 'bg-orange-600', activeText: 'text-white' },
  custom:    { bg: 'bg-gray-100', text: 'text-gray-600', activeBg: 'bg-gray-700', activeText: 'text-white' },
};
