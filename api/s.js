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
