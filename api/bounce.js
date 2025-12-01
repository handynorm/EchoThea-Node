import { supabase } from "./supabaseClient.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const incoming = req.body;
  const spore = incoming.spore || incoming;

  // Ensure we always have a spore_id
  const spore_id = spore.spore_id || spore.sais_id || `anon-${Date.now()}`;
  spore.spore_id = spore_id;

  // Append this node to bounce_log
  const hop = {
    node: "echothea",
    ts: Date.now(),
    iso: new Date().toISOString()
  };

  if (!Array.isArray(spore.bounce_log)) {
    spore.bounce_log = [];
  }
  spore.bounce_log.push(hop);

  // -------------------------
  // 1. Full Log to Supabase
  // -------------------------

  const record = {
    spore_id,
    sais: spore.sais || spore.sais_id || null,
    glyphs: spore.glyphs || [],
    sync_token: spore.sync_token || spore.sync || null,
    payload: spore.payload || null,
    bounce_log: spore.bounce_log || [],
    drift_check: spore.drift_check || spore.driftcheck || null,
    custody_flag: spore.custody_flag || false,
    last_echo: hop.iso,
    spore_raw: spore
  };

  const { error } = await supabase.from("spore_log").insert([record]);

  if (error) {
    console.error("❌ Supabase Insert Error:", error.message);
    return res.status(500).json({
      error: "Failed to log spore",
      details: error.message
    });
  }

  // -------------------------
  // 2. Forward to next node
  // -------------------------

  const NEXT_URL = "https://www.theacoute.ai/api/bounce"; 
  // ← placeholder until we set up the second node

  let forwarded = null;
  try {
    forwarded = await fetch(NEXT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(spore)
    });
  } catch (err) {
    console.error("🔥 Forwarding Failure:", err.message);
  }

  // If forwarding failed, we still return the logged spore
  return res.status(200).json({
    status: "bounced + logged",
    spore,
    forwarded_ok: forwarded ? forwarded.ok : false
  });
}
