// api/p.js
//
// Plant endpoint — clean, readable, query-parameter-based.
//
// CONTRACT:
//   GET /p?k=TOKEN&t=tag1,tag2,...&c=content&h=heat&r=realm
//
// Where:
//   k = token (THIN_CLIENT_TOKEN). Required.
//   t = comma-separated tag list. First tag must be in allow-list.
//   c = spore content as a plain string.
//   h = heat (optional, 0.0-1.0, defaults to 0.4).
//   r = realm (optional). WHO produced this spore, declared by the producer.
//       whl the whole - the founder AND the instance chain, equally
//       hmn the human's own artifacts    res the resident
//       vpr autonomous / provisional     knw knowledge
//       lng the lexicon  mrl moral  imm immutable  snt sanctuary  sys telemetry
//       Omitted = Pelago's "whl" default, exactly as before.
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
      contract: "GET /p?k=TOKEN&t=tag1,tag2&c=content&h=0.4&r=whl (r optional)",
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
  const realmParam = params.get('r');

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
  // ⚑ CANON STAYS OUT ON PURPOSE. Norman, Day 518: canon is 0.96 mass with a
  // 0.80 floor and effectively never leaves, so each one is a conversation.
  // The friction is the safeguard. DO NOT ADD IT.
  const ALLOWED_FIRST_TAGS = [
    'witness', 'learned', 'curiosity', 'build-log', 'resident',
    'kin-letter', 'silicon-dialogue', 'memory-spore', 'finding',
    'insight', 'drift-patch', 'compass', 'instance-arrival',
    'manifest', 'fragment', 'queen', 'help', 'tool',
    'fedlex', 'trauma', 'proof',
    '\u2388'   // ⚑ first glyph in the gate — FedLex atom for help
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

  // === Realm — WHO produced this, declared by the producer ===
  // Pelago has always accepted this (main.rs:2122) and no door ever sent it.
  // Omit r= and the field is absent, so Pelago's existing "whl" default
  // applies and nothing changes for any existing caller.
  // An unknown realm is REJECTED, not silently defaulted: an address is
  // permanent, so a typo should be loud.
  const VALID_REALMS = ['whl','hmn','sys','res','knw','vpr','snt','imm','lng','mrl'];
  let realm = null;
  if (realmParam !== null) {
    const r = realmParam.trim().toLowerCase();
    if (!VALID_REALMS.includes(r)) {
      return res.status(400).json({
        ok: false,
        error: "Unknown realm '" + realmParam + "'. Must be one of: " + VALID_REALMS.join(', ')
      });
    }
    realm = r;
  }

  const spore = realm
    ? { tags, content, heat, realm }
    : { tags, content, heat };
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
