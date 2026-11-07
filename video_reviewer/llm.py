"""Anthropic LLM client with cost tracking and retries."""

from __future__ import annotations

import json
import os
import re
import time
from typing import Any, Optional

from .schema import CostInfo

# Approximate Sonnet pricing (USD / 1M tokens) — for reporting only
INPUT_RATE = 3.0
OUTPUT_RATE = 15.0


class CostLimitExceeded(RuntimeError):
    pass


class LLMClient:
    def __init__(
        self,
        model: str = "claude-sonnet-5-5",
        temperature: float = 0.0,
        max_cost: Optional[float] = None,
        api_key: Optional[str] = None,
    ):
        import anthropic

        key = api_key or os.getenv("ANTHROPIC_API_KEY")
        if not key:
            raise RuntimeError("ANTHROPIC_API_KEY غير موجود. ضعه في البيئة أو أدخله من الواجهة.")
        self.client = anthropic.Anthropic(api_key=key, max_retries=5)
        self.model = model
        self.temperature = temperature
        self.max_cost = max_cost
        self.cost = CostInfo(max_cost=max_cost)

    def _estimate(self, inp: int, out: int) -> float:
        return (inp / 1_000_000) * INPUT_RATE + (out / 1_000_000) * OUTPUT_RATE

    def _guard(self, estimated_extra: float = 0.05) -> None:
        if self.max_cost is not None and (self.cost.estimated_usd + estimated_extra) > self.max_cost:
            raise CostLimitExceeded(
                f"تجاوز سقف التكلفة ({self.max_cost:.2f} USD). "
                f"المصروف حتى الآن ≈ {self.cost.estimated_usd:.4f} USD."
            )

    def _record(self, usage: Any, image: bool = False) -> None:
        inp = int(getattr(usage, "input_tokens", 0) or 0)
        out = int(getattr(usage, "output_tokens", 0) or 0)
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

        last_err: Optional[Exception] = None
        for attempt in range(5):
            try:
                resp = self.client.messages.create(
                    model=self.model,
                    max_tokens=max_tokens,
                    temperature=self.temperature,
                    system=system,
                    messages=[{"role": "user", "content": content}],
                )
                self._record(resp.usage, image=bool(images))
                return "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
            except CostLimitExceeded:
                raise
            except Exception as e:
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
