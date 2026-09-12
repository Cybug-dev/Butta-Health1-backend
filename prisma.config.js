const { defineConfig } = require('prisma/config');
const env = require('./src/config/env');

module.exports = defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: env.DATABASE_URL },
});
