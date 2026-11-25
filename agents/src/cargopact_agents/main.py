"""AgentCore Runtime giriş noktası (port 8080, /invocations)."""
import logging
import os

from bedrock_agentcore.runtime import BedrockAgentCoreApp

from .tools import TracedToken
from .orchestrator import CARRIER_ROLES, CUSTOMER_ROLES, build_orchestrator, get_identity

log = logging.getLogger("cargopact")
app = BedrockAgentCoreApp()


def _session_manager(session_id: str, actor_id: str):
    memory_id = os.environ.get("MEMORY_ID")
    if not memory_id:
        return None
    try:
        from bedrock_agentcore.memory.integrations.strands.config import AgentCoreMemoryConfig
        from bedrock_agentcore.memory.integrations.strands.session_manager import (
            AgentCoreMemorySessionManager,
        )

        cfg = AgentCoreMemoryConfig(memory_id=memory_id, session_id=session_id, actor_id=actor_id)
        return AgentCoreMemorySessionManager(cfg, region_name=os.environ.get("AWS_REGION", "us-east-1"))
    except Exception as e:  # bellek isteğe bağlı
        log.warning("memory disabled: %s", type(e).__name__)
        return None


@app.entrypoint
def invoke(payload: dict, context) -> dict:
    prompt = str(payload.get("prompt", "")).strip()
    token = str(payload.get("idToken") or "")
    if not prompt:
        return {"result": "Mesaj boş."}
    if not token:
        return {"result": "Oturum bilgisi eksik; lütfen yeniden giriş yapın."}
    session_id = str(getattr(context, "session_id", None) or payload.get("sessionId") or "default-session-0000000000000000000")
    token = TracedToken(token, str(payload.get("correlationId") or ""), session_id)
    log.info("turn correlationId=%s session=%s", token.correlation_id, session_id)
    role, name, tenant_id = get_identity(token)
    if role not in CUSTOMER_ROLES | CARRIER_ROLES:
        return {"result": "Kimliğiniz doğrulanamadı veya bu asistan için yetkiniz yok."}
    actor_id = str(payload.get("userId") or "anonymous")
    sm = _session_manager(session_id, actor_id)
    try:
        agent = build_orchestrator(token, role, name, sm, tenant_id)
        return {"result": str(agent(prompt))}
    except Exception as e:
        log.warning("agent with memory failed: %s", type(e).__name__)
        if sm is None:
            return {"result": "Şu an yanıt üretemedim, lütfen tekrar deneyin."}
        try:
            return {"result": str(build_orchestrator(token, role, name, None, tenant_id)(prompt))}
        except Exception:
            return {"result": "Şu an yanıt üretemedim, lütfen tekrar deneyin."}


if __name__ == "__main__":
    app.run()
