import { renderOGCard, ogSize, ogContentType } from '@/lib/seo/og-card';

export const size = ogSize;
export const contentType = ogContentType;
export const alt = 'Resume — Aaron Rohrbacher';

export default function OG() {
  return renderOGCard({
    title: 'Resume',
    subtitle: '7+ years across AI/ML, multi-cloud architecture, and native cross-platform development.',
  });
}
