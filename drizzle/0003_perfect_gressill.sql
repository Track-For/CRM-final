CREATE TABLE "billing_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"provider" text DEFAULT 'asaas' NOT NULL,
	"api_key_encrypted" text,
	"environment" text DEFAULT 'sandbox' NOT NULL,
	"webhook_token_encrypted" text,
	"fine_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"interest_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "boletos" (
	"charge_id" text PRIMARY KEY NOT NULL,
	"entry_id" text,
	"environment" text NOT NULL,
	"gateway_id" text,
	"gateway_customer_id" text,
	"gateway_status" text,
	"status" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"due_date" date NOT NULL,
	"invoice_url" text,
	"bank_slip_url" text,
	"digitable_line" text,
	"barcode" text,
	"nosso_numero" text,
	"paid_at" timestamp with time zone,
	"error_message" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gateway_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"gateway_id" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_settings" ADD CONSTRAINT "billing_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boletos" ADD CONSTRAINT "boletos_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "boletos_gateway_id_unique" ON "boletos" USING btree ("gateway_id");