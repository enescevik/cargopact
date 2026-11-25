"""Orkestratör: kimliği (rol, kiracı) backend'den alır ve isteği rolün uzman ajanına yönlendirir.

Yönlendirme kodla yapılır (rol /me'den gelir, mesajdan değil). Uzman ajan sohbet geçmişini taşır; böylece eksik bilgileri
birkaç mesajda toplayıp önizleme → teyit → uygulama akışını yürütebilir.
"""
import threading
import time

from strands import Agent

from .specialists import (
    ORCHESTRATOR_MODEL_ID,
    carrier_system_prompt,
    carrier_tools,
    customer_system_prompt,
    customer_tools,
    model,
)
from .tools import api_call

CUSTOMER_ROLES = {"customer_user"}
CARRIER_ROLES = {"carrier_admin", "carrier_planner", "carrier_warehouse"}

# Oturum içi sohbet geçmişi (AgentCore Runtime aynı oturumu aynı mikro-VM'de tutar). Kimlik değişirse geçmiş kullanılmaz.
_HISTORY: dict[str, dict] = {}
_LOCK = threading.Lock()
_TTL = 45 * 60
_MAX_MESSAGES = 40


def get_identity(token: str) -> tuple[str | None, str | None, str | None]:
    """GET /me -> (rol, görünen ad, tenantId). Hepsi yalnızca backend'den gelir; mesajdan alınmaz. Geçici hatada bir kez yeniden dener."""
    for _ in range(2):
        me = api_call(token, "GET", "/me")
        if not me.get("error"):
            active = me.get("active") or {}
            return active.get("role"), me.get("displayName"), active.get("tenantId")
        if me.get("status") in (401, 403):
            break
    return None, None, None


def get_role(token: str) -> tuple[str | None, str | None]:
    role, name, _ = get_identity(token)
    return role, name


def _history(session_id: str, owner: str) -> list:
    now = time.time()
    with _LOCK:
        for k in [k for k, v in _HISTORY.items() if now - v["at"] > _TTL]:
            _HISTORY.pop(k, None)
        h = _HISTORY.get(session_id)
        if h and h["owner"] == owner:
            return list(h["messages"])
    return []


def save_history(session_id: str, owner: str, messages: list) -> None:
    # Yalnız tam tur çiftleri saklanır; araç çağrısı/sonucu dengesini bozmamak için baştan kırpılırken 'user' metin mesajında başla.
    msgs = list(messages)
    if len(msgs) > _MAX_MESSAGES:
        msgs = msgs[-_MAX_MESSAGES:]
        while msgs and not (msgs[0].get("role") == "user" and any("text" in c for c in msgs[0].get("content", []))):
            msgs.pop(0)
    with _LOCK:
        _HISTORY[session_id] = {"owner": owner, "messages": msgs, "at": time.time()}


def build_orchestrator(token, role: str, name: str | None, session_manager=None, tenant_id: str | None = None) -> Agent:
    session_id = getattr(token, "session_id", "") or ""
    owner = f"{tenant_id}:{role}"
    messages = _history(session_id, owner) if session_id else []
    if role in CUSTOMER_ROLES:
        tools, prompt = customer_tools(token), customer_system_prompt(name)
    else:
        tools, prompt = carrier_tools(token, tenant_id), carrier_system_prompt(name)
    return Agent(
        model=model(ORCHESTRATOR_MODEL_ID, 1500),
        system_prompt=prompt,
        tools=tools,
        messages=messages or None,
        # Oturum içi geçmiş varsa onu kullan; yoksa (yeni mikro-VM) AgentCore Memory geri yükler.
        session_manager=None if messages else session_manager,
        callback_handler=None,
    )
