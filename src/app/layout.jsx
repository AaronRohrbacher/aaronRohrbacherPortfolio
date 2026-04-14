import '@/styles/globals.scss';
import '@fortawesome/fontawesome-free/css/all.min.css';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import Script from 'next/script';
import GoogleAnalytics from '@/components/GoogleAnalytics';
// AI agent disabled — see AI_COMMENTED_OUT.md at repo root.
// import ChatAgentLoader from '@/components/ChatAgentLoader';

export const metadata = {
  title: {
    default: 'Aaron Rohrbacher | Lead Cross-Platform Software and DevOps Engineer',
    template: '%s | Aaron Rohrbacher',
  },
  description: 'Portfolio of Aaron Rohrbacher — lead cross-platform software and DevOps engineer specializing in AI/ML, full-stack development, and cloud architecture. Based in Portland, Oregon.',
  keywords: ['software engineer', 'cross-platform', 'DevOps', 'AI engineer', 'machine learning', 'AWS', 'full stack', 'Portland'],
  authors: [{ name: 'Aaron Rohrbacher' }],
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
          {/* AI agent disabled — see AI_COMMENTED_OUT.md at repo root. */}
          {/* <ChatAgentLoader /> */}
          {children}
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
