// AgentCore Gateway Lambda target: read-only tools -> CargoPact business API.
// Identity: the caller's Cognito ID token arrives as propagated header X-User-Token (never as a tool argument).
// Tenant/role authorization is enforced by the business API (403 is returned as-is).
const API_URL = (process.env.API_URL || "").replace(/\/$/, "");
const enc = (v) => encodeURIComponent(String(v ?? ""));
const q = (o) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};
const TOOLS = {
  search_trips: (a) => `/customer/trips${q({ date: a.date, pallets: a.pallets })}`,
  trip_detail: (a) => `/customer/trips/${enc(req(a, "tripId"))}${q({ pallets: a.pallets })}`,
  my_reservations: () => "/customer/reservations",
  track_order: (a) => `/customer/orders/${enc(req(a, "orderNumber"))}/tracking`,
  carrier_trips: (a) => `/carrier/trips${q({ status: a.status })}`,
  carrier_trip_detail: (a) => `/carrier/trips/${enc(req(a, "tripId"))}`,
  carrier_dashboard: (a) => `/carrier/dashboard${q({ tripId: a.tripId })}`,
  carrier_kpis: (a) => `/carrier/kpis${q({ from: a.from, to: a.to })}`,
};
function req(a, k) {
  if (typeof a[k] !== "string" || !a[k] || a[k].length > 200) throw new Error(`invalid ${k}`);
  return a[k];
}
const hdr = (h, name) => {
  for (const [k, v] of Object.entries(h || {})) if (k.toLowerCase() === name) return v;
  return undefined;
};
export const handler = async (event, context) => {
  const cc = context.clientContext?.custom ?? {};
  const full = String(cc.bedrockAgentCoreToolName ?? "");
  const tool = full.includes("___") ? full.split("___").pop() : full;
  let ph = cc.bedrockAgentCorePropagatedHeaders ?? {};
  if (typeof ph === "string") { try { ph = JSON.parse(ph); } catch { ph = {}; } }
  const token = String(hdr(ph, "x-user-token") ?? "").replace(/^Bearer\s+/i, "");
  if (!TOOLS[tool]) return { error: true, status: 400, message: `unknown tool` };
  if (!token) return { error: true, status: 401, message: "missing user token" };
  let path;
  try { path = TOOLS[tool](event ?? {}); } catch (e) { return { error: true, status: 400, message: e.message }; }
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  for (const h of ["x-correlation-id", "x-agent-session"]) {
    const v = hdr(ph, h);
    if (v) headers[h] = String(v);
  }
  try {
    const r = await fetch(API_URL + path, { headers, signal: AbortSignal.timeout(10000) });
    const text = await r.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
    if (!r.ok) return { error: true, status: r.status, code: body.code, message: body.message, details: body.details };
    return body;
  } catch (e) {
    return { error: true, message: `API call failed: ${e.name}` };
  }
};
