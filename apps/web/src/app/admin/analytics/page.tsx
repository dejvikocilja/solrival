import { Suspense } from "react"
import { requireAdminPage } from "@/server/auth/session"
import { AnalyticsDashboard } from "@/components/admin/analytics/AnalyticsDashboard"

export const dynamic = "force-dynamic"
export const metadata = { title: "Overview" }

/**
 * Thin server shell: enforces admin access, then hands off to a client
 * dashboard that owns range state and polls for fresh figures.
 *
 * The data fetch moved out of this component deliberately. As a server
 * component the page could only ever show a snapshot frozen at request time —
 * "Active now" would sit at a stale value until a manual reload. It also kept
 * its own copy of the aggregation logic, which had already drifted from the
 * API route's.
 *
 * Suspense is required because the dashboard reads searchParams via
 * useSearchParams, which opts the subtree into client-side rendering.
 */
export default async function AdminAnalyticsPage() {
  await requireAdminPage()

  return (
    <Suspense fallback={null}>
      <AnalyticsDashboard />
    </Suspense>
  )
}
