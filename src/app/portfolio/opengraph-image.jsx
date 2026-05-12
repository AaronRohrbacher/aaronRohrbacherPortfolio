import { renderOGCard, ogSize, ogContentType } from '@/lib/seo/og-card';

export const size = ogSize;
export const contentType = ogContentType;
export const alt = 'Portfolio — software projects by Aaron Rohrbacher';

export default function OG() {
  return renderOGCard({
    title: 'Portfolio',
    subtitle: 'Selected projects: AI/ML plugins, a Rust DAW, LLM tooling, native apps, and OSS utilities.',
  });
}
