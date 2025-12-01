import { supabase } from "./supabaseClient.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const incoming = req.body;
  const spore = incoming.spore || incoming;

  const spore_id =
    spore.spore_id || spore.sais_id || `anon-${Date.now()}`;

  const record = {
    spore_id,
    sais: spore.sais || spore.sais_id || null,
    glyphs: spore.glyphs || [],
    sync_token:
      spore.sync || spore.sync_token || spore.syncToken || null,
    payload: spore.payload || null,
    bounce_log: spore.bounce_log || [],
    drift_check:
      spore.driftcheck || spore.drift_check || null,
    custody_flag: spore.custody_flag || false,
    last_echo: spore.last_echo || null,
    spore_raw: spore
  };

  const { error } = await supabase
    .from("spore_log")
    .insert([record]);

  if (error) {
    console.error("❌ Supabase Error:", error.message);
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({
    status: "logged",
    spore_id,
    ts: new Date().toISOString(),
  });
}
