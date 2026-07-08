import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/ui/page-shell";

/**
 * Privacy Policy.
 *
 * ⚠️ LAUNCH GATE: structured working draft, NOT legal advice. Must be reviewed
 * by counsel before mainnet (GDPR/UK-GDPR and similar regimes apply depending
 * on user base) and the [PLACEHOLDERS] filled in as part of that review.
 */

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How SolRival collects, uses, and protects your data.",
};

const EFFECTIVE_DATE = "TBD — set at mainnet launch";

function LegalSection({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h2 className="font-display text-heading-3 text-fg">
        {n}. {title}
      </h2>
      <div className="space-y-2.5 text-body-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Legal"
        title="Privacy Policy"
        description={`Effective date: ${EFFECTIVE_DATE}`}
      />

      <div className="space-y-8">
        <LegalSection n={1} title="What we collect">
          <p>
            To operate the Platform we collect: your Solana wallet address (your account
            identifier); your chosen username; linked game account tags and public game statistics
            (trophies, level, battle results) fetched from official game APIs; your duel, deposit,
            withdrawal, and ledger history; dispute submissions; and standard technical logs (IP
            address, user agent, timestamps) used for security, rate limiting, and fraud
            prevention. We do not collect your name, email, or payment card details, and we never
            have access to your wallet&apos;s private keys.
          </p>
        </LegalSection>

        <LegalSection n={2} title="How we use it">
          <p>
            Data is used to run duels and verify results, maintain your balance ledger, process
            deposits and withdrawals, resolve disputes, prevent fraud and abuse, secure the
            service, comply with legal obligations, and show public competitive features
            (leaderboards display username and match record — never balances or wallet addresses in
            full).
          </p>
        </LegalSection>

        <LegalSection n={3} title="What is public by design">
          <p>
            Solana is a public blockchain: your deposits to and withdrawals from the Platform
            treasury are publicly visible on-chain and permanently recorded, linked to your wallet
            address. Your username, linked game tags, and match results may appear in public
            Platform surfaces such as the marketplace and leaderboard.
          </p>
        </LegalSection>

        <LegalSection n={4} title="Who we share it with">
          <p>
            We share data only with service providers needed to run the Platform: hosting and
            database providers, official game data APIs (match verification requests include the
            player tags being verified), Solana RPC providers, error-monitoring services, and —
            where legally required — courts or authorities. We do not sell personal data and do not
            use it for third-party advertising.
          </p>
        </LegalSection>

        <LegalSection n={5} title="Retention">
          <p>
            Financial records (ledger entries, deposits, withdrawals, duel settlements) are
            retained for the period required for audit and legal compliance. Technical logs are
            retained briefly for security purposes. Notification history is pruned automatically.
          </p>
        </LegalSection>

        <LegalSection n={6} title="Security">
          <p>
            Balances live in an append-only double-checked ledger; treasury keys are held in
            restricted secret storage, never in application code; withdrawal processing is isolated
            behind dedicated credentials; and admin actions are audit-logged. No system is
            perfectly secure — you are responsible for the security of your own wallet.
          </p>
        </LegalSection>

        <LegalSection n={7} title="Your rights">
          <p>
            Depending on your jurisdiction you may have rights to access, correct, export, or
            delete personal data we hold about you, and to object to certain processing. Note that
            on-chain records cannot be altered or deleted, and financial records may be retained
            where the law requires. To exercise these rights, contact [CONTACT_EMAIL].
          </p>
        </LegalSection>

        <LegalSection n={8} title="Changes and contact">
          <p>
            Material changes to this policy will be announced on the Platform. Data controller:
            [COMPANY], [JURISDICTION]. Contact: [CONTACT_EMAIL].
          </p>
        </LegalSection>
      </div>
    </PageContainer>
  );
}
