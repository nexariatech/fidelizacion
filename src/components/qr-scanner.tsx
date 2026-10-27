"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./ui";

// Lee un QR con la cámara del dispositivo y devuelve su contenido.
export function QrScannerButton({ onResult, label = "Escanear QR" }: { onResult: (value: string) => void; label?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    if (!active || !videoRef.current) return;
    let scanner: import("qr-scanner").default | undefined;
    let cancelled = false;
    import("qr-scanner").then(({ default: QrScanner }) => {
      if (cancelled || !videoRef.current) return;
      scanner = new QrScanner(
        videoRef.current,
        (result) => {
          onResultRef.current(result.data);
          setActive(false);
        },
        { highlightScanRegion: true, returnDetailedScanResult: true },
      );
      scanner.start().catch(() => {
        setError("No se pudo abrir la cámara. Ingresa el dato a mano.");
        setActive(false);
      });
    });
    return () => {
      cancelled = true;
      scanner?.destroy();
    };
  }, [active]);

  return (
    <div className="space-y-2">
      {active ? (
        <>
          <video ref={videoRef} className="w-full max-w-xs rounded-lg bg-black" />
          <Button type="button" variant="secondary" onClick={() => setActive(false)}>
            Cancelar
          </Button>
        </>
      ) : (
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setError(null);
            setActive(true);
          }}
        >
          {label}
        </Button>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
