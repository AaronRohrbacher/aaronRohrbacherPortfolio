import '@/styles/globals.scss';
import '@fortawesome/fontawesome-free/css/all.min.css';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import Script from 'next/script';
import GoogleAnalytics from '@/components/GoogleAnalytics';
import ChatAgentLoader from '@/components/ChatAgentLoader';
import { SEO_HOME_TITLES, SEO_SITES } from '@/lib/seoTitles';

// metadataBase lets every page in the site emit absolute URLs from relative
// strings (canonicals, og.url, twitter images). Without it, relative URLs
// in metadata cause a build warning AND get stamped with localhost in dev.
//
// IMPORTANT: do NOT set `alternates.canonical` here. Next.js shallow-merges
// metadata from layout → page, so a canonical here would inherit onto every
// child route that doesn't override it, telling Google that /about, /portfolio,
// /resume, /contact are all the homepage. That collapses the site into one
// indexed URL in SERPs. Per-page canonicals live in each page.jsx.
export const metadata = {
  metadataBase: new URL('https://aaronrohrbacher.com'),
  title: {
    default: SEO_HOME_TITLES.main,
    template: `%s | ${SEO_SITES.main}`,
  },
  description: 'Portfolio of Aaron Rohrbacher — lead cross-platform software and DevOps engineer specializing in AI/ML, full-stack development, and cloud architecture. Based in Portland, Oregon.',
  applicationName: SEO_SITES.main,
  keywords: ['software engineer', 'cross-platform', 'DevOps', 'AI engineer', 'machine learning', 'AWS', 'full stack', 'Portland'],
  authors: [{ name: 'Aaron Rohrbacher', url: 'https://aaronrohrbacher.com' }],
  creator: 'Aaron Rohrbacher',
  publisher: 'Aaron Rohrbacher',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  openGraph: {
    type: 'website',
    siteName: 'Aaron Rohrbacher',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary',
  },
  icons: {
    icon: [
      { url: '/icons/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/icons/favicon.svg', type: 'image/svg+xml' },
      { url: '/icons/favicon.ico' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  manifest: '/icons/site.webmanifest',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#000000" />
      </head>
      <body>
        <GoogleAnalytics />
        <AppRouterCacheProvider>
          <Script src="/amazonConnect.js" strategy="lazyOnload" />
          <ChatAgentLoader />
          {children}
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
