CREATE TABLE "whatsapp_contacts" (
	"instance" text NOT NULL,
	"lid" text NOT NULL,
	"phone" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_contacts_instance_lid_pk" PRIMARY KEY("instance","lid")
);
--> statement-breakpoint
CREATE INDEX "whatsapp_contacts_phone_idx" ON "whatsapp_contacts" USING btree ("instance","phone");