import '@/styles/globals.scss';
import '@fortawesome/fontawesome-free/css/all.min.css';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import AmazonConnectLoader from '@/components/AmazonConnectLoader';
import GoogleAnalytics from '@/components/GoogleAnalytics';
// AI agent disabled — see AI_COMMENTED_OUT.md at repo root.
// import ChatAgentLoader from '@/components/ChatAgentLoader';

export const metadata = {
  title: {
    default: 'Aaron Rohrbacher | Lead AI Engineer & DevOps Architect',
    template: '%s | Aaron Rohrbacher',
  },
  description: 'Portfolio of Aaron Rohrbacher — lead AI engineer and developer specializing in AI/ML, full-stack software engineering, and DevOps architecture. Based in Portland, Oregon.',
  keywords: ['AI engineer', 'AI developer', 'machine learning', 'DevOps', 'software architect', 'AWS', 'full stack', 'Portland'],
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
          <AmazonConnectLoader />
          {/* AI agent disabled — see AI_COMMENTED_OUT.md at repo root. */}
          {/* <ChatAgentLoader /> */}
          {children}
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
