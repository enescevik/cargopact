from strands import Agent

from .specialists import (
    COMMON,
    ORCHESTRATOR_MODEL_ID,
    build_carrier_specialist,
    build_customer_specialist,
    model,
)
from .tools import api_call

CUSTOMER_ROLES = {"customer_user"}
CARRIER_ROLES = {"carrier_admin", "carrier_planner", "carrier_warehouse"}


def get_identity(token: str) -> tuple[str | None, str | None, str | None]:
    """GET /me -> (rol, görünen ad, tenantId). Hepsi yalnızca backend'den gelir; mesajdan alınmaz."""
    me = api_call(token, "GET", "/me")
    if me.get("error"):
        return None, None, None
    active = me.get("active") or {}
    return active.get("role"), me.get("displayName"), active.get("tenantId")
def get_role(token: str) -> tuple[str | None, str | None]:
    role, name, _ = get_identity(token)
    return role, name


def build_orchestrator(token: str, role: str, name: str | None, session_manager=None, tenant_id: str | None = None) -> Agent:
    if role in CUSTOMER_ROLES:
        tools = [build_customer_specialist(token)]
        routing = "Kullanıcı bir MÜŞTERİ. Sefer, fiyat, rezervasyon ve takip sorularını customer_specialist'e ilet."
    else:
        tools = [build_carrier_specialist(token, tenant_id)]
        routing = "Kullanıcı bir TAŞIYICI. Sefer, kapasite, talep, öncelik ve kural sorularını carrier_specialist'e ilet."
    prompt = (
        f"Sen CargoPact orkestratör ajanısın. Kullanıcı: {name or 'bilinmiyor'}, rol: {role}. {routing} "
        "Kullanıcının isteğini aynen ve eksiksiz uzmana aktar, uzmanın yanıtını kısaltmadan, tutarlı tek cevap olarak sun. "
        "Selamlaşma dışındaki HER soruyu mutlaka uzmana ilet; kendin cevaplama, kullanıcıya geri soru sorma, eksik bilgiyi uzman araçlarıyla bul. Kural, istisna, gelmeme geçmişi ve iade soruları da uzmana gider. " + COMMON
    )
    return Agent(
        model=model(ORCHESTRATOR_MODEL_ID, 1500),
        system_prompt=prompt,
        tools=tools,
        session_manager=session_manager,
        callback_handler=None,
    )
