"""Asistanın elle yapılan işleri yapabilmesi için yazma araçları.

Güvenlik modeli (plan §4/§6: "Q yazma çağrısında kullanıcı formu teyit eder; backend iş koşullarını ve yetkiyi tekrar denetler"):
- Her yazma aracı İKİ ADIMLIDIR ve teyit KODDA zorunludur, modelin sözüne bırakılmaz:
  1) İlk çağrı hiçbir şey yazmaz; önizleme (teklif / iade / uygunluk) ve özet döner, işlem "bekleyen" olarak bu oturuma kaydedilir.
  2) İşlem ancak (a) aynı oturumda aynı işlem önceden önizlenmişse VE (b) kullanıcının BU TURDAKİ mesajı açık bir teyitse çalışır.
- Kimlik/kiracı yalnız kullanıcının token'ından gelir; backend rol, kiracı, kapasite ve zaman kurallarını yeniden doğrular.
- Idempotency-Key oturum + işlem içeriğinden türetilir; aynı teyidin tekrarı ikinci kayıt üretmez.
- Kart numarası sohbette İSTENMEZ: ödeme demo ortamında simüle kayıtlı kartla (•••• 4242) yapılır.
"""
import hashlib
import json
import re
import threading
import time
import urllib.parse
from datetime import datetime
from zoneinfo import ZoneInfo

from strands import tool

from .tools import _out, _slim_res, _slim_trip, _tr, api_call, read_call

_TR = ZoneInfo("Europe/Istanbul")
_PENDING: dict[str, dict[str, dict]] = {}   # session_id -> {action_key: {summary, at}}
_LOCK = threading.Lock()
_PENDING_TTL = 30 * 60

_CONFIRM_RE = re.compile(
    r"^\s*(evet|onayl[ıi]yorum|onayla|onay|onaylıyorum|tamam|kabul( ediyorum)?|olur|uygundur|yap|gönder|devam|"
    r"rezervasyonu (yap|oluştur)|teklifi kabul|evet onayl[ıi]yorum)\b", re.IGNORECASE)
_NEGATIVE_RE = re.compile(r"\b(hayır|hayir|iptal etme|vazgeç|vazgec|dur|bekle|istemiyorum|yapma)\b", re.IGNORECASE)

SIMULATED_CARD_LAST4 = "4242"


def is_confirmation(message: str) -> bool:
    m = (message or "").strip()
    return bool(m) and len(m) <= 120 and bool(_CONFIRM_RE.search(m)) and not _NEGATIVE_RE.search(m)


def _key(action: str, args: dict) -> str:
    return action + ":" + hashlib.sha256(json.dumps(args, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:24]


def _gate(token, action: str, args: dict, summary: dict) -> dict | None:
    """None → işlemi yap. Aksi halde (önizleme) modele dönecek yanıt."""
    sess = getattr(token, "session_id", "") or "nosession"
    turn = getattr(token, "correlation_id", "") or str(id(token))
    k = _key(action, args)
    now = time.time()
    with _LOCK:
        pend = {a: v for a, v in _PENDING.get(sess, {}).items() if now - v["at"] < _PENDING_TTL}
        _PENDING[sess] = pend
        # Önizleme ÖNCEKİ bir turda yapılmış olmalı: kullanıcı sunucunun özetini görmeden aynı turda teyit sayılmaz.
        previewed = k in pend and pend[k]["turn"] != turn
        confirmed = is_confirmation(getattr(token, "user_message", ""))
        if previewed and confirmed:
            pend.pop(k, None)
            return None
        if k in pend and pend[k]["turn"] == turn:
            return {"needsConfirmation": True, "executed": False, "action": action, "summary": pend[k]["summary"],
                    "instruction": "Bu işlem bu turda zaten önizlendi. Aracı tekrar çağırma; özeti göster ve kullanıcının teyidini bekle."}
        pend[k] = {"summary": summary, "at": now, "turn": turn}
    return {
        "needsConfirmation": True,
        "executed": False,
        "action": action,
        "summary": summary,
        "instruction": ("HENÜZ HİÇBİR ŞEY YAPILMADI. Bu özeti kullanıcıya göster ve açıkça 'Onaylıyor musunuz?' diye sor. "
                        "Kullanıcı bir SONRAKİ mesajında 'evet/onaylıyorum' derse bu aracı AYNI parametrelerle tekrar çağır."
                        + (" (Kullanıcının bu mesajı teyit sayıldı ama işlem bu oturumda daha önce önizlenmemişti; önce önizleme gösterildi.)" if confirmed else "")),
    }


def _idem(token, action: str, args: dict) -> str:
    return "agent-" + hashlib.sha256(f"{getattr(token, 'session_id', '')}|{_key(action, args)}".encode()).hexdigest()[:40]


def _istanbul_to_iso(local: str) -> str | None:
    """'2026-11-26 18:00' veya '26.11.2026 18:00' (İstanbul) → ISO UTC."""
    s = (local or "").strip()
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M", "%d.%m.%Y %H:%M", "%d/%m/%Y %H:%M"):
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=_TR).isoformat()
        except ValueError:
            continue
    return None


def _tl(minor) -> str:
    try:
        return f"{int(minor) / 100:,.2f} TL".replace(",", "X").replace(".", ",").replace("X", ".")
    except Exception:
        return str(minor)


# ------------------------------------------------------------------ müşteri
def build_customer_write_tools(token) -> list:
    def _find_reservation(ref: str) -> dict | None:
        r = read_call(token, "my_reservations", {}, "/customer/reservations")
        for x in r.get("items", []):
            if ref and ref.strip().upper() in (str(x.get("id")).upper(), str(x.get("reference")).upper(), str(x.get("orderNumber") or "").upper()):
                return x
        return None

    @tool
    def create_reservation(tripId: str, pallets: int, grossKg: float, productClassCode: str, paymentPlan: str,
                           volumeM3: float = 0, recipientName: str = "", alternativeScenario: str = "") -> str:
        """Seferde yer ayır (teklifi kabul et). ZORUNLU bilgiler: tripId (search_trips sonucundaki id), pallets, grossKg (toplam brüt kg),
        productClassCode (GENEL, GIDA-AMBALAJLI, KIRILGAN, TEHLIKELI), paymentPlan ('full' = tamamı peşin, 'deposit' = %30 kapora).
        Opsiyonel: volumeM3 (verilmezse sistem hesaplar), recipientName (varışta teslim alacak kişi),
        alternativeScenario ('dedicated' = ayrı araçla gönderirdim, 'groupage' = parsiyel/ambar ile gönderirdim; kullanıcı belirtmediyse veya istemediyse BOŞ bırak).
        Onay, taslak taşıma sözleşmesinin elektronik kabulünü de içerir; özet sözleşme bilgisini gösterir.
        Eksik zorunlu bilgi varsa ÇAĞIRMA, kullanıcıya sor. İlk çağrı yalnız önizleme döner; kullanıcı onaylayınca aynı parametrelerle tekrar çağır."""
        plan = (paymentPlan or "").strip().lower()
        plan = {"peşin": "full", "pesin": "full", "tamamı": "full", "kapora": "deposit"}.get(plan, plan)
        if plan not in ("full", "deposit"):
            return _out({"error": True, "message": "paymentPlan 'full' (tamamı) veya 'deposit' (%30 kapora) olmalı; kullanıcıya sor."})
        scen = (alternativeScenario or "").strip().lower()
        scen = {"ayrı araç": "dedicated", "ayri arac": "dedicated", "parsiyel": "groupage", "ambar": "groupage"}.get(scen, scen)
        if scen not in ("dedicated", "groupage"):
            scen = ""
        args = {"tripId": tripId, "pallets": int(pallets), "grossKg": float(grossKg), "productClassCode": productClassCode.strip().upper(),
                "paymentPlan": plan, "volumeM3": float(volumeM3 or 0), "recipientName": (recipientName or "").strip(),
                "alternativeScenario": scen or None}
        q_body = {"pallets": args["pallets"], "grossKg": args["grossKg"], "productClassCode": args["productClassCode"]}
        if args["volumeM3"]:
            q_body["volumeM3"] = args["volumeM3"]
        if scen:
            q_body["alternativeScenario"] = scen
        q = api_call(token, "POST", f"/customer/trips/{urllib.parse.quote(tripId, safe='')}/quote", body=q_body)
        if q.get("error"):
            return _out(q)
        if not q.get("eligible"):
            return _out({"eligible": False, "executed": False, "reasons": q.get("reasons"),
                         "instruction": "Talep uygun değil; gerekçeleri kullanıcıya açıkla, değer değiştirmek isterse yeniden dene."})
        price = q.get("price") or {}
        plans = {p.get("code"): p for p in q.get("paymentPlans") or []}
        cp_body = dict(q_body, paymentPlan=plan)
        if args["recipientName"]:
            cp_body["recipientName"] = args["recipientName"]
        cp = api_call(token, "POST", f"/customer/trips/{urllib.parse.quote(tripId, safe='')}/contract-preview", body=cp_body)
        if cp.get("error"):
            return _out({"error": True, "executed": False, "message": "Sözleşme önizlemesi alınamadı; işlem yapılmadı. " + str(cp.get("message") or "")})
        signer = getattr(token, "display_name", "") or "Kullanıcı"
        rhash = cp.get("renderedHash") or ""
        args["renderedHash"] = rhash       # sözleşme değişirse kapı anahtarı değişir → yeniden teyit
        carbon = q.get("carbon") or {}
        carbon_txt = None
        if carbon:
            carbon_txt = f"Yükünüzün payına düşen emisyon ≈ {carbon.get('allocatedKg')} kg CO₂e"
            if carbon.get("savedKg") is not None:
                carbon_txt += f"; seçtiğiniz alternatife göre tahmini tasarruf ≈ {carbon.get('savedKg')} kg CO₂e"
            carbon_txt += " (demo katsayıları, tahmini)"
        summary = {
            "işlem": "Rezervasyon talebi (taşıyıcı onayına gider)",
            "seferId": tripId, "palet": args["pallets"], "brütKg": args["grossKg"], "ürünSınıfı": args["productClassCode"],
            "hacimM3": args["volumeM3"] or "sistem hesaplar",
            "paletBaşı": _tl(price.get("unitPriceMinor")), "toplam": _tl(price.get("totalPriceMinor")),
            "fiyatAçıklaması": (price.get("breakdown") or {}).get("explanation"),
            "ödemePlanı": "Tamamı peşin" if plan == "full" else "%30 kapora, kalan depo kabulünde",
            "şimdiÇekilecek": _tl((plans.get(plan) or {}).get("dueNowMinor")),
            "ödemeYöntemi": f"Simüle kayıtlı kart •••• {SIMULATED_CARD_LAST4} (demo)",
            "sonRezervasyon_T-3": _tr(q.get("bookingCutoffAt")), "çıkışDeposuSonKabul_T-1": _tr(q.get("intakeCutoffAt")),
            "iptalKoşulları": q.get("cancellationPolicy"), "teslimAlacakKişi": args["recipientName"] or "(belirtilmedi)",
            "karbon_AYNEN_GÖSTER": carbon_txt,
            "sözleşme_AYNEN_GÖSTER": "\n".join([
                f"Sözleşme: {cp.get('title')} · sürüm {cp.get('version') or '1.0-taslak'} · TASLAK – hukuki inceleme yapılmamıştır",
                "- Yük en geç çıkış deposu son kabul (T−1) saatine kadar getirilir: " + str(_tr(q.get("intakeCutoffAt"))),
                "- İptal: 24 saatten fazla %100, 24 saat–T−3 arası %50, sonrası %0 iade",
                "- Depo ölçümü beyandan %3 farka kadar tolerans; fazlası incelemeye alınır",
                "- Varışta yalnız yetkili alıcıya ve teslim koduyla teslim: " + (args["recipientName"] or "(alıcı belirtilmedi)"),
                f"- Sözleşme özeti (SHA-256): {rhash[:12]}",
                f"Onaylamanız, bu taslak sözleşmeyi {signer} adına elektronik olarak kabul etmeniz anlamına gelir.",
            ]),
        }
        gate = _gate(token, "create_reservation", args, summary)
        if gate:
            return _out(gate)
        body = {k: v for k, v in q_body.items()}
        body["contract"] = {"version": cp.get("version") or "1.0-taslak", "renderedHash": rhash, "signerName": signer, "accepted": True}
        body.update({"tripId": tripId, "paymentPlan": plan,
                     "card": {"holder": getattr(token, "display_name", "") or "CargoPact Demo", "number": "4242 4242 4242 4242", "expiry": "12/30", "cvc": "123"}})
        if args["recipientName"]:
            body["recipientName"] = args["recipientName"]
        r = api_call(token, "POST", "/customer/reservations", body=body, idempotency_key=_idem(token, "create_reservation", args))
        if r.get("error"):
            if r.get("status") == 409 and r.get("code") == "CONTRACT_STALE":
                return _out({"error": True, "executed": False, "code": "CONTRACT_STALE",
                             "message": "Sözleşme metni/koşullar değişti. İşlem yapılmadı. Aynı parametrelerle aracı yeniden çağırarak yeni önizlemeyi al ve kullanıcıdan tekrar teyit iste."})
            return _out(r)
        return _out({"executed": True, "reservation": _slim_res(r), "note": "Talep oluşturuldu; taşıyıcı onayı bekleniyor. Referansı kullanıcıya ver."})

    @tool
    def cancel_reservation(reservation: str, reason: str = "") -> str:
        """Kendi rezervasyonunu iptal et. reservation: BV-... referansı, CP-... sipariş no veya id. İlk çağrı iade/ücret önizlemesi döner; onayla tekrar çağır."""
        x = _find_reservation(reservation)
        if not x:
            return _out({"error": True, "message": "Bu referansla rezervasyon bulunamadı; kullanıcıdan referansı iste (my_reservations ile listeleyebilirsin)."})
        prev = api_call(token, "GET", f"/customer/reservations/{x['id']}/cancel-preview")
        if prev.get("error"):
            return _out(prev)
        args = {"id": x["id"], "reason": (reason or "").strip()}
        summary = {"işlem": "Rezervasyon iptali", "rezervasyon": x.get("reference"), "siparişNo": x.get("orderNumber"),
                   "durum": x.get("statusLabel"), "iade": _tl(prev.get("refundMinor")), "kesinti": _tl(prev.get("feeMinor")), "kural": prev.get("rule")}
        gate = _gate(token, "cancel_reservation", args, summary)
        if gate:
            return _out(gate)
        r = api_call(token, "POST", f"/customer/reservations/{x['id']}/cancel", body={"reason": args["reason"] or None},
                     idempotency_key=_idem(token, "cancel_reservation", args))
        return _out(r if r.get("error") else {"executed": True, "reservation": _slim_res(r)})

    @tool
    def set_recipients(reservation: str, recipients: str) -> str:
        """Varışta teslim alabilecek yetkili kişileri belirle (en çok 3). recipients: 'Ad Soyad; Ad Soyad | 05xx...' biçiminde, ';' ile ayrılmış; telefon isteğe bağlı '|' sonrası."""
        x = _find_reservation(reservation)
        if not x:
            return _out({"error": True, "message": "Rezervasyon bulunamadı; referansı sor."})
        people = []
        for part in [p.strip() for p in (recipients or "").split(";") if p.strip()][:3]:
            name, _, phone = part.partition("|")
            people.append({"name": name.strip(), **({"phone": phone.strip()} if phone.strip() else {})})
        if not people:
            return _out({"error": True, "message": "En az bir alıcı adı gerekli; kullanıcıya sor."})
        args = {"id": x["id"], "recipients": people}
        gate = _gate(token, "set_recipients", args, {"işlem": "Yetkili alıcıları güncelle", "rezervasyon": x.get("reference"), "alıcılar": people})
        if gate:
            return _out(gate)
        r = api_call(token, "PUT", f"/customer/reservations/{x['id']}/recipients", body={"recipients": people},
                     idempotency_key=_idem(token, "set_recipients", args))
        return _out(r if r.get("error") else {"executed": True, "reservation": _slim_res(r), "pickup": (r.get("pickup") or {}).get("recipients")})

    @tool
    def reservation_detail(reservation: str) -> str:
        """Kendi rezervasyonunun ayrıntısı (durum, ödeme, teslim kodu, olaylar). reservation: BV-..., CP-... veya id."""
        x = _find_reservation(reservation)
        if not x:
            return _out({"error": True, "message": "Rezervasyon bulunamadı."})
        r = api_call(token, "GET", f"/customer/reservations/{x['id']}")
        if r.get("error"):
            return _out(r)
        out = _slim_res(r)
        out["events"] = [{"label": e.get("label"), "at": _tr(e.get("at"))} for e in r.get("events") or []]
        out["pickup"] = r.get("pickup")
        out["payment"] = r.get("payment")
        out["carbon"] = r.get("carbon")
        c = r.get("contract")
        out["contract"] = ({"version": c.get("version"), "signerName": c.get("signerName"), "acceptedAtIstanbul": _tr(c.get("acceptedAt")),
                            "renderedHash": (c.get("renderedHash") or "")[:12]} if c else None)
        return _out(out)

    return [create_reservation, cancel_reservation, set_recipients, reservation_detail]


# ------------------------------------------------------------------ taşıyıcı
_EVENT_ALIASES = {
    "depoda kabul": "DEPO_KABUL", "kabul": "DEPO_KABUL", "depo_kabul": "DEPO_KABUL",
    "yüklendi": "YUKLENDI", "yukle": "YUKLENDI", "araca yüklendi": "YUKLENDI",
    "varışta": "VARISTA", "varista": "VARISTA", "vardı": "VARISTA",
    "teslim": "TESLIM", "teslim edildi": "TESLIM",
    "gelmedi": "GELMEDI", "eksik": "EKSIK_HASAR", "hasar": "EKSIK_HASAR", "eksik_hasar": "EKSIK_HASAR",
}


def build_carrier_write_tools(token) -> list:
    def _all_reservations() -> list[dict]:
        trips = read_call(token, "carrier_trips", {}, "/carrier/trips").get("items", [])
        out = []
        for t in trips:
            if t.get("status") not in ("published", "closed", "departed", "draft"):
                continue
            d = api_call(token, "GET", f"/carrier/trips/{t['id']}")
            for r in d.get("reservations", []) or []:
                r["_trip"] = t.get("reference")
                out.append(r)
        return out

    def _find(ref: str) -> dict | None:
        ref = (ref or "").strip().upper()
        for r in _all_reservations():
            if ref in (str(r.get("id")).upper(), str(r.get("reference")).upper(), str(r.get("orderNumber") or "").upper()):
                return r
        return None

    @tool
    def find_reservations(customerName: str = "", tripReference: str = "", status: str = "") -> str:
        """Taşıyıcının talep/rezervasyonlarını bul (müşteri adı, sefer referansı veya durum ile süz; durum örn. TASIYICI_ONAYI_BEKLIYOR, ONAYLI). Onay/ret/depo işlemi öncesi doğru kaydı bulmak için kullan."""
        items = _all_reservations()
        def fold(s):
            return str(s or "").translate(str.maketrans("İIıŞşĞğÜüÖöÇç", "iiissgguuoocc")).lower()
        res = [r for r in items
               if (not customerName or fold(customerName) in fold((r.get("customer") or {}).get("name")))
               and (not tripReference or tripReference.upper() == str(r.get("_trip")).upper())
               and (not status or status.upper() == str(r.get("status")).upper())]
        return _out({"items": [{**_slim_res(r), "trip": r.get("_trip"), "pickupRecipients": (r.get("pickup") or {}).get("recipients")} for r in res][:20]})

    @tool
    def decide_reservation(reservation: str, decision: str, reason: str = "") -> str:
        """Bekleyen talebi onayla veya reddet. reservation: BV-... referansı veya id. decision: 'approve' | 'reject'. Ret için reason ZORUNLU (yoksa kullanıcıya sor).
        İlk çağrı önizleme (uygunluk, öncelik, müşteri geçmişi) döner; kullanıcı onaylayınca aynı parametrelerle tekrar çağır."""
        d = {"onayla": "approve", "onay": "approve", "reddet": "reject", "ret": "reject"}.get((decision or "").strip().lower(), (decision or "").strip().lower())
        if d not in ("approve", "reject"):
            return _out({"error": True, "message": "decision 'approve' veya 'reject' olmalı."})
        if d == "reject" and not (reason or "").strip():
            return _out({"error": True, "message": "Ret gerekçesi zorunlu; kullanıcıya sor."})
        r = _find(reservation)
        if not r:
            return _out({"error": True, "message": "Talep bulunamadı; find_reservations ile ara veya referansı sor."})
        args = {"id": r["id"], "decision": d, "reason": (reason or "").strip()}
        summary = {"işlem": "Talebi ONAYLA" if d == "approve" else "Talebi REDDET", "talep": r.get("reference"), "sefer": r.get("_trip"),
                   "müşteri": (r.get("customer") or {}).get("name"), "palet": r.get("pallets"), "kg": r.get("grossKg"),
                   "tutar": _tl(r.get("totalPriceMinor")), "uygunluk": r.get("eligibility"), "öncelikSırası": r.get("priorityRank"),
                   "doğrulanmışGelmeme": r.get("verifiedNoShows"), "gerekçe": args["reason"] or None}
        gate = _gate(token, "decide_reservation", args, summary)
        if gate:
            return _out(gate)
        out = api_call(token, "POST", f"/carrier/reservations/{r['id']}/decision",
                       body={"decision": d, **({"reason": args["reason"]} if args["reason"] else {})},
                       idempotency_key=_idem(token, "decide_reservation", args))
        return _out(out if out.get("error") else {"executed": True, "reservation": _slim_res(out)})

    @tool
    def warehouse_event(reservation: str, eventType: str, measuredPallets: int = 0, measuredKg: int = 0,
                        recipientName: str = "", pickupCode: str = "", note: str = "") -> str:
        """Depo olayı kaydet. eventType: DEPO_KABUL (depoda kabul), YUKLENDI (araca yüklendi), VARISTA (varışta), TESLIM (teslim edildi), GELMEDI, EKSIK_HASAR.
        DEPO_KABUL'de ölçüm opsiyonel (measuredPallets, measuredKg). TESLIM için recipientName ve 6 haneli pickupCode ZORUNLU (müşteriden alınır; yoksa kullanıcıya sor).
        İlk çağrı önizleme döner; kullanıcı onaylayınca aynı parametrelerle tekrar çağır."""
        et = _EVENT_ALIASES.get((eventType or "").strip().lower(), (eventType or "").strip().upper())
        if et not in ("DEPO_KABUL", "YUKLENDI", "VARISTA", "TESLIM", "GELMEDI", "EKSIK_HASAR"):
            return _out({"error": True, "message": "Geçersiz olay türü."})
        if et == "TESLIM" and (not recipientName.strip() or not re.fullmatch(r"\d{6}", (pickupCode or "").strip())):
            return _out({"error": True, "message": "Teslim için teslim alan kişinin adı ve müşterinin 6 haneli teslim kodu gerekli; kullanıcıya sor."})
        r = _find(reservation)
        if not r:
            return _out({"error": True, "message": "Rezervasyon bulunamadı; find_reservations ile ara veya sipariş no/referans sor."})
        body: dict = {"type": et}
        if note.strip():
            body["note"] = note.strip()
        if et == "DEPO_KABUL" and measuredPallets and measuredKg:
            body["measurement"] = {"measuredPallets": int(measuredPallets), "measuredKg": int(measuredKg)}
        if et == "TESLIM":
            body.update({"recipientName": recipientName.strip(), "pickupCode": pickupCode.strip()})
        args = {"id": r["id"], **body}
        summary = {"işlem": f"Depo olayı: {et}", "rezervasyon": r.get("reference"), "siparişNo": r.get("orderNumber"),
                   "müşteri": (r.get("customer") or {}).get("name"), "mevcutDurum": r.get("statusLabel"),
                   "beyan": f"{r.get('pallets')} palet / {r.get('grossKg')} kg", "ölçüm": body.get("measurement"),
                   "teslimAlan": body.get("recipientName"), "teslimKodu": "•••••• (girildi)" if body.get("pickupCode") else None}
        gate = _gate(token, "warehouse_event", args, summary)
        if gate:
            return _out(gate)
        out = api_call(token, "POST", f"/carrier/reservations/{r['id']}/events", body=body, idempotency_key=_idem(token, "warehouse_event", args))
        return _out(out if out.get("error") else {"executed": True, "reservation": _slim_res(out), "measurement": out.get("measurement")})

    @tool
    def list_facilities_and_vehicles() -> str:
        """Yeni sefer açmak için taşıyıcının tesis kodları (transfer/dağıtım merkezi) ve aktif araç plakalarını listele."""
        f = api_call(token, "GET", "/carrier/facilities", {"limit": 200})
        v = api_call(token, "GET", "/carrier/vehicles", {"limit": 200})
        return _out({
            "facilities": [{"code": x.get("code"), "name": x.get("name"), "kind": x.get("kind"), "city": x.get("city")} for x in f.get("items", []) if x.get("status") == "active"],
            "vehicles": [{"plate": x.get("plate"), "status": x.get("status"), "driver": x.get("driverName")} for x in v.get("items", []) if x.get("status") == "active"],
        })

    @tool
    def create_trip(originFacilityCode: str, destinationFacilityCode: str, vehiclePlate: str, departureIstanbul: str, arrivalIstanbul: str,
                    internalPallets: int, internalKg: int, maxGrossKg: int, sellablePallets: int, sellableKg: int, sellableM3: float,
                    basePriceTl: float, publish: bool = True) -> str:
        """'Aracım var, yük ekle': yeni sefer aç ve kapasiteyi satışa çıkar. Tüm alanlar ZORUNLU; eksik olanları kullanıcıya sor (tesis kodu ve plakalar için list_facilities_and_vehicles).
        departureIstanbul/arrivalIstanbul: 'YYYY-MM-DD SS:DD' İstanbul saati. basePriceTl: palet başı taban fiyat (TL). İlk çağrı önizleme; onayla tekrar çağır."""
        f = api_call(token, "GET", "/carrier/facilities", {"limit": 200}).get("items", [])
        v = api_call(token, "GET", "/carrier/vehicles", {"limit": 200}).get("items", [])
        fc = {str(x.get("code")).upper(): x for x in f}
        plate = re.sub(r"[\s\-.]", "", vehiclePlate or "").upper()
        veh = next((x for x in v if x.get("plate") == plate), None)
        o, d = fc.get((originFacilityCode or "").upper()), fc.get((destinationFacilityCode or "").upper())
        dep, arr = _istanbul_to_iso(departureIstanbul), _istanbul_to_iso(arrivalIstanbul)
        missing = [n for n, ok in (("çıkış tesisi kodu", o), ("varış tesisi kodu", d), ("araç plakası", veh), ("kalkış zamanı", dep), ("varış zamanı", arr)) if not ok]
        if missing:
            return _out({"error": True, "message": "Geçersiz/eksik: " + ", ".join(missing) + ". list_facilities_and_vehicles ile geçerli değerleri göster ve kullanıcıya sor."})
        body = {"originFacilityId": o["id"], "destinationFacilityId": d["id"], "vehicleId": veh["id"], "departureAt": dep, "arrivalEta": arr,
                "internalPallets": int(internalPallets), "internalKg": int(internalKg), "maxGrossKg": int(maxGrossKg),
                "sellablePallets": int(sellablePallets), "sellableKg": int(sellableKg), "sellableM3": float(sellableM3),
                "basePriceMinor": int(round(float(basePriceTl) * 100)), "publish": bool(publish)}
        summary = {"işlem": "Yeni sefer aç" + (" ve yayınla" if publish else " (taslak)"), "rota": f"{o.get('name')} → {d.get('name')}",
                   "araç": plate, "kalkış": departureIstanbul, "varış": arrivalIstanbul,
                   "iç yük": f"{internalPallets} palet / {internalKg} kg", "azamiBrüt": f"{maxGrossKg} kg",
                   "satışa açık": f"{sellablePallets} palet / {sellableKg} kg / {sellableM3} m³", "tabanFiyat": f"{basePriceTl} TL/palet"}
        gate = _gate(token, "create_trip", body, summary)
        if gate:
            return _out(gate)
        out = api_call(token, "POST", "/carrier/trips", body=body, idempotency_key=_idem(token, "create_trip", body))
        return _out(out if out.get("error") else {"executed": True, "trip": _slim_trip(out)})

    @tool
    def list_exceptions(status: str = "open") -> str:
        """Operasyon istisnaları (gelmeme, geç bırakma, hasar, teslim alınmama, ölçüm farkı, yeniden değerlendirme). status: open | resolved."""
        r = api_call(token, "GET", "/carrier/exceptions", {"status": status})
        if r.get("error"):
            return _out(r)
        return _out({"items": [{k: x.get(k) for k in ("id", "type", "severity", "title", "tripReference", "responsible", "suggestedAction", "status")} | {"reservation": x.get("reservation")} for x in r.get("items", [])][:25]})

    @tool
    def resolve_exception(exceptionId: str, note: str) -> str:
        """İstisnayı çözüldü olarak kapat. note ZORUNLU (yapılan işlem). İlk çağrı önizleme; onayla tekrar çağır."""
        if not (note or "").strip():
            return _out({"error": True, "message": "Çözüm notu zorunlu; kullanıcıya sor."})
        args = {"id": exceptionId, "note": note.strip()}
        gate = _gate(token, "resolve_exception", args, {"işlem": "İstisnayı kapat", "istisna": exceptionId, "not": args["note"]})
        if gate:
            return _out(gate)
        out = api_call(token, "POST", f"/carrier/exceptions/{urllib.parse.quote(exceptionId, safe='')}/resolve", body={"note": args["note"]},
                       idempotency_key=_idem(token, "resolve_exception", args))
        return _out(out if out.get("error") else {"executed": True, "result": out})

    return [find_reservations, decide_reservation, warehouse_event, list_facilities_and_vehicles, create_trip, list_exceptions, resolve_exception]
