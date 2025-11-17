/*
  Build-time generator for env.js on Netlify (or any CI)
  It reads SUPABASE_URL and SUPABASE_ANON_KEY from process.env
  and writes a static env.js in the site root consumed by index.html/game.html
*/

const fs = require('fs');
const path = require('path');

const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;

const payload = {
  SUPABASE_URL: SUPABASE_URL || null,
  SUPABASE_ANON_KEY: SUPABASE_ANON_KEY || null,
};

const body = 'window.ENV = ' + JSON.stringify(payload) + ';// generated\n';

try {
  const publicDir = path.join(process.cwd(), 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  const outPath = path.join(publicDir, 'env.js');
  fs.writeFileSync(outPath, body, 'utf8');
  console.log('[generate-env] Wrote env.js to', outPath, 'with keys:', Object.keys(payload));
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('[generate-env] WARNING: Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment.');
  }
} catch (e) {
  console.error('[generate-env] Failed to write env.js', e);
  process.exit(1);
}

