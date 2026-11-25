// The database API returns at most 1,000 rows per request. Any list that can
// grow past that (places, markers, stories) must be read in pages, or the
// site silently shows only the first 1,000. This helper does the paging.
//
// Usage:
//   const rows = await fetchAll((from, to) =>
//     supabase.from('pois').select('slug,name').eq('published', true).order('name').range(from, to)
//   );
//
// The callback must return a query with .range(from, to) applied and a stable
// .order(...) so pages don't overlap or skip rows.

const PAGE = 1000;
const MAX_PAGES = 100; // 100,000 rows: a guard against a runaway loop

export async function fetchAll(build) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE;
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) {
      if (rows.length === 0) throw error;
      break;
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}
