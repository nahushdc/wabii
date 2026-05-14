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

export const ACTIVE_COLOR = { bg: '#4f46e5', text: '#ffffff' };
export const INACTIVE_COLOR = { bg: '#f3f4f6', text: '#374151' };
