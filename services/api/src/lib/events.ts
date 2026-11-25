import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import type pg from "pg";
import { withTx } from "@cargopact/db";

export const EVENT_SOURCE = "cargopact.api";
export const busName = (): string => process.env.EVENT_BUS_NAME ?? "cargopact-events";
const BATCH = 100;
const LAG_SECONDS = 3; // commit sırası farkı için kısa gecikme (DSQL'de created_at ≠ commit sırası)

const WAREHOUSE: Record<string, string> = {
  DEPO_KABUL: "warehouse.received", YUKLENDI: "warehouse.loaded", VARISTA: "shipment.arrived",
  TESLIM: "shipment.delivered", EKSIK_HASAR: "shipment.damaged", GELMEDI: "reservation.no_show",
};
/** audit_log eylemini olay türüne çevirir; null = dışarı yayınlanmaz. */
export function detailTypeOf(action: string): string | null {
  const direct: Record<string, string> = {
    "reservation.create": "reservation.requested", "reservation.approve": "reservation.approved",
    "reservation.reject": "reservation.rejected", "reservation.cancel": "reservation.cancelled", "trip.create": "trip.created",
  };
  if (direct[action]) return direct[action];
  if (action.startsWith("reservation.event.")) return WAREHOUSE[action.slice("reservation.event.".length)] ?? null;
  const tripMap: Record<string, string> = { "trip.publish": "trip.published", "trip.close": "trip.closed", "trip.cancel": "trip.cancelled" };
  if (tripMap[action]) return tripMap[action];
  return null;
}

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export interface DomainEvent { id: string; detailType: string; occurredAt: string; detail: Record<string, unknown> }

/** Kişisel veri içermez: yalnız kimlikler, durum ve izleme alanları. */
export function toEvent(r: Row, carrierId: string): DomainEvent | null {
  const detailType = detailTypeOf(r.action);
  if (!detailType) return null;
  const after = (r.after_state ?? {}) as Row;
  const occurredAt = (r.created_at as Date).toISOString();
  return {
    id: r.id, detailType, occurredAt,
    detail: {
      eventId: r.id, version: 1, carrierId, entityType: r.entity_type, entityId: r.entity_id, action: r.action,
      tripId: r.trip_id ?? after.tripId ?? (r.entity_type === "trip" ? r.entity_id : null),
      orderNumber: r.order_number ?? after.orderNumber ?? null,
      status: after.status ?? null, correlationId: r.correlation_id, occurredAt,
    },
  };
}

export interface FlushResult { carrierId: string; scanned: number; published: number; error?: string }

const SELECT = `select a.id, a.action, a.entity_type, a.entity_id, a.after_state, a.correlation_id, a.created_at, a.created_at::text as created_text, r.order_number, r.trip_id
  from audit_log a left join reservations r on a.entity_type = 'reservation' and r.id = a.entity_id
  where (a.tenant_id = $1 or r.carrier_id = $1)
    and (a.created_at > $2::timestamptz or (a.created_at = $2::timestamptz and a.id > $3))
    and a.created_at < now() - interval '${LAG_SECONDS} seconds'
  order by a.created_at, a.id limit ${BATCH}`;

/** Bir taşıyıcının yeni audit_log satırlarını EventBridge'e yayınlar ve imleci ilerletir (en az bir kez). */
export async function flushCarrier(pool: pg.Pool, carrierId: string, eb = new EventBridgeClient({})): Promise<FlushResult> {
  return withTx(pool, async (c) => {
    await c.query(
      "insert into integration_cursors (carrier_id, last_created_at, last_audit_id) values ($1, now() - interval '15 minutes', '00000000-0000-0000-0000-000000000000') on conflict do nothing", [carrierId]);
    const cur = (await c.query("select last_created_at::text as last_created_at, last_audit_id from integration_cursors where carrier_id = $1 for update", [carrierId])).rows[0];
    const rows = (await c.query(SELECT, [carrierId, cur.last_created_at, cur.last_audit_id])).rows;
    if (rows.length === 0) return { carrierId, scanned: 0, published: 0 };
    const events = rows.map((r) => ({ row: r, ev: toEvent(r, carrierId) }));
    let published = 0, lastOk: Row | undefined, error: string | undefined;
    for (let i = 0; i < events.length && !error; i += 10) {
      const chunk = events.slice(i, i + 10);
      const send = chunk.filter((x) => x.ev);
      if (send.length > 0) {
        const out = await eb.send(new PutEventsCommand({
          Entries: send.map((x) => ({ EventBusName: busName(), Source: EVENT_SOURCE, DetailType: x.ev!.detailType, Time: new Date(x.ev!.occurredAt), Detail: JSON.stringify(x.ev!.detail) })),
        }));
        // Başarısız girdi varsa imleç yalnız ilk başarısızdan önceki satıra kadar ilerler.
        const failedAt = (out.Entries ?? []).findIndex((e) => e.ErrorCode);
        if (failedAt >= 0) {
          const okSend = send.slice(0, failedAt);
          published += okSend.length;
          const upTo = chunk.indexOf(send[failedAt]);
          if (upTo > 0) lastOk = chunk[upTo - 1].row;
          error = `${out.FailedEntryCount} olay yayınlanamadı: ${out.Entries![failedAt].ErrorCode}`;
          break;
        }
        published += send.length;
      }
      lastOk = chunk[chunk.length - 1].row;
    }
    if (lastOk) {
      await c.query(
        `update integration_cursors set last_created_at = $2::timestamptz, last_audit_id = $3, published_count = published_count + $4,
           last_published_at = case when $4 > 0 then now() else last_published_at end, last_error = $5, updated_at = now() where carrier_id = $1`,
        [carrierId, lastOk.created_text, lastOk.id, published, error ?? null]);
    } else if (error) {
      await c.query("update integration_cursors set last_error = $2, updated_at = now() where carrier_id = $1", [carrierId, error]);
    }
    return { carrierId, scanned: rows.length, published, error };
  });
}

export async function flushAll(pool: pg.Pool, eb?: EventBridgeClient): Promise<FlushResult[]> {
  const carriers = (await pool.query("select id from tenants where type = 'carrier' and status = 'active'")).rows;
  const out: FlushResult[] = [];
  for (const t of carriers) {
    try { out.push(await flushCarrier(pool, t.id, eb)); }
    catch (e) { out.push({ carrierId: t.id, scanned: 0, published: 0, error: (e as Error).message }); }
  }
  return out;
}

export async function integrationStatus(pool: pg.Pool, carrierId: string) {
  const r = (await pool.query("select last_published_at, published_count, last_error from integration_cursors where carrier_id = $1", [carrierId])).rows[0];
  return {
    bus: busName(), source: EVENT_SOURCE, lastPublishedAt: r?.last_published_at ? (r.last_published_at as Date).toISOString() : null,
    publishedCount: Number(r?.published_count ?? 0), lastError: r?.last_error ?? null, queueDepth: null as number | null,
  };
}
