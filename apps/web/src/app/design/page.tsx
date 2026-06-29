"use client";

import * as React from "react";
import { Inbox, Swords, Trophy } from "lucide-react";
import { PageContainer, PageHeader, Section } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, FieldError, NumberInput, TextInput, Textarea } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Segmented } from "@/components/ui/segmented";
import { Avatar } from "@/components/ui/avatar";
import { Stat } from "@/components/ui/stat";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

/**
 * Living styleguide — renders every primitive in every state. This is the single
 * source of truth for "what does our UI look like?". Build new screens by
 * composing what you see here. (Gate or remove before public mainnet launch.)
 */

const BADGE_TONES: BadgeProps["tone"][] = [
  "neutral",
  "rival",
  "victory",
  "ember",
  "danger",
  "cr",
  "bs",
];

function Swatch({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-caption text-faint">{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

export default function DesignSystemPage() {
  const [tab, setTab] = React.useState("all");
  const [loading, setLoading] = React.useState(false);

  return (
    <PageContainer size="wide">
      <PageHeader
        eyebrow="Internal"
        title="Design system"
        description="Every primitive, every state. Compose new screens from these — don't hand-roll."
      />

      <div className="space-y-12">
        {/* TYPE SCALE */}
        <Section title="Type scale">
          <Card>
            <CardContent className="space-y-3 p-5">
              <p className="font-display text-display text-fg">Display</p>
              <p className="font-display text-heading-1 text-fg">Heading 1 — page titles</p>
              <p className="text-heading-2 text-fg">Heading 2 — panel titles</p>
              <p className="text-heading-3 text-fg">Heading 3 — sub-sections</p>
              <p className="text-body-lg text-fg">Body large — intro copy.</p>
              <p className="text-body text-fg">Body — default paragraph copy.</p>
              <p className="text-body-sm text-muted">Body small — secondary copy.</p>
              <p className="text-caption text-faint">Caption — metadata.</p>
              <p className="text-overline uppercase text-rival">Overline — eyebrow</p>
            </CardContent>
          </Card>
        </Section>

        {/* BUTTONS */}
        <Section title="Buttons">
          <Swatch label="Variants">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
          </Swatch>
          <Swatch label="Sizes">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
          </Swatch>
          <Swatch label="States">
            <Button loading={loading} onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 1500); }}>
              {loading ? "Working…" : "Click to load"}
            </Button>
            <Button loading>Loading</Button>
            <Button disabled>Disabled</Button>
          </Swatch>
        </Section>

        {/* BADGES */}
        <Section title="Badges" description="Tones are functional, not decorative.">
          <Swatch label="Tones">
            {BADGE_TONES.map((tone) => (
              <Badge key={tone} tone={tone}>
                {tone}
              </Badge>
            ))}
          </Swatch>
        </Section>

        {/* CARDS */}
        <Section title="Cards">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="p-5">
                <p className="text-heading-3 text-fg">Basic card</p>
                <p className="mt-1 text-body-sm text-muted">Content padded with CardContent.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <p className="text-heading-3 text-fg">With header</p>
              </CardHeader>
              <CardContent>
                <p className="text-body-sm text-muted">Header + content composition.</p>
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* FORM FIELDS */}
        <Section title="Form fields" description="Default, invalid, and disabled.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Username" hint="3–20 chars">
              <TextInput placeholder="rival_one" />
            </Field>
            <Field label="Stake (SOL)">
              <NumberInput placeholder="0.10" />
            </Field>
            <Field label="Game">
              <Select
                options={[
                  { value: "cr", label: "Clash Royale" },
                  { value: "bs", label: "Brawl Stars" },
                ]}
              />
            </Field>
            <Field label="Invalid example">
              <TextInput aria-invalid defaultValue="taken_name" />
              <FieldError>That username is already taken.</FieldError>
            </Field>
            <Field label="Notes (optional)" className="sm:col-span-2">
              <Textarea placeholder="Anything your rival should know…" />
            </Field>
            <Field label="Disabled">
              <TextInput value="Locked" disabled readOnly />
            </Field>
          </div>
        </Section>

        {/* SEGMENTED */}
        <Section title="Segmented control">
          <div className="max-w-sm">
            <Segmented
              aria-label="Filter"
              value={tab}
              onValueChange={setTab}
              options={[
                { value: "all", label: "All" },
                { value: "open", label: "Open" },
                { value: "done", label: "Completed" },
              ]}
            />
          </div>
        </Section>

        {/* AVATARS */}
        <Section title="Avatars">
          <Swatch label="Sizes">
            <Avatar name="Rival One" size="sm" />
            <Avatar name="Rival One" size="md" />
            <Avatar name="Rival One" size="lg" />
          </Swatch>
        </Section>

        {/* STATS */}
        <Section title="Stats">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Wins" value={42} accent="text-victory" />
            <Stat label="Losses" value={11} accent="text-danger" />
            <Stat label="Duels" value={53} />
            <Stat label="Win rate" value="79%" />
          </div>
        </Section>

        {/* EMPTY STATE */}
        <Section title="Empty state">
          <EmptyState
            icon={Swords}
            title="No duels yet"
            description="Open challenges you create or accept will show up here."
            action={<Button>Create a duel</Button>}
          />
        </Section>

        {/* LOADING */}
        <Section title="Loading">
          <Swatch label="Spinner">
            <Spinner />
            <span className="inline-flex items-center gap-2 text-body-sm text-muted">
              <Spinner /> Loading duels…
            </span>
          </Swatch>
          <Swatch label="Skeleton">
            <div className="w-full max-w-sm space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </Swatch>
        </Section>

        {/* MISC ICONS sanity */}
        <Section title="Icon sanity">
          <Swatch label="lucide-react">
            <Swords className="h-5 w-5 text-rival" />
            <Trophy className="h-5 w-5 text-victory" />
            <Inbox className="h-5 w-5 text-muted" />
          </Swatch>
        </Section>
      </div>
    </PageContainer>
  );
}
