import { renderOGCard, ogSize, ogContentType } from '@/lib/seo/og-card';

export const size = ogSize;
export const contentType = ogContentType;
export const alt = 'Aaron Rohrbacher — Lead Cross-Platform Software and DevOps Engineer';

export default function OG() {
  return renderOGCard({
    title: 'Portfolio',
    subtitle: 'Lead Cross-Platform Software & DevOps Engineer · AI / ML · AWS',
  });
}
