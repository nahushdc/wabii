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
  life_area: { bg: '#eff6ff', text: '#2563eb', activeBg: '#2563eb', activeText: '#ffffff' },
  emotion:   { bg: '#faf5ff', text: '#9333ea', activeBg: '#9333ea', activeText: '#ffffff' },
  fear:      { bg: '#fff7ed', text: '#ea580c', activeBg: '#ea580c', activeText: '#ffffff' },
  custom:    { bg: '#f3f4f6', text: '#4b5563', activeBg: '#374151', activeText: '#ffffff' },
};
