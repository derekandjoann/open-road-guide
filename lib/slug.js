// Generate a URL-safe slug from a string
// "Arches National Park" → "arches-national-park"
export function toSlug(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}
