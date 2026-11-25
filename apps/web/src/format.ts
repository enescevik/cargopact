const TZ = "Europe/Istanbul";
const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
export const tl = (minor: number) => money.format(minor / 100);
export const num = (n: number) => new Intl.NumberFormat("tr-TR").format(n);

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, ...o });
const fDT = fmt({ day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const fT = fmt({ hour: "2-digit", minute: "2-digit" });
const fD = fmt({ weekday: "short", day: "2-digit", month: "long" });
const fFull = fmt({ day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export const dt = (iso: string) => fDT.format(new Date(iso));
export const time = (iso: string) => fT.format(new Date(iso));
export const day = (iso: string) => fD.format(new Date(iso));
export const full = (iso: string) => fFull.format(new Date(iso));

/** datetime-local (İstanbul duvar saati, UTC+3) -> ISO */
export function localToIso(v: string): string {
  return new Date(`${v}:00+03:00`).toISOString();
}
/** ISO -> datetime-local (İstanbul) */
export function isoToLocal(iso: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export const pct = (n: number) => `%${Math.round(n * 100)}`;

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toLocaleUpperCase("tr-TR")).join("");
