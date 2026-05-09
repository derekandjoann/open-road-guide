// Category color mapping for Open Road Guide
// These match the actual categories in the Supabase database

const CATEGORY_COLORS = {
  'geological':     '#ff6b5b',  // coral — canyons, arches, formations
  'natural':        '#12b5a0',  // teal — lakes, mountains, nature
  'historical':     '#ffb627',  // sunny yellow — history, heritage
  'cultural':       '#7c5cfc',  // violet — culture, arts, communities
  'attraction':     '#ff8a7d',  // light coral — must-see stops
  'recreational':   '#12b5a0',  // teal — outdoor activities
  'architectural':  '#7c5cfc',  // violet — buildings, structures
  'culinary':       '#f59e0b',  // amber — food, dining
  'industrial':     '#6b7280',  // slate — industrial sites
  'roadside':       '#ff6b5b',  // coral — roadside gems
  'default':        '#ff6b5b',  // coral fallback
};

export function getCategoryColor(category) {
  if (!category) return CATEGORY_COLORS['default'];
  return CATEGORY_COLORS[category.toLowerCase()] || CATEGORY_COLORS['default'];
}

export function getCategoryEmoji(category) {
  const emojis = {
    'geological':    '🏜️',
    'natural':       '🌲',
    'historical':    '🏛️',
    'cultural':      '🎭',
    'attraction':    '⭐',
    'recreational':  '🏕️',
    'architectural': '🏗️',
    'culinary':      '🍽️',
    'industrial':    '🏭',
    'roadside':      '🛣️',
  };
  if (!category) return '📍';
  return emojis[category.toLowerCase()] || '📍';
}

export default CATEGORY_COLORS;
