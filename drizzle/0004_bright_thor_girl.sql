CREATE TABLE "whatsapp_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"instance" text NOT NULL,
	"provider_id" text NOT NULL,
	"remote_jid" text NOT NULL,
	"phone" text NOT NULL,
	"contact_name" text DEFAULT '' NOT NULL,
	"direction" text NOT NULL,
	"text" text NOT NULL,
	"message_type" text DEFAULT 'text' NOT NULL,
	"status" text DEFAULT 'enviada' NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "whatsapp_phone_sent_idx" ON "whatsapp_messages" USING btree ("phone","sent_at");