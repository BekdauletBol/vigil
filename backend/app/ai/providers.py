"""LLM providers behind one streaming interface.

- AnthropicProvider — Claude via the official SDK (cloud).
- OllamaProvider    — any local model served by Ollama (on-prem, no data leaves the network).
- MockProvider      — deterministic offline analyst, so the demo works without keys.
"""

import asyncio
import json
import re
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator

import httpx

from app.core.config import Settings


class LLMProvider(ABC):
    name: str

    @abstractmethod
    def stream(self, system: str, messages: list[dict], *, context: dict) -> AsyncIterator[str]:
        """Yield response text fragments as they are generated."""


class AnthropicProvider(LLMProvider):
    name = "anthropic"

    def __init__(self, api_key: str, model: str) -> None:
        from anthropic import AsyncAnthropic

        self._client = AsyncAnthropic(api_key=api_key)
        self._model = model

    async def stream(
        self, system: str, messages: list[dict], *, context: dict
    ) -> AsyncIterator[str]:
        async with self._client.beta.messages.stream(
            model=self._model,
            max_tokens=16000,
            system=system,
            messages=messages,
            output_config={"effort": "low"},
            # On a safety decline the API retries on a fallback model in the same call.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        ) as stream:
            async for text in stream.text_stream:
                yield text
            final = await stream.get_final_message()
            if final.stop_reason == "refusal":
                yield "\n\n_Модель отклонила запрос. Переформулируйте вопрос._"


class OllamaProvider(LLMProvider):
    name = "ollama"

    def __init__(self, url: str, model: str) -> None:
        self._url = url.rstrip("/")
        self._model = model

    async def stream(
        self, system: str, messages: list[dict], *, context: dict
    ) -> AsyncIterator[str]:
        payload = {
            "model": self._model,
            "stream": True,
            "messages": [{"role": "system", "content": system}, *messages],
        }
        async with (
            httpx.AsyncClient(timeout=httpx.Timeout(120, connect=5)) as client,
            client.stream("POST", f"{self._url}/api/chat", json=payload) as r,
        ):
            r.raise_for_status()
            async for line in r.aiter_lines():
                if not line:
                    continue
                chunk = json.loads(line)
                if text := chunk.get("message", {}).get("content"):
                    yield text
                if chunk.get("done"):
                    break


class MockProvider(LLMProvider):
    """Template-based analyst that streams a structured report token by token."""

    name = "mock"

    def __init__(self, delay: float = 0.012) -> None:
        self._delay = delay

    async def stream(
        self, system: str, messages: list[dict], *, context: dict
    ) -> AsyncIterator[str]:
        # The last message may carry the RAG preamble; answer the user's own words.
        text = self._compose(context.get("question", messages[-1]["content"]), context)
        for token in re.findall(r"\S+\s*|\n", text):
            yield token
            if self._delay:
                await asyncio.sleep(self._delay)

    @staticmethod
    def _compose(question: str, ctx: dict) -> str:
        alert = ctx.get("alert")
        sources = ctx.get("sources", [])
        refs = ", ".join(f"[{i + 1}]" for i in range(len(sources))) or "—"

        if not alert:
            lines = ["**Ответ на основе базы знаний**", ""]
            for i, s in enumerate(sources, 1):
                lines.append(
                    f"- **{s['doc']} — {s['section']}** [{i}]: {_first_sentence(s['text'])}"
                )
            if not sources:
                lines.append("В базе знаний не нашлось подходящих материалов. Уточните вопрос.")
            lines += [
                "",
                "_Офлайн-режим: подключите Claude или локальную модель через Ollama "
                "для свободного диалога._",
            ]
            return "\n".join(lines)

        tx = alert["transaction"]
        flags = alert["flags"]
        counterparties = [n for n in alert.get("graph_nodes", []) if n["role"] == "counterparty"]
        verdict = (
            "эскалировать кейс и подготовить сообщение о подозрительной операции"
            if alert["score"] >= 85
            else "взять кейс в работу и запросить у клиента документы-основания"
        )
        lines = [
            f"## Заключение по кейсу #{alert['id']}",
            "",
            f"**Резюме.** {alert['account']['name']} ({alert['account']['bank']}) провёл операцию "
            f"на **{_kzt(tx['amount'])}** через канал «{CHANNELS_RU.get(tx['channel'], tx['channel'])}», получатель — "
            f"{tx['receiver']['name']} ({tx['receiver']['country']}). "
            f"Итоговый риск — **{alert['score']}/100**, уровень «{SEVERITY_RU.get(alert['severity'], alert['severity'])}».",
            "",
            "## Выявленные признаки",
        ]
        lines += [f"- **{f['title']}** (вес {f['weight']})" for f in flags]
        lines += [
            "",
            "## Анализ связей",
            f"За 7 дней у субъекта {len(counterparties)} значимых контрагентов. "
            + (
                "Крупнейшие: " + ", ".join(n["label"] for n in counterparties[:3]) + "."
                if counterparties
                else "Связей за период немного."
            ),
            "",
            "## Типология",
            f"Наиболее вероятная типология — «{alert['typology']}». "
            f"Сопоставлено с материалами базы знаний {refs}.",
            "",
            "## Рекомендация",
            f"Рекомендую {verdict}. Решение остаётся за аналитиком.",
        ]
        if question and not question.startswith("Сформируй заключение"):
            lines += [
                "",
                f"_По вопросу «{question[:120]}»: в офлайн-режиме доступен только "
                "шаблонный анализ. Подключите LLM для развёрнутого ответа._",
            ]
        return "\n".join(lines)


CHANNELS_RU = {
    "transfer": "перевод",
    "card": "карта",
    "cash": "наличные",
    "swift": "SWIFT",
    "p2p": "P2P",
    "crypto": "криптообменник",
}
SEVERITY_RU = {"low": "низкий", "medium": "средний", "high": "высокий", "critical": "критический"}


def _first_sentence(text: str) -> str:
    flat = " ".join(line.lstrip("- ").strip() for line in text.splitlines() if line.strip())
    return flat.split(". ")[0].rstrip(".") + "."


def _kzt(amount: float) -> str:
    return f"{amount:,.0f}".replace(",", " ") + " ₸"


def make_provider(settings: Settings) -> LLMProvider:
    kind = settings.llm_provider
    if kind == "auto":
        kind = "anthropic" if settings.anthropic_api_key else "mock"
    if kind == "anthropic":
        if not settings.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is not set")
        return AnthropicProvider(settings.anthropic_api_key, settings.anthropic_model)
    if kind == "ollama":
        return OllamaProvider(settings.ollama_url, settings.ollama_model)
    return MockProvider()
