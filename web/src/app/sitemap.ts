import type { MetadataRoute } from 'next'

const SITE = 'https://hardstop-omega.vercel.app'
const PAGES = ['', '/protect', '/vaults', '/activity', '/how-it-works', '/developers', '/evidence']

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((path) => ({ url: `${SITE}${path}` }))
}
