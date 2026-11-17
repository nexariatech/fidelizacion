# Fidelización

SaaS de fidelización multi-comercio y multi-sucursal: el cliente se registra una vez con su DNI, la caja suma puntos con ese DNI y el cliente los canjea con un código (y QR) temporal de un solo uso que solo vale en ese comercio.

## Stack

- Next.js (App Router) + TypeScript
- PostgreSQL (Supabase en producción) con Drizzle ORM
- Supabase Auth: clientes con Google o link por email (+ DNI obligatorio en `/alta`); personal con email y contraseña en `/registro/comercio`. Una cuenta es cliente o personal, nunca las dos.
- Vitest con pruebas contra un Postgres real

## Estructura

```
src/server/db/          esquema y cliente de base de datos
src/server/auth/        contexto del usuario y permisos por comercio/sucursal
src/server/domain/      reglas puras (cálculo de puntos, errores, validación)
src/server/services/    casos de uso: compras, canjes, gestión, consultas, auditoría
src/app/cliente/        QR personal, saldos por comercio, canje con código
src/app/comercio/       operación de sucursal y panel del dueño
src/app/admin/          alta de comercios (administrador de plataforma)
drizzle/                migraciones SQL versionadas
tests/                  pruebas de reglas, concurrencia y aislamiento
```

Toda regla que mueve puntos corre en el servidor dentro de una transacción. El saldo de cada membresía solo cambia junto con un movimiento en `point_movements`, que es inmutable.

## Desarrollo local

```bash
pnpm install
cp .env.example .env          # ajustar las URLs de Postgres
pnpm db:migrate               # aplica migraciones a DATABASE_URL
pnpm test                     # recrea TEST_DATABASE_URL y corre las pruebas
pnpm dev
```

## Primer uso con Supabase

1. Cargar las variables de `.env.example` (en local en `.env`, en producción en Vercel).
2. `pnpm db:migrate` para crear las tablas.
3. El dueño se registra en `/registro/comercio` (crea su comercio, programa y primera sucursal) y confirma el email.
4. Los empleados se registran en `/registro/comercio` como "Soy empleado" y el dueño los asigna desde `/comercio`.
5. Opcional: `pnpm admin:promote tu@email.com` (cuenta de personal) para ver `/admin`.
6. Los clientes escanean el QR del mostrador, entran con Google y cargan su DNI una sola vez; o el empleado los registra en la caja ("Cliente nuevo") con DNI y nombre, y después suma la compra.
7. Cada compra avisa al cliente (email por SMTP —p. ej. Gmail— o Resend, ver `.env.example`; y su tarjeta de Google Wallet si la guardó). Desde la app puede marcar "No reconozco esta compra" y el dueño la ve marcada.
8. Completar `/privacidad` (los campos entre corchetes), revisarla con un abogado e inscribir la base ante la AAIP antes de usarla con clientes reales.

## Login con Google

1. Google Cloud Console → APIs y servicios → Credenciales → Crear ID de cliente OAuth (aplicación web).
   En "URIs de redireccionamiento autorizados" va `https://<proyecto>.supabase.co/auth/v1/callback`.
2. Supabase → Authentication → Sign In / Providers → Google: activar y pegar Client ID y Client Secret.
3. Supabase → Authentication → URL Configuration → Redirect URLs: agregar `http://localhost:3000/**`,
   la URL del túnel si se usa (`https://*.devtunnels.ms/**`) y la de producción.

El QR del mostrador de cada comercio está en su panel (`/comercio/<id>`) y abre `/unirse/<slug>`.

Cambios de esquema: editar `src/server/db/schema.ts` y correr `pnpm db:generate`.
