"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ArrowUpFromLine, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, NumberInput, TextInput, FieldError } from "@/components/ui/field";
import { useWithdraw, type BalanceView } from "@/hooks/useCredits";
import { ApiError } from "@/lib/api/client";
import { solToLamports, lamportsToSol } from "@/lib/utils";

/**
 * Withdraw credits back to a Solana wallet. Funds lock immediately; the request
 * auto-approves unless the player has an active dispute (then it's held for an
 * admin). Destination defaults to the connected login wallet.
 */
export function WithdrawCard({ balance }: { balance: BalanceView | undefined }) {
  const withdraw = useWithdraw();
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");

  const lamports = solToLamports(amount);
  const available = balance ? BigInt(balance.availableLamports) : 0n;
  const overBalance = lamports != null && lamports > available;

  const submit = async () => {
    if (!lamports || overBalance) return;
    try {
      const res = await withdraw.mutateAsync({
        amountLamports: lamports,
        destinationWallet: destination.trim() || undefined,
      });
      toast.success(res.message, { duration: 6000 });
      setAmount("");
      setDestination("");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Withdrawal failed");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-victory/12 text-victory">
          <ArrowUpFromLine className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-fg">Withdraw</h2>
          <p className="text-xs text-faint">Send your balance to a Solana wallet — no fee</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="Amount" hint={balance ? `Available ◎${lamportsToSol(available)}` : undefined}>
          <NumberInput
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={withdraw.isPending}
          />
          {amount && !lamports ? <FieldError>Enter a valid amount</FieldError> : null}
          {overBalance ? <FieldError>Amount exceeds your available balance</FieldError> : null}
        </Field>

        <Field label="Destination" hint="optional">
          <TextInput
            placeholder="Defaults to your connected wallet"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            disabled={withdraw.isPending}
          />
        </Field>

        <div className="flex items-start gap-2 rounded-md border border-border bg-surface-2 p-3 text-xs text-faint">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-victory" aria-hidden />
          <p>
            Withdrawals are approved automatically and paid out shortly. If you have an active dispute, the request is
            held for a quick manual review to keep funds safe.
          </p>
        </div>

        <Button
          className="w-full"
          disabled={!lamports || overBalance || withdraw.isPending}
          onClick={() => void submit()}
        >
          {withdraw.isPending ? "Submitting…" : "Request withdrawal"}
        </Button>
      </CardContent>
    </Card>
  );
}
