import { NextResponse, type NextRequest } from "next/server";
import { requestOrigin } from "@/lib/origin";
import { getViewer } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { DomainError } from "@/server/domain/errors";
import { joinMerchant } from "@/server/services/enrollment";

// Destino del QR del mostrador. Sin sesión, va al login y vuelve acá; con
// sesión, une al cliente al comercio y abre su tarjeta.
export async function GET(_: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const origin = await requestOrigin();
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.redirect(`${origin}/login?next=${encodeURIComponent(`/unirse/${slug}`)}`);
  }
  try {
    const { merchantId } = await joinMerchant(getDb(), viewer.customer, slug);
    return NextResponse.redirect(`${origin}/cliente/${merchantId}`);
  } catch (error) {
    if (error instanceof DomainError) return NextResponse.redirect(`${origin}/cliente?comercio=no-encontrado`);
    throw error;
  }
}
