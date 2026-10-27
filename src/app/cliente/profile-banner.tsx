import Link from "next/link";

// Aviso para completar los datos a cambio de puntos.
export function ProfileBanner({ points }: { points?: number }) {
  return (
    <Link
      href="/cliente/perfil"
      className="flex items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900 hover:bg-indigo-100"
    >
      <span>
        <span className="block font-semibold">
          {points ? `Ganá ${points} puntos de regalo` : "Completá tus datos y ganá puntos"}
        </span>
        Solo tu teléfono y cumpleaños, una vez.
      </span>
      <span className="shrink-0 font-medium">Completar →</span>
    </Link>
  );
}
