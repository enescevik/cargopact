"""İş API'sine çağrı yapan araçlar. Kimlik, çağıranın ID token'ıdır; kiracı/rol backend'de zorlanır."""
import json
import os
import urllib.error
import urllib.parse
import urllib.request
import uuid

from strands import tool

API_URL = os.environ.get("API_URL", "https://765h182ijf.execute-api.us-east-1.amazonaws.com").rstrip("/")
_TIMEOUT = 8
_MAX_CHARS = 12000


def api_call(token: str, method: str, path: str, query: dict | None = None, body: dict | None = None) -> dict:
    url = API_URL + path
    if query:
        q = {k: v for k, v in query.items() if v not in (None, "")}
        if q:
            url += "?" + urllib.parse.urlencode(q)
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    data = None
    if method in ("POST", "PUT", "PATCH"):
        headers["Content-Type"] = "application/json"
        headers["Idempotency-Key"] = str(uuid.uuid4())
        data = json.dumps(body or {}).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as r:
            return json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            err = json.loads(e.read().decode())
        except Exception:
            err = {}
        out = {"error": True, "status": e.code, "code": err.get("code"), "message": err.get("message"),
               "details": err.get("details")}
        if e.code == 404 and err.get("code") == "NOT_FOUND" and "bulunamad" in str(err.get("message", "")):
            out["note"] = "Veri şu an alınamadı (uç nokta veya kayıt bulunamadı)."
        return out
    except Exception as e:  # ağ/zaman aşımı
        return {"error": True, "message": f"API çağrısı başarısız: {type(e).__name__}"}


def _out(obj) -> str:
    s = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    return s[:_MAX_CHARS]


def _slim_trip(t: dict) -> dict:
    p = t.get("price") or {}
    return {
        "id": t.get("id"), "reference": t.get("reference"),
        "carrier": (t.get("carrier") or {}).get("name"),
        "origin": f"{(t.get('origin') or {}).get('name')} ({(t.get('origin') or {}).get('city')})",
        "destination": f"{(t.get('destination') or {}).get('name')} ({(t.get('destination') or {}).get('city')})",
        "vehicleType": (t.get("vehicleType") or {}).get("name"),
        "departureAt": t.get("departureAt"), "arrivalEta": t.get("arrivalEta"),
        "bookingCutoffAt": t.get("bookingCutoffAt"), "intakeCutoffAt": t.get("intakeCutoffAt"),
        "remaining": t.get("remaining"),
        "unitPriceMinor": p.get("unitPriceMinor"), "totalPriceMinor": p.get("totalPriceMinor"),
        "priceExplanation": (p.get("breakdown") or {}).get("explanation"),
        "status": t.get("status"), "pendingCount": t.get("pendingCount"),
        "capacity": t.get("capacity"),
    }


def _slim_res(r: dict) -> dict:
    out = {
        "id": r.get("id"), "reference": r.get("reference"), "orderNumber": r.get("orderNumber"),
        "status": r.get("status"), "statusLabel": r.get("statusLabel"),
        "customer": (r.get("customer") or {}).get("name"),
        "trip": (r.get("trip") or {}).get("reference"),
        "pallets": r.get("pallets"), "grossKg": r.get("grossKg"), "volumeM3": r.get("volumeM3"),
        "productClass": (r.get("productClass") or {}).get("name"),
        "totalPriceMinor": r.get("totalPriceMinor"), "paymentStatus": (r.get("payment") or {}).get("status"),
        "holdExpiresAt": r.get("holdExpiresAt"), "createdAt": r.get("createdAt"),
    }
    for k in ("priorityRank", "verifiedNoShows", "eligibility"):
        if k in r:
            out[k] = r[k]
    return out


CARRIER_RULES = """Taşıyıcı kuralları (Dinçer/Siva ortak demo bilgi tabanı):
- Zaman sınırları (T = planlanan kalkış): yer ayırma ve kesin rezervasyon en geç T-3 saat (sınır dahil). Çıkış deposu fiziksel kabul en geç T-1 saat; sonrası standart akışta işlenmez, operasyona gecikme bildirilir.
- Öncelik: doğrulanmış gelmeme (T-1'e kadar getirilmeyen onaylı yük) kaydı olan firma, uygun talepler arasında daha düşük önceliktedir; eşitlikte başvuru sırası geçerlidir.
- Sıralama özeti: önce uygun talepler; bunların içinde doğrulanmış gelmemesi (verifiedNoShows) az olan firma önde; gelmeme sayısı eşitse önce başvuran önde. Başvuru zamanı yalnızca eşitlik bozucudur.
- Gelmeme SAYILMAYANLAR: zamanında bildirilmiş iptal, taşıyıcı kaynaklı aksama, inceleme bekleyen yük, geç gelen yük, ölçüm farkı.
- Planlamacının seçim gerekçesi denetim izine yazılır. Başka firmanın geçmişi müşteriye gösterilmez.
- Uygunluk: palet adedi, brüt kg, ölçü/yükseklik, m³, ürün uyumu, zaman penceresi ve iç yük rezervi birlikte kontrol edilir; iç transfer kapasitesine dokunulmaz.
- Ret/iptal/süre aşımı kapasiteyi bir kez iade eder."""


def build_customer_tools(token: str) -> list:
    @tool
    def search_trips(originCity: str = "", destinationCity: str = "", date: str = "", pallets: int = 1) -> str:
        """Uygun seferleri ara. date: YYYY-MM-DD (opsiyonel). Fiyat istenen palet adediyle hesaplanır."""
        r = api_call(token, "GET", "/customer/trips", {
            "originCity": originCity, "destinationCity": destinationCity, "date": date, "pallets": pallets})
        if r.get("error"):
            return _out(r)
        return _out({"items": [_slim_trip(t) for t in r.get("items", [])]})

    @tool
    def quote(tripId: str, pallets: int, grossKg: float, productClassCode: str = "GENEL", volumeM3: float = 0) -> str:
        """Bir sefer için uygunluk ve fiyat teklifi al (hiçbir şey yazmaz). productClassCode: GENEL, GIDA-AMBALAJLI, KIRILGAN, TEHLIKELI."""
        body = {"pallets": pallets, "grossKg": grossKg, "productClassCode": productClassCode}
        if volumeM3:
            body["volumeM3"] = volumeM3
        return _out(api_call(token, "POST", f"/customer/trips/{urllib.parse.quote(tripId, safe='')}/quote", body=body))

    @tool
    def my_reservations() -> str:
        """Çağıran firmanın rezervasyonlarını listele (yeniden eskiye)."""
        r = api_call(token, "GET", "/customer/reservations")
        if r.get("error"):
            return _out(r)
        return _out({"items": [_slim_res(x) for x in r.get("items", [])]})

    @tool
    def track(orderNumber: str) -> str:
        """Sipariş numarasıyla (CP-2026-000123) palet/sipariş takibi."""
        return _out(api_call(token, "GET", f"/customer/orders/{urllib.parse.quote(orderNumber, safe='')}/tracking"))

    return [search_trips, quote, my_reservations, track]


def build_carrier_tools(token: str) -> list:
    def _resolve(trip: str) -> str | None:
        r = api_call(token, "GET", "/carrier/trips")
        for t in r.get("items", []):
            if trip in (t.get("id"), t.get("reference")):
                return t["id"]
        return None

    @tool
    def list_trips() -> str:
        """Taşıyıcının seferlerini listele (kalkışa göre) ve kapasite özetini getir."""
        r = api_call(token, "GET", "/carrier/trips")
        if r.get("error"):
            return _out(r)
        return _out({"items": [_slim_trip(t) for t in r.get("items", [])]})

    @tool
    def trip_detail(tripIdOrReference: str) -> str:
        """Sefer detayı: kapasite ve talepler (priorityRank, verifiedNoShows, uygunluk). Sefer id veya referans (örn. DNC-DEMO-GEB-ANK) verilebilir."""
        trip_id = _resolve(tripIdOrReference) or tripIdOrReference
        r = api_call(token, "GET", f"/carrier/trips/{urllib.parse.quote(trip_id, safe='')}")
        if r.get("error"):
            return _out(r)
        out = _slim_trip(r)
        out["reservations"] = sorted(
            (_slim_res(x) for x in r.get("reservations", [])), key=lambda x: x.get("priorityRank") or 999)
        return _out(out)

    @tool
    def dashboard(tripIdOrReference: str = "") -> str:
        """Gelir/maliyet/katkı özeti ve müşteri listesi. Boşsa en yakın demo seferi."""
        trip_id = _resolve(tripIdOrReference) if tripIdOrReference else None
        r = api_call(token, "GET", "/carrier/dashboard", {"tripId": trip_id or tripIdOrReference})
        if r.get("error"):
            return _out(r)
        r["trip"] = _slim_trip(r.get("trip") or {})
        return _out(r)

    @tool
    def carrier_rules() -> str:
        """Gelmeme, öncelik ve zaman sınırı kuralları (taşıyıcı bilgi tabanı)."""
        return CARRIER_RULES

    return [list_trips, trip_detail, dashboard, carrier_rules]
