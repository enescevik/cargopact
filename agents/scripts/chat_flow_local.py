"""Yerel çok turlu sohbet testi: ajan, gerçek iş API'sine kullanıcının token'ıyla bağlanır.
Kullanım: cd /workshop && set -a && . ./.env.seed && set +a && PYTHONPATH=agents/src python agents/scripts/chat_flow_local.py
"""
import json
import os
import sys
import time
import urllib.request
import uuid

import boto3

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from cargopact_agents.main import invoke  # noqa: E402

API = os.environ["API_URL"]
cog = boto3.client("cognito-idp", region_name="us-east-1")


def token(email: str) -> str:
    r = cog.initiate_auth(AuthFlow="USER_PASSWORD_AUTH", ClientId=os.environ["USER_POOL_CLIENT_ID"],
                          AuthParameters={"USERNAME": email, "PASSWORD": os.environ["SEED_USER_PASSWORD"]})
    return r["AuthenticationResult"]["IdToken"]


def api(tok: str, path: str) -> dict:
    req = urllib.request.Request(API + path, headers={"Authorization": f"Bearer {tok}"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())


class Ctx:
    def __init__(self, sid): self.session_id = sid


def converse(email: str, turns: list[str]) -> str:
    tok = token(email)
    sid = f"sess-local-{uuid.uuid4()}"
    for msg in turns:
        t0 = time.time()
        out = invoke({"prompt": msg, "idToken": tok, "userId": email, "correlationId": f"local-{uuid.uuid4().hex[:12]}"}, Ctx(sid))
        print(f"\n👤 {msg}\n🤖 ({time.time() - t0:.1f}s) {out['result'][:900]}")
    return tok


if __name__ == "__main__":
    who = sys.argv[1] if len(sys.argv) > 1 else "customer"
    if who == "customer":
        tok = converse("web.musteri@cargopact.example.test", [
            "Yarın Gebze'den Ankara'ya 3 palet göndermek istiyorum.",
            "Toplam 1500 kg, genel kargo, tamamını peşin ödeyeceğim. Teslim alacak kişi Ayşe Kaya. Alternatif olarak ayrı araçla gönderirdim.",
            "Evet, onaylıyorum.",
            "Evet.",
        ])
        items = [x for x in api(tok, "/customer/reservations")["items"] if (x.get("trip") or {}).get("reference") == "DNC-DEMO-GEB-ANK"]
        print("\nDEMO SEFERİ REZERVASYONLARI:", json.dumps([{k: x.get(k) for k in ("reference", "status", "pallets", "grossKg", "totalPriceMinor")} for x in items], ensure_ascii=False))
    else:
        converse("web.yonetici@cargopact.example.test", [
            "DNC-DEMO-GEB-ANK seferinde bekleyen talepleri göster.",
            "Marmara Ambar'ın talebini onayla.",
            "Evet onaylıyorum.",
        ])
