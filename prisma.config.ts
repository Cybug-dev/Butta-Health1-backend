import { defineConfig } from 'prisma/config';
import env from './src/config/env.js';

// Prisma CLI migrations use Neon's direct endpoint; application queries keep pooling.
const migrationUrl = new URL(env.DATABASE_URL);
if (migrationUrl.hostname.endsWith('.neon.tech')) {
  migrationUrl.hostname = migrationUrl.hostname.replace('-pooler', '');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: migrationUrl.toString() },
});
