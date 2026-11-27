CREATE TABLE "users" (
  "_id" UUID PRIMARY KEY,
  "name" VARCHAR(80) NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  "profileImage" TEXT NOT NULL DEFAULT '',
  "resetTokenHash" TEXT,
  "resetTokenExpiresAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "projects" (
  "_id" UUID PRIMARY KEY,
  "ownerId" UUID NOT NULL REFERENCES "users" ("_id") ON DELETE CASCADE,
  "name" VARCHAR(120) NOT NULL,
  "originalUrl" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'in_review', 'archived')),
  "thumbnail" TEXT NOT NULL DEFAULT '',
  "lastError" TEXT,
  "changesCount" INTEGER NOT NULL DEFAULT 0,
  "activeRevisionNumber" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "projects_owner_updated_idx" ON "projects" ("ownerId", "updatedAt" DESC);
CREATE INDEX "projects_status_idx" ON "projects" ("status");

CREATE TABLE "pages" (
  "_id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL REFERENCES "projects" ("_id") ON DELETE CASCADE,
  "originalUrl" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT '',
  "viewport" JSONB NOT NULL DEFAULT '{"preset":"desktop","width":1440,"height":900}'::jsonb,
  "snapshotHtml" TEXT NOT NULL DEFAULT '',
  "elements" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "layers" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "navLinks" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("projectId", "originalUrl")
);

CREATE TABLE "revisions" (
  "_id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL REFERENCES "projects" ("_id") ON DELETE CASCADE,
  "revisionNumber" INTEGER NOT NULL,
  "label" TEXT NOT NULL DEFAULT '',
  "changes" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdBy" UUID NOT NULL REFERENCES "users" ("_id"),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("projectId", "revisionNumber")
);

CREATE TABLE "changes" (
  "_id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL REFERENCES "projects" ("_id") ON DELETE CASCADE,
  "pageId" UUID REFERENCES "pages" ("_id") ON DELETE SET NULL,
  "pageUrl" TEXT NOT NULL,
  "clientId" TEXT,
  "elementId" TEXT NOT NULL,
  "elementFingerprint" JSONB NOT NULL,
  "type" TEXT NOT NULL CHECK ("type" IN ('text', 'image', 'style', 'layout', 'visibility', 'move')),
  "originalValue" JSONB,
  "proposedValue" JSONB NOT NULL,
  "revisionId" UUID REFERENCES "revisions" ("_id") ON DELETE SET NULL,
  "unresolved" BOOLEAN NOT NULL DEFAULT FALSE,
  "unresolvedReason" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "changes_project_created_idx" ON "changes" ("projectId", "createdAt");
CREATE INDEX "changes_project_page_element_idx" ON "changes" ("projectId", "pageUrl", "elementId");

CREATE TABLE "assets" (
  "_id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL REFERENCES "projects" ("_id") ON DELETE CASCADE,
  "ownerId" UUID NOT NULL REFERENCES "users" ("_id") ON DELETE CASCADE,
  "filename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "url" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "assets_project_idx" ON "assets" ("projectId");

CREATE TABLE "shares" (
  "_id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL REFERENCES "projects" ("_id") ON DELETE CASCADE,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "permission" TEXT NOT NULL DEFAULT 'read-only' CHECK ("permission" = 'read-only'),
  "passwordHash" TEXT,
  "expiresAt" TIMESTAMPTZ,
  "revokedAt" TIMESTAMPTZ,
  "accessCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "shares_project_idx" ON "shares" ("projectId");

CREATE TABLE "browser_sessions" (
  "_id" UUID PRIMARY KEY,
  "projectId" UUID NOT NULL REFERENCES "projects" ("_id") ON DELETE CASCADE,
  "ownerId" UUID NOT NULL REFERENCES "users" ("_id") ON DELETE CASCADE,
  "workerSessionId" TEXT NOT NULL UNIQUE,
  "currentUrl" TEXT NOT NULL,
  "viewport" TEXT NOT NULL DEFAULT 'desktop' CHECK ("viewport" IN ('desktop', 'tablet', 'mobile')),
  "sessionStatus" TEXT NOT NULL DEFAULT 'active' CHECK ("sessionStatus" IN ('active', 'closed', 'expired', 'error')),
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "browser_sessions_project_idx" ON "browser_sessions" ("projectId");
CREATE INDEX "browser_sessions_owner_idx" ON "browser_sessions" ("ownerId");
CREATE INDEX "browser_sessions_status_idx" ON "browser_sessions" ("sessionStatus");
