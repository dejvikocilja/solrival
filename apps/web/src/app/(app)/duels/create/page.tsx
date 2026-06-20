import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CreateDuelForm } from "@/components/duel/create-duel-form";

export const metadata: Metadata = {
  title: "Create a duel",
  description: "Set your game, stake, and rules, then lock it in Solana escrow.",
};

export default function CreateDuelPage() {
  return (
    <main className="mx-auto max-w-xl px-4 pb-24 pt-6 sm:px-6 sm:pt-10">
      <Link
        href="/marketplace"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg focus-visible:focus-ring rounded-md"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to marketplace
      </Link>

      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">Create a duel</h1>
        <p className="mt-1 text-sm text-muted">
          Choose your game and stake, set the rules, and challenge a rival. Your stake is held in
          escrow until the match is settled.
        </p>
      </div>

      <CreateDuelForm />
    </main>
  );
}
