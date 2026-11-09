CREATE TABLE "saas_workspaces" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "schema_name" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  "onboarded_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
