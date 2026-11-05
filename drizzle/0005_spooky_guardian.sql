CREATE TABLE "instagram_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"page_id" text NOT NULL,
	"page_name" text NOT NULL,
	"token_encrypted" text,
	"token_expires_at" timestamp with time zone,
	"profile" jsonb NOT NULL,
	"media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"media_cursor" text,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_synced_at" timestamp with time zone,
	"stories_synced_at" timestamp with time zone,
	"connected_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instagram_oauth_states" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instagram_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"app_id" text NOT NULL,
	"app_secret_encrypted" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"graph_version" text DEFAULT 'v25.0' NOT NULL,
	"active_account_id" text,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "instagram_accounts" ADD CONSTRAINT "instagram_accounts_connected_by_users_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_oauth_states" ADD CONSTRAINT "instagram_oauth_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_settings" ADD CONSTRAINT "instagram_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;