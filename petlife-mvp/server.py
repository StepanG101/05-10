#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
============================================================================
 PetLife — локальный сервер MVP
============================================================================
 Запуск:   python server.py        (или двойной клик по start.bat)
 Адрес:    http://127.0.0.1:8765/

 Что делает:
   • отдаёт статику проекта (HTML/CSS/JS) без сборщиков и зависимостей;
   • /api/weather   — погода + AQI + UV + пыльца + почасовой прогноз
                      (Open-Meteo без ключа, либо OpenWeather при наличии ключа);
   • /api/analyze   — vision-анализ фото через OpenRouter (если есть ключ);
   • /api/ai/chat   — ИИ-ассистент через OpenRouter (если есть ключ);
   • /api/access    — сохранение заявок на ранний доступ в data/signups.json;
   • /api/health    — состояние сервера и ключей.

 Ключи берутся из js/config.js , из переменных окружения
 (PETLIFE_OPENWEATHER_KEY / PETLIFE_OPENROUTER_KEY) или из keys.json.
 Без ключей сайт всё равно полностью работает в демо-режиме.
============================================================================
"""

from __future__ import annotations

import json
import os
import re
import socket
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from datetime import datetime, timedelta, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
SIGNUPS_FILE = DATA_DIR / "signups.json"
HOST = "127.0.0.1"
DEFAULT_PORT = int(os.environ.get("PETLIFE_PORT", "8765"))
VERSION = "2.0"
USER_AGENT = "PetLife-MVP/2.0 (+local demo)"

WEATHER_CODES = {
    0: ("ясно", "☀️"), 1: ("преимущественно ясно", "🌤"), 2: ("переменная облачность", "⛅"), 3: ("пасмурно", "☁️"),
    45: ("туман", "🌫"), 48: ("изморозь", "🌫"), 51: ("лёгкая морось", "🌦"), 53: ("морось", "🌦"), 55: ("сильная морось", "🌧"),
    56: ("ледяная морось", "🌧"), 57: ("сильная ледяная морось", "🌧"), 61: ("небольшой дождь", "🌦"), 63: ("дождь", "🌧"),
    65: ("сильный дождь", "🌧"), 66: ("ледяной дождь", "🌧"), 67: ("сильный ледяной дождь", "🌧"), 71: ("небольшой снег", "🌨"),
    73: ("снег", "❄️"), 75: ("сильный снег", "❄️"), 77: ("снежные зёрна", "🌨"), 80: ("небольшой ливень", "🌦"), 81: ("ливень", "🌧"),
    82: ("сильный ливень", "⛈"), 85: ("небольшой снегопад", "🌨"), 86: ("сильный снегопад", "❄️"), 95: ("гроза", "⛈"),
    96: ("гроза с градом", "⛈"), 99: ("сильная гроза с градом", "⛈"),
}

OW_MAP = {
    "ясно": "ясно", "малооблачно": "малооблачно", "облачно": "облачно с прояснениями", "пасмурно": "пасмурно",
    "небольшой дождь": "небольшой дождь", "дождь": "дождь", "ливень": "ливень", "снег": "снег",
    "небольшой снег": "небольшой снег", "гроза": "гроза", "туман": "туман", "морось": "морось",
}

VISION_MODELS = [
    "meta-llama/llama-3.2-11b-vision-instruct:free",
    "google/gemini-2.0-flash-exp:free",
    "qwen/qwen2.5-vl-7b-instruct:free",
]
TEXT_MODELS = [
    "meta-llama/llama-3.3-70b-instruct:free",
    "google/gemini-2.0-flash-exp:free",
    "mistralai/mistral-7b-instruct:free",
]

PROMPT = (
    "Ты — ветеринарный ассистент. Посмотри на фото питомца. Кратко опиши, что видишь. "
    "Если есть признаки проблем со здоровьем — укажи. Дай рекомендацию: наблюдать дома "
    "или обратиться к ветеринару. Отвечай на русском, дружелюбно, максимум 5 предложений."
)

CHAT_PROMPT = (
    "Ты — PetLife AI, дружелюбный ассистент для владельцев питомцев. Отвечай на русском языке, "
    "структурно и по делу, максимум 8 предложений. Учитывай контекст питомца. "
    "Не назначай лекарства и дозировки, при серьёзных симптомах рекомендуй ветеринара."
)


# --------------------------------------------------------------------------- утилиты
def log(message: str) -> None:
    sys.stdout.write(message + "\n")
    sys.stdout.flush()


def read_keys() -> dict:
    """Ключи: env → keys.json → js/config.js."""
    keys = {"openweather": os.environ.get("PETLIFE_OPENWEATHER_KEY", "").strip(),
            "openrouter": os.environ.get("PETLIFE_OPENROUTER_KEY", "").strip(),
            "vision_model": "", "text_model": "", "port": ""}

    keys_file = ROOT / "keys.json"
    if keys_file.exists():
        try:
            data = json.loads(keys_file.read_text(encoding="utf-8"))
            for src, dst in (("openweather", "openweather"), ("openweather_api_key", "openweather"),
                             ("openrouter", "openrouter"), ("openrouter_api_key", "openrouter"),
                             ("vision_model", "vision_model"), ("text_model", "text_model"), ("port", "port")):
                if not keys.get(dst) and data.get(src):
                    keys[dst] = str(data[src]).strip()
        except Exception:
            log("! keys.json повреждён — пропускаю")

    config = ROOT / "js" / "config.js"
    if config.exists():
        try:
            text = config.read_text(encoding="utf-8")
            def grab(name: str) -> str:
                match = re.search(rf'{name}\s*:\s*"([^"]*)"', text)
                return match.group(1).strip() if match else ""
            for field, dst in (("OPENWEATHER_API_KEY", "openweather"), ("OPENROUTER_API_KEY", "openrouter"),
                               ("OPENROUTER_MODEL", "vision_model"), ("OPENROUTER_TEXT_MODEL", "text_model")):
                if not keys.get(dst):
                    keys[dst] = grab(field)
        except Exception:
            log("! js/config.js не прочитан — работаю на демо-данных")

    if not keys["vision_model"]:
        keys["vision_model"] = VISION_MODELS[0]
    if not keys["text_model"]:
        keys["text_model"] = TEXT_MODELS[0]
    if not keys["port"]:
        keys["port"] = str(DEFAULT_PORT)
    return keys


KEYS = read_keys()


def has_key(value: str) -> bool:
    return bool(value) and not value.upper().startswith(("YOUR_", "PASTE", "ВСТАВЬ", "XXX"))


def http_json(url: str, timeout: float = 12.0, headers: dict | None = None, payload: bytes | None = None) -> dict:
    request = urllib.request.Request(url, data=payload, headers=headers or {"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read().decode("utf-8", errors="replace")
    return json.loads(raw) if raw else {}


def free_port(start: int) -> int:
    for port in range(start, start + 25):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            if sock.connect_ex((HOST, port)) != 0:
                return port
    return start


# --------------------------------------------------------------------------- погода
def weather_open_meteo(city: str) -> dict:
    geo = http_json("https://geocoding-api.open-meteo.com/v1/search?" + urllib.parse.urlencode(
        {"name": city, "count": 1, "language": "ru", "format": "json"}))
    results = geo.get("results") or []
    if not results:
        raise LookupError("not-found")

    place = results[0]
    label = place.get("name") or city
    if place.get("admin1") and place["admin1"] != label:
        label = f"{label}, {place['admin1']}"
    elif place.get("country"):
        label = f"{label}, {place['country']}"

    forecast = http_json("https://api.open-meteo.com/v1/forecast?" + urllib.parse.urlencode({
        "latitude": place["latitude"], "longitude": place["longitude"],
        "current": "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation",
        "hourly": "temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m,weather_code",
        "wind_speed_unit": "ms", "timezone": "auto", "forecast_days": 2,
    }))
    current = forecast.get("current") or {}
    if current.get("temperature_2m") is None:
        raise RuntimeError("api")

    hourly_raw = forecast.get("hourly") or {}
    times = hourly_raw.get("time") or []
    now = datetime.now().astimezone()
    hourly = []
    for index, stamp in enumerate(times):
        try:
            moment = datetime.fromisoformat(stamp)
        except ValueError:
            continue
        if now.tzinfo is not None:
            if moment.tzinfo is None:
                moment = moment.replace(tzinfo=now.tzinfo)
            else:
                moment = moment.astimezone(now.tzinfo)
        if moment < now - timedelta(hours=1):
            continue
        hourly.append({
            "time": stamp,
            "temp": hourly_raw.get("temperature_2m", [None])[index],
            "apparent": hourly_raw.get("apparent_temperature", [None])[index],
            "precip": hourly_raw.get("precipitation_probability", [None])[index],
            "wind": hourly_raw.get("wind_speed_10m", [None])[index],
        })
        if len(hourly) >= 24:
            break

    air = None
    try:
        air_raw = http_json("https://air-quality-api.open-meteo.com/v1/air-quality?" + urllib.parse.urlencode({
            "latitude": place["latitude"], "longitude": place["longitude"],
            "current": "pm2_5,pm10,uv_index,european_aqi,grass_pollen,birch_pollen,alder_pollen",
            "timezone": "auto",
        }))
        air = air_raw.get("current") or None
    except Exception:
        air = None

    code = int(current.get("weather_code") or 0)
    description, icon = WEATHER_CODES.get(code, ("переменная облачность", "⛅"))
    return {
        "cityName": label,
        "temp": round(float(current["temperature_2m"]), 1),
        "feelsLike": round(float(current.get("apparent_temperature") or current["temperature_2m"]), 1),
        "humidity": int(current.get("relative_humidity_2m") or 0),
        "wind": round(float(current.get("wind_speed_10m") or 0), 1),
        "precip": float(current.get("precipitation") or 0),
        "description": description,
        "code": code,
        "icon": icon,
        "hourly": hourly,
        "air": air,
        "source": "open-meteo",
        "lat": place.get("latitude"),
        "lon": place.get("longitude"),
    }


def weather_openweather(city: str) -> dict:
    query = urllib.parse.urlencode({"q": city, "appid": KEYS["openweather"], "units": "metric", "lang": "ru"})
    data = http_json(f"https://api.openweathermap.org/data/2.5/weather?{query}")
    main = data.get("main") or {}
    wind = data.get("wind") or {}
    weather = (data.get("weather") or [{}])[0]
    description = OW_MAP.get(weather.get("description", ""), weather.get("description") or "переменная погода")
    return {
        "cityName": f"{data.get('name', city)}, {((data.get('sys') or {}).get('country') or '')}".strip(", "),
        "temp": round(float(main.get("temp") or 0), 1),
        "feelsLike": round(float(main.get("feels_like") or main.get("temp") or 0), 1),
        "humidity": int(main.get("humidity") or 0),
        "wind": round(float(wind.get("speed") or 0), 1),
        "precip": float((data.get("rain") or {}).get("1h") or 0),
        "description": description,
        "code": None,
        "icon": "🌤",
        "hourly": [],
        "air": None,
        "source": "openweather",
    }


def fetch_weather(city: str) -> dict:
    """OpenWeather при наличии ключа (ТЗ), иначе — открытый Open-Meteo."""
    if has_key(KEYS["openweather"]):
        try:
            return weather_openweather(city)
        except LookupError:
            raise
        except urllib.error.HTTPError as err:
            if err.code == 404:
                raise LookupError("not-found")
        except Exception:
            pass
    return weather_open_meteo(city)


# --------------------------------------------------------------------------- ИИ
def extract_text(payload: dict) -> str:
    choices = payload.get("choices") or []
    if not choices:
        return ""
    content = ((choices[0] or {}).get("message") or {}).get("content")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                parts.append(item.get("text") or "")
        return " ".join(parts).strip()
    return ""


def openrouter_call(models: list, messages: list, timeout: float = 60.0) -> tuple[str, object]:
    last_error: object = "Что-то пошло не так. Попробуйте позже."
    for model in models:
        body = json.dumps({"model": model, "messages": messages, "max_tokens": 700}).encode("utf-8")
        request = urllib.request.Request(
            "https://openrouter.ai/api/v1/chat/completions", data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": "Bearer " + KEYS["openrouter"],
                "HTTP-Referer": f"http://{HOST}:{KEYS['port']}",
                "X-Title": "PetLife MVP",
            }, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                data = json.loads(response.read().decode("utf-8", errors="replace"))
            text = extract_text(data)
            if text:
                return text, model
            last_error = "Модель не вернула текст анализа."
        except urllib.error.HTTPError as err:
            detail = err.read().decode("utf-8", errors="ignore")
            message = ""
            try:
                parsed = json.loads(detail)
                message = ((parsed.get("error") or {}).get("message")) or parsed.get("message") or ""
            except json.JSONDecodeError:
                message = detail[:200]
            if err.code == 401:
                return "", 401
            if err.code == 429:
                return "", 429
            last_error = message or f"HTTP {err.code}"
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc) or "network"
    return "", last_error


def analyze_image(data_url: str) -> dict:
    if not has_key(KEYS["openrouter"]):
        return {"local": True, "source": "local"}

    models = [KEYS["vision_model"]] + [m for m in VISION_MODELS if m != KEYS["vision_model"]]
    messages = [{"role": "user", "content": [
        {"type": "text", "text": PROMPT},
        {"type": "image_url", "image_url": {"url": data_url}},
    ]}]
    text, status = openrouter_call(models, messages)
    if text:
        return {"text": text, "source": "openrouter"}
    if status == 401:
        return {"error": "Ошибка API-ключа. Проверьте ключ OpenRouter.", "source": "local", "local": True}
    if status == 429:
        return {"error": "Слишком много запросов. Подождите минуту.", "source": "local", "local": True}
    return {"local": True, "source": "local", "note": str(status)}


def chat_completion(question: str, context: str, history: list) -> dict:
    if not has_key(KEYS["openrouter"]):
        return {"local": True, "source": "local"}

    messages = [{"role": "system", "content": CHAT_PROMPT + "\n\nКонтекст питомца: " + (context or "нет данных")}]
    for item in (history or [])[-6:]:
        role = "assistant" if item.get("role") == "assistant" else "user"
        text = str(item.get("content") or item.get("text") or "")[:1200]
        if text:
            messages.append({"role": role, "content": text})
    messages.append({"role": "user", "content": question})

    models = [KEYS["text_model"]] + [m for m in TEXT_MODELS if m != KEYS["text_model"]]
    text, status = openrouter_call(models, messages, timeout=45.0)
    if text:
        return {"text": text, "source": "openrouter"}
    if status == 401:
        return {"error": "Ошибка API-ключа. Проверьте ключ OpenRouter.", "source": "local", "local": True}
    if status == 429:
        return {"error": "Слишком много запросов. Подождите минуту.", "source": "local", "local": True}
    return {"local": True, "source": "local"}


# --------------------------------------------------------------------------- заявки
def save_signup(entry: dict) -> int:
    DATA_DIR.mkdir(exist_ok=True)
    items = []
    if SIGNUPS_FILE.exists():
        try:
            items = json.loads(SIGNUPS_FILE.read_text(encoding="utf-8"))
            if not isinstance(items, list):
                items = []
        except json.JSONDecodeError:
            items = []
    items.append(entry)
    SIGNUPS_FILE.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    return len(items)


def count_signups() -> int:
    if not SIGNUPS_FILE.exists():
        return 0
    try:
        data = json.loads(SIGNUPS_FILE.read_text(encoding="utf-8"))
        return len(data) if isinstance(data, list) else 0
    except Exception:
        return 0


# --------------------------------------------------------------------------- сервер
class PetLifeHandler(SimpleHTTPRequestHandler):
    server_version = "PetLife/" + VERSION

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        sys.stdout.write("  · " + (fmt % args) + "\n")
        sys.stdout.flush()

    # ---------- ответы
    def _json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length > 9 * 1024 * 1024:
            raise ValueError("too-large")
        if not length:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    # ---------- GET
    def do_GET(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/weather":
            city = (urllib.parse.parse_qs(parsed.query).get("city") or [""])[0].strip()
            if not city:
                self._json({"error": "empty"}, 400)
                return
            try:
                self._json(fetch_weather(city))
            except LookupError:
                self._json({"error": "not-found"}, 404)
            except Exception as exc:  # noqa: BLE001
                log(f"! погода: {exc}")
                self._json({"error": "api"}, 502)
            return

        if path == "/api/health":
            self._json({
                "ok": True, "version": VERSION, "time": datetime.now(timezone.utc).isoformat(),
                "openweather": has_key(KEYS["openweather"]),
                "openrouter": has_key(KEYS["openrouter"]),
                "weather_source": "openweather" if has_key(KEYS["openweather"]) else "open-meteo",
                "ai_source": "openrouter" if has_key(KEYS["openrouter"]) else "local",
                "vision_model": KEYS["vision_model"], "text_model": KEYS["text_model"],
                "signups": count_signups(),
            })
            return

        if path == "/api/signups":
            items = []
            if SIGNUPS_FILE.exists():
                try:
                    items = json.loads(SIGNUPS_FILE.read_text(encoding="utf-8"))
                except Exception:
                    items = []
            self._json({"count": len(items), "items": items[-50:]})
            return

        if path in ("/", "/index.html", ""):
            self.path = "/index.html"
        elif path == "/app":
            self.path = "/index.html"
        return SimpleHTTPRequestHandler.do_GET(self)

    # ---------- POST
    def do_POST(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/analyze":
            try:
                payload = self._read_json()
            except ValueError:
                self._json({"error": "Файл слишком большой (макс. 5 МБ)"}, 400)
                return
            except json.JSONDecodeError:
                self._json({"error": "Что-то пошло не так. Попробуйте позже."}, 400)
                return

            data_url = str(payload.get("image") or "")
            if not data_url.startswith("data:image/"):
                self._json({"error": "Загрузите изображение"}, 400)
                return
            result = analyze_image(data_url)
            if result.get("error") and not result.get("local"):
                self._json(result, 200)
                return
            self._json(result)
            return

        if path == "/api/ai/chat":
            try:
                payload = self._read_json()
            except Exception:
                self._json({"error": "Что-то пошло не так. Попробуйте позже."}, 400)
                return
            question = str(payload.get("question") or "").strip()
            if not question:
                self._json({"error": "Пустой вопрос"}, 400)
                return
            self._json(chat_completion(question, str(payload.get("context") or ""), payload.get("history") or []))
            return

        if path == "/api/access":
            try:
                payload = self._read_json()
            except Exception:
                self._json({"error": "bad-request"}, 400)
                return
            name = str(payload.get("name") or "").strip()
            email = str(payload.get("email") or "").strip()
            if len(name) < 2:
                self._json({"error": "name"}, 400)
                return
            if "@" not in email or "." not in email:
                self._json({"error": "email"}, 400)
                return
            total = save_signup({
                "name": name, "email": email, "breed": str(payload.get("breed") or "").strip(),
                "premium": bool(payload.get("premium")), "createdAt": datetime.now(timezone.utc).isoformat(),
            })
            log(f"  + заявка: {name} <{email}> (всего {total})")
            self._json({"ok": True, "total": total})
            return

        self._json({"error": "not-found"}, 404)


# --------------------------------------------------------------------------- старт
def banner(url: str, port: int) -> None:
    line = "=" * 66
    log("")
    log(line)
    log("   🐾  P e t L i f e   —   AI-экосистема для владельцев питомцев")
    log(line)
    log(f"   Сайт:        {url}")
    log(f"   Кабинет:     {url}#hub")
    log(f"   Погода:      {'OpenWeather (ключ найден)' if has_key(KEYS['openweather']) else 'Open-Meteo (без ключа)'}")
    log(f"   ИИ-анализ:   {'OpenRouter vision' if has_key(KEYS['openrouter']) else 'локальный анализатор (ключ не задан)'}")
    log(f"   ИИ-ассистент:{' OpenRouter LLM' if has_key(KEYS['openrouter']) else ' локальная база знаний'}")
    log(f"   Модель:      {KEYS['vision_model']}")
    log(f"   Заявки:      {count_signups()} шт. → data/signups.json")
    log(line)
    log("   Остановить сервер: Ctrl + C")
    log("   Ключи вставить:    js/config.js  (или keys.json, или переменные окружения)")
    log(line)
    log("")


def open_browser(url: str) -> None:
    time.sleep(0.8)
    try:
        webbrowser.open(url)
    except Exception:
        pass


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    os.chdir(ROOT)
    port = free_port(int(KEYS["port"]))
    KEYS["port"] = str(port)

    try:
        httpd = ThreadingHTTPServer((HOST, port), PetLifeHandler)
    except OSError as exc:
        log(f"! Не удалось запустить сервер на порту {port}: {exc}")
        log("  Попробуйте: set PETLIFE_PORT=9000 && python server.py")
        sys.exit(1)

    url = f"http://{HOST}:{port}/"
    banner(url, port)

    if "--no-browser" not in sys.argv:
        threading.Thread(target=open_browser, args=(url,), daemon=True).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        log("\n   Сервер остановлен. Хорошего дня и здоровых питомцев! 🐾\n")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
