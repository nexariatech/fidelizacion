# Fidelización

SaaS de fidelización multi-comercio y multi-sucursal: el cliente se identifica con su QR personal, el comercio registra compras que otorgan puntos y el cliente los canjea con un código temporal de un solo uso.

## Stack

- Next.js (App Router) + TypeScript
- PostgreSQL (Supabase en producción) con Drizzle ORM
- Supabase Auth para login (email y contraseña)
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
3. Registrarse en `/registro` y confirmar el email.
4. `pnpm admin:promote tu@email.com` para ser administrador de plataforma.
5. En `/admin`, crear un comercio con el email del dueño (ya registrado).
6. El dueño agrega sucursales, recompensas y empleados desde `/comercio`.

Cambios de esquema: editar `src/server/db/schema.ts` y correr `pnpm db:generate`.
