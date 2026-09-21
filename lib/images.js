// Image URL helper for Open Road Guide.
//
// Every image on the site goes through here. A record can carry two things:
//   - a Cloudinary public_id  (hero_image_public_id / thumbnail_public_id)
//   - a legacy Supabase Storage URL (hero_image_url / thumbnail_url)
//
// Cloudinary wins when a public_id is present. The Supabase URL is kept as a
// fallback so a row that has not been migrated yet still renders. Once every
// row has a public_id the *_url columns can be retired without touching pages.
//
// Cloudinary transformations used:
//   f_auto   serve WebP/AVIF when the browser supports it
//   q_auto   automatic quality
//   w_<n>    bound the width
//   c_limit  scale down only, never up; keeps aspect ratio

const CLOUD_NAME = 'kkchilrx';
const CLOUDINARY_BASE = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload`;

export function cloudinaryUrl(publicId, width) {
  const t = ['f_auto', 'q_auto'];
  if (width) t.push(`w_${width}`, 'c_limit');
  return `${CLOUDINARY_BASE}/${t.join(',')}/${publicId}`;
}

// Legacy path: rewrite a Supabase public-object URL to the on-the-fly
// render/image endpoint with a width bound. Anything not in that form is
// returned untouched.
export function supabaseRenderUrl(url, width) {
  if (!url) return '';
  if (!width || !url.includes('/storage/v1/object/public/')) return url;
  const base = url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
  return `${base}${base.includes('?') ? '&' : '?'}width=${width}&resize=contain&quality=72`;
}

export function imageSrc(publicId, url, width) {
  if (publicId) return cloudinaryUrl(publicId, width);
  return supabaseRenderUrl(url, width);
}

// Record-based conveniences. Hero images live in hero_image_*; POI thumbnails
// (which also serve as the POI page hero) live in thumbnail_*.
export function heroImage(record, width = 1600) {
  return imageSrc(record?.hero_image_public_id, record?.hero_image_url, width);
}

export function thumbImage(record, width = 600) {
  return imageSrc(record?.thumbnail_public_id, record?.thumbnail_url, width);
}

export function hasHeroImage(record) {
  return Boolean(record?.hero_image_public_id || record?.hero_image_url);
}

export function hasThumbImage(record) {
  return Boolean(record?.thumbnail_public_id || record?.thumbnail_url);
}
