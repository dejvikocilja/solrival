import { type ReactNode } from "react"
import { AdminShell } from "@/components/admin/AdminShell"
import { requireAdminPage } from "@/server/auth/session"

export const metadata = {
  title: { template: "%s · Admin · SolRival", default: "Admin · SolRival" },
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Belt-and-suspenders: middleware already cloaks /admin as a 404 for
  // non-admins. This server-side check renders Next's 404 (notFound()) too, so
  // the panel stays invisible even if middleware is ever bypassed or
  // misconfigured. Every admin page inherits this guard via the layout.
  await requireAdminPage()
  return <AdminShell>{children}</AdminShell>
}
