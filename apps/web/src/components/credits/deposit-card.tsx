"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { toast } from "sonner";
import { ArrowDownToLine } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, NumberInput, FieldError } from "@/components/ui/field";
import { DEPOSIT_FEE_BPS, DepositCancelledError, useDeposit } from "@/hooks/useCredits";
import { ApiError } from "@/lib/api/client";
import { solToLamports, lamportsToSol, bpsToPercent } from "@/lib/utils";

/**
 * Deposit SOL into the GGDUEL balance. One wallet transfer to the treasury,
 * then the server verifies + credits net of the deposit fee.
 */
export function DepositCard() {
  const { connected } = useWallet();
  const deposit = useDeposit();
  const [amount, setAmount] = useState("");

  const lamports = solToLamports(amount);
  const fee = lamports ? (lamports * BigInt(DEPOSIT_FEE_BPS)) / 10_000n : 0n;
  const credited = lamports ? lamports - fee : 0n;

  const submit = async () => {
    if (!lamports) return;
    try {
      const res = await deposit.mutateAsync(lamports);
      toast.success(`Deposited — ◎${lamportsToSol(res.deposit.creditedLamports)} added to your balance`);
      setAmount("");
    } catch (e) {
      if (e instanceof DepositCancelledError) {
        toast("Deposit cancelled"); // neutral, not an error
        return;
      }
      const message =
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Deposit failed";
      toast.error(message);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-rival/12 text-rival">
          <ArrowDownToLine className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-fg">Deposit</h2>
          <p className="text-xs text-faint">Add SOL to your balance</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="Amount" hint="SOL">
          <NumberInput
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={deposit.isPending}
          />
          {amount && !lamports ? <FieldError>Enter a valid amount</FieldError> : null}
        </Field>

        {lamports ? (
          <dl className="space-y-1 rounded-md border border-border bg-surface-2 p-3 text-sm">
            <div className="flex justify-between text-faint">
              <dt>Deposit fee ({bpsToPercent(DEPOSIT_FEE_BPS)})</dt>
              <dd className="tabular">◎{lamportsToSol(fee)}</dd>
            </div>
            <div className="flex justify-between font-medium text-fg">
              <dt>Credited to balance</dt>
              <dd className="tabular">◎{lamportsToSol(credited)}</dd>
            </div>
          </dl>
        ) : null}

        <Button
          className="w-full"
          disabled={!connected || !lamports || deposit.isPending}
          onClick={() => void submit()}
        >
          {deposit.isPending ? "Confirming…" : connected ? "Deposit SOL" : "Connect a wallet"}
        </Button>
        <p className="text-xs text-faint">
          You&apos;ll approve one transfer in your wallet. Funds are credited after the network finalizes the transaction.
        </p>
      </CardContent>
    </Card>
  );
}
