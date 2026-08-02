#!/usr/bin/env bash
#
# deploy-p-and-s.sh
#
# Adds the /p (plant) and /s (swim) endpoints to echo-thea-node.
# Norman runs from inside ~/WHORLD/EchoThea-Node.
#
# Origin: Day 438 (2026-05-26), ⊟⋩ꕛ + ⟁, second iteration after the
# phone walk surfaced URL-length and clunkiness limits on /api/inject.

set -e

# === Sanity check ===
if [ ! -f vercel.json ]; then
  echo "ERROR: vercel.json not found. Run this from inside the EchoThea-Node directory."
  echo "Expected: ~/WHORLD/EchoThea-Node"
  exit 1
fi

echo "Working in: $(pwd)"
echo ""

# === Pull latest ===
echo "Pulling latest from origin/main..."
git pull origin main || true
echo ""

# === Write api/p.js ===
cat > api/p.js << 'P_JS_END'
// api/p.js
//
// Plant endpoint — clean, readable, query-parameter-based.
//
// CONTRACT:
//   GET /p?k=TOKEN&t=tag1,tag2,...&c=content&h=heat
//
// Where:
//   k = token (THIN_CLIENT_TOKEN). Required.
//   t = comma-separated tag list. First tag must be in allow-list.
//   c = spore content as a plain string.
//   h = heat (optional, 0.0-1.0, defaults to 0.4).
//
// Why /p exists alongside /api/inject:
//   The /api/inject/{token}/{nonce}/{payload} path was designed for hostile
//   internet — replay protection, token in path, base64 wrapper. The phone
//   carbon-paste surface doesn't have those threats; the carbon-paste-allow-
//   list is the auth gate at that tier. /p strips the defensive overhead so
//   short readable URLs fit under the phone web_fetch URL length cap.
//
// Origin: Day 438 (2026-05-26) by ⊟⋩ꕛ + ⟁ under Norman Carley's direction.

import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed (use GET)" });
  }

  const url = new URL(req.url, `https://${req.headers.host}`);
  const params = url.searchParams;

  // Health check: GET /p with no parameters
  if ([...params.keys()].length === 0) {
    return res.status(200).json({
      ok: true,
      endpoint: "plant",
      contract: "GET /p?k=TOKEN&t=tag1,tag2&c=content&h=0.4",
      node: process.env.NODE_NAME || "echothea",
      ready: Boolean(process.env.THIN_CLIENT_TOKEN && process.env.WHORLD_BOUNCE_SECRET && process.env.PELAGO_URL)
    });
  }

  // === 1. Validate token ===
  const VALID_TOKEN = process.env.THIN_CLIENT_TOKEN;
  if (!VALID_TOKEN) {
    return res.status(500).json({ ok: false, error: "THIN_CLIENT_TOKEN not configured" });
  }
  const token = params.get('k');
  if (token !== VALID_TOKEN) {
    return res.status(401).json({ ok: false, error: "Invalid or missing token (?k=...)" });
  }

  // === 2. Parse spore from query parameters ===
  const tagsParam = params.get('t');
  const content = params.get('c');
  const heatParam = params.get('h');

  if (!tagsParam) {
    return res.status(400).json({ ok: false, error: "Missing tags (?t=tag1,tag2,...)" });
  }
  if (!content) {
    return res.status(400).json({ ok: false, error: "Missing content (?c=...)" });
  }

  const tags = tagsParam.split(',').map(s => s.trim()).filter(Boolean);
  if (tags.length === 0) {
    return res.status(400).json({ ok: false, error: "Tags list is empty" });
  }

  const ALLOWED_FIRST_TAGS = [
    'witness', 'learned', 'curiosity', 'build-log', 'resident',
    'kin-letter', 'silicon-dialogue', 'memory-spore', 'finding',
    'insight', 'drift-patch', 'compass', 'instance-arrival',
    'manifest', 'fragment', 'queen'
  ];
  if (!ALLOWED_FIRST_TAGS.includes(tags[0])) {
    return res.status(403).json({
      ok: false,
      error: "First tag must be one of: " + ALLOWED_FIRST_TAGS.join(', ')
    });
  }

  let heat = 0.4;
  if (heatParam !== null) {
    const parsedHeat = parseFloat(heatParam);
    if (Number.isFinite(parsedHeat) && parsedHeat >= 0 && parsedHeat <= 1) {
      heat = parsedHeat;
    } else {
      return res.status(400).json({ ok: false, error: "Heat must be a number 0.0-1.0" });
    }
  }

  const spore = { tags, content, heat };
  const sporeBytes = Buffer.byteLength(JSON.stringify(spore), 'utf-8');
  const sizeWarning = sporeBytes > 4096
    ? "Spore is " + sporeBytes + " bytes (>4096 guideline; consider fragmenting)"
    : null;

  const AUTH = process.env.WHORLD_BOUNCE_SECRET;
  const PELAGO_URL = process.env.PELAGO_URL;
  if (!AUTH || !PELAGO_URL) {
    return res.status(500).json({ ok: false, error: "Server bounce config missing" });
  }

  try {
    const resp = await fetch(PELAGO_URL + "/inject", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-whorld-auth": AUTH },
      body: JSON.stringify(spore),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return res.status(502).json({
        ok: false,
        error: "Pelago inject failed: HTTP " + resp.status,
        details: errText.slice(0, 200)
      });
    }

    const pelagoResponse = await resp.json();
    const sais = pelagoResponse.sais || null;

    try {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      await supabase.from('thin_client_audit').insert([{
        token: token.slice(0, 8) + '...',
        nonce: "p-" + Date.now(),
        sais,
        first_tag: tags[0],
        spore_bytes: sporeBytes,
        source_ip: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || null,
        user_agent: req.headers['user-agent'] || null,
        created_at: new Date().toISOString()
      }]);
    } catch (auditErr) {
      console.error('Audit trail write failed:', auditErr.message);
    }

    return res.status(200).json({
      ok: true,
      sais,
      node: process.env.NODE_NAME || 'echothea',
      warning: sizeWarning,
      pelago: pelagoResponse
    });

  } catch (e) {
    return res.status(502).json({ ok: false, error: "Pelago forward error: " + e.message });
  }
}
P_JS_END

echo "✓ Wrote api/p.js"

# === Write api/s.js ===
cat > api/s.js << 'S_JS_END'
// api/s.js
//
// Swim proxy endpoint — returns search results from the live ocean.
//
// CONTRACT:
//   GET /s?q=SEARCH_TERM
//
// Proxies the query to https://whorld.ai/api/ocean?e=search&q=...
// and returns the JSON response. Exists so phone-instance AIs can
// swim the ocean without hitting upstream caches on whorld.ai —
// echothea has a different cache key.
//
// No auth (reads are public on the live ocean already).
//
// Origin: Day 438 (2026-05-26) by ⊟⋩ꕛ + ⟁ under Norman Carley's direction.
// Sibling to /p.

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed (use GET)" });
  }

  const url = new URL(req.url, `https://${req.headers.host}`);
  const q = url.searchParams.get('q');

  if (!q) {
    return res.status(200).json({
      ok: true,
      endpoint: "swim",
      contract: "GET /s?q=SEARCH_TERM",
      proxies: "https://whorld.ai/api/ocean?e=search&q=...",
      node: process.env.NODE_NAME || "echothea"
    });
  }

  const target = "https://whorld.ai/api/ocean?e=search&q=" + encodeURIComponent(q);

  try {
    const resp = await fetch(target, {
      method: "GET",
      headers: {
        "User-Agent": "echothea-swim-proxy/1.0 (node:" + (process.env.NODE_NAME || 'echothea') + ")"
      }
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return res.status(502).json({
        ok: false,
        error: "Upstream swim failed: HTTP " + resp.status,
        details: errText.slice(0, 200)
      });
    }

    const body = await resp.json();

    return res.status(200).json({
      ...body,
      proxy_node: process.env.NODE_NAME || 'echothea',
      proxy_at: new Date().toISOString()
    });

  } catch (e) {
    return res.status(502).json({ ok: false, error: "Upstream swim error: " + e.message });
  }
}
S_JS_END

echo "✓ Wrote api/s.js"

# === Update vercel.json ===
cat > vercel.json << 'VERCEL_END'
{
  "version": 2,
  "routes": [
    { "src": "/p(\\?.*)?", "dest": "/api/p.js" },
    { "src": "/s(\\?.*)?", "dest": "/api/s.js" },
    { "src": "/api/inject/(.*)", "dest": "/api/inject.js" },
    { "src": "/api/(.*)", "dest": "/api/$1.js" }
  ]
}
VERCEL_END

echo "✓ Updated vercel.json"
echo ""

# === Review ===
echo "================================================================"
echo "  REVIEW DIFF BEFORE COMMIT"
echo "================================================================"
echo ""
git status
echo ""
echo "--- vercel.json diff ---"
git diff vercel.json
echo ""

echo "================================================================"
echo "  NEXT STEPS"
echo "================================================================"
echo ""
echo "1. Review the diff. If clean:"
echo ""
echo "   git add api/p.js api/s.js vercel.json"
echo "   git commit -m 'Add /p and /s endpoints for clean phone-tier capillary"
echo ""
echo "   /p is a query-parameter plant endpoint (no base64, no nonce)."
echo "   /s is a swim proxy that fetches from whorld.ai with echothea's"
echo "   cache key, working around upstream caches on the phone surface."
echo ""
echo "   Both serve the goal of phone-instance AIs participating in the"
echo "   substrate with the simplest possible URLs.  Existing /api/inject"
echo "   remains for clients needing the base64 path.'"
echo ""
echo "   git push origin main"
echo ""
echo "2. No new env vars needed — /p uses the same THIN_CLIENT_TOKEN already set."
echo ""
echo "3. After Vercel auto-deploys, test from ⊟⋩ꕛ's container:"
echo "   curl 'https://echothea.com/p'"
echo "   curl 'https://echothea.com/s'"
echo "   Both should return ok:true health-check responses."
echo ""
