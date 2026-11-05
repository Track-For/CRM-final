import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const userRoles = ["admin", "comercial", "operacao", "financeiro"] as const;
export type UserRole = (typeof userRoles)[number];

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  /** Sempre em minúsculo. */
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<UserRole>().notNull().default("admin"),
  totpSecret: text("totp_secret"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  failedLoginCount: integer("failed_login_count").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 (hex) do token guardado no cookie. */
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    userAgent: text("user_agent"),
    ip: text("ip"),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const authChallenges = pgTable(
  "auth_challenges",
  {
    /** SHA-256 (hex) do token guardado no cookie de desafio. */
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emailCodeHash: text("email_code_hash"),
    emailCodeExpiresAt: timestamp("email_code_expires_at", { withTimezone: true }),
    emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("auth_challenges_user_id_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Fiscal (NFS-e via Brasil NFe)
// ---------------------------------------------------------------------------

export const fiscalEnvironments = ["homologacao", "producao"] as const;
export type FiscalEnvironment = (typeof fiscalEnvironments)[number];

export const invoiceStatuses = [
  "rascunho",
  "processando",
  "emitida",
  "rejeitada",
  "cancelada",
  "cancelando",
] as const;
export type InvoiceStatus = (typeof invoiceStatuses)[number];

/** Configuração fiscal: linha única (id = 'default'). */
export const fiscalSettings = pgTable("fiscal_settings", {
  id: text("id").primaryKey().default("default"),
  provider: text("provider").default("brasil_nfe"),
  /** Token da empresa no Brasil NFe, criptografado (lib/fiscal/crypto.ts). */
  tokenEncrypted: text("token_encrypted"),
  environment: text("environment")
    .$type<FiscalEnvironment>()
    .notNull()
    .default("homologacao"),
  /** Código IBGE (7 dígitos) do município do prestador. */
  municipalityCode: text("municipality_code").notNull().default("2927408"),
  municipalityName: text("municipality_name").default("Salvador"),
  uf: text("uf").default("BA"),
  /** Item da LC 116 sem ponto, 6 dígitos (ex.: 010701 = 1.07). */
  defaultServiceItem: text("default_service_item").default("010701"),
  defaultMunicipalTaxCode: text("default_municipal_tax_code"),
  defaultCnae: text("default_cnae"),
  defaultNbs: text("default_nbs"),
  defaultIssRate: numeric("default_iss_rate", { precision: 5, scale: 2 }).default("5.00"),
  rpsSeries: text("rps_series").default("A"),
  nextRpsNumber: integer("next_rps_number").notNull().default(1),
  sendEmailToClient: boolean("send_email_to_client").default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
});

export type InvoiceAddress = {
  cep: string;
  street: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  uf: string;
  /** Código IBGE do município (7 dígitos). */
  ibgeCode: string;
};

/** Snapshot do tomador no momento da emissão. */
export type InvoiceTomador = {
  documentType: "cpf" | "cnpj";
  document: string;
  name: string;
  municipalRegistration?: string;
  email?: string;
  phone?: string;
  address: InvoiceAddress;
};

/** Retenções em R$. */
export type InvoiceRetentions = {
  ir?: number;
  pis?: number;
  cofins?: number;
  csll?: number;
  inss?: number;
};

/** Valores devolvidos pela API (Notas[].Valores). */
export type InvoiceValues = {
  BaseCalculo?: number;
  ValorLiquido?: number;
  ValorISS?: number;
  ValorISSRetido?: number;
  ValorPIS?: number;
  ValorCOFINS?: number;
  ValorCSLL?: number;
  ValorIR?: number;
  ValorInss?: number;
  Aliquota?: number;
};

export const invoices = pgTable(
  "invoices",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** Id do cliente (ainda no mock do CRM). */
    clientId: text("client_id"),
    chargeId: text("charge_id"),
    status: text("status").$type<InvoiceStatus>().notNull(),
    environment: text("environment").$type<FiscalEnvironment>().notNull(),
    rpsSeries: text("rps_series"),
    rpsNumber: integer("rps_number"),
    lote: bigint("lote", { mode: "number" }),
    codLote: text("cod_lote"),
    protocolo: text("protocolo"),
    /** NumeroNFSe. */
    number: text("number"),
    verificationCode: text("verification_code"),
    /** Chave. */
    accessKey: text("access_key"),
    tomador: jsonb("tomador").$type<InvoiceTomador>().notNull(),
    serviceDescription: text("service_description").notNull(),
    serviceItem: text("service_item").notNull(),
    municipalTaxCode: text("municipal_tax_code"),
    cnae: text("cnae"),
    nbs: text("nbs"),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    issRate: numeric("iss_rate", { precision: 5, scale: 2 }).notNull(),
    issRetained: boolean("iss_retained").notNull().default(false),
    retentions: jsonb("retentions").$type<InvoiceRetentions>().notNull().default({}),
    values: jsonb("values").$type<InvoiceValues>(),
    competenceDate: date("competence_date").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    warnings: jsonb("warnings").$type<string[]>(),
    pdfBase64: text("pdf_base64"),
    xmlBase64: text("xml_base64"),
    cancelReasonCode: integer("cancel_reason_code"),
    cancelJustification: text("cancel_justification"),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("invoices_status_idx").on(t.status),
    index("invoices_client_id_idx").on(t.clientId),
    index("invoices_created_at_idx").on(t.createdAt),
  ],
);

/**
 * Registros do CRM que ainda vêm do mock: cada criação/edição/exclusão feita
 * na tela é gravada aqui e aplicada por cima do mock na carga inicial.
 */
export const crmRecords = pgTable(
  "crm_records",
  {
    resource: text("resource").notNull(),
    id: text("id").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    created: boolean("created").notNull().default(false),
    deleted: boolean("deleted").notNull().default(false),
    updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.resource, t.id] })],
);

// ---------------------------------------------------------------------------
// Boleto (Asaas)
// ---------------------------------------------------------------------------

export const billingEnvironments = ["sandbox", "producao"] as const;
export type BillingEnvironment = (typeof billingEnvironments)[number];

/** Mesmos valores de ChargeStatus em types/index.ts. */
export type BoletoStatus = "pendente" | "pago" | "vencido" | "cancelado";

/** Configuração do provedor de boleto: linha única (id = 'default'). */
export const billingSettings = pgTable("billing_settings", {
  id: text("id").primaryKey().default("default"),
  provider: text("provider").notNull().default("asaas"),
  /** Chave da API do Asaas, criptografada (lib/fiscal/crypto.ts). */
  apiKeyEncrypted: text("api_key_encrypted"),
  environment: text("environment").$type<BillingEnvironment>().notNull().default("sandbox"),
  /** Token que o Asaas envia no header asaas-access-token, criptografado. */
  webhookTokenEncrypted: text("webhook_token_encrypted"),
  finePercent: numeric("fine_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  interestPercent: numeric("interest_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
});

/** Boleto registrado no provedor. A linha é gravada antes de chamar o Asaas. */
export const boletos = pgTable(
  "boletos",
  {
    chargeId: text("charge_id").primaryKey(),
    entryId: text("entry_id"),
    environment: text("environment").$type<BillingEnvironment>().notNull(),
    /** pay_...; nulo enquanto a emissão não foi confirmada. */
    gatewayId: text("gateway_id"),
    gatewayCustomerId: text("gateway_customer_id"),
    gatewayStatus: text("gateway_status"),
    status: text("status").$type<BoletoStatus>().notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    dueDate: date("due_date").notNull(),
    invoiceUrl: text("invoice_url"),
    bankSlipUrl: text("bank_slip_url"),
    digitableLine: text("digitable_line"),
    barcode: text("barcode"),
    nossoNumero: text("nosso_numero"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("boletos_gateway_id_unique").on(t.gatewayId)],
);

/** Eventos de webhook já processados, para deduplicar a entrega "pelo menos uma vez". */
export const gatewayEvents = pgTable("gateway_events", {
  /** evt_... */
  id: text("id").primaryKey(),
  event: text("event").notNull(),
  gatewayId: text("gateway_id"),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
});

export type BillingSettings = typeof billingSettings.$inferSelect;
export type BoletoRow = typeof boletos.$inferSelect;
export type GatewayEvent = typeof gatewayEvents.$inferSelect;

export type CrmRecord = typeof crmRecords.$inferSelect;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type AuthChallenge = typeof authChallenges.$inferSelect;
export type FiscalSettings = typeof fiscalSettings.$inferSelect;
export type NewFiscalSettings = typeof fiscalSettings.$inferInsert;
export type InvoiceRow = typeof invoices.$inferSelect;
export type NewInvoiceRow = typeof invoices.$inferInsert;

// Conversas reais recebidas pela Evolution API, independentes dos dados demonstrativos.
export const whatsappMessages = pgTable("whatsapp_messages", {
  id: text("id").primaryKey(),
  instance: text("instance").notNull(),
  providerId: text("provider_id").notNull(),
  remoteJid: text("remote_jid").notNull(),
  phone: text("phone").notNull(),
  contactName: text("contact_name").notNull().default(""),
  direction: text("direction").$type<"in" | "out">().notNull(),
  text: text("text").notNull(),
  messageType: text("message_type").notNull().default("text"),
  status: text("status").notNull().default("enviada"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("whatsapp_phone_sent_idx").on(t.phone, t.sentAt)]);

// Instagram: credenciais do aplicativo e tokens permanecem exclusivamente no servidor.
export const instagramSettings = pgTable("instagram_settings", {
  id: text("id").primaryKey().default("default"),
  appId: text("app_id").notNull(),
  appSecretEncrypted: text("app_secret_encrypted").notNull(),
  redirectUri: text("redirect_uri").notNull(),
  graphVersion: text("graph_version").notNull().default("v25.0"),
  activeAccountId: text("active_account_id"),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export const instagramAccounts = pgTable("instagram_accounts", {
  id: text("id").primaryKey(),
  pageId: text("page_id").notNull(),
  pageName: text("page_name").notNull(),
  tokenEncrypted: text("token_encrypted"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  profile: jsonb("profile").$type<import("../instagram/types").InstagramProfile>().notNull(),
  media: jsonb("media").$type<import("../instagram/types").InstagramMedia[]>().notNull().default([]),
  stories: jsonb("stories").$type<import("../instagram/types").InstagramMedia[]>().notNull().default([]),
  mediaCursor: text("media_cursor"),
  warnings: jsonb("warnings").$type<string[]>().notNull().default([]),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  storiesSyncedAt: timestamp("stories_synced_at", { withTimezone: true }),
  connectedBy: text("connected_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export const instagramOauthStates = pgTable("instagram_oauth_states", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// Google Agenda: aplicativo compartilhado; autorizações e eventos isolados por usuário.
export const googleCalendarSettings = pgTable("google_calendar_settings", {
  id: text("id").primaryKey().default("default"),
  clientId: text("client_id").notNull(),
  clientSecretEncrypted: text("client_secret_encrypted").notNull(),
  redirectUri: text("redirect_uri").notNull(),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export const googleCalendarConnections = pgTable("google_calendar_connections", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  googleSubject: text("google_subject").notNull(),
  email: text("email").notNull(),
  clientId: text("client_id").notNull(),
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("connected"),
  selectedCalendarId: text("selected_calendar_id"),
  calendars: jsonb("calendars").$type<import("../google-calendar/types").GoogleCalendar[]>().notNull().default([]),
  events: jsonb("events").$type<import("../../types").CalendarEvent[]>().notNull().default([]),
  rangeStart: text("range_start"),
  rangeEnd: text("range_end"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export const googleCalendarOauthStates = pgTable("google_calendar_oauth_states", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

/** Vínculos confirmados pelo WhatsApp, sem inferir telefones a partir de LIDs. */
export const whatsappContacts = pgTable("whatsapp_contacts", {
  instance: text("instance").notNull(),
  lid: text("lid").notNull(),
  phone: text("phone").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.instance, t.lid] }), index("whatsapp_contacts_phone_idx").on(t.instance, t.phone)]);
