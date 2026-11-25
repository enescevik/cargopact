"""AgentCore Runtime giriş noktası (port 8080, /invocations)."""
import os

from bedrock_agentcore.runtime import BedrockAgentCoreApp

from .orchestrator import build_orchestrator

app = BedrockAgentCoreApp()


def _session_manager(session_id: str, actor_id: str):
    memory_id = os.environ.get("MEMORY_ID")
    if not memory_id:
        return None
    from bedrock_agentcore.memory.integrations.strands.config import AgentCoreMemoryConfig
    from bedrock_agentcore.memory.integrations.strands.session_manager import (
        AgentCoreMemorySessionManager,
    )

    cfg = AgentCoreMemoryConfig(memory_id=memory_id, session_id=session_id, actor_id=actor_id)
    return AgentCoreMemorySessionManager(cfg, region_name=os.environ.get("AWS_REGION", "us-east-1"))


@app.entrypoint
def invoke(payload: dict, context) -> dict:
    prompt = str(payload.get("prompt", "")).strip()
    if not prompt:
        return {"error": "prompt boş"}
    session_id = getattr(context, "session_id", None) or "default-session-0000000000000000000"
    actor_id = str(payload.get("userId") or "anonymous")
    agent = build_orchestrator(_session_manager(session_id, actor_id))
    return {"result": str(agent(prompt))}


if __name__ == "__main__":
    app.run()
