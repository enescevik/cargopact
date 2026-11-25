import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, MapPin, Truck } from "lucide-react";
import { api, ApiError } from "../api";
import type { CarrierTrip, Facility } from "../types";
import { addDays, dayNum, localToIso, num, tl, today, weekday } from "../format";
import { ErrorBox, Skeleton, useFetch, useToast } from "../ui";
import { ChipSelect, OptionCard, Segmented, Stepper } from "../components/controls";
import { TruckMap, type Cell } from "../components/TruckMap";
import { roadKm } from "../lib/carbon";

type Vehicle = { id: string; plate: string; vehicleTypeId?: string; driverName?: string; status?: string; active?: boolean; vehicleType?: { name?: string } };
type VType = { id: string; code: string; name: string; palletPositions: number; maxPayloadKg?: number };

const TIMES = ["06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00"];
const round50 = (n: number) => Math.max(50, Math.round(n / 50) * 50);

/** "Aracım var, yük ekle": tek ekranda yönlendirmeli sihirbaz; sağda canlı araç önizlemesi. */
export function NewTripWizard({ onCreated }: { onCreated: (id: string) => void }) {
  const toast = useToast();
  const fac = useFetch((s) => api<{ items: Facility[] }>("GET", "/carrier/facilities", undefined, { signal: s }), []);
  const veh = useFetch((s) => api<{ items: Vehicle[] }>("GET", "/carrier/vehicles", undefined, { signal: s }), []);
  const vts = useFetch((s) => api<{ items: VType[] }>("GET", "/catalog/vehicle-types", undefined, { signal: s }), []);

  const all = fac.data?.items ?? [];
  const isHub = (x: Facility) => !x.kind || /transfer|hub|terminal/i.test(x.kind);
  const origins = all.filter((x) => (all.some((y) => y.kind) ? isHub(x) : true));
  const dests = all.filter((x) => (all.some((y) => y.kind) ? !isHub(x) : true));
  const vehicles = (veh.data?.items ?? []).filter((v) => v.active !== false && v.status !== "inactive");
  const vtype = (v?: Vehicle) => vts.data?.items.find((t) => t.id === v?.vehicleTypeId);

  const [o, setO] = useState<string | null>(null);
  const [d, setD] = useState<string | null>(null);
  const [vId, setVId] = useState<string | null>(null);
  const [day, setDay] = useState(addDays(today(), 1));
  const [tm, setTm] = useState("18:00");
  const [dur, setDur] = useState<number | null>(null);
  const [intP, setIntP] = useState<number | null>(null);
  const [intKg, setIntKg] = useState<number | null>(null);
  const [maxKg, setMaxKg] = useState<number | null>(null);
  const [sKg, setSKg] = useState<number | null>(null);
  const [sM3, setSM3] = useState<number | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [publish, setPublish] = useState<"yes" | "no">("yes");

  useEffect(() => { if (!o && origins[0]) setO(origins[0].id); }, [origins, o]);
  useEffect(() => { if (!vId && vehicles[0] && vts.data) setVId((vehicles.find((v) => vtype(v)?.palletPositions === 33) ?? vehicles[0]).id); }, [vehicles, vId, vts.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const O = all.find((x) => x.id === o), D = all.find((x) => x.id === d);
  const V = vehicles.find((v) => v.id === vId);
  const VT = vtype(V);
  const positions = VT?.palletPositions ?? 33;
  const km = O && D ? roadKm(O, D) : null;
  const suggestedDur = km ? Math.max(2, Math.round(km / 70 + 1)) : 5;
  const suggestedPrice = km ? round50(350 + km * 2.4) : 1000;

  // araç değişince kapasite varsayılanları
  useEffect(() => {
    const ip = Math.max(0, positions - Math.max(2, Math.round(positions / 4)));
    const mk = VT?.maxPayloadKg ?? 22000;
    setIntP(ip); setMaxKg(mk);
    const ik = Math.round((ip * 680) / 10) * 10; setIntKg(ik);
    setSKg(Math.max(0, Math.round((mk - ik) / 100) * 100));
    setSM3(Math.round((positions - ip) * 1.5 * 10) / 10);
  }, [positions, VT?.maxPayloadKg]);
  useEffect(() => { setDur(null); setPrice(null); }, [o, d]);

  const sP = positions - (intP ?? 0);
  const duration = dur ?? suggestedDur;
  const base = price ?? suggestedPrice;
  const depIso = localToIso(`${day}T${tm}`);
  const etaIso = new Date(Date.parse(depIso) + duration * 3600e3).toISOString();
  const kgOver = (intKg ?? 0) + (sKg ?? 0) > (maxKg ?? 0);
  const ok = !!(o && d && vId && o !== d && sP > 0 && !kgOver);

  const cells: Cell[] = useMemo(() => Array.from({ length: intP ?? 0 }, () => ({ state: "int" as const })), [intP]);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  async function submit() {
    setBusy(true); setErr(null);
    try {
      const t = await api<CarrierTrip>("POST", "/carrier/trips", {
        originFacilityId: o, destinationFacilityId: d, vehicleId: vId, departureAt: depIso, arrivalEta: etaIso,
        internalPallets: intP, internalKg: intKg, maxGrossKg: maxKg, sellablePallets: sP, sellableKg: sKg, sellableM3: sM3,
        basePriceMinor: base * 100, publish: publish === "yes",
      }, { idempotencyKey: key });
      toast("Sefer oluşturuldu.", "ok");
      onCreated(t.id);
    } catch (e) { setErr(e as ApiError); } finally { setBusy(false); }
  }

  if (fac.loading || veh.loading) return <div className="wizard"><Skeleton h={500} /><Skeleton h={500} /></div>;
  const loadErr = fac.error ?? veh.error;

  return (
    <div className="wizard">
      <section className="panel wiz-main" aria-label="Sefer bilgileri">
        <div className="pane-scroll">
          <div className="eyebrow">Kapasite yayınla</div>
          <h1 className="route-h">Aracım var, yük ekle</h1>
          {loadErr && <ErrorBox error={loadErr} />}

          <Step n={1} title="Rota" done={!!(o && d)}>
            <span className="lbl">Çıkış transfer merkezi</span>
            <div className="tiles">
              {origins.map((f) => <OptionCard key={f.id} on={o === f.id} onClick={() => { setO(f.id); if (d === f.id) setD(null); }}><b><MapPin size={13} /> {f.district ?? f.city}</b><small>{f.name}</small></OptionCard>)}
            </div>
            <span className="lbl">Varış dağıtım merkezi</span>
            <div className="tiles">
              {dests.filter((f) => f.id !== o).map((f) => <OptionCard key={f.id} on={d === f.id} onClick={() => setD(f.id)}><b><MapPin size={13} /> {f.district ?? f.city}</b><small>{f.name}{O && roadKm(O, f) ? ` · ~${Math.round(roadKm(O, f)!)} km` : ""}</small></OptionCard>)}
            </div>
          </Step>

          <Step n={2} title="Araç ve zaman" done={!!vId}>
            <div className="tiles">
              {vehicles.map((v) => { const t = vtype(v); return (
                <OptionCard key={v.id} on={vId === v.id} onClick={() => setVId(v.id)}><b><Truck size={13} /> <span className="mono">{v.plate}</span></b><small>{t ? `${t.name} · ${t.palletPositions} palet` : v.driverName ?? ""}</small></OptionCard>
              ); })}
            </div>
            <span className="lbl">Kalkış günü</span>
            <ChipSelect size="sm" value={day} onChange={setDay} options={Array.from({ length: 7 }, (_, i) => addDays(today(), i)).map((x) => ({ value: x, label: <>{weekday(x)} <b>{dayNum(x)}</b></> }))} />
            <span className="lbl">Kalkış saati (İstanbul)</span>
            <ChipSelect size="sm" value={tm} onChange={setTm} options={TIMES.map((x) => ({ value: x, label: x }))} />
            <span className="lbl">Yol süresi {km ? <span className="hint">· ~{Math.round(km)} km, önerilen {suggestedDur} sa</span> : null}</span>
            <div className="row wrap" style={{ gap: 8 }}>
              <ChipSelect size="sm" value={dur == null ? suggestedDur : dur} onChange={setDur}
                options={[...new Set([3, 5, 8, 10, 12, suggestedDur])].sort((a, b) => a - b).map((h) => ({ value: h, label: `${h} sa`, sub: h === suggestedDur ? "önerilen" : undefined }))} />
            </div>
          </Step>

          <Step n={3} title="Kapasite" done={sP > 0 && !kgOver}>
            <div className="grid-steps">
              <div><span className="lbl">İç yük (palet)</span><Stepper value={intP ?? 0} min={0} max={positions - 1} onChange={setIntP} /></div>
              <div><span className="lbl">Satışa açık palet</span><Stepper value={sP} min={1} max={positions} onChange={(v) => setIntP(positions - v)} /></div>
              <div><span className="lbl">İç yük ağırlığı</span><Stepper value={intKg ?? 0} min={0} max={maxKg ?? 40000} step={100} unit=" kg" onChange={setIntKg} /></div>
              <div><span className="lbl">Azami brüt</span><Stepper value={maxKg ?? 0} min={1000} max={40000} step={500} unit=" kg" onChange={setMaxKg} /></div>
              <div><span className="lbl">Satışa açık ağırlık</span><Stepper value={sKg ?? 0} min={0} max={40000} step={100} unit=" kg" onChange={setSKg} /></div>
              <div><span className="lbl">Satışa açık hacim</span><Stepper value={sM3 ?? 0} min={0} max={120} step={0.5} unit=" m³" onChange={setSM3} /></div>
            </div>
            {kgOver && <div className="alert warn">İç yük + satışa açık ağırlık ({num((intKg ?? 0) + (sKg ?? 0))} kg) azami brütü ({num(maxKg ?? 0)} kg) aşıyor.</div>}
          </Step>

          <Step n={4} title="Fiyat ve yayın" done>
            <span className="lbl">Palet başı baz fiyat</span>
            <div className="row wrap" style={{ gap: 10 }}>
              <ChipSelect size="sm" value={base} onChange={setPrice} options={[
                { value: round50(suggestedPrice * 0.85), label: "Ekonomik", sub: tl(round50(suggestedPrice * 0.85) * 100).replace(",00", "") },
                { value: suggestedPrice, label: "Önerilen", sub: tl(suggestedPrice * 100).replace(",00", "") },
                { value: round50(suggestedPrice * 1.2), label: "Premium", sub: tl(round50(suggestedPrice * 1.2) * 100).replace(",00", "") },
              ]} />
              <Stepper value={base} min={50} max={20000} step={50} unit=" ₺" onChange={setPrice} />
            </div>
            <div className="hint">Talep ve kalkışa kalan süreye göre dinamik fiyat bu tabandan hesaplanır.</div>
            <span className="lbl">Yayın</span>
            <Segmented value={publish} onChange={setPublish} options={[{ value: "yes", label: "Hemen yayınla" }, { value: "no", label: "Taslak kaydet" }]} />
          </Step>
        </div>
      </section>

      <aside className="noir wiz-side" aria-label="Önizleme">
        <div className="pane-scroll">
          <span className="eyebrow light">Önizleme</span>
          <div className="q-route">{O ? (O.district ?? O.city) : "Çıkış"} → {D ? (D.district ?? D.city) : "Varış"}</div>
          <div className="q-sub">{weekday(day)} {dayNum(day)} · {tm} → {new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" }).format(new Date(etaIso))} · {V?.plate ?? "araç"}</div>
          <div className="truck-dark"><TruckMap operator positions={positions} cells={cells} compact /></div>
          <div className="kv light"><span>Satışa açık</span><b>{sP} palet · {num(sKg ?? 0)} kg · {num(sM3 ?? 0)} m³</b></div>
          <div className="kv light"><span>Baz fiyat</span><b>{tl(base * 100)} / palet</b></div>
          <div className="kv light"><span>Tam dolulukta brüt</span><b className="mintc">{tl(base * 100 * sP)}</b></div>
          <div className="kv light"><span>Durum</span><b>{publish === "yes" ? "Müşterilere açık" : "Taslak"}</b></div>
        </div>
        <div className="quote-foot">
          {err && <ErrorBox error={err} />}
          <button className="btn cta block" disabled={!ok || busy} onClick={submit}>{busy ? "Oluşturuluyor…" : <>Seferi oluştur <ArrowRight size={17} /></>}</button>
          {!d && <div className="tiny light center">Varış merkezini seçin.</div>}
        </div>
      </aside>
    </div>
  );
}

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <section className="wstep">
      <div className="wstep-h"><span className={`wnum ${done ? "done" : ""}`}>{done ? <Check size={13} strokeWidth={3} /> : n}</span><h3 className="h3">{title}</h3></div>
      <div className="wstep-b">{children}</div>
    </section>
  );
}
