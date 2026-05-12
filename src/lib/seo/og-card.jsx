import { ImageResponse } from 'next/og';

// Shared 1200x630 OG / Twitter card. Each `app/.../opengraph-image.jsx`
// is a thin wrapper that calls `renderOGCard({ title, subtitle })` so the
// look-and-feel stays in one place — change brand colors / layout here
// and every share preview updates on the next deploy.
//
// Hex values mirror src/styles/_variables.scss → keep in sync if those change.
const ACCENT_1 = '#00a878';
const ACCENT_2 = '#7c3aed';
const DARK = '#1f1f1f';

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = 'image/png';

export function renderOGCard({ title, subtitle }) {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '80px',
          background: DARK,
          color: '#f8f8f8',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '8px',
            background: `linear-gradient(135deg, ${ACCENT_1}, ${ACCENT_2})`,
            display: 'flex',
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: '28px',
              opacity: 0.7,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              display: 'flex',
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: '108px',
              fontWeight: 700,
              lineHeight: 1.05,
              marginTop: '24px',
              backgroundImage: `linear-gradient(135deg, ${ACCENT_1}, ${ACCENT_2})`,
              backgroundClip: 'text',
              color: 'transparent',
              display: 'flex',
            }}
          >
            Aaron Rohrbacher
          </div>
          <div
            style={{
              fontSize: '40px',
              marginTop: '24px',
              lineHeight: 1.25,
              maxWidth: '900px',
              display: 'flex',
            }}
          >
            {subtitle}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '26px',
            opacity: 0.75,
          }}
        >
          <div style={{ display: 'flex' }}>aaronrohrbacher.com</div>
          <div style={{ display: 'flex' }}>Portland, Oregon</div>
        </div>
      </div>
    ),
    { ...ogSize },
  );
}
