CREATE TABLE "crm_records" (
	"resource" text NOT NULL,
	"id" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created" boolean DEFAULT false NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_records_resource_id_pk" PRIMARY KEY("resource","id")
);
--> statement-breakpoint
ALTER TABLE "crm_records" ADD CONSTRAINT "crm_records_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;