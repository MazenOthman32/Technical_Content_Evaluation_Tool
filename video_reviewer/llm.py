"""LLM client with Anthropic and Groq providers."""

from __future__ import annotations

import json
import os
import re
import time
from typing import Any, Optional

from .schema import CostInfo

GROQ_BASE_URL = "https://api.groq.com/openai/v1"

# Approximate pricing USD / 1M tokens — reporting only
RATES = {
    "anthropic": {"input": 3.0, "output": 15.0},
    "groq": {"input": 0.05, "output": 0.08},
}

DEFAULT_MODELS = {
    "anthropic": "claude-sonnet-5-5",
    "groq": "openai/gpt-oss-120b",
}

AVAILABLE_MODELS = {
    "anthropic": [
        {"id": "claude-sonnet-5-5", "label": "Claude Sonnet 5.5"},
        {"id": "claude-haiku-4-5-20251001", "label": "Claude Haiku 4.5"},
    ],
    "groq": [
        {"id": "openai/gpt-oss-120b", "label": "GPT-OSS 120B (Groq)"},
        {"id": "llama-3.3-70b-versatile", "label": "Llama 3.3 70B"},
        {"id": "llama-3.1-8b-instant", "label": "Llama 3.1 8B Instant"},
    ],
}


class CostLimitExceeded(RuntimeError):
    pass


class LLMClient:
    def __init__(
        self,
        model: str = "claude-sonnet-5-5",
        provider: str = "anthropic",
        temperature: float = 0.0,
        max_cost: Optional[float] = None,
        api_key: Optional[str] = None,
    ):
        self.provider = (provider or "anthropic").lower().strip()
        if self.provider not in {"anthropic", "groq"}:
            raise RuntimeError(f"مزود غير مدعوم: {provider}")
        self.model = model or DEFAULT_MODELS[self.provider]
        self.temperature = temperature
        self.max_cost = max_cost
        self.cost = CostInfo(max_cost=max_cost)

        if self.provider == "anthropic":
            import anthropic

            key = api_key or os.getenv("ANTHROPIC_API_KEY")
            if not key:
                raise RuntimeError("ANTHROPIC_API_KEY غير موجود.")
            self.client = anthropic.Anthropic(api_key=key, max_retries=5)
        else:
            from openai import OpenAI

            key = api_key or os.getenv("GROQ_API_KEY")
            if not key:
                raise RuntimeError("GROQ_API_KEY غير موجود.")
            self.client = OpenAI(api_key=key, base_url=GROQ_BASE_URL, max_retries=12)

    def _estimate(self, inp: int, out: int) -> float:
        rates = RATES.get(self.provider, RATES["anthropic"])
        return (inp / 1_000_000) * rates["input"] + (out / 1_000_000) * rates["output"]

    def _guard(self, estimated_extra: float = 0.05) -> None:
        if self.max_cost is not None and (self.cost.estimated_usd + estimated_extra) > self.max_cost:
            raise CostLimitExceeded(
                f"تجاوز سقف التكلفة ({self.max_cost:.2f} USD). "
                f"المصروف حتى الآن ≈ {self.cost.estimated_usd:.4f} USD."
            )

    def _record(self, usage: Any, image: bool = False) -> None:
        if self.provider == "anthropic":
            inp = int(getattr(usage, "input_tokens", 0) or 0)
            out = int(getattr(usage, "output_tokens", 0) or 0)
        else:
            inp = int(getattr(usage, "prompt_tokens", 0) or 0)
            out = int(getattr(usage, "completion_tokens", 0) or 0)
        self.cost.input_tokens += inp
        self.cost.output_tokens += out
        self.cost.text_requests += 0 if image else 1
        if image:
            self.cost.image_requests += 1
        self.cost.estimated_usd += self._estimate(inp, out)

    @staticmethod
    def extract_json(text: str) -> dict:
        text = text.strip()
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.MULTILINE)
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end == -1:
            raise ValueError("No JSON object found in model response")
        return json.loads(text[start : end + 1])

    def complete(
        self,
        system: str,
        user: str,
        max_tokens: int = 4000,
        images: Optional[list[dict]] = None,
    ) -> str:
        self._guard()
        last_err: Optional[Exception] = None
        for attempt in range(5):
            try:
                if self.provider == "anthropic":
                    content: list[dict] = []
                    if images:
                        for img in images:
                            content.append(
                                {
                                    "type": "image",
                                    "source": {
                                        "type": "base64",
                                        "media_type": img.get("media_type", "image/jpeg"),
                                        "data": img["data"],
                                    },
                                }
                            )
                    content.append({"type": "text", "text": user})
                    resp = self.client.messages.create(
                        model=self.model,
                        max_tokens=max_tokens,
                        temperature=self.temperature,
                        system=system,
                        messages=[{"role": "user", "content": content}],
                    )
                    self._record(resp.usage, image=bool(images))
                    return "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")

                # Groq / OpenAI-compatible — images not used in Phase 1 text review
                kwargs: dict[str, Any] = {}
                if "gpt-oss" in self.model:
                    kwargs["reasoning_effort"] = "medium"
                resp = self.client.chat.completions.create(
                    model=self.model,
                    max_tokens=max_tokens,
                    temperature=self.temperature,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    **kwargs,
                )
                self._record(resp.usage)
                return resp.choices[0].message.content or ""
            except CostLimitExceeded:
                raise
            except Exception as e:
                msg = str(e).lower()
                if "rate" in msg and ("day" in msg or "tpd" in msg):
                    raise RuntimeError("خلصت حصة Groq اليومية. جرّب Anthropic أو كمّل لاحقاً.") from e
                last_err = e
                time.sleep(min(2**attempt, 16))
        raise RuntimeError(f"فشل استدعاء النموذج بعد محاولات: {last_err}")

    def json(
        self,
        system: str,
        user: str,
        max_tokens: int = 4000,
        images: Optional[list[dict]] = None,
    ) -> dict:
        last_err: Optional[Exception] = None
        for _ in range(3):
            try:
                return self.extract_json(self.complete(system, user, max_tokens, images))
            except (ValueError, json.JSONDecodeError) as e:
                last_err = e
            except CostLimitExceeded:
                raise
        raise RuntimeError(f"النموذج لم يُرجع JSON صالحاً: {last_err}")
