import type { MetadataRoute } from 'next'

/**
 * Next.js metadata sitemap (L-002).
 *
 * Only public marketing and app routes are included. Admin routes, API routes,
 * and user-specific pages (profile, duel detail) are excluded — they are also
 * disallowed in robots.txt.
 *
 * Extend this function with dynamic routes (e.g. public tournament pages) once
 * the relevant pages are built.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://solrival.com'

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/arena`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 0.9,
    },
  ]
}
