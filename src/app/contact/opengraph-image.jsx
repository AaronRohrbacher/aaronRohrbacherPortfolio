import { renderOGCard, ogSize, ogContentType } from '@/lib/seo/og-card';

export const size = ogSize;
export const contentType = ogContentType;
export const alt = 'Contact Aaron Rohrbacher';

export default function OG() {
  return renderOGCard({
    title: 'Contact',
    subtitle: 'Open to senior, lead, and architect roles. Reach out by chat, voice, video, or email.',
  });
}
