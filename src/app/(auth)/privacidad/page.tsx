import { Card } from "@/components/ui";

// Texto base para cumplir la Ley 25.326. Lo que está [entre corchetes] lo
// completa el responsable. Antes de usarlo con clientes reales: revisión de un
// abogado e inscripción de la base ante la AAIP.
export default function PrivacyPage() {
  return (
    <Card title="Política de privacidad">
      <div className="space-y-3 text-sm text-neutral-700">
        <p>
          <strong>Responsable:</strong> [Razón social], CUIT [número], con domicilio en [domicilio]. Contacto:
          [email de contacto].
        </p>
        <p>
          <strong>Qué datos pedimos:</strong> nombre, DNI y, si lo das, tu email. De forma opcional, teléfono y fecha de
          nacimiento. Registramos cuándo aceptaste esta política y, si te registraste en un comercio, qué empleado lo hizo.
        </p>
        <p>
          <strong>Para qué:</strong> el DNI sirve para identificarte en la caja de los comercios adheridos y registrar los
          puntos de tus compras. El email, para avisarte cada vez que sumas puntos. No usamos tus datos para otro fin ni
          los vendemos.
        </p>
        <p>
          <strong>Quién los ve:</strong> el personal de los comercios donde sumas o canjeas puntos ve tu nombre abreviado
          y tus movimientos en ese comercio. No ve tus movimientos en otros comercios.
        </p>
        <p>
          <strong>Dar los datos es voluntario,</strong> pero sin DNI no podemos registrar tus puntos.
        </p>
        <p>
          <strong>Tus derechos:</strong> puedes pedir acceso gratuito a tus datos cada seis meses, y su rectificación,
          actualización o supresión, escribiendo a [email de contacto] (Ley 25.326, arts. 14 a 16). La Agencia de Acceso
          a la Información Pública, órgano de control de la Ley 25.326, atiende las denuncias y reclamos por
          incumplimiento de las normas de protección de datos personales.
        </p>
        <p className="text-neutral-500">Última actualización: [fecha].</p>
      </div>
    </Card>
  );
}
