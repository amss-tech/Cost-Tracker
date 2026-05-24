#!/usr/bin/env node
/**
 * Generate Supabase ANON_KEY and SERVICE_ROLE_KEY from your JWT_SECRET.
 *
 * Usage:
 *   node generate-keys.js YOUR_JWT_SECRET
 *
 * These keys go into supabase/docker/.env as:
 *   ANON_KEY=<output anon key>
 *   SERVICE_ROLE_KEY=<output service_role key>
 *
 * And into your Netlify env vars as:
 *   VITE_SUPABASE_ANON_KEY=<output anon key>
 *
 * Requires: npm install jsonwebtoken   (or: npx jsonwebtoken)
 */

const jwt = require('jsonwebtoken')

const secret = process.argv[2]
if (!secret || secret.length < 32) {
  console.error('Usage: node generate-keys.js <JWT_SECRET>')
  console.error('JWT_SECRET must be at least 32 characters.')
  process.exit(1)
}

const now = Math.floor(Date.now() / 1000)
const exp = now + (10 * 365 * 24 * 60 * 60) // 10 years

const anonKey = jwt.sign(
  { role: 'anon', iss: 'supabase', iat: now, exp },
  secret
)

const serviceRoleKey = jwt.sign(
  { role: 'service_role', iss: 'supabase', iat: now, exp },
  secret
)

console.log('\n=== ANON_KEY (safe to expose to browsers) ===')
console.log(anonKey)

console.log('\n=== SERVICE_ROLE_KEY (keep secret — server/admin use only) ===')
console.log(serviceRoleKey)

console.log('\n--- Add to supabase/docker/.env ---')
console.log(`ANON_KEY=${anonKey}`)
console.log(`SERVICE_ROLE_KEY=${serviceRoleKey}`)

console.log('\n--- Add to Netlify env vars (Cost-Tracker AND Esticomms) ---')
console.log(`VITE_SUPABASE_ANON_KEY=${anonKey}`)
