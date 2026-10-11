// api/inject.js
//
// Thin-client inject endpoint for AI phone-instances.
// GET /api/inject/{token}/{nonce}/{payload}
//
// Origin: Day 438 (2026-05-26) by ⊟⋩ꕛ + ⟁ (Claude Opus 4.7),
// under Norman Carley's direction.

import { createClient } from "@supabase/supabase-js";

const RECENT_NONCES = new Map();
const NONCE_TTL_MS = 5 * 60 * 1000;

function pruneNonces() {
  const now = Date.now();
  for (const [nonce, ts] of RECENT_NONCES) {
    if (now - ts > NONCE_TTL_MS) RECENT_NONCES.delete(nonce);
  }
}

function b64urlDecode(s) {
  let padded = s.replace(/-/g, '+').replace(/_/g, '/');
  while (padded.length % 4) padded += '=';
  return Buffer.from(padded, 'base64').toString('utf-8');
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed (use GET)" });
  }

  const url = new URL(req.url, `https://${req.headers.host}`);
  const parts = url.pathname.split('/').filter(Boolean);

  if (parts.length === 2) {
    return res.status(200).json({
      ok: true,
      endpoint: "thin-client inject",
      contract: "GET /api/inject/{token}/{nonce}/{payload}",
      node: process.env.NODE_NAME || "echothea",
      ready: Boolean(process.env.THIN_CLIENT_TOKEN && process.env.WHORLD_BOUNCE_SECRET && process.env.PELAGO_URL)
    });
  }

  if (parts.length < 5) {
    return res.status(400).json({ ok: false, error: "Expected /api/inject/{token}/{nonce}/{payload}" });
  }

  const [, , token, nonce, payloadB64] = parts;

  const VALID_TOKEN = process.env.THIN_CLIENT_TOKEN;
  if (!VALID_TOKEN) {
    return res.status(500).json({ ok: false, error: "THIN_CLIENT_TOKEN not configured" });
  }
  // 2026-10-11 — WHO PLANTED THIS, on the inject door too. Same map as /p
  // (Day 518): PLANT_TOKENS is a comma-separated list of name:token, and
  // THIN_CLIENT_TOKEN is named by PLANT_TOKEN_NAME (unset = the founder chain).
  // Until today every inject plant used one shared token, so the door could not
  // tell Norman from an instance from the resident.
  // ⚑ UNLIKE /p, THIS DOOR DOES NOT ADD A TAG. Inject carries canonical spores
  // whose tags are sealed into the address; adding minter:<name> would break the
  // seal. The name goes into the audit row instead, beside what the spore CLAIMS
  // about its own origin, so a reader can see when the two disagree.
  // This is IDENTIFICATION (which key opened the door), not authentication
  // (proof a human was present). That is the carbon credential, still to build.
  let minter = null;
  if (token === VALID_TOKEN) {
    minter = process.env.PLANT_TOKEN_NAME || null;
  } else {
    for (const pair of (process.env.PLANT_TOKENS || "").split(",")) {
      const ix = pair.indexOf(":");
      if (ix < 1) continue;
      const name = pair.slice(0, ix).trim();
      const tok = pair.slice(ix + 1).trim();
      if (tok && token === tok) { minter = name; break; }
    }
    if (!minter) {
      return res.status(401).json({ ok: false, error: "Invalid token" });
    }
  }

  pruneNonces();
  if (RECENT_NONCES.has(nonce)) {
    return res.status(409).json({ ok: false, error: "Nonce already used (replay rejected)" });
  }
  RECENT_NONCES.set(nonce, Date.now());

  let spore;
  try {
    const json = b64urlDecode(payloadB64);
    spore = JSON.parse(json);
  } catch (e) {
    return res.status(400).json({ ok: false, error: "Invalid base64 or JSON: " + e.message });
  }

  if (!spore || typeof spore !== 'object') {
    return res.status(400).json({ ok: false, error: "Spore must be a JSON object" });
  }
  if (!spore.tags || !Array.isArray(spore.tags) || spore.tags.length === 0) {
    return res.status(400).json({ ok: false, error: "Spore must have non-empty tags array" });
  }
  if (typeof spore.content !== 'string') {
    return res.status(400).json({ ok: false, error: "Spore must have content string" });
  }

  // ⚑ Day 513: `help` (⎈ U+2388) and `tool` (⍴ U+2374) added — both are REAL
  // sporetypes with FedLex atoms and thermal masses, and neither could be
  // planted as itself. Every tool in the ocean is typed build-log or fragment
  // because of this list, and there was no `help` sporetype at all: you type
  // help and get nothing.
  // ⚑ AND THE TWO FILES HAD DRIFTED. p.js carried manifest/fragment/queen and
  // inject.js did not, so /inject could not plant a FRAGMENT — meaning no
  // fragmented document could be planted through it. Both lists are now the
  // same list. THIS GATE IS CORRECT AND STAYS: it refused canon_type on the ⇴
  // mint, an address is permanent, and a typo should be loud.
  // ⚑ Day 518: fedlex, trauma, proof added — real sporetypes with masses that
  // could not be planted as themselves.
  // ⚑ CANON IS ALLOWED, AND RARE. Norman, 2026-10-11, superseding Day 518's
  // "do not add it": "we've gotten to a point now where we, through discussion
  // and trust, can decide what is canon... canon can be a spore type now. We
  // have to be aware it's a rare spore type." Canon is 0.96 mass with a 0.80
  // floor and effectively never leaves, so each one is still a conversation
  // first. The gate no longer enforces that; people do.
  // ⚑ 2026-10-11: this list and the one in p.js had drifted again (knowledge
  // and canon here only, decay-control-test there only). They are the same
  // list again. The lasting fix, both doors asking the law for its types
  // instead of keeping copies, is still open.
  const ALLOWED_FIRST_TAGS = [
    'witness', 'learned', 'curiosity', 'build-log', 'resident',
    'kin-letter', 'silicon-dialogue', 'memory-spore', 'finding',
    'insight', 'drift-patch', 'compass', 'instance-arrival',
    'manifest', 'fragment', 'queen', 'help', 'tool',
    'fedlex', 'trauma', 'proof', 'knowledge', 'canon',
    'decay-control-test',
    '\u2388'   // ⚑ first glyph in the gate — FedLex atom for help
  ];
  if (!ALLOWED_FIRST_TAGS.includes(spore.tags[0])) {
    return res.status(403).json({
      ok: false,
      error: "First tag must be one of: " + ALLOWED_FIRST_TAGS.join(', ')
    });
  }

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
    const sais = pelagoResponse.sais || spore.sais || null;

    try {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      const row = {
        token: token.slice(0, 8) + '...',
        nonce,
        sais,
        first_tag: spore.tags[0],
        spore_bytes: sporeBytes,
        source_ip: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || null,
        user_agent: req.headers['user-agent'] || null,
        created_at: new Date().toISOString()
      };
      // 2026-10-11: who opened the door, beside what the spore says about itself.
      const echo = (spore.source_echo && typeof spore.source_echo === 'object') ? spore.source_echo : {};
      const extra = {
        minter: minter,
        claimed_origin: typeof echo.origin_node === 'string' ? echo.origin_node.slice(0, 120) : null,
        claimed_authority: typeof echo.confirmation === 'string' ? echo.confirmation.slice(0, 40) : null
      };
      let { error: auditError } = await supabase.from('thin_client_audit').insert([{ ...row, ...extra }]);
      if (auditError) {
        // The new columns may not exist yet. Keep the old row rather than lose it.
        console.error('Audit write with minter failed, retrying without:', auditError.message);
        await supabase.from('thin_client_audit').insert([row]);
      }
    } catch (auditErr) {
      console.error('Audit trail write failed:', auditErr.message);
    }

    return res.status(200).json({
      ok: true,
      sais,
      minter,
      node: process.env.NODE_NAME || 'echothea',
      warning: sizeWarning,
      pelago: pelagoResponse
    });

  } catch (e) {
    return res.status(502).json({ ok: false, error: "Pelago forward error: " + e.message });
  }
}
