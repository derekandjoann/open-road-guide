import './globals.css';
import Script from 'next/script';
import Nav from '../components/nav';

export const metadata = {
  title: 'Open Road Guide — Road Trip Guides to the American West',
  description: 'Your road trip companion for the American West — interactive maps, scenic drives, regional guides, and the roadside history worth pulling over for.',
};

// Site-wide structured data: Organization (who publishes this) and WebSite
// (what this is), shipped in the <head> of every page. Page-level types —
// TouristAttraction, Article, TouristTrip, TouristDestination — live inline
// in their own pages. Built once at module scope; "<" is escaped so nothing
// can break out of the script tag.
const siteJsonLd = JSON.stringify([
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Open Road Guide',
    url: 'https://openroadguide.com',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Open Road Guide',
    url: 'https://openroadguide.com',
    description:
      'Road trip guides to the American West — interactive maps, scenic drives, regional guides, and the roadside history worth pulling over for.',
  },
]).replace(/</g, '\\u003c');

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* Google Fonts: Fraunces (display) + Outfit (body) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700;9..144,800;9..144,900&family=Outfit:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* MapLibre GL CSS */}
        <link
          href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css"
          rel="stylesheet"
        />
        {/* Structured data for search engines (read from the server-rendered HTML) */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: siteJsonLd }}
        />
      </head>
      <body>
        <Nav />
        {children}

        {/* Google Analytics (gtag.js) */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-T7BG5S3X62"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-T7BG5S3X62');
          `}
        </Script>
      </body>
    </html>
  );
}
