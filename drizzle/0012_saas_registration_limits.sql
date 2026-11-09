CREATE TABLE "saas_registration_limits" (
  "id" text PRIMARY KEY NOT NULL,
  "count" integer NOT NULL DEFAULT 1,
  "expires_at" timestamp with time zone NOT NULL
);
