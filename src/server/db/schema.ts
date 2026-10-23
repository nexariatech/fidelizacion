import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ---------------------------------------------------------------------------
// Identidad
// ---------------------------------------------------------------------------

// Cuenta global del cliente: una sola por persona, válida en todos los comercios.
// auth_user_id es el id del proveedor de autenticación (Supabase Auth); no hay FK
// para no atar el esquema a un proveedor concreto.
export const customers = pgTable("customers", {
  id: id(),
  authUserId: uuid("auth_user_id").notNull().unique(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  birthDate: date("birth_date"),
  // Se marca la primera vez que el cliente completa teléfono y cumpleaños.
  profileCompletedAt: timestamp("profile_completed_at", { withTimezone: true }),
  // Identificador opaco del QR personal. Se reemplaza si se compromete.
  qrToken: text("qr_token").notNull().unique(),
  createdAt: createdAt(),
});

// Usuarios que operan comercios (dueños, empleados) y administradores de plataforma.
export const staffUsers = pgTable("staff_users", {
  id: id(),
  authUserId: uuid("auth_user_id").notNull().unique(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Estructura comercial
// ---------------------------------------------------------------------------

export const merchantStatus = pgEnum("merchant_status", ["active", "suspended"]);

export const merchants = pgTable("merchants", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: merchantStatus("status").notNull().default("active"),
  createdAt: createdAt(),
});

export const branches = pgTable(
  "branches",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id),
    name: text("name").notNull(),
    address: text("address"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("branches_merchant_idx").on(t.merchantId)],
);

export const staffRole = pgEnum("staff_role", ["owner", "employee"]);

// owner: branch_id nulo, alcance de todo el comercio.
// employee: branch_id obligatorio, alcance de esa sucursal.
export const staffAssignments = pgTable(
  "staff_assignments",
  {
    id: id(),
    staffUserId: uuid("staff_user_id").notNull().references(() => staffUsers.id),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id),
    branchId: uuid("branch_id").references(() => branches.id),
    role: staffRole("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("staff_assignments_unique").on(t.staffUserId, t.merchantId, t.branchId).nullsNotDistinct(),
    check(
      "staff_assignments_scope",
      sql`(${t.role} = 'owner' and ${t.branchId} is null) or (${t.role} = 'employee' and ${t.branchId} is not null)`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Programa de fidelización
// ---------------------------------------------------------------------------

export const accrualBase = pgEnum("accrual_base", ["total", "eligible"]);

// Un programa por comercio en el MVP. Regla: points_per_unit puntos por cada
// unit_amount_cents gastados, redondeo hacia abajo. accrual_base define si se
// calcula sobre el total de la compra o sobre un importe elegible que informa
// el empleado.
export const loyaltyPrograms = pgTable(
  "loyalty_programs",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().unique().references(() => merchants.id),
    name: text("name").notNull(),
    description: text("description"),
    active: boolean("active").notNull().default(true),
    accrualBase: accrualBase("accrual_base").notNull().default("total"),
    pointsPerUnit: integer("points_per_unit").notNull(),
    unitAmountCents: integer("unit_amount_cents").notNull(),
    // Puntos de regalo por completar los datos del perfil; 0 lo desactiva.
    profileBonusPoints: integer("profile_bonus_points").notNull().default(50),
    createdAt: createdAt(),
  },
  (t) => [
    check("loyalty_programs_rule", sql`${t.pointsPerUnit} > 0 and ${t.unitAmountCents} > 0`),
    check("loyalty_programs_profile_bonus", sql`${t.profileBonusPoints} >= 0`),
  ],
);

// Participación de un cliente en el programa de un comercio. El saldo se comparte
// entre sucursales y solo cambia junto con un movimiento en point_movements.
export const programMemberships = pgTable(
  "program_memberships",
  {
    id: id(),
    programId: uuid("program_id").notNull().references(() => loyaltyPrograms.id),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    balance: integer("balance").notNull().default(0),
    // El regalo por completar el perfil se acredita una sola vez por membresía.
    profileBonusGrantedAt: timestamp("profile_bonus_granted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("program_memberships_unique").on(t.programId, t.customerId),
    index("program_memberships_merchant_idx").on(t.merchantId),
    check("program_memberships_balance", sql`${t.balance} >= 0`),
  ],
);

// ---------------------------------------------------------------------------
// Operaciones
// ---------------------------------------------------------------------------

export const purchaseStatus = pgEnum("purchase_status", ["confirmed", "voided"]);

export const purchases = pgTable(
  "purchases",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    membershipId: uuid("membership_id").notNull().references(() => programMemberships.id),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    amountCents: integer("amount_cents").notNull(),
    eligibleAmountCents: integer("eligible_amount_cents"),
    pointsAwarded: integer("points_awarded").notNull(),
    // Regla aplicada, para reconstruir el cálculo aunque el programa cambie.
    ruleSnapshot: jsonb("rule_snapshot").notNull(),
    externalReference: text("external_reference"),
    idempotencyKey: text("idempotency_key").notNull(),
    status: purchaseStatus("status").notNull().default("confirmed"),
    registeredBy: uuid("registered_by").notNull().references(() => staffUsers.id),
    voidedBy: uuid("voided_by").references(() => staffUsers.id),
    voidReason: text("void_reason"),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("purchases_idempotency").on(t.merchantId, t.idempotencyKey),
    index("purchases_merchant_created_idx").on(t.merchantId, t.createdAt),
    check("purchases_amount", sql`${t.amountCents} > 0`),
    check(
      "purchases_eligible_amount",
      sql`${t.eligibleAmountCents} is null or (${t.eligibleAmountCents} >= 0 and ${t.eligibleAmountCents} <= ${t.amountCents})`,
    ),
  ],
);

export const rewards = pgTable(
  "rewards",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id),
    name: text("name").notNull(),
    description: text("description"),
    pointsCost: integer("points_cost").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("rewards_merchant_idx").on(t.merchantId), check("rewards_cost", sql`${t.pointsCost} > 0`)],
);

export const authorizationStatus = pgEnum("redemption_authorization_status", ["pending", "used", "expired", "cancelled"]);

// Autorización temporal de un solo uso que el cliente genera desde su cuenta.
// Queda atada a cliente, comercio, sucursal y recompensa.
export const redemptionAuthorizations = pgTable(
  "redemption_authorizations",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    membershipId: uuid("membership_id").notNull(),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    rewardId: uuid("reward_id").notNull().references(() => rewards.id),
    code: text("code").notNull(),
    status: authorizationStatus("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "redemption_authorizations_membership_fk",
      columns: [t.membershipId],
      foreignColumns: [programMemberships.id],
    }),
    // Un código pendiente no puede repetirse en la misma sucursal.
    uniqueIndex("redemption_authorizations_pending_code")
      .on(t.branchId, t.code)
      .where(sql`${t.status} = 'pending'`),
  ],
);

export const redemptionStatus = pgEnum("redemption_status", ["completed", "cancelled"]);

export const redemptions = pgTable(
  "redemptions",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    membershipId: uuid("membership_id").notNull().references(() => programMemberships.id),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    rewardId: uuid("reward_id").notNull().references(() => rewards.id),
    authorizationId: uuid("authorization_id")
      .notNull()
      .unique()
      .references(() => redemptionAuthorizations.id),
    pointsSpent: integer("points_spent").notNull(),
    status: redemptionStatus("status").notNull().default("completed"),
    redeemedBy: uuid("redeemed_by").notNull().references(() => staffUsers.id),
    cancelledBy: uuid("cancelled_by").references(() => staffUsers.id),
    cancelReason: text("cancel_reason"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("redemptions_merchant_created_idx").on(t.merchantId, t.createdAt)],
);

export const movementType = pgEnum("point_movement_type", [
  "purchase",
  "purchase_void",
  "redemption",
  "redemption_cancel",
  "profile_bonus",
]);

// Libro de movimientos: inmutable, nunca se edita ni se borra.
// Los lotes y vencimientos de la fase 2 se apoyan en este libro.
export const pointMovements = pgTable(
  "point_movements",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id),
    // Nulo solo en movimientos que no ocurren en una caja (regalo por perfil).
    branchId: uuid("branch_id").references(() => branches.id),
    membershipId: uuid("membership_id").notNull().references(() => programMemberships.id),
    type: movementType("type").notNull(),
    points: integer("points").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    purchaseId: uuid("purchase_id").references(() => purchases.id),
    redemptionId: uuid("redemption_id").references(() => redemptions.id),
    actorStaffId: uuid("actor_staff_id").references(() => staffUsers.id),
    createdAt: createdAt(),
  },
  (t) => [
    index("point_movements_membership_idx").on(t.membershipId, t.createdAt),
    check("point_movements_nonzero", sql`${t.points} <> 0`),
    // ::text porque Postgres no permite usar un valor nuevo del enum en la
    // misma transacción que lo agrega.
    check("point_movements_branch", sql`${t.branchId} is not null or ${t.type}::text = 'profile_bonus'`),
  ],
);

// ---------------------------------------------------------------------------
// Auditoría
// ---------------------------------------------------------------------------

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    merchantId: uuid("merchant_id").references(() => merchants.id),
    actorType: text("actor_type").notNull(),
    actorId: uuid("actor_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    data: jsonb("data"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_merchant_created_idx").on(t.merchantId, t.createdAt)],
);
