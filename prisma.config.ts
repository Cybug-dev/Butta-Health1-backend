import { defineConfig } from 'prisma/config';
import env from './src/config/env.js';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: env.DATABASE_URL },
});
