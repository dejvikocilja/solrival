import "server-only";

/**
 * Username change policy.
 *
 * Usernames are how players identify each other across duels, disputes, and
 * the leaderboard. Letting someone rename freely lets them shed a reputation
 * mid-dispute or impersonate a rival right after a match, so changes are rate
 * limited rather than forbidden outright — people do outgrow a name they
 * picked in thirty seconds at signup.
 *
 * The rule lives here, alone, so the API route, the settings UI, and any future
 * admin override all read the same policy instead of re-deriving it.
 */

/** Days a user must wait between username changes. */
export const USERNAME_CHANGE_COOLDOWN_DAYS = 20;

const DAY_MS = 24 * 60 * 60 * 1000;
export const USERNAME_CHANGE_COOLDOWN_MS = USERNAME_CHANGE_COOLDOWN_DAYS * DAY_MS;

export interface UsernameChangeEligibility {
  canChange: boolean;
  /** When the next change becomes available; null when already eligible. */
  availableAt: Date | null;
  /** Whole days remaining, rounded up. 0 when eligible. */
  daysRemaining: number;
}

/**
 * Pure policy check.
 *
 * A null `usernameChangedAt` means the account still carries the name it was
 * created with and gets one free change — the cooldown is meant to stop
 * churn, not to trap someone in an auto-generated handle forever.
 */
export function checkUsernameChangeEligibility(
  usernameChangedAt: Date | null,
  now: Date = new Date(),
): UsernameChangeEligibility {
  if (usernameChangedAt === null) {
    return { canChange: true, availableAt: null, daysRemaining: 0 };
  }

  const availableAt = new Date(usernameChangedAt.getTime() + USERNAME_CHANGE_COOLDOWN_MS);
  const remainingMs = availableAt.getTime() - now.getTime();

  if (remainingMs <= 0) {
    return { canChange: true, availableAt: null, daysRemaining: 0 };
  }

  return {
    canChange: false,
    availableAt,
    daysRemaining: Math.ceil(remainingMs / DAY_MS),
  };
}

/** User-facing copy for a blocked change. Kept next to the rule it describes. */
export function usernameCooldownMessage(eligibility: UsernameChangeEligibility): string {
  const days = eligibility.daysRemaining;
  return `You can change your username again in ${days} ${days === 1 ? "day" : "days"}.`;
}
