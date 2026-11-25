import NearClient from './NearClient';

// "What's near me": the 12 closest places and 12 closest historical markers
// to the visitor's location, or to a town picked from search
// (/near?lat=&lng=&label=). Everything loads in the browser.
const TITLE = "What's Near Me | Open Road Guide";
const DESC = 'The closest places and historical markers to where you are right now.';
const URL = 'https://openroadguide.com/near';

export const metadata = {
  title: { absolute: TITLE },
  description: DESC,
  alternates: { canonical: URL },
  robots: { index: false, follow: true },
  openGraph: { title: TITLE, description: DESC, type: 'website', url: URL },
};

export default function NearPage() {
  return <NearClient />;
}
