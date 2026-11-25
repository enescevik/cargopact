"""Uzman ajanlar. Proje planı gelince rolleri ve araçları burada tanımlayın."""
import os

from strands import Agent, tool
from strands.models import BedrockModel

MODEL_ID = os.environ.get("MODEL_ID", "us.anthropic.claude-sonnet-4-20250514-v1:0")


def _model() -> BedrockModel:
    return BedrockModel(model_id=MODEL_ID, region_name=os.environ.get("AWS_REGION", "us-east-1"))


@tool
def research_specialist(query: str) -> str:
    """Bilgi toplama ve analiz gerektiren sorular için araştırma uzmanı."""
    agent = Agent(
        model=_model(),
        system_prompt="Sen CargoPact için araştırma uzmanısın. Kısa, doğru ve kaynaklı yanıt ver.",
        callback_handler=None,
    )
    return str(agent(query))


@tool
def operations_specialist(request: str) -> str:
    """Operasyonel işler (kayıt oluşturma, durum sorgulama) için operasyon uzmanı."""
    agent = Agent(
        model=_model(),
        system_prompt=(
            "Sen CargoPact için operasyon uzmanısın. Henüz veri araçları bağlı değil; "
            "yapamayacağın işi açıkça söyle."
        ),
        callback_handler=None,
    )
    return str(agent(request))


SPECIALISTS = [research_specialist, operations_specialist]
