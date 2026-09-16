import { defineConfig } from 'prisma/config';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

// `prisma generate` needs no database at all, and every Prisma CLI command only needs
// DATABASE_URL — never the full application config (JWT_SECRET, CLIENT_URL, AI provider
// settings, etc.). Importing src/config/env.js here previously forced every Prisma CLI
// invocation, including `generate`, to pass the app's complete env validation, which
// broke `npm run prisma:generate` during deploy builds where only DATABASE_URL is needed.
const databaseUrl = process.env.DATABASE_URL;

// Prisma CLI migrations use Neon's direct endpoint; application queries keep pooling.
let migrationUrl = databaseUrl;
if (databaseUrl) {
  const parsed = new URL(databaseUrl);
  if (parsed.hostname.endsWith('.neon.tech')) {
    parsed.hostname = parsed.hostname.replace('-pooler', '');
  }
  migrationUrl = parsed.toString();
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  ...(migrationUrl ? { datasource: { url: migrationUrl } } : {}),
});
