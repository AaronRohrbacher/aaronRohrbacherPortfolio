export const SEO_SITES = Object.freeze({
  main: 'Aaron Rohrbacher',
  music: 'Aaron Rohrbacher Music',
  portaputer: 'PortaPuter',
});

export const SEO_HOME_TITLES = Object.freeze({
  main: `${SEO_SITES.main} | Lead Software Engineer & DevOps Architect`,
  music: `${SEO_SITES.music} | Recordings & Downloads`,
  portaputer: `${SEO_SITES.portaputer} | Portable Windows PC Capture`,
});

export function seoPageTitle(page, site) {
  const cleanPage = String(page || '').replace(/\s+/g, ' ').trim();
  const cleanSite = String(site || '').replace(/\s+/g, ' ').trim();
  if (!cleanPage || !cleanSite) throw new Error('SEO titles require a page name and site name');
  return `${cleanPage} | ${cleanSite}`;
}

export function absoluteSeoTitle(title) {
  return { absolute: title };
}
