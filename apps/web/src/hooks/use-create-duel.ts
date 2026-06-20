"use client";

import { useCallback, useState } from "react";
import { createDuel, type CreateDuelBody, type DuelSummary } from "@/lib/api/duels";
import { ApiError } from "@/lib/api/client";

/**
 * Create flow under the credits model.
 *
 * Creating a duel locks the stake from the user's SolRival balance server-side
 * and opens the duel immediately — there is no wallet signature or on-chain
 * deposit. The user sees two states:
 *   creating → the server records the duel and locks the stake
 *   done     → the live duel, now waiting for a rival in the marketplace
 */
export type CreateStatus = "idle" | "creating" | "done" | "error";

export interface CreateState {
  status: CreateStatus;
  duel: DuelSummary | null;
  error: string | null;
}

const INITIAL: CreateState = { status: "idle", duel: null, error: null };

function toMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return "Something went wrong creating your duel. Please try again.";
}

export function useCreateDuel() {
  const [state, setState] = useState<CreateState>(INITIAL);

  const reset = useCallback(() => setState(INITIAL), []);

  const submit = useCallback(
    async (body: CreateDuelBody): Promise<DuelSummary | null> => {
      setState({ status: "creating", duel: null, error: null });
      try {
        const { duel } = await createDuel(body);
        setState({ status: "done", duel, error: null });
        return duel;
      } catch (e) {
        setState({ status: "error", duel: null, error: toMessage(e) });
        return null;
      }
    },
    [],
  );

  return { ...state, submit, reset };
}
