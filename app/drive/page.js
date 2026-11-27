import DriveClient from './DriveClient';

// Drive Mode: the road ahead for a Chart My Course trip. Personal to each
// trip and location, so it is never indexed.
export const metadata = {
  title: { absolute: 'Drive Mode | Open Road Guide' },
  description: 'The road ahead on your trip: the next places and historical markers with a mileage countdown.',
  robots: { index: false, follow: true },
  alternates: { canonical: 'https://openroadguide.com/plan' },
};

export default function DrivePage() {
  return <DriveClient />;
}
