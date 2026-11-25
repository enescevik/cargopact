import { createHash } from "node:crypto";
import { CONTRACT_CODE, CONTRACT_TITLE, CONTRACT_VERSION, renderContract, signPreview, type ContractValues } from "@cargopact/domain";
import type { Q } from "./trips";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const iso = (d: unknown): string => (d instanceof Date ? d.toISOString() : String(d));
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const windowText = (w: { from?: string; to?: string } | null | undefined) => (w?.from && w?.to ? `${w.from}–${w.to}` : null);

export interface ContractInput {
  trip: Row; customerName: string; productClassName: string;
  pallets: number; grossKg: number; volumeM3: number;
  unitPriceMinor: number; totalPriceMinor: number; paymentPlan: "full" | "deposit"; depositPercent: number;
}
const valuesOf = (i: ContractInput): ContractValues => ({
  customerName: i.customerName, carrierName: i.trip.carrier_name, tripReference: i.trip.reference,
  originName: i.trip.o_name, destinationName: i.trip.d_name,
  departureAt: new Date(i.trip.departure_at), bookingCutoffAt: new Date(i.trip.booking_cutoff_at), intakeCutoffAt: new Date(i.trip.intake_cutoff_at),
  pickupWindow: windowText(i.trip.d_pickup), pallets: i.pallets, grossKg: i.grossKg, volumeM3: i.volumeM3, productClass: i.productClassName,
  unitPriceMinor: i.unitPriceMinor, totalPriceMinor: i.totalPriceMinor, paymentPlan: i.paymentPlan, depositPercent: i.depositPercent,
});

/** Önizleme metni (imza alanları "—") ve parmak izi. Zamana bağlı hiçbir değer içermez. */
export function previewContract(i: ContractInput) {
  const renderedMarkdown = renderContract(valuesOf(i));
  return { contractCode: CONTRACT_CODE, version: CONTRACT_VERSION, isDraft: true as const, title: CONTRACT_TITLE, renderedMarkdown, renderedHash: sha256(renderedMarkdown) };
}

/** Kabul kaydındaki metin, imza bölümü dolu. */
export const signedFromAcceptance = (a: Row) => signPreview(a.rendered_markdown, { signerName: a.signer_name, acceptedAt: new Date(a.accepted_at), contractHash: a.rendered_hash });

export async function loadAcceptances(q: Q, ids: string[]): Promise<Map<string, Row>> {
  if (ids.length === 0) return new Map();
  const { rows } = await q.query("select * from contract_acceptances where reservation_id = any($1::uuid[])", [ids]);
  return new Map(rows.map((r) => [r.reservation_id, r]));
}
export const contractView = (a?: Row) => a ? { version: a.version as string, signerName: a.signer_name as string, acceptedAt: iso(a.accepted_at), renderedHash: a.rendered_hash as string } : null;
