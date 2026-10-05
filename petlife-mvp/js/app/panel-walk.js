/* ============================================================================
 * PetLife — app/panel-walk.js
 * Панель «Прогулка и погода»: погода сейчас, асфальт, AQI/UV/пыльца, лучшее
 * время, прогноз на 24 часа, карта района, маршрут, таймер прогулки, дневник.
 * ==========================================================================*/
(function () {
  "use strict";
  const { $, $$, esc, fmt, card, stat, badge, progress, empty, field, table, list, Charts, toast, modal, confirmDialog, Actions, observeOnce } = window.PL;
  const D = window.PL_DATA;

  /* ------------------------------------------------------------- состояние панели */
  const W = {
    data: null,          // последняя погода
    city: "",
    size: "medium",
    mapType: "all",
    activePlace: null,
    routeMinutes: 60,
    loading: false,
    error: null,
    timer: { running: false, startedAt: null, elapsed: 0, target: 45, interval: null, route: null, paused: false }
  };

  function pet() { return window.Store.pet(); }

  function loadSaved() {
    const S = window.Store.state;
    if (!W.city) W.city = (S.owner && S.owner.city) || "";
    if (S.lastWeather && !W.data) W.data = S.lastWeather;
    const p = pet();
    if (p) W.size = p.species === "cat" ? "cat" : (p.size || "medium");
    if (W.data && W.data.advice) {
      W.data.asphalt = window.Weather.asphalt(W.data.temp);
      W.data.advice = window.Weather.advice(+W.data.temp, W.data.asphalt, W.size);
    }
  }

  /* ------------------------------------------------------------- персональные советы */
  function personalAdvice(data, p) {
    const breed = window.Store.breed(p);
    const stage = window.Store.ageStage(p);
    const age = window.Store.age(p);
    const items = [];
    const t = +data.temp;
    if (t < breed.tempMin) items.push({ kind: "danger", text: "Для породы " + breed.name + " холоднее комфортного (" + breed.tempMin + " °C). Нужен комбинезон и сокращённая прогулка." });
    else if (t > breed.tempMax) items.push({ kind: "danger", text: "Выше комфортного максимума (" + breed.tempMax + " °C). Гуляйте до 10:00 или после 20:00, берите воду." });
    else items.push({ kind: "ok", text: "Температура в комфортном диапазоне для " + breed.name + " (" + breed.tempMin + "…" + breed.tempMax + " °C)." });

    const mins = stage.id === "senior" || stage.id === "geriatric" ? Math.round(breed.walk * 0.7)
      : stage.id === "puppy" ? Math.round(breed.walk * 0.5) : breed.walk;
    items.push({ kind: "info", text: "Рекомендуемая длительность для стадии «" + stage.name + "»: " + mins + " минут (" + window.PL.fmt.plural(mins, "прогулка", "прогулки", "прогулок") + " в день)." });

    const floor = window.Weather.asphalt(t);
    if (floor > 40) items.push({ kind: "warn", text: "Асфальт " + fmt.temp(floor) + ": используйте обувь или выбирайте траву и тень." });
    if (data.air && (data.air.european_aqi || 0) > 60) items.push({ kind: "warn", text: "AQI " + Math.round(data.air.european_aqi) + " — сократите прогулку у дорог, лучше парк." });
    if (data.air && (data.air.uv_index || 0) >= 7) items.push({ kind: "warn", text: "Высокий UV-индекс — светлые породы и животные с белой мордой могут обгореть." });
    if (age < 1) items.push({ kind: "info", text: "Щенкам и котятам нельзя долго по асфальту: 5 минут на каждый месяц жизни." });
    if (p.species === "cat") items.push({ kind: "info", text: "Для кошки достаточно 15–25 минут на шлейке или балконе с сеткой." });
    if (data.air && (Math.max(data.air.grass_pollen || 0, data.air.birch_pollen || 0)) > 50) items.push({ kind: "warn", text: "Высокая пыльца: после прогулки протрите лапы и морду влажной салфеткой." });

    const wear = [];
    if (t < 0) wear.push("🧥 тёплый комбинезон");
    if (t < -10) wear.push("👟 обувь на лапы");
    if (floor >= 40) wear.push("👟 обувь от горячего асфальта");
    if (data.precip > 0.5) wear.push("☔️ дождевик");
    if (!wear.length) wear.push("ничего дополнительного — только поводок и вода");
    return { items, mins, wear };
  }

  /* ------------------------------------------------------------- карта района */
  function markerHtml(place, active) {
    return `<button class="map-marker ${active ? "active" : ""}" style="left:${place.x}%;top:${place.y}%" data-act="walk.place" data-id="${place.id}">
      <span class="pin">${place.emoji}</span>
      <span class="pin-label">${esc(place.name)}</span>
    </button>`;
  }

  function mapTab(view) {
    const list_ = D.places.filter((p) => W.mapType === "all" || p.type === W.mapType);
    const active = W.activePlace ? D.places.find((p) => p.id === W.activePlace) : null;
    view.innerHTML = `
      <div class="panel-grid cols-2" style="grid-template-columns:1.4fr 1fr">
        <section class="card">
          <header class="card-head"><h3><span class="card-ico">🗺</span> Карта района</h3>
            <span class="muted small">${list_.length} ${window.PL.fmt.plural(list_.length, "объект", "объекта", "объектов")} рядом</span>
          </header>
          <div class="card-body">
            <div class="chip-row mb-2">
              ${D.mapTypes.map((t) => `<button class="tag ${W.mapType === t.id ? "active" : ""}" data-act="walk.maptype" data-id="${t.id}">${t.emoji} ${esc(t.name)}</button>`).join("")}
            </div>
            <div class="map-wrap">
              <div class="city-map">
                <div class="map-user" style="left:50%;top:50%"><span class="radius"></span><span class="pulse"></span></div>
                ${list_.map((p) => markerHtml(p, W.activePlace === p.id)).join("")}
              </div>
            </div>
            <div class="map-legend">
              <span class="badge badge-info">🏥 ветклиники</span>
              <span class="badge badge-ok">🌳 площадки и парки</span>
              <span class="badge badge-warn">🛍 магазины</span>
              <span class="badge badge-violet">✂️ груминг</span>
              <span class="badge badge-muted">🏨 передержка</span>
            </div>
            ${active ? `
              <div class="hint-box mt-2">
                <b>${active.emoji} ${esc(active.name)}</b>
                <div class="kv mt-1">
                  <div class="kv-row"><span class="kv-k">Адрес</span><span class="kv-v">${esc(active.address)}</span></div>
                  <div class="kv-row"><span class="kv-k">Часы</span><span class="kv-v">${esc(active.hours)}</span></div>
                  <div class="kv-row"><span class="kv-k">Телефон</span><span class="kv-v">${esc(active.phone)}</span></div>
                  <div class="kv-row"><span class="kv-k">Рейтинг</span><span class="kv-v">⭐ ${fmt.num(active.rating, 1)}</span></div>
                  <div class="kv-row"><span class="kv-k">Особенности</span><span class="kv-v">${esc(active.note)}</span></div>
                </div>
                <div class="row mt-2">
                  <a class="btn btn-green btn-sm" href="tel:${esc((active.phone || "").replace(/[^\d+]/g, ""))}">📞 Позвонить</a>
                  <button class="btn btn-soft btn-sm" data-act="walk.route-to" data-id="${active.id}">🧭 Маршрут к месту</button>
                  <button class="btn btn-ghost btn-sm" data-act="walk.place" data-id="">Сбросить</button>
                </div>
              </div>` : `<div class="muted small mt-2">Нажмите на маркер, чтобы увидеть адрес, часы работы и телефон.</div>`}
          </div>
        </section>
        <section class="card">
          <header class="card-head"><h3><span class="card-ico">📍</span> Ближайшие места</h3></header>
          <div class="card-body stack" style="gap:10px">
            ${list_.slice().sort((a, b) => dist(a) - dist(b)).map((p) => `
              <div class="map-item ${W.activePlace === p.id ? "active" : ""}" data-act="walk.place" data-id="${p.id}">
                <span class="mi-ico">${p.emoji}</span>
                <span>
                  <span class="mi-name">${esc(p.name)}</span>
                  <span class="mi-sub">${esc(p.address)} · ${fmt.num(dist(p), 1)} км · ${esc(p.hours)}</span>
                </span>
              </div>`).join("")}
          </div>
        </section>
      </div>`;
  }

  function dist(place) {
    const dx = place.x - 50, dy = place.y - 50;
    return Math.sqrt(dx * dx + dy * dy) * 0.06; // условная шкала: 1% карты ≈ 60 м
  }

  /* ------------------------------------------------------------- вкладки */
  function tabNow(view) {
    const p = pet();
    const data = W.data;
    if (W.loading) {
      view.innerHTML = `<div class="loading-box"><span class="spinner dark"></span> Загружаем погоду, качество воздуха и прогноз…</div>`;
      return;
    }
    if (W.error && !data) {
      view.innerHTML = `<div class="advice danger"><div><div>${esc(W.error)}</div><small>Проверьте название города или подключение к интернету.</small></div></div>
        <div class="row mt-2"><button class="btn btn-primary" data-act="walk.demo">Показать демо-данные</button>
        <button class="btn btn-ghost" data-act="walk.load">Попробовать снова</button></div>`;
      return;
    }
    if (!data) {
      view.innerHTML = card({
        title: "Погода для прогулки", icon: "🌤",
        body: `<div class="hint-box mb-2">Введите город — рассчитаю температуру асфальта, качество воздуха, лучшее время и маршрут для <b>${esc(p.name)}</b>.</div>
          <div class="form-grid">
            ${field({ label: "Город", value: W.city, placeholder: "Например, Москва", id: "walkCity" })}
            ${field({ label: "Тип питомца", type: "select", value: W.size, id: "walkSize", options: [
              { value: "small", label: "Собака (мелкая)" }, { value: "medium", label: "Собака (средняя)" },
              { value: "large", label: "Собака (крупная)" }, { value: "cat", label: "Кошка" }] })}
          </div>
          <button class="btn btn-primary btn-block" data-act="walk.load">🔍 Проверить погоду</button>`
      });
      return;
    }
    const pa = personalAdvice(data, p);
    const a = data.air || {};
    const aqi = a.european_aqi != null ? a.european_aqi : a.aqi;
    const windows = (data.best || []).slice(0, 4);
    view.innerHTML = `
      <div class="kpi-row mb-2">
        ${stat({ icon: "🔥", value: fmt.temp(data.asphalt), label: "Асфальт", hint: data.asphalt >= 40 ? "высокий риск для лап" : "безопасно", kind: data.asphalt >= 40 ? "warn" : "ok" })}
        ${stat({ icon: "🌡", value: fmt.temp(data.temp), label: "Воздух", hint: esc(data.description) })}
        ${stat({ icon: "😮‍💨", value: aqi != null ? fmt.num(aqi, 0) : "—", label: "Качество воздуха", hint: aqi != null ? esc(data.airLevel.label) : "нет данных", kind: aqi > 60 ? "warn" : "ok" })}
        ${stat({ icon: "⏱", value: pa.mins + " мин", label: "Норма прогулки", hint: esc(window.Store.ageStage(p).name) })}
      </div>
      <div class="panel-grid cols-2">
        <section class="card">
          <header class="card-head"><h3><span class="card-ico">🌤</span> Погода сейчас</h3>
            <button class="btn btn-ghost btn-sm" data-act="walk.refresh">⟳ Обновить</button></header>
          <div class="card-body" id="walkWeatherCard">${window.Weather.renderCard(data)}</div>
        </section>
        <div class="stack">
          <section class="card">
            <header class="card-head"><h3><span class="card-ico">🐕</span> Персонально для ${esc(p.name)}</h3></header>
            <div class="card-body stack" style="gap:10px">
              ${pa.items.map((i) => `<div class="${i.kind === "danger" ? "danger-box" : i.kind === "warn" ? "hint-box" : "ok-box"}">${esc(i.text)}</div>`).join("")}
              <div class="hint-box"><b>Что взять:</b> ${pa.wear.map(esc).join(", ")}.</div>
            </div>
          </section>
          <section class="card">
            <header class="card-head"><h3><span class="card-ico">⏰</span> Безопасные окна сегодня</h3></header>
            <div class="card-body">
              ${windows.length ? `<div class="stack" style="gap:8px">${windows.map((w) => `
                <div class="metric"><span class="m-ico">✅</span><span><span class="m-label">${esc(w.from)}–${esc(w.to)}</span>
                <span class="m-value">${fmt.temp(w.temp)} · асфальт ${fmt.temp(w.asf)}</span>
                <span class="m-label">${esc(w.reason)}</span></span></div>`).join("")}</div>`
                : `<div class="warn-note">Сегодня нет полностью безопасных окон: гуляйте коротко, по траве, утром или поздно вечером.</div>`}
              <button class="btn btn-soft btn-block mt-2" data-act="hub.open" data-panel="walk" data-tab="hourly">📈 Прогноз на 24 часа</button>
            </div>
          </section>
        </div>
      </div>`;
  }

  function tabHourly(view) {
    const data = W.data;
    if (!data || !data.hourly || !data.hourly.length) {
      view.innerHTML = empty("📈", "Нет данных прогноза", "Сначала проверьте погоду на вкладке «Сейчас».", `<button class="btn btn-primary" data-act="hub.open" data-panel="walk" data-tab="now">К погоде</button>`);
      return;
    }
    const hours = data.hourly.slice(0, 24);
    const series = hours.map((h) => ({ label: h.time, value: h.temp }));
    const asfSeries = hours.map((h) => ({ label: h.time, value: window.Weather.asphalt(h.temp) }));
    view.innerHTML = `
      <div class="panel-grid cols-2">
        <section class="card"><header class="card-head"><h3><span class="card-ico">🌡</span> Температура воздуха, 24 часа</h3></header>
          <div class="card-body">${Charts.line(series, { color: "#2C5F8D", unit: "°C", target: 25 })}</div></section>
        <section class="card"><header class="card-head"><h3><span class="card-ico">🔥</span> Температура асфальта</h3></header>
          <div class="card-body">${Charts.line(asfSeries, { color: "#FF9800", unit: "°C", target: 40, min: Math.min(-5, ...asfSeries.map((s) => s.value)) })}</div></section>
      </div>
      <section class="card mt-2">
        <header class="card-head"><h3><span class="card-ico">📋</span> Почасовой план прогулок</h3>
          <span class="muted small">зелёный — безопасно, оранжевый — осторожно, красный — опасно</span></header>
        <div class="card-body">
          ${table(["Время", "Воздух", "Асфальт", "Осадки", "Ветер", "Вердикт"], hours.map((h) => {
            const asf = window.Weather.asphalt(h.temp);
            const kind = asf > 50 ? "danger" : asf >= 40 ? "warn" : "ok";
            const verdict = kind === "danger" ? "опасно для лап" : kind === "warn" ? "только тень и трава" : "можно гулять";
            return [esc(h.time.slice(11, 16)), fmt.temp(h.temp), `<b style="color:${kind === "danger" ? "#E53935" : kind === "warn" ? "#FB8C00" : "#43A047"}">${fmt.temp(asf)}</b>`,
              h.precip != null ? fmt.num(h.precip, 0) + "%" : "—", fmt.num(h.wind, 1) + " м/с", badge(verdict, kind)];
          }))}
        </div>
      </section>`;
  }

  function tabRoute(view) {
    const p = pet();
    const data = W.data;
    const r = window.Weather.route((data && data.cityName) || W.city || "Москва", W.routeMinutes, W.size);
    if (W.timer.route) Object.assign(r, W.timer.route);
    view.innerHTML = `
      <div class="panel-grid cols-2" style="grid-template-columns:1.2fr 1fr">
        <section class="card">
          <header class="card-head"><h3><span class="card-ico">🗺</span> ${esc(r.name)}</h3>${badge(fmt.num(r.km, 1) + " км", "info")}</header>
          <div class="card-body">
            <div class="chip-row mb-2">
              ${[20, 30, 45, 60, 90].map((m) => `<button class="tag ${W.routeMinutes === m ? "active" : ""}" data-act="walk.routetime" data-min="${m}">${m} мин</button>`).join("")}
            </div>
            <div class="metric-grid">
              <div class="metric"><span class="m-ico">📏</span><span><span class="m-label">Дистанция</span><span class="m-value">${fmt.num(r.km, 1)} км</span></span></div>
              <div class="metric"><span class="m-ico">👣</span><span><span class="m-label">Примерно шагов питомца</span><span class="m-value">${fmt.int(r.steps)}</span></span></div>
              <div class="metric"><span class="m-ico">⏱</span><span><span class="m-label">Время</span><span class="m-value">${r.minutes} мин</span></span></div>
              <div class="metric"><span class="m-ico">🐾</span><span><span class="m-label">Порода</span><span class="m-value">${esc(window.Store.breed(p).name)}</span></span></div>
            </div>
            <div class="timeline mt-2">
              ${r.waypoints.map((w, i) => `<div class="tl-item">
                <div class="tl-rail"><div class="tl-dot">${i === 0 ? "🏁" : i === r.waypoints.length - 1 ? "🏠" : "🐾"}</div>${i < r.waypoints.length - 1 ? '<div class="tl-line"></div>' : ""}</div>
                <div class="tl-body"><div class="tl-title">${esc(w)}</div><div class="tl-time">${Math.round((r.minutes / r.waypoints.length) * (i + 1))} мин от старта</div></div>
              </div>`).join("")}
            </div>
            <div class="hint-box mt-2">${esc(r.tip)}</div>
            <div class="row mt-2">
              <button class="btn btn-green" data-act="walk.start" data-city="${esc((data && data.cityName) || W.city)}">▶️ Начать прогулку по маршруту</button>
              <button class="btn btn-ghost" data-act="walk.other-route">🔄 Другой маршрут</button>
            </div>
          </div>
        </section>
        <section class="card">
          <header class="card-head"><h3><span class="card-ico">📍</span> Интересное по пути</h3></header>
          <div class="card-body stack" style="gap:10px">
            ${r.pointsOfInterest.map((poi) => `<div class="map-item">
              <span class="mi-ico">${poi.emoji}</span>
              <span><span class="mi-name">${esc(poi.name)}</span><span class="mi-sub">${esc(poi.note)}</span></span>
            </div>`).join("")}
            ${D.places.filter((pl) => pl.type === "park").slice(0, 3).map((pl) => `<div class="map-item" data-act="walk.place" data-id="${pl.id}">
              <span class="mi-ico">${pl.emoji}</span>
              <span><span class="mi-name">${esc(pl.name)}</span><span class="mi-sub">${esc(pl.address)} · ${fmt.num(dist(pl), 1)} км</span></span>
            </div>`).join("")}
          </div>
        </section>
      </div>`;
  }

  /* ------------------------------------------------------------- таймер прогулки */
  function tick() {
    const t = W.timer;
    if (!t.running) return;
    t.elapsed = Math.floor((Date.now() - t.startedAt) / 1000);
    paintTimer();
  }

  function paintTimer() {
    const t = W.timer;
    const display = $("#walkTimerValue");
    if (!display) return;
    const mm = String(Math.floor(t.elapsed / 60)).padStart(2, "0");
    const ss = String(t.elapsed % 60).padStart(2, "0");
    display.textContent = mm + ":" + ss;
    const pct = Math.min(100, Math.round((t.elapsed / 60 / t.target) * 100));
    const bar = $("#walkTimerBar");
    if (bar) bar.style.width = pct + "%";
    const dist = $("#walkTimerDist");
    const km = (t.elapsed / 60) * (W.size === "large" ? 4.2 : W.size === "small" || W.size === "cat" ? 3.2 : 3.8);
    if (dist) dist.textContent = fmt.num(km, 2) + " км";
    const steps = $("#walkTimerSteps");
    if (steps) steps.textContent = fmt.int(Math.round((km * 1000) / 0.6)) + " шагов";
    const goal = $("#walkTimerGoal");
    if (goal) goal.textContent = pct + "% цели";
  }

  function startTimer(target, route) {
    const t = W.timer;
    if (t.interval) clearInterval(t.interval);
    t.running = true;
    t.paused = false;
    t.elapsed = 0;
    t.startedAt = Date.now();
    t.target = target || 45;
    t.route = route || null;
    t.interval = setInterval(tick, 500);
  }

  function stopTimer(save) {
    const t = W.timer;
    t.running = false;
    if (t.interval) clearInterval(t.interval);
    t.interval = null;
    if (!save) { t.elapsed = 0; return; }
    const p = pet();
    const minutes = Math.max(1, Math.round(t.elapsed / 60));
    const km = +((t.elapsed / 3600) * (W.size === "large" ? 4.2 : W.size === "small" || W.size === "cat" ? 3.2 : 3.8)).toFixed(2);
    const data = W.data;
    window.Store.update((s) => {
      s.walks.unshift({
        id: window.Store.uid("wl"), petId: p.id, date: fmt.today(), city: (data && data.cityName) || W.city || "—",
        temp: data ? Math.round(data.temp) : null, asphalt: data ? data.asphalt : null, minutes, distance: km,
        route: t.route ? t.route.name : "Свободная прогулка", rating: 5
      });
      const today = s.activity[p.id].find((a) => a.date === fmt.today());
      if (today) { today.minutes += minutes; today.steps += Math.round(km * 1000 / 0.6); }
      else s.activity[p.id].push({ id: window.Store.uid("ac"), date: fmt.today(), minutes, steps: Math.round(km * 1000 / 0.6) });
      if (!s.moods[p.id]) s.moods[p.id] = [];
      s.moods[p.id] = s.moods[p.id].filter((m) => m.date !== fmt.today());
      s.moods[p.id].unshift({ id: window.Store.uid("mo"), date: fmt.today(), mood: "happy" });
    }, "walk");
    toast("Прогулка сохранена: " + minutes + " мин, " + km + " км", "ok");
    t.elapsed = 0;
    t.route = null;
  }

  function tabTimer(view) {
    const t = W.timer;
    const p = pet();
    const target = t.target || 45;
    view.innerHTML = `
      <div class="panel-grid cols-2">
        <section class="card">
          <header class="card-head"><h3><span class="card-ico">⏱</span> Таймер прогулки</h3>
            <span class="muted small">${esc(p.name)} · цель ${target} мин</span></header>
          <div class="card-body center">
            <div style="font-size:4rem;font-weight:800;letter-spacing:-.04em" id="walkTimerValue">00:00</div>
            <div class="progress mt-2" style="height:12px"><span id="walkTimerBar" style="width:0"></span></div>
            <div class="metric-grid mt-2">
              <div class="metric"><span class="m-ico">📏</span><span><span class="m-label">Дистанция</span><span class="m-value" id="walkTimerDist">0,00 км</span></span></div>
              <div class="metric"><span class="m-ico">👣</span><span><span class="m-label">Шаги</span><span class="m-value" id="walkTimerSteps">0 шагов</span></span></div>
              <div class="metric"><span class="m-ico">🎯</span><span><span class="m-label">Прогресс</span><span class="m-value" id="walkTimerGoal">0% цели</span></span></div>
              <div class="metric"><span class="m-ico">🔥</span><span><span class="m-label">Асфальт</span><span class="m-value">${W.data ? fmt.temp(W.data.asphalt) : "—"}</span></span></div>
            </div>
            <div class="chip-row mt-2" style="justify-content:center">
              ${[15, 30, 45, 60, 90].map((m) => `<button class="tag ${target === m ? "active" : ""}" data-act="walk.target" data-min="${m}">${m} мин</button>`).join("")}
            </div>
            <div class="row mt-3" style="justify-content:center">
              ${t.running
                ? `<button class="btn btn-orange btn-lg" data-act="walk.pause">⏸ Пауза</button>
                   <button class="btn btn-primary btn-lg" data-act="walk.finish">✅ Завершить и сохранить</button>`
                : `<button class="btn btn-green btn-lg" data-act="walk.timer-start">▶️ Начать прогулку</button>`}
              <button class="btn btn-ghost" data-act="walk.timer-reset">↺ Сброс</button>
            </div>
            ${t.route ? `<div class="hint-box mt-2">Маршрут: <b>${esc(t.route.name)}</b> · ${fmt.num(t.route.km, 1)} км · ${esc(t.route.waypoints.join(" → "))}</div>` : ""}
          </div>
        </section>
        <div class="stack">
          <section class="card">
            <header class="card-head"><h3><span class="card-ico">🐾</span> Что важно помнить</h3></header>
            <div class="card-body">
              ${list([
                "Первые 5 минут — на поводке: питомец «разогревается»",
                "Нюхание = умственная нагрузка, дайте 10 минут на запахи",
                "Вода каждые 15 минут в жару",
                "После прогулки: проверьте лапы, уши и клещей",
                "Сохранённая прогулка попадёт в трекеры и PetLife Index"
              ], "tick")}
            </div>
          </section>
          <section class="card">
            <header class="card-head"><h3><span class="card-ico">📊</span> Прогулки за 7 дней</h3></header>
            <div class="card-body">${walkChart()}</div>
          </section>
        </div>
      </div>`;
    paintTimer();
  }

  function walkChart() {
    const p = pet();
    const days = Array.from({ length: 7 }, (_, i) => window.Store.iso(6 - i));
    const data = days.map((d) => ({
      label: d, short: fmt.short(d),
      value: (window.Store.state.walks || []).filter((w) => w.petId === p.id && w.date === d).reduce((s, w) => s + w.minutes, 0)
    }));
    return Charts.bars(data, { color: "#4CAF50", unit: " мин" }) + `<div class="muted small center mt-1">норма для породы: ${window.Store.breed(p).walk} мин/день</div>`;
  }

  function tabJournal(view) {
    const p = pet();
    const walks = (window.Store.state.walks || []).filter((w) => w.petId === p.id);
    const totalMin = walks.reduce((s, w) => s + (w.minutes || 0), 0);
    const totalKm = walks.reduce((s, w) => s + (w.distance || 0), 0);
    view.innerHTML = `
      <div class="kpi-row mb-2">
        ${stat({ icon: "🚶", value: walks.length, label: "прогулок записано" })}
        ${stat({ icon: "⏱", value: Math.round(totalMin / 60) + " ч", label: "всего на улице", kind: "ok" })}
        ${stat({ icon: "📏", value: fmt.num(totalKm, 1) + " км", label: "пройдено вместе" })}
        ${stat({ icon: "🔥", value: fmt.temp(Math.max(0, ...walks.map((w) => w.asphalt || 0))), label: "макс. асфальт", kind: "warn" })}
      </div>
      <div class="panel-grid cols-2">
        <section class="card">
          <header class="card-head"><h3><span class="card-ico">📔</span> Дневник прогулок</h3>
            <button class="btn btn-ghost btn-sm" data-act="walk.addmanual">＋ Добавить</button></header>
          <div class="card-body">
            ${walks.length ? `<div class="timeline">${walks.slice(0, 12).map((w) => `<div class="tl-item">
              <div class="tl-rail"><div class="tl-dot">${(w.asphalt || 0) >= 40 ? "🔥" : "🐾"}</div><div class="tl-line"></div></div>
              <div class="tl-body">
                <div class="tl-title">${esc(w.route || "Прогулка")} · ${w.minutes} мин</div>
                <div class="tl-time">${esc(fmt.date(w.date))} · ${esc(w.city || "")} · ${w.temp != null ? fmt.temp(w.temp) : "—"} · асфальт ${w.asphalt != null ? fmt.temp(w.asphalt) : "—"} · ${fmt.num(w.distance || 0, 1)} км</div>
                <button class="btn btn-xs btn-ghost mt-1" data-act="walk.del" data-id="${w.id}">Удалить</button>
              </div></div>`).join("")}</div>`
              : empty("🐾", "Пока нет прогулок", "Запустите таймер или добавьте запись вручную.", `<button class="btn btn-primary btn-sm" data-act="walk.addmanual">Добавить прогулку</button>`)}
          </div>
        </section>
        <section class="card">
          <header class="card-head"><h3><span class="card-ico">📊</span> Статистика</h3></header>
          <div class="card-body">
            ${Charts.bars(Array.from({ length: 14 }, (_, i) => {
              const d = window.Store.iso(13 - i);
              return { label: d, short: fmt.short(d), value: walks.filter((w) => w.date === d).reduce((s, w) => s + w.minutes, 0) };
            }), { color: "#2C5F8D", unit: " мин", target: window.Store.breed(p).walk })}
            <div class="kv mt-2">
              <div class="kv-row"><span class="kv-k">Средняя прогулка</span><span class="kv-v">${walks.length ? Math.round(totalMin / walks.length) : 0} мин</span></div>
              <div class="kv-row"><span class="kv-k">Любимый маршрут</span><span class="kv-v">${esc(mode(walks.map((w) => w.route)) || "—")}</span></div>
              <div class="kv-row"><span class="kv-k">Дней с прогулкой</span><span class="kv-v">${new Set(walks.map((w) => w.date)).size}</span></div>
            </div>
            <button class="btn btn-ghost btn-block mt-2" data-act="walk.export">📤 Экспорт дневника</button>
          </div>
        </section>
      </div>`;
  }

  function mode(arr) {
    const counts = {};
    arr.filter(Boolean).forEach((v) => { counts[v] = (counts[v] || 0) + 1; });
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  }

  /* ------------------------------------------------------------- рендер панели */
  function render(view, ctx) {
    loadSaved();
    const p = pet();
    const tab = ctx.tab || "now";
    const tabs = [
      { id: "now", title: "Сейчас", icon: "🌤" }, { id: "hourly", title: "24 часа", icon: "📈" },
      { id: "map", title: "Карта района", icon: "🗺" }, { id: "route", title: "Маршрут", icon: "🧭" },
      { id: "timer", title: "Таймер", icon: "⏱" }, { id: "journal", title: "Дневник", icon: "📔" }
    ];
    const head = `
      <div class="panel-head">
        <div>
          <h2>🌤 Прогулка и погода</h2>
          <p>Температура асфальта, качество воздуха, лучшее время, маршрут и таймер — для <b>${esc(p.name)}</b> (${esc(window.Store.breed(p).name)})</p>
        </div>
        <div class="panel-tools">
          <button class="btn btn-ghost btn-sm" data-act="walk.load">${W.data ? "⟳ Обновить погоду" : "🔍 Получить погоду"}</button>
          <button class="btn btn-soft btn-sm" data-act="hub.open" data-panel="ai">🤖 Спросить ИИ</button>
        </div>
      </div>
      <div class="chip-row mb-2">
        ${tabs.map((t) => `<button class="tag ${tab === t.id ? "active" : ""}" data-act="hub.open" data-panel="walk" data-tab="${t.id}">${t.icon} ${t.title}</button>`).join("")}
      </div>`;
    view.innerHTML = `<div class="panel">${head}</div>`;
    const body = document.createElement("div");
    view.appendChild(body);
    const painter = tab === "hourly" ? tabHourly : tab === "map" ? mapTab : tab === "route" ? tabRoute : tab === "timer" ? tabTimer : tab === "journal" ? tabJournal : tabNow;
    painter(body);
    if (tab === "timer") paintTimer();
  }

  window.Panels.register("walk", { render });

  /* ------------------------------------------------------------- действия */
  Actions.registerAll({
    "walk.load": async () => {
      const cityInput = $("#walkCity");
      if (cityInput) W.city = cityInput.value.trim();
      const sizeSelect = $("#walkSize");
      if (sizeSelect) W.size = sizeSelect.value;
      if (!W.city) { toast("Введите город", "error"); if (cityInput) cityInput.classList.add("invalid"); return; }
      W.loading = true;
      W.error = null;
      window.Hub.render();
      try {
        W.data = await window.Weather.get(W.city, { size: W.size, minutes: W.routeMinutes });
        window.Store.update((s) => { s.owner.city = W.data.cityName; }, "owner");
        toast("Погода обновлена: асфальт " + fmt.temp(W.data.asphalt), W.data.asphalt >= 40 ? "warn" : "ok");
      } catch (err) {
        W.error = (err && err.message) || "Не удалось получить погоду. Попробуйте позже.";
        toast(W.error, "error");
      } finally {
        W.loading = false;
        window.Hub.render();
      }
    },
    "walk.demo": () => {
      W.data = window.Weather.demo(W.city || "Москва", W.size);
      W.error = null;
      toast("Показаны демонстрационные данные", "warn");
      window.Hub.render();
    },
    "walk.refresh": () => Actions.run("walk.load", {}, null, null),
    "walk.maptype": (ds) => { W.mapType = ds.id; window.Hub.render(); },
    "walk.place": (ds) => { W.activePlace = ds.id || null; window.Hub.render(); },
    "walk.route-to": (ds) => {
      const place = D.places.find((p) => p.id === ds.id);
      if (!place) return;
      toast("Маршрут к «" + place.name + "» построен: ~" + fmt.num(dist(place) * 4, 1) + " км", "ok");
      window.Hub.open("walk", "route");
    },
    "walk.routetime": (ds) => { W.routeMinutes = +ds.min || 60; window.Hub.render(); },
    "walk.other-route": () => { W.routeMinutes = [20, 30, 45, 60, 90][Math.floor(Math.random() * 5)]; window.Hub.render(); },
    "walk.save": () => {
      const p = pet();
      const d = W.data;
      if (!d) { toast("Сначала получите погоду", "warn"); return; }
      window.Store.update((s) => {
        s.walks.unshift({ id: window.Store.uid("wl"), petId: p.id, date: fmt.today(), city: d.cityName, temp: Math.round(d.temp), asphalt: d.asphalt, minutes: 30, distance: 1.8, route: "Погодная заметка", rating: 4 });
      }, "walk");
      toast("Запись добавлена в дневник прогулок", "ok");
    },
    "walk.start": (ds) => {
      window.Hub.open("walk", "timer");
      const route = window.Weather.route((W.data && W.data.cityName) || ds.city || W.city || "Москва", W.routeMinutes, W.size);
      startTimer(W.timer.target || 45, route);
      toast("Таймер прогулки запущен. Хорошей прогулки! 🐾", "ok");
    },
    "walk.timer-start": () => { startTimer(W.timer.target || 45, W.timer.route); window.Hub.render(); },
    "walk.pause": () => {
      const t = W.timer;
      if (t.running) {
        t.paused = true;
        t.running = false;
        t.pausedElapsed = t.elapsed;
        if (t.interval) clearInterval(t.interval);
        t.interval = null;
        toast("Пауза. Нажмите «Продолжить», чтобы вернуться к прогулке.", "info");
      } else {
        t.running = true;
        t.paused = false;
        t.startedAt = Date.now() - (t.pausedElapsed || t.elapsed) * 1000;
        t.interval = setInterval(tick, 500);
      }
      window.Hub.render();
    },
    "walk.finish": () => {
      const minutes = Math.round(W.timer.elapsed / 60);
      if (minutes < 1) { toast("Прогулка короче минуты — не сохраняю", "warn"); return; }
      const body = `
        <div class="kv mb-2">
          <div class="kv-row"><span class="kv-k">Длительность</span><span class="kv-v">${minutes} мин</span></div>
          <div class="kv-row"><span class="kv-k">Маршрут</span><span class="kv-v">${esc(W.timer.route ? W.timer.route.name : "Свободная прогулка")}</span></div>
          <div class="kv-row"><span class="kv-k">Асфальт</span><span class="kv-v">${W.data ? fmt.temp(W.data.asphalt) : "—"}</span></div>
        </div>
        ${field({ label: "Как прошла прогулка?", type: "select", id: "walkRating", options: [
          { value: "5", label: "😄 Отлично, питомец счастлив" }, { value: "4", label: "🙂 Хорошо" },
          { value: "3", label: "😐 Нормально" }, { value: "2", label: "😕 Питомец устал" }] })}
        ${field({ label: "Заметка", type: "textarea", id: "walkNote", placeholder: "Встретили друзей, нашли новую площадку…" })}`;
      modal({
        title: "Завершить прогулку", icon: "🐾", body,
        actions: [{ label: "Отмена" }, {
          label: "Сохранить", kind: "primary", onClick: (wrap) => {
            const rating = +$("#walkRating", wrap).value;
            const note = $("#walkNote", wrap).value.trim();
            const p = pet();
            const km = +((W.timer.elapsed / 3600) * (W.size === "large" ? 4.2 : W.size === "small" || W.size === "cat" ? 3.2 : 3.8)).toFixed(2);
            window.Store.update((s) => {
              s.walks.unshift({
                id: window.Store.uid("wl"), petId: p.id, date: fmt.today(), city: (W.data && W.data.cityName) || W.city || "—",
                temp: W.data ? Math.round(W.data.temp) : null, asphalt: W.data ? W.data.asphalt : null,
                minutes, distance: km, route: W.timer.route ? W.timer.route.name : "Свободная прогулка", rating, note
              });
              const today = (s.activity[p.id] || []).find((a) => a.date === fmt.today());
              const steps = Math.round((km * 1000) / 0.6);
              if (today) { today.minutes += minutes; today.steps += steps; }
              else s.activity[p.id].push({ id: window.Store.uid("ac"), date: fmt.today(), minutes, steps });
            }, "walk");
            stopTimer(false);
            toast("Прогулка сохранена: " + minutes + " мин, " + km + " км", "ok");
            return true;
          }
        }]
      });
    },
    "walk.timer-reset": () => { stopTimer(false); window.Hub.render(); toast("Таймер сброшен", "info"); },
    "walk.target": (ds) => { W.timer.target = +ds.min || 45; window.Hub.render(); },
    "walk.addmanual": () => {
      const body = `
        <div class="form-grid">
          ${field({ label: "Дата", type: "date", id: "wmDate", value: fmt.today() })}
          ${field({ label: "Минуты", type: "number", id: "wmMin", value: 45 })}
          ${field({ label: "Дистанция, км", type: "number", id: "wmKm", value: 2.5, attrs: 'step="0.1"' })}
          ${field({ label: "Асфальт, °C", type: "number", id: "wmAsf", value: W.data ? W.data.asphalt : 25 })}
        </div>
        ${field({ label: "Маршрут", id: "wmRoute", value: "Свободная прогулка" })}`;
      modal({
        title: "Добавить прогулку", icon: "📔", body,
        actions: [{ label: "Отмена" }, {
          label: "Добавить", kind: "primary", onClick: (wrap) => {
            const p = pet();
            window.Store.update((s) => {
              s.walks.unshift({
                id: window.Store.uid("wl"), petId: p.id, date: $("#wmDate", wrap).value || fmt.today(),
                city: W.city || (s.owner && s.owner.city) || "—", temp: null, asphalt: +$("#wmAsf", wrap).value || null,
                minutes: +$("#wmMin", wrap).value || 30, distance: +$("#wmKm", wrap).value || 0,
                route: $("#wmRoute", wrap).value || "Прогулка", rating: 4
              });
            }, "walk");
            toast("Прогулка добавлена", "ok");
            return true;
          }
        }]
      });
    },
    "walk.del": async (ds) => {
      const ok = await confirmDialog("Удалить запись о прогулке?", { ok: "Удалить", danger: true });
      if (!ok) return;
      window.Store.update((s) => { s.walks = s.walks.filter((w) => w.id !== ds.id); }, "walk");
      toast("Запись удалена", "ok");
    },
    "walk.export": () => {
      const p = pet();
      const walks = (window.Store.state.walks || []).filter((w) => w.petId === p.id);
      const csv = ["Дата;Маршрут;Минуты;Км;Температура;Асфальт"]
        .concat(walks.map((w) => [w.date, w.route || "", w.minutes, w.distance || 0, w.temp, w.asphalt].join(";")))
        .join("\n");
      window.PL.download("petlife-walks.csv", "\uFEFF" + csv, "text/csv;charset=utf-8");
      toast("Дневник прогулок выгружен", "ok");
    }
  });
})();
