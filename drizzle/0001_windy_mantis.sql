CREATE TABLE "fiscal_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"provider" text DEFAULT 'brasil_nfe',
	"token_encrypted" text,
	"environment" text DEFAULT 'homologacao' NOT NULL,
	"municipality_code" text DEFAULT '2927408' NOT NULL,
	"municipality_name" text DEFAULT 'Salvador',
	"uf" text DEFAULT 'BA',
	"default_service_item" text DEFAULT '010701',
	"default_municipal_tax_code" text,
	"default_cnae" text,
	"default_nbs" text,
	"default_iss_rate" numeric(5, 2) DEFAULT '5.00',
	"rps_series" text DEFAULT 'A',
	"next_rps_number" integer DEFAULT 1 NOT NULL,
	"send_email_to_client" boolean DEFAULT true,
	"updated_at" timestamp with time zone DEFAULT now(),
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text,
	"charge_id" text,
	"status" text NOT NULL,
	"environment" text NOT NULL,
	"rps_series" text,
	"rps_number" integer,
	"lote" bigint,
	"cod_lote" text,
	"protocolo" text,
	"number" text,
	"verification_code" text,
	"access_key" text,
	"tomador" jsonb NOT NULL,
	"service_description" text NOT NULL,
	"service_item" text NOT NULL,
	"municipal_tax_code" text,
	"cnae" text,
	"nbs" text,
	"amount" numeric(12, 2) NOT NULL,
	"iss_rate" numeric(5, 2) NOT NULL,
	"iss_retained" boolean DEFAULT false NOT NULL,
	"retentions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"values" jsonb,
	"competence_date" date NOT NULL,
	"issued_at" timestamp with time zone,
	"error_message" text,
	"warnings" jsonb,
	"pdf_base64" text,
	"xml_base64" text,
	"cancel_reason_code" integer,
	"cancel_justification" text,
	"canceled_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fiscal_settings" ADD CONSTRAINT "fiscal_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invoices_client_id_idx" ON "invoices" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "invoices_created_at_idx" ON "invoices" USING btree ("created_at");