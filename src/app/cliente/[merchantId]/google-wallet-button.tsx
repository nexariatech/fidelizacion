"use client";

import { useState, useTransition } from "react";
import { googleWalletAction } from "@/app/actions/customer";

// El enlace se genera al hacer clic para que incluya el saldo del momento.
export function GoogleWalletButton({ merchantId }: { merchantId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await googleWalletAction(merchantId);
            if ("url" in result) window.location.href = result.url;
            else setError(result.error);
          })
        }
        className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? "Abriendo…" : "Agregar a Google Wallet"}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
