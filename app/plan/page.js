import PlanClient from './PlanClient';

// Chart My Course: a road-trip planner. From and to, the places and told
// markers along the road with their detour times, the visitor's own stops in
// order, days, save on the device, share link, Google and Apple Maps, GPX and
// print. Everything after the first paint happens in the browser.
//
// The page is indexable; every trip link (?f=&t=&s=) points its canonical
// back to /plan, so trips never compete with it in search.
const TITLE = 'Chart My Course: Road Trip Planner | Open Road Guide';
const DESC =
  'Plan a road trip from one town to another and see the places and historical markers along the road, with detour times, days, maps and a GPX file.';
const URL = 'https://openroadguide.com/plan';

export const metadata = {
  title: { absolute: TITLE },
  description: DESC,
  alternates: { canonical: URL },
  openGraph: { title: TITLE, description: DESC, type: 'website', url: URL, siteName: 'Open Road Guide' },
  twitter: { card: 'summary', title: TITLE, description: DESC },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'Chart My Course',
      url: URL,
      description: DESC,
      applicationCategory: 'TravelApplication',
      operatingSystem: 'Any',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      publisher: { '@type': 'Organization', name: 'Open Road Guide', url: 'https://openroadguide.com' },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://openroadguide.com' },
        { '@type': 'ListItem', position: 2, name: 'Chart My Course', item: URL },
      ],
    },
  ],
};

export default function PlanPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PlanClient />
    </>
  );
}
