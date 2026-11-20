// Bundles the MCP server into one file, web/mcp/dist/hardstop-mcp.mjs, so an
// AI assistant can run it with plain `node` and nothing installed:
//   npx -y github:vaibhav4046/hardstop --demo
// Run from web/: node scripts/bundle-mcp.mjs
import { build } from 'esbuild'

await build({
  entryPoints: ['mcp/server.ts'],
  outfile: 'mcp/dist/hardstop-mcp.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  legalComments: 'none',
  logLevel: 'warning',
  // Some dependencies call require() for Node built-ins; an ES module has no require of its own.
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire as __hardstopRequire } from 'node:module';\nconst require = __hardstopRequire(import.meta.url);",
  },
})
console.log('wrote mcp/dist/hardstop-mcp.mjs')
