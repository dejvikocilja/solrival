import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/ui/page-shell";

/**
 * Terms of Service.
 *
 * ⚠️ LAUNCH GATE: this is a structured working draft, NOT legal advice. It must
 * be reviewed and adapted by qualified counsel for every jurisdiction SolRival
 * operates in BEFORE mainnet — real-money skill-gaming rules (and whether
 * age/geo gating is required) vary significantly by country and state. The
 * placeholders below ([JURISDICTION], [CONTACT_EMAIL], [COMPANY]) must be
 * filled in as part of that review.
 */

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of SolRival.",
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

export default function TermsPage() {
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Legal"
        title="Terms of Service"
        description={`Effective date: ${EFFECTIVE_DATE}`}
      />

      <div className="space-y-8">
        <LegalSection n={1} title="What SolRival is">
          <p>
            SolRival (&quot;the Platform&quot;, operated by [COMPANY]) is a competitive gaming platform where
            players challenge each other to skill-based duels in supported games and stake platform
            credits on the outcome. Match results are determined by gameplay skill and verified
            automatically against official game data. By creating an account or connecting a wallet,
            you agree to these Terms.
          </p>
        </LegalSection>

        <LegalSection n={2} title="Eligibility">
          <p>
            You must be at least 18 years old (or the age of majority in your jurisdiction, if
            higher) to use SolRival. You are responsible for ensuring that participating in
            skill-based competitions with real-value stakes is lawful where you live; the Platform
            is not available where such participation is prohibited. We may require verification of
            age or identity and may suspend accounts that fail it.
          </p>
        </LegalSection>

        <LegalSection n={3} title="Accounts and wallets">
          <p>
            You authenticate by signing a message with your Solana wallet. You are solely
            responsible for the security of your wallet and its keys; anyone who controls your
            wallet controls your account. One account per person. Accounts are not transferable.
          </p>
        </LegalSection>

        <LegalSection n={4} title="Credits, deposits, and custody">
          <p>
            Duels are funded with platform credits. You obtain credits by depositing SOL to the
            Platform treasury; credits are recorded on an internal ledger and are redeemable for SOL
            via withdrawal, subject to these Terms. Credits are a prepaid balance for use on the
            Platform — they are not an investment, do not accrue interest, and have no value outside
            the Platform. Deposits may carry a fee, displayed before you confirm.
          </p>
        </LegalSection>

        <LegalSection n={5} title="Duels, stakes, and fees">
          <p>
            Creating or accepting a duel locks your stake until the duel resolves. The winner
            receives the combined pot minus the platform fee shown at creation time; the fee in
            effect when a duel is created applies to that duel regardless of later changes. Duels
            that are never accepted expire and are refunded automatically. Stake and withdrawal
            limits may apply and may change over time.
          </p>
        </LegalSection>

        <LegalSection n={6} title="Result verification">
          <p>
            Results are verified automatically against official game APIs by matching the battle
            between the two linked player accounts within the duel&apos;s validity window. If no
            verifiable result exists by the deadline, the duel is refunded or routed to review. You
            must link your own game accounts; playing on someone else&apos;s account, win-trading, or
            manipulating match outcomes is prohibited.
          </p>
        </LegalSection>

        <LegalSection n={7} title="Disputes">
          <p>
            Either participant may dispute a live duel, or contest a verified result within the
            posted dispute window after settlement. Open disputes pause related payouts for both
            participants. Our team reviews disputes and may uphold the result, award the duel to the
            other player (reversing the payout), or void the duel and return both stakes. Dispute
            decisions are final within the Platform.
          </p>
        </LegalSection>

        <LegalSection n={8} title="Withdrawals">
          <p>
            You may withdraw available credits to a Solana wallet at any time, subject to minimums,
            daily limits, and review holds (for example, while a dispute involving your account is
            open). On-chain transfers are irreversible once confirmed; double-check destination
            addresses. Network conditions may delay payouts.
          </p>
        </LegalSection>

        <LegalSection n={9} title="Prohibited conduct">
          <p>
            The following lead to suspension, forfeiture of contested funds, and/or account
            termination: cheating or using unauthorized software in matches; colluding or
            win-trading; multi-accounting; exploiting bugs instead of reporting them; harassment;
            money laundering or use of illicitly obtained funds; circumventing geographic or age
            restrictions; and any attempt to manipulate verification or the dispute process.
          </p>
        </LegalSection>

        <LegalSection n={10} title="Suspension and termination">
          <p>
            We may suspend or terminate accounts that violate these Terms. Where funds are not the
            subject of an active integrity investigation, we will make reasonable efforts to allow
            withdrawal of remaining available balance upon account closure.
          </p>
        </LegalSection>

        <LegalSection n={11} title="Disclaimers and limitation of liability">
          <p>
            The Platform is provided &quot;as is&quot;. We do not guarantee uninterrupted availability of the
            Platform, third-party game APIs, or the Solana network. To the maximum extent permitted
            by law, [COMPANY]&apos;s aggregate liability arising from your use of the Platform is limited
            to the balance held in your account at the time the claim arose. Nothing in these Terms
            excludes liability that cannot be excluded by law.
          </p>
        </LegalSection>

        <LegalSection n={12} title="Intellectual property and third-party games">
          <p>
            Supported games are the property of their respective publishers. This material is
            unofficial and is not endorsed by, affiliated with, or sponsored by Supercell. Game
            names and assets are trademarks of their owners; SolRival uses official public APIs to
            verify match results.
          </p>
        </LegalSection>

        <LegalSection n={13} title="Changes, governing law, and contact">
          <p>
            We may update these Terms; material changes will be announced on the Platform and apply
            prospectively. These Terms are governed by the laws of [JURISDICTION]. Questions:
            [CONTACT_EMAIL].
          </p>
        </LegalSection>
      </div>
    </PageContainer>
  );
}
