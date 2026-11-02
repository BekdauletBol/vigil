"""AI analyst: retrieval-augmented generation over the case and the knowledge base."""

import json
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.providers import LLMProvider
from app.ai.retriever import get_retriever
from app.schemas import ChatRequest
from app.services.alerts import get_alert_detail

SYSTEM_PROMPT = """Ты — ассистент аналитика финансового мониторинга (AML/CFT) в демонстрационной системе Vigil.
Помогаешь разбирать алерты о подозрительных операциях: объясняешь сработавшие признаки, \
анализируешь связи, сопоставляешь с типологиями и предлагаешь следующие шаги.

Правила:
- Опирайся на данные кейса в <case> и материалы базы знаний в <knowledge>. \
Ссылайся на материалы как [1], [2] по их номерам.
- Не утверждай виновность: говори о наличии или отсутствии признаков подозрительности.
- Окончательное решение принимает человек — формулируй рекомендации, а не решения.
- Если данных недостаточно, прямо скажи, каких именно.
- Пиши по-русски, кратко и структурно: короткие разделы с заголовками ## и списки."""


def _case_block(alert: dict) -> str:
    tx = alert["transaction"]
    compact = {
        "id": alert["id"],
        "score": alert["score"],
        "severity": alert["severity"],
        "status": alert["status"],
        "typology": alert["typology"],
        "flags": [f["title"] for f in alert["flags"]],
        "subject": {
            k: alert["account"][k]
            for k in ("name", "kind", "bank", "country", "is_pep", "risk_level", "opened_at")
        },
        "transaction": {
            "ts": tx["ts"],
            "amount_kzt": tx["amount"],
            "channel": tx["channel"],
            "country": tx["country"],
            "purpose": tx["purpose"],
            "receiver": tx["receiver"]["name"],
            "anomaly_score": tx["anomaly_score"],
        },
        "counterparties_7d": [
            {"name": n["label"], "country": n["country"], "volume_kzt": n["volume"]}
            for n in alert["graph_nodes"]
            if n["role"] == "counterparty"
        ],
        "recent_transactions": [
            {
                "ts": t["ts"],
                "amount": t["amount"],
                "channel": t["channel"],
                "from": t["sender"]["name"],
                "to": t["receiver"]["name"],
                "risk": t["risk_score"],
            }
            for t in alert["related"][:15]
        ],
    }
    return json.dumps(compact, ensure_ascii=False, default=str, indent=1)


async def prepare_context(session: AsyncSession, req: ChatRequest) -> dict:
    """Load the case and retrieve knowledge before streaming starts (the DB session closes then)."""
    alert = None
    if req.alert_id is not None:
        alert = (await get_alert_detail(session, req.alert_id)).model_dump(mode="json")

    question = req.messages[-1].content
    retriever = get_retriever()
    if alert:
        # One source per triggered signal (heaviest first), then the question itself.
        flags = sorted(alert["flags"], key=lambda f: f["weight"], reverse=True)
        queries = [f["title"] for f in flags if f["code"] != "ML_ANOMALY"] + [question]
        hits = retriever.search_each(queries)
    else:
        hits = retriever.search(question, k=3)
    return {"alert": alert, "sources": [h.as_dict() for h in hits], "question": question}


async def run_analyst(
    req: ChatRequest, context: dict, provider: LLMProvider
) -> AsyncIterator[tuple[str, dict]]:
    """Yield (event, data) pairs: one `meta`, many `delta`, one `done`."""
    alert, sources = context["alert"], context["sources"]
    yield "meta", {"provider": provider.name, "alert_id": req.alert_id, "sources": sources}

    knowledge = "\n\n".join(
        f'<doc index="{i}" title="{s["doc"]} — {s["section"]}">\n{s["text"]}\n</doc>'
        for i, s in enumerate(sources, 1)
    )
    preamble = f"<knowledge>\n{knowledge or 'нет подходящих материалов'}\n</knowledge>\n\n"
    if alert:
        preamble = f"<case>\n{_case_block(alert)}\n</case>\n\n" + preamble

    history = [m.model_dump() for m in req.messages]
    # Context goes into the first user turn so earlier turns stay byte-identical (cache-friendly).
    history[0] = {"role": "user", "content": preamble + history[0]["content"]}

    async for text in provider.stream(SYSTEM_PROMPT, history, context=context):
        yield "delta", {"text": text}
    yield "done", {}
