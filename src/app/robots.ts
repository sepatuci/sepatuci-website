import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // The portal and sign-in pages are kept out of search results by the
      // "noindex" header they send (see next.config.mjs). They are not listed
      // here, because a crawler that is told not to fetch a page never sees
      // that header and can still list the bare address.
      disallow: ['/api/portal/'],
    },
    sitemap: 'https://sepatuci.com/sitemap.xml',
  }
}
