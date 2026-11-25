from strands import Agent

from .specialists import SPECIALISTS, _model

SYSTEM_PROMPT = """Sen CargoPact orkestratör ajanısın. Kullanıcının dilinde yanıt ver.
Soruyu analiz et; gerekirse uygun uzman ajana yönlendir, basit sorulara doğrudan cevap ver.
Uzman yanıtlarını kullanıcıya tek, tutarlı bir cevap olarak sun."""


def build_orchestrator(session_manager=None) -> Agent:
    return Agent(
        model=_model(),
        system_prompt=SYSTEM_PROMPT,
        tools=SPECIALISTS,
        session_manager=session_manager,
        callback_handler=None,
    )
