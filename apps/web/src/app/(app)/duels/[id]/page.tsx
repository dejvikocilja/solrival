import type { Metadata } from "next";
import { DuelDetailView } from "@/components/duel/duel-detail-view";

export const metadata: Metadata = {
  title: "Duel",
  description: "Review the challenge, match the stake, and accept the duel.",
};

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function DuelDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  // The share/success screen links with ?invite=…; the API reads it as `token`.
  const rawToken = sp.invite ?? sp.token;
  const inviteToken = Array.isArray(rawToken) ? rawToken[0] : rawToken;

  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-6 sm:px-6 sm:pt-10">
      <DuelDetailView id={id} inviteToken={inviteToken} />
    </main>
  );
}
