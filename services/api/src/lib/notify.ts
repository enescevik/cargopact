import type pg from "pg";
export type NotifyAudience = "customer" | "carrier";
const hhmm = (d: Date) => new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
/**
 * Uygulama içi bildirim; durum değişimiyle AYNI işlemde (c) yazılır.
 * title/body içinde {customer} {carrier} {order} {ref} {pallets} {cutoff} {window} yer tutucuları
 * rezervasyondan doldurulur; ek değerler `extra` ile ({reason} vb.) verilir.
 */
export async function notify(c: pg.PoolClient, reservationId: string, audience: NotifyAudience, type: string, title: string, body = "", extra: Record<string, string> = {}): Promise<void> {
  const q = await c.query(
    `select r.customer_id, r.carrier_id, r.trip_id, r.order_number, r.reference, r.pallets, r.is_demo, cu.name customer_name, ca.name carrier_name,
            t.intake_cutoff_at, d.pickup_window
       from reservations r join tenants cu on cu.id = r.customer_id join tenants ca on ca.id = r.carrier_id
       join trips t on t.id = r.trip_id join facilities d on d.id = t.destination_facility_id where r.id = $1`, [reservationId]);
  const r = q.rows[0];
  if (!r) return;
  const pw = r.pickup_window as { from?: string; to?: string } | null;
  const vars: Record<string, string> = {
    customer: r.customer_name, carrier: r.carrier_name, order: r.order_number ?? r.reference, ref: r.reference, pallets: String(r.pallets),
    cutoff: hhmm(r.intake_cutoff_at as Date), window: pw?.from && pw?.to ? `${pw.from}–${pw.to}` : "09:00–18:00", ...extra,
  };
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
  await c.query(
    "insert into notifications (tenant_id, audience, reservation_id, trip_id, type, title, body, is_demo) values ($1,$2,$3,$4,$5,$6,$7,$8)",
    [audience === "customer" ? r.customer_id : r.carrier_id, audience, reservationId, r.trip_id, type, fill(title).slice(0, 200), fill(body).slice(0, 500), Boolean(r.is_demo)]);
}
