import { Card } from "@/components/ui";

// BORRADOR. Antes de usarlo con clientes reales: completar el responsable,
// revisarlo con un abogado e inscribir la base ante la AAIP (Ley 25.326).
export default function PrivacyPage() {
  return (
    <Card title="Política de privacidad">
      <div className="space-y-3 text-sm text-neutral-700">
        <p>
          <strong>Qué datos pedimos:</strong> nombre, email y DNI. De forma opcional, teléfono y fecha de nacimiento.
        </p>
        <p>
          <strong>Para qué:</strong> el DNI sirve para identificarte en la caja de los comercios adheridos y registrar
          los puntos de tus compras. No lo usamos para otro fin ni lo vendemos.
        </p>
        <p>
          <strong>Quién lo ve:</strong> el personal de los comercios donde sumas o canjeas puntos ve tu nombre abreviado y
          tus movimientos en ese comercio. No ve tus movimientos en otros comercios.
        </p>
        <p>
          <strong>Tus derechos:</strong> puedes pedir acceso, rectificación o supresión de tus datos (Ley 25.326, arts.
          14 a 16). La Agencia de Acceso a la Información Pública es el órgano de control.
        </p>
        <p className="text-neutral-500">Responsable de la base de datos: [completar razón social y contacto].</p>
      </div>
    </Card>
  );
}
