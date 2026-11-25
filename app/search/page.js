import SearchClient from './SearchClient';

// Site-wide search: places, historical markers, drives, stories, regions,
// states and towns, from one box. Results load in the browser
// (/api/data?kind=site-search), so this page itself is a static shell.
// Result pages aren't indexed: the content they point to is.
const TITLE = 'Search | Open Road Guide';
const DESC = 'Search every place, historical marker, scenic drive, story and town on Open Road Guide.';
const URL = 'https://openroadguide.com/search';

export const metadata = {
  title: { absolute: TITLE },
  description: DESC,
  alternates: { canonical: URL },
  robots: { index: false, follow: true },
  openGraph: { title: TITLE, description: DESC, type: 'website', url: URL },
};

export default function SearchPage() {
  return <SearchClient />;
}
