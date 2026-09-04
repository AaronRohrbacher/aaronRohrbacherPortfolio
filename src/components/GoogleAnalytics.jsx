import Script from 'next/script';

/**
 * GoogleAnalytics
 *
 * Loads GA4 in production when NEXT_PUBLIC_GA_ID is set. Set it to your
 * Measurement ID (starts with "G-") in SST secrets to enable analytics.
 * Nothing renders during development or when the env var is absent.
 */
export default function GoogleAnalytics() {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  if (process.env.NODE_ENV !== 'production' || !gaId) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${gaId}', { send_page_view: true });
        `}
      </Script>
    </>
  );
}
