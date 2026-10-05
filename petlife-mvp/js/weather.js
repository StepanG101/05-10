/* ============================================================================
 * PetLife — weather.js
 * Погода для прогулки: температура, влажность, ветер, осадки, температура
 * асфальта, качество воздуха (AQI, пыльца, UV), лучшее время и маршрут.
 *
 * Источники (оба открытые, ключ не нужен):
 *   1) локальный Python-сервер  → /api/weather?city=...
 *   2) напрямую Open-Meteo       → если сервер не запущен (index.html открыт файлом)
 * Если в js/config.js указан ключ OpenWeather — сервер использует его.
 * ==========================================================================*/
(function () {
  "use strict";
  const D = window.PL_DATA;
  const BASE = (window.PETLIFE_CONFIG && window.PETLIFE_CONFIG.API_BASE) || "";

  const WEATHER_CODES = {
    0: ["ясно", "☀️"], 1: ["преимущественно ясно", "🌤"], 2: ["переменная облачность", "⛅"], 3: ["пасмурно", "☁️"],
    45: ["туман", "🌫"], 48: ["изморозь", "🌫"], 51: ["лёгкая морось", "🌦"], 53: ["морось", "🌦"], 55: ["сильная морось", "🌧"],
    56: ["ледяная морось", "🌧"], 57: ["сильная ледяная морось", "🌧"], 61: ["небольшой дождь", "🌦"], 63: ["дождь", "🌧"],
    65: ["сильный дождь", "🌧"], 66: ["ледяной дождь", "🌧"], 67: ["сильный ледяной дождь", "🌧"], 71: ["небольшой снег", "🌨"],
    73: ["снег", "❄️"], 75: ["сильный снег", "❄️"], 77: ["снежные зёрна", "🌨"], 80: ["небольшой ливень", "🌦"], 81: ["ливень", "🌧"],
    82: ["сильный ливень", "⛈"], 85: ["небольшой снегопад", "🌨"], 86: ["сильный снегопад", "❄️"], 95: ["гроза", "⛈"],
    96: ["гроза с градом", "⛈"], 99: ["сильная гроза с градом", "⛈"]
  };

  const OW_CODES = { 200: "гроза", 300: "морось", 500: "дождь", 600: "снег", 700: "туман", 800: "ясно", 801: "малооблачно", 802: "облачно", 803: "облачно", 804: "пасмурно" };

  function cityHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 100000;
    return h;
  }

  async function fetchJSON(url, timeout) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout || 9000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error("http-" + res.status);
      return await res.json();
    } finally { clearTimeout(timer); }
  }

  /* ---------------------------------------------------------------- расчёты ТЗ */
  function asphalt(temp) {
    const t = +temp;
    if (t > 25) return Math.round(t + 20);
    if (t >= 15) return Math.round(t + 10);
    if (t >= 0) return Math.round(t + 5);
    return Math.round(t - 5);
  }

  function advice(air, asf, size) {
    const small = size === "small" || size === "cat";
    if (asf > 50) return {
      level: "danger", title: "Опасно! Асфальт слишком горячий",
      text: "⚠️ Опасно! Гуляйте до 10:00 или после 20:00. Асфальт может обжечь лапы за секунды.",
      detail: "Приложите тыл ладони к асфальту на 5 секунд: если не можете удержать — питомцу тоже горячо. Перенесите прогулку на тень или используйте обувь."
    };
    if (asf >= 40) return {
      level: "warn", title: "Осторожно: горячий асфальт",
      text: "⚠️ Осторожно. Сократите прогулку, избегайте асфальта, берите воду.",
      detail: "Идите по траве или в тени, делайте паузы и предлагайте воду каждые 10 минут."
    };
    if (air < -10) return {
      level: "danger", title: "Опасно! Сильный мороз",
      text: "⚠️ Опасно! Сократите прогулку до 10 минут. Мелким породам — тёплый комбинезон.",
      detail: small ? "Мелкие породы и кошки мёрзнут первыми: комбинезон, обувь и тёплая подстилка дома." : "Следите за лапами: реагенты и лёд травмируют подушечки, после прогулки промойте лапы тёплой водой."
    };
    if (air < 0) return {
      level: "warn", title: "Прохладно",
      text: "❄️ Прохладно. Одевайте питомца, сократите прогулку.",
      detail: small ? "Для мелких пород и кошек — свитер или комбинезон, прогулка 20–30 минут." : "Активным породам комфортно, но после прогулки протрите лапы."
    };
    if (air > 30) return {
      level: "warn", title: "Жарко",
      text: "🥵 Жарко. Гуляйте рано утром или поздно вечером, берите воду.",
      detail: "Брахицефальные породы (мопс, бульдог, перс) в группе риска: перегреваются за 10 минут."
    };
    return {
      level: "ok", title: "Отличное время для прогулки",
      text: "✅ Отличное время для прогулки!",
      detail: "Идеальные условия для активности: " + (small ? "25–40 минут" : "45–90 минут") + " с играми и нюханием."
    };
  }

  function bestTimes(hourly, size) {
    if (!hourly || !hourly.length) return [];
    const good = hourly.filter((h) => {
      const asf = asphalt(h.temp);
      return asf < 40 && h.temp > -10 && h.temp < 30 && (h.precip == null || h.precip < 0.6);
    });
    const windows = [];
    good.forEach((h) => {
      const last = windows[windows.length - 1];
      const hour = parseInt(h.time.slice(11, 13), 10);
      if (last && hour === last.toHour + 1) { last.toHour = hour; last.to = h.time.slice(11, 16); }
      else windows.push({ fromHour: hour, toHour: hour, from: h.time.slice(11, 16), to: h.time.slice(11, 16), temp: h.temp, asf: asphalt(h.temp) });
    });
    return windows.map((w) => ({
      from: w.from, to: w.to, temp: w.temp, asf: w.asf,
      reason: w.asf < 25 ? "прохладный асфальт, комфортная температура" : "асфальт в безопасных пределах"
    }));
  }

  function aqiLevel(aqi) {
    if (aqi == null) return { label: "нет данных", kind: "muted" };
    if (aqi <= 20) return { label: "отлично", kind: "ok" };
    if (aqi <= 40) return { label: "хорошо", kind: "ok" };
    if (aqi <= 60) return { label: "средне", kind: "warn" };
    if (aqi <= 80) return { label: "плохо", kind: "warn" };
    return { label: "очень плохо", kind: "danger" };
  }

  function uvLevel(uv) {
    if (uv == null) return { label: "нет данных", kind: "muted" };
    if (uv < 3) return { label: "низкий", kind: "ok" };
    if (uv < 6) return { label: "умеренный", kind: "ok" };
    if (uv < 8) return { label: "высокий", kind: "warn" };
    return { label: "очень высокий", kind: "danger" };
  }

  function pollenLevel(v) {
    if (v == null) return { label: "нет данных", kind: "muted" };
    if (v < 10) return { label: "низкая", kind: "ok" };
    if (v < 50) return { label: "умеренная", kind: "warn" };
    return { label: "высокая", kind: "danger" };
  }

  function route(city, minutes, size) {
    const parks = D.places.filter((p) => p.type === "park");
    const extras = D.places.filter((p) => ["cafe", "shop", "training"].includes(p.type));
    const h = cityHash(city || "город");
    const p1 = parks[h % parks.length];
    const p2 = extras[(h >> 2) % extras.length];
    const speed = size === "small" || size === "cat" ? 3.2 : size === "large" ? 4.2 : 3.8;
    const km = +((minutes / 60) * speed).toFixed(1);
    const variants = [
      { name: "Кольцевой маршрут вокруг парка", waypoints: [p1.name, "Тихая аллея", "Площадка для выгула", p1.name] },
      { name: "Маршрут «Новые запахи»", waypoints: ["Двор", p1.name, "Пруд", "Новый двор"] },
      { name: "Социальный маршрут", waypoints: [p1.name, p2.name, "Площадка знакомств", "Домой"] }
    ];
    const v = variants[h % variants.length];
    const steps = Math.round((km * 1000) / (size === "small" ? 0.42 : 0.62));
    return {
      name: v.name, km, minutes, steps, waypoints: v.waypoints,
      pointsOfInterest: [p1, p2].filter(Boolean).map((p) => ({ name: p.name, type: p.type, emoji: p.emoji, note: p.note })),
      tip: size === "small" || size === "cat"
        ? "Мелким породам хватает 25–40 минут, но лучше 2 прогулки в день."
        : "Крупным породам нужна нагрузка: добавьте 10 минут быстрого шага и игру в апортт."
    };
  }

  /* ---------------------------------------------------------------- источник данных */
  async function fromServer(city) {
    const data = await fetchJSON(BASE + "/api/weather?city=" + encodeURIComponent(city));
    if (data && data.error) {
      const map = { empty: "Введите город", "not-found": "Город не найден. Проверьте название.", api: "Не удалось получить погоду. Попробуйте позже." };
      throw new Error(map[data.error] || "Не удалось получить погоду. Попробуйте позже.");
    }
    return data;
  }

  async function fromOpenMeteo(city) {
    const geo = await fetchJSON("https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(city) + "&count=1&language=ru&format=json");
    const place = (geo.results || [])[0];
    if (!place) throw new Error("Город не найден. Проверьте название.");
    const label = [place.name, place.admin1 && place.admin1 !== place.name ? place.admin1 : place.country].filter(Boolean).join(", ");

    const fc = await fetchJSON("https://api.open-meteo.com/v1/forecast?latitude=" + place.latitude + "&longitude=" + place.longitude +
      "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation" +
      "&hourly=temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m,weather_code" +
      "&wind_speed_unit=ms&timezone=auto&forecast_days=2");
    const cur = fc.current || {};
    if (cur.temperature_2m == null) throw new Error("Не удалось получить погоду. Попробуйте позже.");

    let air = null;
    try {
      const aq = await fetchJSON("https://air-quality-api.open-meteo.com/v1/air-quality?latitude=" + place.latitude + "&longitude=" + place.longitude +
        "&current=pm2_5,pm10,uv_index,grass_pollen,birch_pollen,alder_pollen,european_aqi&timezone=auto");
      air = aq.current || null;
    } catch (e) { air = null; }

    const hourly = [];
    const times = (fc.hourly && fc.hourly.time) || [];
    for (let i = 0; i < times.length; i++) {
      const d = new Date(times[i]);
      if (d.getTime() < Date.now() - 3600000) continue;
      hourly.push({
        time: times[i], temp: fc.hourly.temperature_2m[i], apparent: fc.hourly.apparent_temperature[i],
        precip: (fc.hourly.precipitation_probability || [])[i], wind: (fc.hourly.wind_speed_10m || [])[i]
      });
      if (hourly.length >= 24) break;
    }

    const code = cur.weather_code != null ? Math.round(cur.weather_code) : null;
    const desc = code != null && WEATHER_CODES[code] ? WEATHER_CODES[code][0] : "переменная облачность";
    return {
      cityName: label, temp: +cur.temperature_2m, feelsLike: +(cur.apparent_temperature != null ? cur.apparent_temperature : cur.temperature_2m),
      humidity: cur.relative_humidity_2m, wind: cur.wind_speed_10m, precip: cur.precipitation, description: desc,
      code, hourly, air, source: "open-meteo", lat: place.latitude, lon: place.longitude
    };
  }

  const Weather = {
    asphalt, advice, bestTimes, route, aqiLevel, uvLevel, pollenLevel, cityHash,

    iconFor(data) {
      if (!data) return "🌤";
      if (data.code != null && WEATHER_CODES[data.code]) return WEATHER_CODES[data.code][1];
      const d = (data.description || "").toLowerCase();
      if (d.includes("дожд") || d.includes("ливень") || d.includes("морос")) return "🌧";
      if (d.includes("снег")) return "❄️";
      if (d.includes("гроза")) return "⛈";
      if (d.includes("облач") || d.includes("пасмур")) return "⛅";
      if (d.includes("туман")) return "🌫";
      if (d.includes("ясно")) return "☀️";
      return "🌤";
    },

    /* полный пакет: погода + асфальт + AQI + время + маршрут */
    async get(city, opts) {
      const o = Object.assign({ size: "medium", minutes: 60, preferServer: true }, opts || {});
      if (!city || !city.trim()) throw new Error("Введите город");
      let data = null;
      let lastError = null;

      if (o.preferServer) {
        try { data = await fromServer(city.trim()); }
        catch (err) { lastError = err; }
      }
      if (!data) {
        try { data = await fromOpenMeteo(city.trim()); }
        catch (err) {
          if (err && err.message && err.message.indexOf("Город не найден") === 0) throw err;
          throw new Error("Не удалось получить погоду. Попробуйте позже.");
        }
      }
      if (!data) throw lastError || new Error("Не удалось получить погоду. Попробуйте позже.");

      data.asphalt = asphalt(data.temp);
      data.advice = advice(+data.temp, data.asphalt, o.size);
      data.best = bestTimes(data.hourly, o.size);
      data.route = route(data.cityName || city, o.minutes, o.size);
      data.airLevel = aqiLevel(data.air && (data.air.european_aqi != null ? data.air.european_aqi : data.air.aqi));
      data.uvLevel = uvLevel(data.air && data.air.uv_index);
      data.pollenLevel = pollenLevel(data.air && (data.air.grass_pollen != null ? Math.max(data.air.grass_pollen || 0, data.air.birch_pollen || 0, data.air.alder_pollen || 0) : null));
      data.icon = this.iconFor(data);
      data.fetchedAt = new Date().toISOString();
      try { window.Store.update((s) => { s.lastWeather = data; }, "weather"); } catch (e) { /* store может быть ещё не готов */ }
      return data;
    },

    /* демо-данные, если сеть недоступна: показываем честно помеченный набор */
    demo(city, size) {
      const h = cityHash(city || "Москва");
      const temp = Math.round(((h % 40) - 12) + Math.sin(h) * 4);
      const code = [0, 1, 2, 3, 61, 71][h % 6];
      const data = {
        cityName: (city || "Москва") + " (демо-данные)", temp, feelsLike: temp - 1, humidity: 45 + (h % 40), wind: +(1 + (h % 50) / 10).toFixed(1),
        precip: 0, description: WEATHER_CODES[code][0], code, air: { european_aqi: 18 + (h % 30), uv_index: (h % 8), pm2_5: 6 + (h % 12), grass_pollen: h % 60 },
        hourly: Array.from({ length: 24 }, (_, i) => {
          const hour = (new Date().getHours() + i) % 24;
          const t = temp + Math.round(Math.sin((hour - 6) / 24 * Math.PI * 2) * 7);
          const date = new Date(Date.now() + i * 3600000);
          return { time: date.toISOString().slice(0, 13) + ":00", temp: t, apparent: t - 1, precip: (h + i) % 40, wind: 2 + (i % 4) };
        }),
        source: "demo", demo: true
      };
      data.asphalt = asphalt(data.temp);
      data.advice = advice(data.temp, data.asphalt, size || "medium");
      data.best = bestTimes(data.hourly, size || "medium");
      data.route = route(data.cityName, 60, size || "medium");
      data.airLevel = aqiLevel(data.air.european_aqi);
      data.uvLevel = uvLevel(data.air.uv_index);
      data.pollenLevel = pollenLevel(data.air.grass_pollen);
      data.icon = this.iconFor(data);
      return data;
    },

    /* карточка погоды (используется и на лендинге, и в кабинете) */
    renderCard(data, opts) {
      const { esc, fmt, badge, progress } = window.PL;
      const o = opts || {};
      const adv = data.advice;
      const a = data.air || {};
      const aqi = a.european_aqi != null ? a.european_aqi : a.aqi;
      const pollenMax = Math.max(a.grass_pollen || 0, a.birch_pollen || 0, a.alder_pollen || 0);
      const bestHtml = (data.best || []).slice(0, 3).map((b) =>
        `<div class="metric"><span class="m-ico">⏰</span><span><span class="m-label">Лучшее время</span><span class="m-value">${esc(b.from)}–${esc(b.to)}</span></span></div>`).join("");
      const demoNote = data.demo || data.source === "demo"
        ? `<div class="warn-note">⚠️ Показаны демонстрационные данные: интернет или API недоступны. Расчёты асфальта, рекомендаций и маршрута — настоящие.</div>` : "";
      return `
        <div class="weather-result">
          <div class="weather-hero">
            <div>
              <div class="weather-city">${esc(data.cityName)}</div>
              <div class="weather-temp">${fmt.temp(data.temp)}</div>
              <div class="weather-desc">${esc(data.description)} · ощущается ${fmt.temp(data.feelsLike)}</div>
            </div>
            <div class="weather-big-emoji">${data.icon || "🌤"}</div>
          </div>
          <div class="metric-grid">
            <div class="metric"><span class="m-ico">🔥</span><span><span class="m-label">Асфальт (расчёт)</span><span class="m-value" style="color:${data.asphalt > 50 ? "#E53935" : data.asphalt >= 40 ? "#FB8C00" : "#43A047"}">${fmt.temp(data.asphalt)}</span></span></div>
            <div class="metric"><span class="m-ico">💧</span><span><span class="m-label">Влажность</span><span class="m-value">${fmt.num(data.humidity, 0)}%</span></span></div>
            <div class="metric"><span class="m-ico">🌬</span><span><span class="m-label">Ветер</span><span class="m-value">${fmt.num(data.wind, 1)} м/с</span></span></div>
            <div class="metric"><span class="m-ico">🌡</span><span><span class="m-label">Ощущается</span><span class="m-value">${fmt.temp(data.feelsLike)}</span></span></div>
            <div class="metric"><span class="m-ico">😮‍💨</span><span><span class="m-label">Качество воздуха (AQI)</span><span class="m-value">${aqi != null ? fmt.num(aqi, 0) : "—"} ${aqi != null ? "· " + esc(data.airLevel.label) : ""}</span></span></div>
            <div class="metric"><span class="m-ico">🔆</span><span><span class="m-label">UV-индекс</span><span class="m-value">${a.uv_index != null ? fmt.num(a.uv_index, 0) : "—"} ${a.uv_index != null ? "· " + esc(data.uvLevel.label) : ""}</span></span></div>
            <div class="metric"><span class="m-ico">🌾</span><span><span class="m-label">Пыльца</span><span class="m-value">${pollenMax ? esc(data.pollenLevel.label) : "—"}</span></span></div>
            <div class="metric"><span class="m-ico">☔️</span><span><span class="m-label">Осадки</span><span class="m-value">${data.precip != null ? fmt.num(data.precip, 1) + " мм" : (a.precipitation_probability != null ? a.precipitation_probability + "%" : "—")}</span></span></div>
            ${bestHtml}
          </div>
          <div class="advice ${adv.level}">
            <div>
              <div>${esc(adv.text)}</div>
              <small>${esc(adv.detail)}</small>
            </div>
          </div>
          ${demoNote}
          ${o.compact ? "" : `
          <div class="row mt-2" style="gap:8px">
            <button class="btn btn-soft btn-sm" data-act="walk.route" data-city="${esc(data.cityName)}">🗺 Показать маршрут</button>
            <button class="btn btn-soft btn-sm" data-act="walk.save" data-city="${esc(data.cityName)}">💾 Сохранить в дневник прогулок</button>
            <button class="btn btn-soft btn-sm" data-act="walk.start" data-city="${esc(data.cityName)}">⏱ Запустить таймер прогулки</button>
            <button class="btn btn-ghost btn-sm" data-act="hub.open" data-panel="walk" data-tab="hourly">📈 Прогноз на 24 часа</button>
          </div>`}
        </div>`;
    }
  };

  window.Weather = Weather;
})();
