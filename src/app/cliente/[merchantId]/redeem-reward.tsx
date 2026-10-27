"use client";

import QRCode from "qrcode";
import { useEffect, useState, useTransition } from "react";
import { requestAuthorizationAction } from "@/app/actions/customer";
import { Button, Select } from "@/components/ui";

type Props = { rewardId: string; branches: { id: string; name: string }[] };

export function RedeemReward({ rewardId, branches }: Props) {
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [auth, setAuth] = useState<{ code: string; expiresAt: number; qr: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!auth) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [auth]);

  const secondsLeft = auth ? Math.max(0, Math.ceil((auth.expiresAt - now) / 1000)) : 0;

  function request() {
    setError(null);
    startTransition(async () => {
      const result = await requestAuthorizationAction(rewardId, branchId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      const qr = await QRCode.toDataURL(result.code, { margin: 1, width: 200 });
      setNow(Date.now());
      setAuth({ code: result.code, expiresAt: new Date(result.expiresAt).getTime(), qr });
    });
  }

  if (auth && secondsLeft > 0) {
    return (
      <div className="mt-4 space-y-2 rounded-lg bg-indigo-50 p-4 text-center">
        <p className="text-sm text-neutral-700">Muestra este código en la caja</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={auth.qr} alt="QR de canje" className="mx-auto h-40 w-40" />
        <p className="font-mono text-4xl font-bold tracking-widest text-indigo-800">{auth.code}</p>
        <p className="text-sm text-neutral-600">Vence en {secondsLeft} s · un solo uso</p>
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-auto flex-1">
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </Select>
      <Button onClick={request} disabled={pending || !branchId}>
        {auth ? "Generar otro código" : "Canjear"}
      </Button>
      {auth && <p className="w-full text-sm text-amber-700">El código venció.</p>}
      {error && <p className="w-full text-sm text-red-700">{error}</p>}
    </div>
  );
}
