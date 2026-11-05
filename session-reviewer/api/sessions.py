"""قراءة تقارير Supabase. المفتاح السري يفضل على السيرفر."""

from __future__ import annotations

import hmac
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler


def _env(name: str) -> str:
    return os.getenv(name, "").strip()


def _supabase_get(path: str) -> list:
    base = _env("SUPABASE_URL").rstrip("/")
    key = _env("SUPABASE_SERVICE_ROLE_KEY")
    if not base or not key:
        raise RuntimeError("Supabase مش متوصل على السيرفر.")
    req = urllib.request.Request(f"{base}/rest/v1/{path}")
    req.add_header("apikey", key)
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as ex:
        detail = ex.read().decode("utf-8", errors="replace")[:240]
        raise RuntimeError(f"Supabase رجّع {ex.code}: {detail}") from ex


class handler(BaseHTTPRequestHandler):
    def _send(self, status: int, payload: dict) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:
        expected = _env("SITE_PASSWORD")
        given = self.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        if not expected or not hmac.compare_digest(given, expected):
            self._send(401, {"error": "كلمة السر مطلوبة."})
            return
        query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        slug = (query.get("slug") or [""])[0].strip()
        try:
            if slug:
                if ".." in slug or slug.startswith("/"):
                    self._send(400, {"error": "التقرير مش معروف."})
                    return
                rows = _supabase_get(
                    "sessions?slug=eq."
                    + urllib.parse.quote(slug, safe="")
                    + "&select=slug,title,topic,source,created_at,report_html,transcript,total,major,moderate,minor"
                )
                if not rows:
                    self._send(404, {"error": "التقرير مش موجود."})
                    return
                self._send(200, rows[0])
                return
            rows = _supabase_get(
                "sessions?select=slug,title,topic,created_at,total,major,moderate,minor&order=created_at.desc"
            )
            self._send(200, {"sessions": rows})
        except Exception as ex:
            self._send(500, {"error": str(ex)})
