import { renderOGCard, ogSize, ogContentType } from '@/lib/seo/og-card';

export const size = ogSize;
export const contentType = ogContentType;
export const alt = 'About Aaron Rohrbacher';

export default function OG() {
  return renderOGCard({
    title: 'About',
    subtitle: 'Lead AI/ML Software Engineer & DevOps Architect in Portland, Oregon.',
  });
}
