/* ============================================================================
 * PetLife — app/panel-trackers.js
 * Панель «Трекеры»: ТЗ 31 — вес, ТЗ 32 — активность и ошейник,
 * ТЗ 33 — сон, ТЗ 34 — настроение. KPI-строка, графики, экспорт и дневник ИИ.
 * ==========================================================================*/
(function () {
  "use strict";

  const { $, esc, fmt, card, stat, badge, progress, empty, field, table,
          Charts, toast, confirmDialog, Actions } = window.PL;
  const D = window.PL_DATA;
  const S = () => window.Store.state;

  const STEP_GOAL = 8000;
  const WEIGHT_SAFE_TREND = 5; // % за 30 дней

  const TABS = [
    { id: "weight", label: "⚖️ Вес" },
    { id: "activity", label: "🏃 Активность" },
    { id: "sleep", label: "🌙 Сон" },
    { id: "mood", label: "🙂 Настроение" }
  ];

  /* ================================================================ утилиты */
  function tabsBar(active) {
    return `<div class="chip-row mb-2">${TABS.map((t) =>
      `<button class="tag ${t.id === active ? "active" : ""}" data-act="hub.open" data-panel="trackers" data-tab="${t.id}">${t.label}</button>`
    ).join("")}</div>`;
  }

  function sorted(bucketName, petId) {
    return window.Store.bucket(bucketName, petId).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  function todayRec(bucketName, petId) {
    const today = fmt.today();
    const items = window.Store.bucket(bucketName, petId);
    const exact = items.filter((r) => r.date === today)[0];
    if (exact) return exact;
    const list_ = sorted(bucketName, petId);
    return list_.length ? list_[list_.length - 1] : null;
  }

  function shiftDate(iso, days) {
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function dayDiff(a, b) {
    return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
  }

  function numInput(v) {
    return v == null || v === "" ? "" : String(v).replace(",", ".");
  }

  function inputNum(sel, root) {
    const el = $(sel, root || document);
    if (!el) return null;
    const v = parseFloat(String(el.value).replace(",", "."));
    return isNaN(v) ? null : v;
  }

  function moodDef(id) {
    return D.moods.filter((m) => m.id === id)[0] || null;
  }

  function moodScore(id) {
    const m = moodDef(id);
    return m ? m.score : 0;
  }

  function sleepNorm(pet) {
    const stage = window.Store.ageStage(pet).id;
    let base = pet.species === "cat" ? 14 : 12;
    if (stage === "puppy") base += 6;
    else if (stage === "junior") base += 3;
    else if (stage === "senior") base += 1;
    else if (stage === "geriatric") base += 1.5;
    return base;
  }

  function weightTrend(petId) {
    const list_ = sorted("weights", petId);
    if (list_.length < 2) return null;
    const last = list_[list_.length - 1];
    const cutoff = window.Store.iso(30);
    let base = null;
    for (let i = list_.length - 2; i >= 0; i--) { if (String(list_[i].date) <= cutoff) { base = list_[i]; break; } }
    if (!base) base = list_[0];
    if (base === last) return null;
    const delta = +last.kg - +base.kg;
    const pct = +base.kg ? (delta / +base.kg) * 100 : 0;
    return { delta, pct, base, last, days: dayDiff(base.date, last.date) };
  }

  function daySeries(bucketName, petId, days, key, aggregate) {
    const recs = window.Store.bucket(bucketName, petId);
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const iso = window.Store.iso(i);
      const items = recs.filter((r) => r.date === iso);
      let value = 0;
      if (aggregate) value = items.reduce((s, r) => s + (+r[key] || 0), 0);
      else { const r = items[items.length - 1]; value = r ? (+r[key] || 0) : 0; }
      out.push({ label: iso, short: fmt.short(iso), value: Math.round(value * 10) / 10 });
    }
    return out;
  }

  /* ============================================================ KPI-строка */
  function kpiRow(pet) {
    const weights = sorted("weights", pet.id);
    const lastW = weights.length ? weights[weights.length - 1] : null;
    const trend = weightTrend(pet.id);
    const normW = +D.breedById(pet.breedId).weight || 5;
    const dev = lastW ? Math.abs((+lastW.kg - normW) / normW) : 0;
    const wKind = dev < 0.1 ? "green" : dev < 0.2 ? "orange" : "orange";

    const actToday = (function () {
      const items = window.Store.bucket("activity", pet.id);
      return items.filter((r) => r.date === fmt.today())[0] || sorted("activity", pet.id).slice(-1)[0] || null;
    })();
    const steps = actToday ? +actToday.steps || 0 : 0;
    const stepsPct = Math.min(100, Math.round((steps / STEP_GOAL) * 100));

    const sleepToday = todayRec("sleep", pet.id);
    const normSleep = sleepNorm(pet);
    const sleepDelta = sleepToday ? Math.abs(+sleepToday.hours - normSleep) : 0;

    const moodToday = (function () {
      const items = window.Store.bucket("moods", pet.id);
      return items.filter((r) => r.date === fmt.today())[0] || null;
    })();
    const md = moodToday ? moodDef(moodToday.mood) : null;

    const deltaText = trend
      ? "Δ за месяц " + (trend.delta >= 0 ? "+" : "−") + fmt.num(Math.abs(trend.delta), 1) + " кг"
      : "мало данных";

    return `<div class="kpi-row mb-2">
      <button type="button" class="kpi ${lastW ? wKind : ""}" style="text-align:left;font-family:inherit;cursor:pointer" data-act="hub.open" data-panel="trackers" data-tab="weight">
        <span class="k-ico">⚖️</span>
        <span style="min-width:0">
          <span class="k-value" style="display:block">${lastW ? fmt.num(lastW.kg, 1) + " кг" : "—"}</span>
          <span class="k-label" style="display:block">Вес · ${deltaText}</span>
        </span>
      </button>
      <button type="button" class="kpi blue" style="text-align:left;font-family:inherit;cursor:pointer" data-act="hub.open" data-panel="trackers" data-tab="activity">
        <span class="k-ico">🏃</span>
        <span style="min-width:0">
          <span class="k-value" style="display:block">${fmt.int(steps)}</span>
          <span class="k-label" style="display:block">Шаги сегодня · ${stepsPct}% цели</span>
        </span>
      </button>
      <button type="button" class="kpi ${sleepToday && sleepDelta <= 2 ? "green" : "orange"}" style="text-align:left;font-family:inherit;cursor:pointer" data-act="hub.open" data-panel="trackers" data-tab="sleep">
        <span class="k-ico">🌙</span>
        <span style="min-width:0">
          <span class="k-value" style="display:block">${sleepToday ? fmt.num(sleepToday.hours, 1) + " ч" : "—"}</span>
          <span class="k-label" style="display:block">Сон за сутки · норма ${fmt.num(normSleep, 1)} ч</span>
        </span>
      </button>
      <button type="button" class="kpi ${md && md.score >= 4 ? "green" : "orange"}" style="text-align:left;font-family:inherit;cursor:pointer" data-act="hub.open" data-panel="trackers" data-tab="mood">
        <span class="k-ico">${md ? md.emoji : "🙂"}</span>
        <span style="min-width:0">
          <span class="k-value" style="display:block">${md ? esc(md.label) : "не отмечено"}</span>
          <span class="k-label" style="display:block">Настроение сегодня${moodToday ? " · " + esc(fmt.short(moodToday.date)) : ""}</span>
        </span>
      </button>
    </div>`;
  }

  /* ================================================================== ВЕС */
  function weightTab(pet) {
    const list_ = sorted("weights", pet.id);
    const breed = D.breedById(pet.breedId);
    const norm = +breed.weight || 5;
    const last = list_.length ? list_[list_.length - 1] : null;
    const values = list_.map((w) => +w.kg);
    const min = values.length ? Math.min.apply(null, values) : null;
    const max = values.length ? Math.max.apply(null, values) : null;
    const trend = weightTrend(pet.id);
    const dev = last ? Math.abs((+last.kg - norm) / norm) : 0;
    const devPct = Math.round(dev * 100);
    const status = dev < 0.1
      ? { kind: "ok", text: "в породной норме" }
      : dev < 0.2
        ? { kind: "warn", text: "небольшое отклонение от нормы" }
        : { kind: "danger", text: "сильное отклонение от нормы" };

    const chart = list_.length
      ? Charts.line(list_.map((w) => ({ label: w.date, value: +w.kg })), {
          unit: " кг", target: norm, color: "#2C5F8D",
          min: Math.min.apply(null, values.concat([norm])) - 0.6,
          max: Math.max.apply(null, values.concat([norm])) + 0.6
        })
      : empty("⚖️", "Записей о весе нет", "Добавьте первое измерение — и появится график с линией породной нормы.",
          `<button class="btn btn-primary" data-act="trackers.focus" data-target="tw-kg">Добавить вес</button>`);

    const trendHtml = trend
      ? `<div class="${Math.abs(trend.pct) > WEIGHT_SAFE_TREND ? "danger-box" : "hint-box"}">
           ${Math.abs(trend.pct) > WEIGHT_SAFE_TREND
             ? `<b>Вес изменился на ${fmt.num(Math.abs(trend.pct), 1)}% за ${trend.days} дн.</b> Это выше безопасного порога ${WEIGHT_SAFE_TREND}%. Резкая потеря или набор веса — повод показать питомца ветеринару.`
             : `Изменение за ${trend.days} дн.: ${trend.delta >= 0 ? "+" : "−"}${fmt.num(Math.abs(trend.delta), 1)} кг (${fmt.num(Math.abs(trend.pct), 1)}%). Это в пределах безопасного коридора.`}
         </div>`
      : `<div class="hint-box">Для оценки динамики нужно минимум два измерения с разницей в датах.</div>`;

    const dynamics = card({
      title: "Динамика веса", icon: "⚖️",
      tools: badge(status.text, status.kind),
      body: `
        <div class="tracker-tiles mb-2">
          ${stat({ icon: "📍", value: last ? fmt.num(last.kg, 1) + " кг" : "—", label: "Текущий вес", hint: last ? fmt.date(last.date) : "" })}
          ${stat({ icon: "🎯", value: fmt.num(norm, 1) + " кг", label: "Норма породы", hint: esc(breed.name) })}
          ${stat({ icon: "📉", value: min != null ? fmt.num(min, 1) + " кг" : "—", label: "Минимум за период" })}
          ${stat({ icon: "📈", value: max != null ? fmt.num(max, 1) + " кг" : "—", label: "Максимум за период" })}
        </div>
        ${chart}
        <div class="mt-2">${trendHtml}</div>
        ${Math.abs(dev) >= 0.2 || (trend && Math.abs(trend.pct) > WEIGHT_SAFE_TREND)
          ? `<div class="row mt-2"><button class="btn btn-orange btn-sm" data-act="hub.open" data-panel="health" data-tab="report">🩺 Показать ветеринару</button>
             <span class="muted small">Отчёт с динамикой веса, прививками и симптомами.</span></div>`
          : `<div class="row mt-2"><button class="btn btn-ghost btn-sm" data-act="hub.open" data-panel="health" data-tab="report">🩺 Отчёт для ветеринара</button>
             <span class="muted small">Отклонение от нормы ${devPct}% — пока в безопасной зоне.</span></div>`}
      `
    });

    const addForm = card({
      title: "Добавить измерение", icon: "➕",
      body: `
        <div class="row" style="align-items:flex-end">
          <div style="flex:1;min-width:150px">${field({ label: "Дата", type: "date", value: fmt.today(), id: "tw-date" })}</div>
          <div style="flex:1;min-width:150px">${field({ label: "Вес, кг", type: "number", value: last ? numInput(last.kg) : numInput(pet.weight), id: "tw-kg", placeholder: "13,4", attrs: 'step="0.1" min="0.2" max="150"' })}</div>
          <div style="min-width:150px;margin-bottom:14px"><button class="btn btn-primary btn-block" data-act="trackers.addWeight">Записать вес</button></div>
        </div>
        <div class="muted small">Взвешивайте питомца утром до кормления — так данные сопоставимы.</div>`
    });

    const journal = list_.length ? card({
      title: "Журнал измерений", icon: "📔",
      body: table(["Дата", "Вес", "Отклонение от нормы", ""], list_.slice().reverse().slice(0, 12).map((w) => {
        const d = ((+w.kg - norm) / norm) * 100;
        const kind = Math.abs(d) < 10 ? "ok" : Math.abs(d) < 20 ? "warn" : "danger";
        return [
          esc(fmt.date(w.date)),
          "<b>" + fmt.num(w.kg, 1) + " кг</b>",
          badge((d >= 0 ? "+" : "−") + fmt.num(Math.abs(d), 1) + "%", kind),
          `<button class="btn btn-xs btn-ghost" data-act="trackers.remove" data-bucket="weights" data-id="${esc(w.id)}">Удалить</button>`
        ];
      }))
    }) : "";

    return `<div class="stack">${dynamics}${addForm}${journal}</div>`;
  }

  /* =========================================================== АКТИВНОСТЬ */
  function activityTab(pet) {
    const list_ = sorted("activity", pet.id);
    const stepsSeries = daySeries("activity", pet.id, 14, "steps", false);
    const minutesSeries = daySeries("activity", pet.id, 14, "minutes", false);
    const stepsToday = stepsSeries[stepsSeries.length - 1].value;
    const todayPct = Math.min(100, Math.round((stepsToday / STEP_GOAL) * 100));

    const week = list_.filter((r) => String(r.date) >= window.Store.iso(6));
    const weekSteps = week.reduce((s, r) => s + (+r.steps || 0), 0);
    const avgMinutes = week.length ? Math.round(week.reduce((s, r) => s + (+r.minutes || 0), 0) / week.length) : 0;
    const best = week.slice().sort((a, b) => (+b.steps || 0) - (+a.steps || 0))[0] || null;

    const todayCard = card({
      title: "Цель дня", icon: "🏃",
      tools: `<button class="btn btn-sm btn-soft" data-act="trackers.syncCollar">📡 Синхронизировать ошейник</button>`,
      body: `
        <div class="row-between mb-1">
          <b>${fmt.int(stepsToday)} шагов из ${fmt.int(STEP_GOAL)}</b>
          <span class="muted small">${todayPct}%</span>
        </div>
        ${progress(todayPct, todayPct >= 100 ? "green" : todayPct >= 50 ? "orange" : "red")}
        <div class="tracker-tiles mt-2">
          ${stat({ icon: "👟", value: fmt.int(weekSteps), label: "Шагов за 7 дней" })}
          ${stat({ icon: "⏱", value: avgMinutes + " мин", label: "Средняя активность в день", kind: avgMinutes >= 45 ? "ok" : "warn" })}
          ${stat({ icon: "🏆", value: best ? fmt.short(best.date) : "—", label: "Лучший день недели", hint: best ? fmt.int(best.steps) + " шагов" : "" })}
          ${stat({ icon: "📡", value: list_.length ? "онлайн" : "нет данных", label: "Ошейник PetLife Track", kind: list_.length ? "ok" : "warn" })}
        </div>`
    });

    const charts = card({
      title: "Шаги и минуты активности", icon: "📊",
      body: `
        <div class="muted small mb-1">Шаги за 14 дней (цель ${fmt.int(STEP_GOAL)})</div>
        ${Charts.bars(stepsSeries, { unit: " шагов", target: STEP_GOAL, color: "#4CAF50" })}
        <div class="muted small mt-3 mb-1">Минуты активности за 14 дней</div>
        ${Charts.bars(minutesSeries, { unit: " мин", target: 60, color: "#00ACC1" })}`
    });

    const addForm = card({
      title: "Добавить вручную", icon: "➕",
      body: `
        <div class="row" style="align-items:flex-end">
          <div style="flex:1;min-width:140px">${field({ label: "Дата", type: "date", value: fmt.today(), id: "ta-date" })}</div>
          <div style="flex:1;min-width:120px">${field({ label: "Шаги", type: "number", value: "", id: "ta-steps", placeholder: "8400", attrs: 'min="0" max="60000"' })}</div>
          <div style="flex:1;min-width:120px">${field({ label: "Минуты активности", type: "number", value: "", id: "ta-min", placeholder: "55", attrs: 'min="0" max="600"' })}</div>
          <div style="min-width:150px;margin-bottom:14px"><button class="btn btn-primary btn-block" data-act="trackers.addActivity">Добавить запись</button></div>
        </div>`
    });

    const journal = list_.length ? card({
      title: "Журнал активности", icon: "📔",
      body: table(["Дата", "Шаги", "Минуты", "Источник", ""], list_.slice().reverse().slice(0, 14).map((r) => [
        esc(fmt.date(r.date)),
        "<b>" + fmt.int(r.steps) + "</b>",
        fmt.int(r.minutes) + " мин",
        r.source === "collar" ? badge("ошейник", "info") : badge("вручную", "muted"),
        `<button class="btn btn-xs btn-ghost" data-act="trackers.remove" data-bucket="activity" data-id="${esc(r.id)}">Удалить</button>`
      ]))
    }) : empty("📡", "Активность не отслеживается", "Наденьте ошейник PetLife Track и нажмите «Синхронизировать» — или внесите шаги вручную.",
        `<button class="btn btn-primary" data-act="trackers.syncCollar">📡 Синхронизировать ошейник</button>`);

    return `<div class="stack">${todayCard}${charts}${addForm}${journal}</div>`;
  }

  /* ================================================================== СОН */
  function sleepTab(pet) {
    const list_ = sorted("sleep", pet.id);
    const norm = sleepNorm(pet);
    const values = list_.map((s) => +s.hours);
    const last7 = list_.filter((s) => String(s.date) >= window.Store.iso(6));
    const avg = last7.length ? last7.reduce((s, r) => s + (+r.hours || 0), 0) / last7.length : 0;
    const diff = avg ? avg - norm : 0;
    const stage = window.Store.ageStage(pet);

    const qualityCount = {};
    list_.forEach((s) => { const q = Math.max(1, Math.min(5, Math.round(+s.quality || 3))); qualityCount[q] = (qualityCount[q] || 0) + 1; });
    const qualityLabels = { 5: "отлично", 4: "хорошо", 3: "нормально", 2: "беспокойно", 1: "плохо" };
    const qualityHtml = list_.length
      ? `<div class="chip-row">${[5, 4, 3, 2, 1].map((q) =>
          `<span class="badge badge-${q >= 4 ? "ok" : q === 3 ? "info" : "warn"}">${q} · ${qualityLabels[q]} — ${qualityCount[q] || 0}</span>`).join("")}</div>`
      : `<div class="muted small">Оценок качества пока нет.</div>`;

    const chart = list_.length
      ? Charts.line(list_.map((s) => ({ label: s.date, value: +s.hours })), {
          unit: " ч", target: norm, color: "#8E44AD",
          min: Math.min.apply(null, values.concat([norm])) - 1.2,
          max: Math.max.apply(null, values.concat([norm])) + 1.2
        })
      : empty("🌙", "Записей о сне нет", "Добавьте первую ночь — и увидите график с линией нормы для возраста и вида.",
          `<button class="btn btn-primary" data-act="trackers.focus" data-target="ts-hours">Добавить сон</button>`);

    const advice = Math.abs(diff) > 2
      ? `<div class="danger-box"><b>Отклонение от нормы ${fmt.num(Math.abs(diff), 1)} ч.</b> ${diff < 0
          ? "Питомец спит меньше нормы: проверьте место отдыха, шум и вечернюю активность. Хронический недосып снижает иммунитет."
          : "Питомец спит больше нормы: это бывает при скуке, жаре или недомогании. Понаблюдайте 3 дня и при вялости покажитесь врачу."}</div>`
      : `<div class="ok-box">Сон в пределах нормы — режим подобран верно.</div>`;

    const overview = card({
      title: "Сон и восстановление", icon: "🌙",
      tools: badge("норма ~" + fmt.num(norm, 1) + " ч", "info"),
      body: `
        <div class="tracker-tiles mb-2">
          ${stat({ icon: "🛏", value: list_.length ? fmt.num(list_[list_.length - 1].hours, 1) + " ч" : "—", label: "Последняя ночь", hint: list_.length ? fmt.date(list_[list_.length - 1].date) : "" })}
          ${stat({ icon: "📊", value: avg ? fmt.num(avg, 1) + " ч" : "—", label: "Средний сон за 7 дней", kind: Math.abs(diff) <= 2 ? "ok" : "warn" })}
          ${stat({ icon: "🎯", value: fmt.num(norm, 1) + " ч", label: "Норма", hint: esc(pet.species === "cat" ? "кошка" : "собака") + " · " + esc(stage.name) })}
          ${stat({ icon: "🗂", value: list_.length, label: "Записей всего" })}
        </div>
        ${chart}
        <div class="mt-2">${qualityHtml}</div>
        <div class="mt-2">${advice}</div>`
    });

    const addForm = card({
      title: "Добавить ночь", icon: "➕",
      body: `
        <div class="row" style="align-items:flex-end">
          <div style="flex:1;min-width:140px">${field({ label: "Дата", type: "date", value: fmt.today(), id: "ts-date" })}</div>
          <div style="flex:1;min-width:120px">${field({ label: "Часов сна", type: "number", value: "", id: "ts-hours", placeholder: "12,5", attrs: 'step="0.5" min="0" max="24"' })}</div>
          <div style="flex:1;min-width:170px">${field({ label: "Качество", type: "select", value: "4", id: "ts-quality",
            options: [{ value: "5", label: "5 — отлично" }, { value: "4", label: "4 — хорошо" }, { value: "3", label: "3 — нормально" }, { value: "2", label: "2 — беспокойно" }, { value: "1", label: "1 — плохо" }] })}</div>
          <div style="min-width:150px;margin-bottom:14px"><button class="btn btn-primary btn-block" data-act="trackers.addSleep">Записать сон</button></div>
        </div>`
    });

    const journal = list_.length ? card({
      title: "Журнал сна", icon: "📔",
      body: table(["Дата", "Часы", "Качество", "Отклонение", ""], list_.slice().reverse().slice(0, 14).map((s) => {
        const d = (+s.hours || 0) - norm;
        return [
          esc(fmt.date(s.date)),
          "<b>" + fmt.num(s.hours, 1) + " ч</b>",
          badge(qualityLabels[Math.round(+s.quality || 3)] || "—", +s.quality >= 4 ? "ok" : +s.quality === 3 ? "info" : "warn"),
          badge((d >= 0 ? "+" : "−") + fmt.num(Math.abs(d), 1) + " ч", Math.abs(d) <= 2 ? "ok" : "warn"),
          `<button class="btn btn-xs btn-ghost" data-act="trackers.remove" data-bucket="sleep" data-id="${esc(s.id)}">Удалить</button>`
        ];
      }))
    }) : "";

    return `<div class="stack">${overview}${addForm}${journal}</div>`;
  }

  /* =========================================================== НАСТРОЕНИЕ */
  function moodStreaks(list_) {
    const byDate = {};
    list_.forEach((m) => { const def = moodDef(m.mood); if (def) byDate[m.date] = def.score; });
    const dates = Object.keys(byDate).sort();
    let best = 0, run = 0, prev = null;
    dates.forEach((d) => {
      if (byDate[d] >= 4) {
        run = prev && dayDiff(prev, d) === 1 ? run + 1 : 1;
        best = Math.max(best, run);
        prev = d;
      } else { run = 0; prev = null; }
    });
    let current = 0;
    let cursor = byDate[fmt.today()] >= 4 ? fmt.today() : (byDate[window.Store.iso(1)] >= 4 ? window.Store.iso(1) : null);
    while (cursor && byDate[cursor] >= 4) { current += 1; cursor = shiftDate(cursor, -1); }
    return { best, current: current || 0 };
  }

  function moodWalkInsight(pet) {
    const moods = sorted("moods", pet.id);
    if (!moods.length) return "Пока нет данных о настроении — отметьте состояние сегодня.";
    const walkDates = {};
    (S().walks || []).filter((w) => w.petId === pet.id).forEach((w) => {
      walkDates[w.date] = (walkDates[w.date] || 0) + (+w.minutes || 0);
    });
    const withWalk = moods.filter((m) => walkDates[m.date]);
    const without = moods.filter((m) => !walkDates[m.date]);
    const avg = (arr) => arr.reduce((s, m) => s + moodScore(m.mood), 0) / arr.length;
    if (withWalk.length >= 2 && without.length >= 2) {
      const a = avg(withWalk), b = avg(without);
      if (a > b + 0.15) return "В дни с прогулками настроение выше: " + fmt.num(a, 1) + " из 5 против " + fmt.num(b, 1) + " без прогулки. Гуляйте даже 20 минут — это заметно влияет на состояние.";
      if (b > a + 0.15) return "Питомец бодрее в дни без прогулок: " + fmt.num(b, 1) + " против " + fmt.num(a, 1) + ". Проверьте нагрузку на прогулке — возможно, она слишком утомляет.";
      return "Настроение почти не зависит от прогулок (" + fmt.num(a, 1) + " и " + fmt.num(b, 1) + ") — ищите другую причину: питание, сон, общение.";
    }
    return "Данных пока мало: отметьте настроение в дни с прогулками и без, чтобы увидеть связь (" +
      withWalk.length + " с прогулкой, " + without.length + " без).";
  }

  function moodTab(pet) {
    const list_ = sorted("moods", pet.id);
    const todayMood = list_.filter((m) => m.date === fmt.today())[0] || null;
    const streak = moodStreaks(list_);
    const counts = {};
    list_.forEach((m) => { counts[m.mood] = (counts[m.mood] || 0) + 1; });
    const parts = D.moods.map((m) => ({ label: m.label, value: counts[m.id] || 0, color: m.color })).filter((p) => p.value > 0);
    const recent = list_.filter((m) => String(m.date) >= window.Store.iso(13));
    const avg = recent.length ? recent.reduce((s, m) => s + moodScore(m.mood), 0) / recent.length : 0;

    const picker = card({
      title: "Как питомец сегодня?", icon: "🙂",
      tools: todayMood ? badge("сегодня уже отмечено", "ok") : badge("ждём отметку", "info"),
      body: `
        <div class="mood-row">
          ${D.moods.map((m) => `<button class="mood-btn ${todayMood && todayMood.mood === m.id ? "active" : ""}" data-act="trackers.setMood" data-id="${m.id}">
            <span class="mb-emoji">${m.emoji}</span>
            <span class="mb-label">${esc(m.label)}</span>
          </button>`).join("")}
        </div>
        <div class="mt-2">${todayMood
          ? `<div class="ok-box">Сегодня отмечено: ${moodDef(todayMood.mood) ? moodDef(todayMood.mood).emoji : ""} ${esc(moodDef(todayMood.mood) ? moodDef(todayMood.mood).label : "")}. Нажмите другую кнопку, чтобы заменить запись.</div>`
          : `<div class="hint-box">Ежедневная отметка занимает секунду, а ИИ по ней замечает изменения в состоянии питомца на неделю раньше владельца.</div>`}</div>`
    });

    const feed = card({
      title: "Лента за 14 дней", icon: "🗓",
      body: `<div class="mood-row">${Array.from({ length: 14 }, (_, i) => {
        const iso = window.Store.iso(13 - i);
        const rec = list_.filter((m) => m.date === iso).slice(-1)[0];
        const def = rec ? moodDef(rec.mood) : null;
        return `<div class="center" style="width:44px">
          <div style="font-size:1.5rem">${def ? def.emoji : "·"}</div>
          <div class="tiny muted">${esc(fmt.short(iso))}</div>
        </div>`;
      }).join("")}</div>`
    });

    const stats_ = card({
      title: "Распределение настроений", icon: "🥧",
      body: `
        <div class="grid grid-2" style="align-items:center">
          <div>${Charts.donut(parts, { center: list_.length ? fmt.num(avg, 1) : "—", centerSub: "средняя оценка" })}</div>
          <div class="stack" style="gap:8px">
            ${D.moods.map((m) => `<div class="row-between">
              <span>${m.emoji} ${esc(m.label)} <span class="muted small">(${m.score}/5)</span></span>
              <b>${counts[m.id] || 0}</b></div>`).join("")}
          </div>
        </div>
        <div class="tracker-tiles mt-2">
          ${stat({ icon: "🔥", value: streak.current + " " + fmt.plural(streak.current, "день", "дня", "дней"), label: "Стрик хороших дней", hint: "настроение 4 балла и выше", kind: streak.current >= 3 ? "ok" : "warn" })}
          ${stat({ icon: "🏅", value: streak.best + " " + fmt.plural(streak.best, "день", "дня", "дней"), label: "Лучший стрик" })}
          ${stat({ icon: "📝", value: list_.length, label: "Всего отметок" })}
          ${stat({ icon: "📈", value: avg ? fmt.num(avg, 1) + " / 5" : "—", label: "Среднее за 2 недели" })}
        </div>`
    });

    const insight = card({
      title: "Инсайт: настроение и прогулки", icon: "🔍",
      body: `<div class="hint-box">${esc(moodWalkInsight(pet))}</div>
        <div class="row mt-2">
          <button class="btn btn-soft btn-sm" data-act="hub.open" data-panel="social" data-tab="forum">💬 Поделиться в форум</button>
          <button class="btn btn-ghost btn-sm" data-act="hub.open" data-panel="walk">🌤 К прогулкам</button>
        </div>`
    });

    const journal = list_.length ? card({
      title: "История отметок", icon: "📔",
      body: table(["Дата", "Настроение", "Балл", ""], list_.slice().reverse().slice(0, 12).map((m) => {
        const def = moodDef(m.mood) || { emoji: "🙂", label: "—", score: 0 };
        return [
          esc(fmt.date(m.date)),
          def.emoji + " <b>" + esc(def.label) + "</b>",
          badge(def.score + " / 5", def.score >= 4 ? "ok" : def.score === 3 ? "info" : "warn"),
          `<button class="btn btn-xs btn-ghost" data-act="trackers.remove" data-bucket="moods" data-id="${esc(m.id)}">Удалить</button>`
        ];
      }))
    }) : "";

    return `<div class="stack">${picker}${feed}${stats_}${insight}${journal}</div>`;
  }

  /* ==================================================== ДНЕВНИК И ЭКСПОРТ */
  function tabSummary(pet, tab) {
    const name = pet.name;
    if (tab === "weight") {
      const l = sorted("weights", pet.id);
      const norm = +D.breedById(pet.breedId).weight || 5;
      const last = l[l.length - 1];
      const tr = weightTrend(pet.id);
      return `Дневник PetLife · Вес ${name}: текущий ${last ? fmt.num(last.kg, 1) : "—"} кг при породной норме ${fmt.num(norm, 1)} кг.` +
        (tr ? ` За ${tr.days} дн. изменение ${tr.delta >= 0 ? "+" : "−"}${fmt.num(Math.abs(tr.delta), 1)} кг (${fmt.num(Math.abs(tr.pct), 1)}%).` : " Динамики пока мало.") +
        ` Измерений в журнале: ${l.length}. Что посоветуешь по весу и кормлению?`;
    }
    if (tab === "activity") {
      const l = sorted("activity", pet.id);
      const today = l.filter((r) => r.date === fmt.today())[0] || l[l.length - 1];
      const week = l.filter((r) => String(r.date) >= window.Store.iso(6));
      const steps = week.reduce((s, r) => s + (+r.steps || 0), 0);
      return `Дневник PetLife · Активность ${name}: сегодня ${today ? fmt.int(today.steps) : 0} шагов и ${today ? fmt.int(today.minutes) : 0} мин активности при цели ${fmt.int(STEP_GOAL)} шагов.` +
        ` За 7 дней ${fmt.int(steps)} шагов. Как поднять активность комфортно для питомца?`;
    }
    if (tab === "sleep") {
      const l = sorted("sleep", pet.id);
      const norm = sleepNorm(pet);
      const last7 = l.filter((r) => String(r.date) >= window.Store.iso(6));
      const avg = last7.length ? last7.reduce((s, r) => s + (+r.hours || 0), 0) / last7.length : 0;
      const q = l[l.length - 1];
      return `Дневник PetLife · Сон ${name}: средний сон ${fmt.num(avg, 1)} ч за неделю при норме ${fmt.num(norm, 1)} ч для вида и возраста.` +
        ` Последняя ночь ${q ? fmt.num(q.hours, 1) + " ч, качество " + (q.quality || "—") + "/5" : "не отмечена"}. Стоит ли менять режим?`;
    }
    const l = sorted("moods", pet.id);
    const st = moodStreaks(l);
    const avg = l.filter((m) => String(m.date) >= window.Store.iso(13));
    const score = avg.length ? avg.reduce((s, m) => s + moodScore(m.mood), 0) / avg.length : 0;
    return `Дневник PetLife · Настроение ${name}: средняя оценка ${fmt.num(score, 1)} из 5 за 2 недели, стрик хороших дней ${st.current}, лучший ${st.best}.` +
      ` ${moodWalkInsight(pet)} Что можно улучшить?`;
  }

  function exportPayload(pet, tab) {
    const base = { app: "PetLife", generatedAt: new Date().toISOString(), pet: { id: pet.id, name: pet.name, breed: D.breedById(pet.breedId).name, species: pet.species }, tab };
    if (tab === "weight") return Object.assign(base, { norm: +D.breedById(pet.breedId).weight, records: sorted("weights", pet.id) });
    if (tab === "activity") return Object.assign(base, { goalSteps: STEP_GOAL, records: sorted("activity", pet.id) });
    if (tab === "sleep") return Object.assign(base, { norm: sleepNorm(pet), records: sorted("sleep", pet.id) });
    return Object.assign(base, { moodsDictionary: D.moods, records: sorted("moods", pet.id) });
  }

  function footerActions(tab) {
    return `<div class="card"><div class="card-body row">
      <button class="btn btn-soft" data-act="trackers.aiNote" data-tab="${tab}">🤖 Записать в дневник ИИ</button>
      <button class="btn btn-ghost" data-act="trackers.export" data-tab="${tab}">📤 Экспорт данных</button>
      <span class="muted small">Сводка по разделу уйдёт ИИ-ассистенту, а полный JSON сохранится в файл.</span>
    </div></div>`;
  }

  /* ================================================================ РЕНДЕР */
  window.Panels.register("trackers", {
    title: "Трекеры",
    icon: "📈",
    desc: "Вес, активность с ошейником, сон и настроение питомца",
    render(view, ctx) {
      const pet = (ctx && ctx.pet) || window.Store.pet();
      const wanted = ctx && ctx.tab;
      const tab = TABS.some((t) => t.id === wanted) ? wanted : "weight";
      let body = "";
      if (tab === "weight") body = weightTab(pet);
      else if (tab === "activity") body = activityTab(pet);
      else if (tab === "sleep") body = sleepTab(pet);
      else body = moodTab(pet);

      view.innerHTML = `<div class="panel">
        <div class="panel-head">
          <div><h2>📈 Трекеры</h2><p>${esc(pet.name)} · ${esc(window.Store.ageLabel(pet))} · ${esc(D.breedById(pet.breedId).name)}</p></div>
          <div class="panel-tools">
            <button class="btn btn-sm btn-ghost" data-act="hub.open" data-panel="ai">🤖 Спросить ИИ</button>
            <button class="btn btn-sm btn-primary" data-act="trackers.export" data-tab="${tab}">📤 Экспорт</button>
          </div>
        </div>
        ${tabsBar(tab)}
        ${kpiRow(pet)}
        ${body}
        ${footerActions(tab)}
      </div>`;
    }
  });

  /* ============================================================== ДЕЙСТВИЯ */
  Actions.registerAll({
    "trackers.focus": (ds) => {
      const el = document.getElementById(ds.target);
      if (!el) return;
      window.PL.scrollToEl(el, 120);
      setTimeout(() => { el.focus(); }, 260);
    },

    "trackers.addWeight": () => {
      const pet = window.Store.pet();
      const date = ($("#tw-date") || {}).value || fmt.today();
      const kg = inputNum("#tw-kg");
      if (kg == null || kg <= 0 || kg > 150) { toast("Укажите вес в килограммах (0,2–150)", "warn"); return; }
      const value = Math.round(kg * 100) / 100;
      window.Store.update(() => {
        const bucket = window.Store.bucket("weights", pet.id);
        const same = bucket.filter((w) => w.date === date)[0];
        if (same) { same.kg = value; }
        else bucket.unshift({ id: window.Store.uid("w"), date, kg: value });
        const latest = window.Store.bucket("weights", pet.id).slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(-1)[0];
        const p = window.Store.pet(pet.id);
        if (latest) p.weight = +latest.kg;
      }, "weights");
      toast("Вес " + fmt.num(value, 1) + " кг записан", "ok");
    },

    "trackers.addActivity": () => {
      const pet = window.Store.pet();
      const date = ($("#ta-date") || {}).value || fmt.today();
      const steps = inputNum("#ta-steps");
      const minutes = inputNum("#ta-min");
      if (steps == null && minutes == null) { toast("Заполните шаги или минуты активности", "warn"); return; }
      window.Store.update(() => {
        const bucket = window.Store.bucket("activity", pet.id);
        const same = bucket.filter((r) => r.date === date)[0];
        if (same) { same.steps = Math.max(0, Math.round(steps == null ? same.steps : steps)); same.minutes = Math.max(0, Math.round(minutes == null ? same.minutes : minutes)); same.source = "manual"; }
        else bucket.unshift({ id: window.Store.uid("ac"), date, steps: Math.max(0, Math.round(steps || 0)), minutes: Math.max(0, Math.round(minutes || 0)), source: "manual" });
      }, "activity");
      toast("Запись активности добавлена", "ok");
    },

    "trackers.syncCollar": () => {
      const pet = window.Store.pet();
      const cat = pet.species === "cat";
      const steps = cat ? 400 + Math.round(Math.random() * 1200) : 6500 + Math.round(Math.random() * 6000);
      const minutes = cat ? 8 + Math.round(Math.random() * 18) : 35 + Math.round(Math.random() * 50);
      const today = fmt.today();
      window.Store.update(() => {
        const bucket = window.Store.bucket("activity", pet.id);
        const same = bucket.filter((r) => r.date === today)[0];
        if (same) { same.steps = steps; same.minutes = minutes; same.source = "collar"; }
        else bucket.unshift({ id: window.Store.uid("ac"), date: today, steps, minutes, source: "collar" });
      }, "activity");
      toast("Синхронизировано: " + fmt.int(steps) + " шагов, " + minutes + " мин активности", "ok");
    },

    "trackers.addSleep": () => {
      const pet = window.Store.pet();
      const date = ($("#ts-date") || {}).value || fmt.today();
      const hours = inputNum("#ts-hours");
      const quality = parseInt((($("#ts-quality") || {}).value || "3"), 10);
      if (hours == null || hours < 0 || hours > 24) { toast("Укажите часы сна (0–24)", "warn"); return; }
      const value = Math.round(hours * 10) / 10;
      window.Store.update(() => {
        const bucket = window.Store.bucket("sleep", pet.id);
        const same = bucket.filter((r) => r.date === date)[0];
        if (same) { same.hours = value; same.quality = quality; }
        else bucket.unshift({ id: window.Store.uid("sl"), date, hours: value, quality });
      }, "sleep");
      toast("Сон " + fmt.num(value, 1) + " ч записан", "ok");
    },

    "trackers.setMood": (ds) => {
      const pet = window.Store.pet();
      const def = moodDef(ds.id);
      if (!def) return;
      const today = fmt.today();
      window.Store.update(() => {
        const bucket = window.Store.bucket("moods", pet.id);
        const same = bucket.filter((m) => m.date === today)[0];
        if (same) same.mood = def.id;
        else bucket.unshift({ id: window.Store.uid("mo"), date: today, mood: def.id });
      }, "moods");
      toast("Настроение отмечено: " + def.emoji + " " + def.label, "ok");
    },

    "trackers.remove": async (ds) => {
      const pet = window.Store.pet();
      const names = { weights: "измерение веса", activity: "запись активности", sleep: "запись сна", moods: "отметку настроения" };
      const item = window.Store.bucket(ds.bucket, pet.id).filter((r) => r.id === ds.id)[0];
      if (!item) return;
      const ok = await confirmDialog("Удалить " + (names[ds.bucket] || "запись") + " от " + fmt.date(item.date) + "?", { ok: "Удалить", danger: true, icon: "🗑" });
      if (!ok) return;
      window.Store.remove(ds.bucket, ds.id, pet.id);
      toast("Запись удалена", "ok");
    },

    "trackers.export": (ds) => {
      const pet = window.Store.pet();
      const tab = ds.tab || "weight";
      const payload = exportPayload(pet, tab);
      window.PL.download("petlife-" + tab + "-" + fmt.today() + ".json", JSON.stringify(payload, null, 2));
      toast("Данные выгружены в petlife-" + tab + "-" + fmt.today() + ".json", "ok");
    },

    "trackers.aiNote": (ds) => {
      const pet = window.Store.pet();
      const tab = ds.tab || "weight";
      const text = tabSummary(pet, tab);
      window.Store.update(() => {
        window.Store.array("chat").push({ role: "user", text });
      }, "chat");
      toast("Запись добавлена в дневник ИИ", "ok");
      window.Hub.open("ai");
    }
  });
})();
