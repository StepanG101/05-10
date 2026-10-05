/* ============================================================================
 * PetLife — app/panel-services.js
 * Панель «Сервисы и бюджет» (функции ТЗ 26–30):
 *   26. Бюджет на питомца (расходы, лимит, аналитика, CSV).
 *   27. Сравнение страховок и калькулятор рисков.
 *   28. Запись на груминг.
 *   29. Запись на передержку.
 *   30. Умный дом: камеры, кормушки, фонтанчик, ошейник.
 *   + Мои заказы и записи.
 * Подразделы: budget | insurance | grooming | boarding | smart | orders.
 * ==========================================================================*/
(function () {
  "use strict";

  const PL = window.PL;
  const { $, esc, fmt, card, badge, progress, empty, field, table, list, bullets, Charts, toast, modal, confirmDialog, download, Actions } = PL;
  const D = window.PL_DATA;
  const Store = window.Store;
  const S = () => window.Store.state;

  /* ======================================================== состояние интерфейса */
  const TABS = [
    { id: "budget", name: "Бюджет", emoji: "💰" },
    { id: "insurance", name: "Страховки", emoji: "🛡" },
    { id: "grooming", name: "Груминг", emoji: "✂️" },
    { id: "boarding", name: "Передержка", emoji: "🏨" },
    { id: "smart", name: "Умный дом", emoji: "📡" },
    { id: "orders", name: "Заказы и записи", emoji: "🧾" }
  ];

  const SLOTS = ["09:00", "10:30", "12:00", "13:30", "15:00", "16:30", "18:00", "19:30"];
  const DEV_EMOJI = { camera: "📷", feeder: "🍽", fountain: "⛲", collar: "📡", sensor: "🌡" };
  const DEV_TYPES = [
    { id: "camera", name: "Камера" }, { id: "feeder", name: "Кормушка" },
    { id: "fountain", name: "Фонтанчик" }, { id: "collar", name: "Ошейник" }, { id: "sensor", name: "Датчик" }
  ];
  const BOARD_CHECK = [
    { id: "food", name: "Корм на весь срок", emoji: "🥣" },
    { id: "meds", name: "Лекарства и назначения", emoji: "💊" },
    { id: "toy", name: "Любимая игрушка", emoji: "🧸" },
    { id: "passport", name: "Ветпаспорт и прививки", emoji: "📕" },
    { id: "bed", name: "Подстилка или лежанка", emoji: "🛏" }
  ];

  const ui = {
    petId: null,
    bCat: "all", bMonth: "all", limit: null,
    insSort: "price", insNoFranchise: false, insAge: null, insSpend: null,
    gService: null, gPlace: null, gDate: null, gSlot: null,
    tTariff: null, tFrom: null, tTo: null, tHotel: null, tCheck: {}
  };

  /* ==================================================================== утилиты */
  const val = (id) => { const el = document.getElementById(id); return el ? el.value : ""; };
  const num = (id, def) => {
    const v = parseFloat(String(val(id)).replace(",", "."));
    return isNaN(v) ? (def == null ? 0 : def) : v;
  };
  const hhmm = () => {
    const d = new Date();
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  };
  function bind(view, sel, evt, fn) { const el = $(sel, view); if (el) el.addEventListener(evt, fn); }
  const refresh = () => { if (window.Hub && window.Hub.refresh) window.Hub.refresh(); };
  const text = (v) => String(v == null ? "" : v);

  function syncPet(pet) {
    if (ui.petId === pet.id) return;
    ui.petId = pet.id;
    ui.insAge = null;
    ui.insSpend = null;
    ui.gSlot = null;
    ui.tCheck = {};
  }

  const catById = (id) => D.expenseCategories.find((c) => c.id === id) || { id, name: "Другое", emoji: "📦" };
  const petById = (id) => Store.pets().find((p) => p.id === id) || {};
  const daysAgo = (date) => (Date.now() - new Date(date).getTime()) / 86400000;
  const sum = (arr, key) => arr.reduce((s, x) => s + (+(key ? x[key] : x) || 0), 0);
  const monthKey = (date) => text(date).slice(0, 7);
  function monthLabel(m) {
    const d = new Date(m + "-01T00:00:00");
    return isNaN(d) ? m : d.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  }
  function dateDiffDays(from, to) {
    const a = new Date(from), b = new Date(to);
    if (isNaN(a) || isNaN(b)) return 0;
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  }
  const money = (n) => fmt.money(n);

  const kpi = (icon, value, label, kind) =>
    `<div class="kpi ${kind || ""}"><span class="k-ico">${icon}</span><div><div class="k-value">${value}</div><div class="k-label">${esc(label)}</div></div></div>`;

  function tabBar(tab) {
    return `<div class="chip-row mb-2">${TABS.map((t) =>
      `<button class="tag ${t.id === tab ? "active" : ""}" data-act="hub.open" data-panel="services" data-tab="${t.id}">${t.emoji} ${esc(t.name)}</button>`
    ).join("")}</div>`;
  }

  /* ==================================================================== KPI-строка */
  function kpiRow() {
    const expenses = Store.array("expenses");
    const in30 = expenses.filter((e) => daysAgo(e.date) <= 30);
    const avgCheck = expenses.length ? Math.round(sum(expenses, "amount") / expenses.length) : 0;
    const bookings = Store.array("bookings").filter((b) => Store.daysUntil(b.date) >= 0)
      .sort((a, b) => (Store.daysUntil(a.date) - Store.daysUntil(b.date)));
    const next = bookings[0];
    const devices = Store.array("devices");
    const online = devices.filter((d) => d.on).length;
    const total30 = sum(in30, "amount");
    const limit = S().budgetLimit || 0;
    const kind = !limit ? "" : total30 / limit > 0.9 ? "orange" : "green";
    return `<div class="kpi-row mb-2">
      ${kpi("💰", money(total30), "Расход за 30 дней", kind)}
      ${kpi("🧾", money(avgCheck), "Средний чек", "")}
      ${kpi("📅", next ? esc(fmt.short(next.date)) + " " + esc(next.time || "") : "нет", next ? "Ближайшая запись" : "Записей нет", "")}
      ${kpi("📡", online + " из " + devices.length, "Устройств онлайн", online ? "green" : "")}
    </div>`;
  }

  /* ================================================================ 1. БЮДЖЕТ */
  function budgetFilters() {
    const all = Store.array("expenses");
    const byCat = ui.bCat === "all" ? all : all.filter((e) => e.category === ui.bCat);
    const byMonth = ui.bMonth === "all" ? byCat : byCat.filter((e) => monthKey(e.date) === ui.bMonth);
    return byMonth.slice().sort((a, b) => text(b.date).localeCompare(text(a.date)));
  }

  function savingsTips(all) {
    const tips = [];
    const byCat = {};
    all.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + (+e.amount || 0); });
    const food = byCat.food || 0;
    if (food > 0) {
      const perMonth = Math.round(food / Math.max(1, Math.min(12, new Set(all.map((e) => monthKey(e.date))).size)));
      tips.push("📦 Подписка на корм вместо разовых покупок: −15%, это около " + money(Math.round(perMonth * 0.15)) + " в месяц.");
    } else {
      tips.push("📦 Оформите подписку на корм — она дешевле разовых покупок на 15%.");
    }
    const ins = S().settings.insurance;
    if (!ins && D.insurance.length) {
      const min = D.insurance.reduce((a, b) => (a.monthly < b.monthly ? a : b));
      tips.push("🛡 Страховка вместо разовых визитов: полис от " + money(min.monthly) + " в месяц закрывает осмотры и операции.");
    } else if (ins) {
      tips.push("🛡 Полис «" + esc(ins.company + " " + ins.plan) + "» уже оформлен — используйте его на профилактику, а не только на экстренные случаи.");
    }
    const grooming = byCat.grooming || 0;
    if (grooming > 0) {
      tips.push("✂️ Груминг раз в 2 месяца вместо ежемесячного: экономия до " + money(Math.round(grooming * 0.4)) + " за период.");
    }
    if ((byCat.vet || 0) > 3000) {
      tips.push("🏥 Профилактический осмотр раз в год дешевле лечения: базовый чек-ап обычно стоит " + money(2500) + ".");
    }
    const toys = byCat.toys || 0;
    if (toys > 0) {
      tips.push("🧸 Игрушки-лизунцы и нюхательные коврики живут дольше мягких: заменяют часть покупок игрушек.");
    }
    tips.push("❤️ Premium-подписка PetLife возвращает 5% на заказы маркетплейса и даёт −15% на услуги.");
    tips.push("📉 Покупайте корм упаковками по 3–5 кг: цена за кг ниже на 10–20%, чем в маленьких пачках.");
    const save = Math.round((food * 0.15 + grooming * 0.4) / Math.max(1, new Set(all.map((e) => monthKey(e.date))).size) * 12);
    return { tips, save };
  }

  function renderBudget() {
    const st = S();
    const expenses = Store.array("expenses");
    const in30 = expenses.filter((e) => daysAgo(e.date) <= 30);
    const total30 = sum(in30, "amount");
    const totalAll = sum(expenses, "amount");
    const limit = ui.limit == null ? (+st.budgetLimit || 0) : ui.limit;
    const pct = limit ? Math.round((total30 / limit) * 100) : 0;
    const kind = pct < 70 ? "green" : pct <= 100 ? "orange" : "red";
    const limitHint = !limit ? "Лимит не задан" :
      pct > 100 ? "Лимит превышен на " + money(total30 - limit) :
        "Остаток лимита — " + money(Math.max(0, limit - total30));

    const months = Array.from(new Set(expenses.map((e) => monthKey(e.date)).filter(Boolean))).sort().reverse();
    const avgMonth = months.length ? Math.round(totalAll / months.length) : 0;
    const forecast = avgMonth * 12;
    const rows = budgetFilters();

    const donutParts = D.expenseCategories.map((c, i) => ({
      label: c.name,
      value: sum(in30.filter((e) => e.category === c.id), "amount"),
      color: Charts.palette[i % Charts.palette.length]
    })).filter((p) => p.value > 0);

    const catChips = `<div class="chip-row mb-2">
      <button class="tag ${ui.bCat === "all" ? "active" : ""}" data-act="services.bcat" data-cat="all">🗂 Все категории</button>
      ${D.expenseCategories.map((c) => `<button class="tag ${ui.bCat === c.id ? "active" : ""}" data-act="services.bcat" data-cat="${c.id}">${c.emoji} ${esc(c.name)}</button>`).join("")}
    </div>`;

    const monthOptions = [{ value: "all", label: "За всё время" }].concat(months.map((m) => ({ value: m, label: monthLabel(m) })));

    const formCard = card({
      title: "Новый расход", icon: "➕",
      body: `
        <div class="grid grid-3">
          ${field({ label: "Дата", type: "date", id: "sb-date", value: fmt.today() })}
          ${field({ label: "Категория", type: "select", id: "sb-cat", options: D.expenseCategories.map((c) => ({ value: c.id, label: c.emoji + " " + c.name })), value: "food" })}
          ${field({ label: "Сумма, ₽", type: "number", id: "sb-amount", value: "", placeholder: "Например, 2450", attrs: 'min="1" step="10"' })}
        </div>
        <div class="grid grid-2">
          ${field({ label: "Питомец", type: "select", id: "sb-pet", options: Store.pets().map((p) => ({ value: p.id, label: (p.emoji || "🐾") + " " + p.name })), value: (st.activePetId || "") })}
          ${field({ label: "Заметка", type: "text", id: "sb-note", placeholder: "Корм 3 кг, витамины…" })}
        </div>`,
      foot: `
        <button class="btn btn-primary" data-act="services.addExpense">💾 Добавить расход</button>
        <button class="btn btn-ghost" data-act="services.exportCsv">⬇️ Экспорт CSV</button>
      `
    });

    const limitCard = card({
      title: "Лимит бюджета", icon: "🎚",
      tools: badge(pct + "% лимита", pct < 70 ? "ok" : pct <= 100 ? "warn" : "danger"),
      body: `
        <div class="grid grid-2">
          ${field({ label: "Лимит в месяц, ₽", type: "number", id: "sb-limit", value: limit, attrs: 'min="100" step="500"' })}
          <div class="kv">
            <div class="kv-row"><span class="kv-k">За 30 дней</span><span class="kv-v">${money(total30)}</span></div>
            <div class="kv-row"><span class="kv-k">За всё время</span><span class="kv-v">${money(totalAll)}</span></div>
            <div class="kv-row"><span class="kv-k">Средний расход в месяц</span><span class="kv-v">${money(avgMonth)}</span></div>
            <div class="kv-row"><span class="kv-k">Прогноз на год</span><span class="kv-v">${money(forecast)}</span></div>
          </div>
        </div>
        ${progress(pct, kind)}
        <p class="muted small mt-1">${esc(limitHint)}</p>`,
      foot: `<button class="btn btn-green" data-act="services.saveLimit">💾 Сохранить лимит</button>
             <span class="muted small">Месяцев в истории: ${months.length || 0}</span>`
    });

    const analyticsCard = card({
      title: "Структура расходов за 30 дней", icon: "🍩",
      body: donutParts.length
        ? Charts.donut(donutParts, { center: money(total30), centerSub: "за 30 дней", size: 180, thickness: 24 }) +
          list(donutParts.map((p) => `${p.label}: <b>${money(p.value)}</b> (${Math.round((p.value / total30) * 100)}%)`), "dot")
        : empty("🍩", "Пока нет расходов", "Добавьте первый расход — и увидите структуру трат.",
          `<button class="btn btn-primary" data-act="services.focusExpense">Добавить расход</button>`)
    });

    const listCard = card({
      title: "Расходы", icon: "🧾",
      tools: `<span class="muted small">${rows.length} ${fmt.plural(rows.length, "запись", "записи", "записей")} · ${money(sum(rows, "amount"))}</span>`,
      body: `
        ${catChips}
        <div class="grid grid-2 mb-2">
          ${field({ label: "Месяц", type: "select", id: "sb-month", options: monthOptions, value: ui.bMonth })}
          <div class="kv">
            <div class="kv-row"><span class="kv-k">Показано записей</span><span class="kv-v">${rows.length}</span></div>
            <div class="kv-row"><span class="kv-k">Сумма по фильтру</span><span class="kv-v">${money(sum(rows, "amount"))}</span></div>
          </div>
        </div>
        ${rows.length ? table(
          ["Дата", "Категория", "Питомец", "Заметка", "Сумма", "Действия"],
          rows.slice(0, 80).map((e) => {
            const c = catById(e.category);
            const p = petById(e.petId);
            return [
              esc(fmt.short(e.date)),
              `${c.emoji} ${esc(c.name)}`,
              esc((p.emoji || "🐾") + " " + (p.name || "—")),
              esc(e.note || "—"),
              `<b>${money(e.amount)}</b>`,
              `<button class="btn btn-xs btn-danger" data-act="services.delExpense" data-id="${esc(e.id)}">Удалить</button>`
            ];
          })
        ) : empty("🧾", "Расходов нет", "Измените фильтры или добавьте новый расход.",
          `<button class="btn btn-primary" data-act="services.bcat" data-cat="all">Сбросить фильтр</button>`)}`
    });

    const { tips, save } = savingsTips(expenses);
    const savingsCard = card({
      title: "Как сэкономить", icon: "💡",
      tools: badge("до " + money(save) + " в год", "ok"),
      body: bullets("Проверенные способы сократить траты", tips) +
        `<p class="muted small mt-1">Оценка экономии рассчитана по вашим фактическим расходам за последние месяцы.</p>`
    });

    return `<div class="panel-grid cols-2">${formCard}${limitCard}</div>
      <div class="mt-2">${analyticsCard}</div>
      <div class="mt-2">${listCard}</div>
      <div class="mt-2">${savingsCard}</div>`;
  }

  /* ============================================================= 2. СТРАХОВКИ */
  const catOnlyPlan = (ins) => /кот/i.test(ins.plan);
  function plansFor(pet) {
    return pet.species === "cat" ? D.insurance.slice() : D.insurance.filter((i) => !catOnlyPlan(i));
  }

  function scoreInsurance(ins, age, risks, spend, pet) {
    let s = 50;
    const why = [];
    if (ins.coverage >= spend * 2) { s += 20; why.push("покрытие " + money(ins.coverage) + " вдвое перекрывает ожидаемые траты " + money(spend)); }
    else if (ins.coverage >= spend) { s += 10; why.push("покрытия " + money(ins.coverage) + " хватает на типичный год"); }
    else { s -= 12; why.push("покрытие " + money(ins.coverage) + " меньше ожидаемых трат " + money(spend)); }
    if (!ins.franchise) { s += 15; why.push("без франшизы — лечение оплачивается полностью"); }
    else { s -= 5; why.push("франшиза " + money(ins.franchise) + " на каждый случай"); }
    if (age >= 8 && !ins.franchise) { s += 10; why.push("после 8 лет франшиза невыгодна — визиты частые"); }
    if (risks >= 3 && ins.coverage >= 200000) { s += 12; why.push("у породы " + risks + " риска — нужен большой лимит"); }
    if (risks >= 3 && ins.coverage < 100000) { s -= 8; why.push("маленькое покрытие при породных рисках"); }
    if (ins.monthly <= 1000) { s += 8; why.push("недорого: " + money(ins.monthly) + " в месяц"); }
    else if (ins.monthly >= 2000) { s -= 6; why.push("высокий взнос " + money(ins.monthly) + " в месяц"); }
    if ((ins.features || []).some((f) => /онколог|МРТ|реабилит|стоматолог/i.test(f))) { s += 6; why.push("расширенные опции: " + ins.features.join(", ")); }
    if (pet && pet.species === "cat" && catOnlyPlan(ins)) { s += 6; why.push("тариф создан для домашних кошек"); }
    return { score: s, why };
  }

  function renderInsurance(pet) {
    if (!D.insurance.length) {
      return empty("🛡", "Тарифов пока нет", "Справочник страховок пуст — загляните позже.");
    }
    const breed = Store.breed(pet);
    const risks = (breed.risks || []).length;
    const age = ui.insAge == null ? Math.round(Store.age(pet) * 10) / 10 : ui.insAge;
    const spend = ui.insSpend == null ? 30000 : ui.insSpend;
    const current = S().settings.insurance;
    const available = plansFor(pet);

    let items = available.slice();
    if (ui.insNoFranchise) items = items.filter((i) => !i.franchise);
    if (ui.insSort === "coverage") items.sort((a, b) => b.coverage - a.coverage);
    else if (ui.insSort === "rating") items.sort((a, b) => (b.coverage / Math.max(1, b.monthly)) - (a.coverage / Math.max(1, a.monthly)));
    else items.sort((a, b) => a.monthly - b.monthly);

    const scored = available.map((i) => Object.assign({ ins: i }, scoreInsurance(i, age, risks, spend, pet)))
      .sort((a, b) => b.score - a.score);
    const best = scored[0];

    const calcCard = card({
      title: "Калькулятор: нужна ли страховка", icon: "🧮",
      body: `
        <div class="grid grid-3">
          ${field({ label: "Возраст питомца, лет", type: "number", id: "si-age", value: age, attrs: 'min="0" max="25" step="0.5"' })}
          ${field({ label: "Неожиданные траты за год, ₽", type: "number", id: "si-spend", value: spend, attrs: 'min="0" step="1000"' })}
          <div class="stat ${risks >= 3 ? "warn" : "ok"}">
            <div class="stat-ico">🧬</div>
            <div class="stat-main">
              <div class="stat-value">${risks}</div>
              <div class="stat-label">породных рисков</div>
              <div class="stat-hint">${esc(breed.name)}: ${esc((breed.risks || []).join(", ") || "рисков не отмечено")}</div>
            </div>
          </div>
        </div>
        <div class="ok-box mt-2">
          <b>Рекомендуем: ${esc(best.ins.company)} «${esc(best.ins.plan)}»</b> — ${money(best.ins.monthly)} в месяц, покрытие ${money(best.ins.coverage)}.<br>
          ${esc(best.why.slice(0, 3).join("; "))}.
        </div>`,
      foot: `
        <button class="btn btn-primary" data-act="services.insCalc">🤖 Подобрать тариф</button>
        <button class="btn btn-ghost" data-act="services.insReset">♻️ Сбросить</button>
        <span class="muted small">За год страховка обойдётся примерно в ${money(best.ins.monthly * 12)}</span>
      `
    });

    const filtersCard = card({
      title: "Тарифы", icon: "🛡",
      tools: `<span class="muted small">${items.length} из ${D.insurance.length}</span>`,
      body: `
        <div class="chip-row mb-2">
          <span class="muted small">Сортировка:</span>
          <button class="tag ${ui.insSort === "price" ? "active" : ""}" data-act="services.insSort" data-sort="price">💸 По цене</button>
          <button class="tag ${ui.insSort === "coverage" ? "active" : ""}" data-act="services.insSort" data-sort="coverage">🛡 По покрытию</button>
          <button class="tag ${ui.insSort === "rating" ? "active" : ""}" data-act="services.insSort" data-sort="rating">⭐ Выгодность</button>
          <button class="tag ${ui.insNoFranchise ? "active" : ""}" data-act="services.insFilter">🚫 Без франшизы</button>
        </div>
        ${pet.species === "cat" ? "" : `<p class="muted small">Для собак тарифы «только для кошек» скрыты — их ${D.insurance.length - available.length}.</p>`}
        ${current ? `<div class="ok-box">У вас оформлен полис «${esc(current.company)} ${esc(current.plan)}»: ${money(current.monthly)} в месяц, покрытие ${money(current.coverage)}. Действует с ${esc(fmt.short(current.since))}.</div>` : ""}`
    });

    const grid = items.length ? `<div class="grid grid-3 mt-2">${items.map((ins) => {
      const isBest = ins.id === best.ins.id;
      const sc = scoreInsurance(ins, age, risks, spend, pet);
      const isMine = current && current.id === ins.id;
      return `<div class="insurance-card ${isBest ? "best" : ""}">
        ${isBest ? `<span class="ic-best">Подходит: ${esc(ins.bestFor)}</span>` : ""}
        <div class="row-between">
          <div>
            <div class="med-name">${esc(ins.company)}</div>
            <div class="med-sub">тариф «${esc(ins.plan)}»</div>
          </div>
          ${isMine ? badge("Оформлен", "ok") : ""}
        </div>
        <div class="insurance-price mt-1">${money(ins.monthly)} <span class="small muted">/ мес</span></div>
        <div class="kv mt-1">
          <div class="kv-row"><span class="kv-k">Покрытие</span><span class="kv-v">${money(ins.coverage)}</span></div>
          <div class="kv-row"><span class="kv-k">Франшиза</span><span class="kv-v">${ins.franchise ? money(ins.franchise) : "нет"}</span></div>
          <div class="kv-row"><span class="kv-k">За год</span><span class="kv-v">${money(ins.monthly * 12)}</span></div>
          <div class="kv-row"><span class="kv-k">Комментарий</span><span class="kv-v">${esc(ins.bestFor)}</span></div>
        </div>
        <div class="chip-row mt-1">${(ins.features || []).map((f) => badge(f, "info")).join("")}</div>
        ${isBest ? `<div class="hint-box mt-2"><b>Почему подходит:</b><br>${esc(sc.why.join("; "))}</div>` : `<p class="muted small mt-1">${esc(sc.why[0] || "")}</p>`}
        <div class="mt-2">
          <button class="btn btn-sm ${isMine ? "btn-ghost" : "btn-primary"}" data-act="services.insure" data-id="${ins.id}" ${isMine ? "disabled" : ""}>${isMine ? "✅ Полис оформлен" : "📝 Оформить"}</button>
        </div>
      </div>`;
    }).join("")}</div>` : empty("🛡", "Под фильтр не подошёл ни один тариф", "Снимите фильтр «без франшизы».",
      `<button class="btn btn-primary" data-act="services.insFilter">Показать все тарифы</button>`);

    return calcCard + `<div class="mt-2">${filtersCard}</div>` + grid;
  }

  /* ============================================================== 3. ГРУМИНГ */
  function slotBusy(place, date, time) {
    const booked = Store.array("bookings").some((b) => b.place === place.name && b.date === date && b.time === time);
    if (booked) return true;
    const seed = (text(date) + time + place.id).split("").reduce((s, ch) => s + ch.charCodeAt(0), 0);
    return seed % 5 === 0;
  }

  function renderGrooming(pet) {
    const services = D.services.grooming;
    const places = D.places.filter((p) => p.type === "groomer");
    if (!services.length || !places.length) {
      return empty("✂️", "Груминг недоступен", "В справочнике нет услуг или салонов груминга.");
    }
    const svc = services.find((s) => s.id === ui.gService) || services[0];
    const place = places.find((p) => p.id === ui.gPlace) || places[0];
    const date = ui.gDate || Store.iso(-1);
    const premium = !!S().owner.premium;
    const price = premium ? Math.round(svc.price * 0.85) : svc.price;
    const slot = ui.gSlot && !slotBusy(place, date, ui.gSlot) ? ui.gSlot : null;
    const myBookings = Store.array("bookings").filter((b) => b.type === "grooming" && b.petId === pet.id);

    const serviceCard = card({
      title: "Услуги груминга", icon: "✂️",
      body: `<div class="grid grid-3">${services.map((s) => `
        <button class="tag ${s.id === svc.id ? "active" : ""}" data-act="services.gservice" data-id="${s.id}" style="display:block;text-align:left;padding:14px">
          <div style="font-size:1.5rem">${s.emoji}</div>
          <div style="font-weight:700">${esc(s.name)}</div>
          <div class="muted small">${esc(s.desc)}</div>
          <div class="mt-1"><b>${money(s.price)}</b> · ${s.minutes} мин</div>
        </button>`).join("")}</div>`,
      tools: badge(services.length + " " + fmt.plural(services.length, "услуга", "услуги", "услуг"), "muted")
    });

    const placeCard = card({
      title: "Салон и время", icon: "📍",
      body: `
        <div class="grid grid-2">
          ${field({ label: "Салон", type: "select", id: "sg-place", options: places.map((p) => ({ value: p.id, label: p.emoji + " " + p.name })), value: place.id })}
          ${field({ label: "Дата", type: "date", id: "sg-date", value: date })}
        </div>
        <div class="kv mb-2">
          <div class="kv-row"><span class="kv-k">Адрес</span><span class="kv-v">${esc(place.address)}</span></div>
          <div class="kv-row"><span class="kv-k">Часы работы</span><span class="kv-v">${esc(place.hours)}</span></div>
          <div class="kv-row"><span class="kv-k">Рейтинг салона</span><span class="kv-v">⭐ ${fmt.num(place.rating, 1)}</span></div>
        </div>
        <div class="muted small mb-1">Свободные слоты (${esc(fmt.date(date))}) — занятые зачёркнуты:</div>
        <div class="slot-row">
          ${SLOTS.map((t) => slotBusy(place, date, t)
            ? `<button class="slot busy" disabled>${t}</button>`
            : `<button class="slot ${ui.gSlot === t ? "active" : ""}" data-act="services.gslot" data-time="${t}">${t}</button>`).join("")}
        </div>`,
      foot: `
        <div class="row-between" style="width:100%">
          <div>
            <div class="small muted">${esc(svc.name)} · ${svc.minutes} мин${slot ? " · " + esc(ui.gSlot) : ""}</div>
            <div><b style="font-size:1.15rem">${money(price)}</b> ${premium ? `<span class="prod-old">${money(svc.price)}</span> ${badge("Premium −15%", "ok")}` : ""}</div>
          </div>
          <button class="btn btn-primary" data-act="services.bookGrooming">📅 Записаться</button>
        </div>`
    });

    const mineCard = card({
      title: "Мои записи на груминг", icon: "📋",
      tools: badge(String(myBookings.length), myBookings.length ? "info" : "muted"),
      body: myBookings.length ? `<div class="stack">${myBookings.map((b) => `
        <div class="cart-line">
          <span class="cart-line-ico" style="font-size:1.4rem">✂️</span>
          <span class="cl-name">
            <b>${esc(b.service || "Груминг")}</b><br>
            <span class="muted small">${esc(b.place || "")} · ${esc(fmt.date(b.date))} в ${esc(b.time || "")} · ${money(b.price)}</span>
          </span>
          <span>${badge(b.status || "подтверждена", "ok")}</span>
          <button class="btn btn-xs btn-ghost" data-act="services.remind" data-id="${esc(b.id)}">🔔 Напомнить</button>
          <button class="btn btn-xs btn-danger" data-act="services.cancelBooking" data-id="${esc(b.id)}">Отменить</button>
        </div>`).join("")}</div>`
        : empty("✂️", "Записей нет", "Выберите услугу, салон и удобный слот — запись появится здесь.",
          `<button class="btn btn-primary" data-act="services.gslot" data-time="${SLOTS[0]}">Выбрать ${SLOTS[0]}</button>`)
    });

    return `${serviceCard}<div class="mt-2">${placeCard}</div><div class="mt-2">${mineCard}</div>`;
  }

  /* =========================================================== 4. ПЕРЕДЕРЖКА */
  function renderBoarding(pet) {
    const tariffs = D.services.boarding;
    const hotels = D.places.filter((p) => p.type === "hotel");
    if (!tariffs.length) {
      return empty("🏨", "Передержка недоступна", "В справочнике нет тарифов передержки.");
    }
    const tariff = tariffs.find((t) => t.id === ui.tTariff) || tariffs[0];
    const hotel = hotels.find((h) => h.id === ui.tHotel) || hotels[0] || { name: "Зоогостиница", address: "—", note: "" };
    const from = ui.tFrom || Store.iso(-1);
    const to = ui.tTo || Store.iso(-3);
    const days = Math.max(0, dateDiffDays(from, to));
    const base = days * tariff.price;
    const discount = days > 7 ? Math.round(base * 0.1) : 0;
    const total = base - discount;
    const checked = BOARD_CHECK.filter((c) => ui.tCheck[c.id]).length;
    const myBookings = Store.array("bookings").filter((b) => b.type === "boarding" && b.petId === pet.id);

    const tariffCard = card({
      title: "Тарифы передержки", icon: "🏨",
      body: `<div class="grid grid-2">${tariffs.map((t) => `
        <button class="tag ${t.id === tariff.id ? "active" : ""}" data-act="services.ttariff" data-id="${t.id}" style="display:block;text-align:left;padding:14px">
          <div style="font-size:1.5rem">${t.emoji}</div>
          <div style="font-weight:700">${esc(t.name)}</div>
          <div class="muted small">${esc(t.desc)}</div>
          <div class="mt-1"><b>${money(t.price)}</b> / ${esc(t.unit)}</div>
        </button>`).join("")}</div>`
    });

    const calcCard = card({
      title: "Даты и расчёт", icon: "🗓",
      body: `
        <div class="grid grid-3">
          ${field({ label: "Заезд, с", type: "date", id: "st-from", value: from })}
          ${field({ label: "Выезд, по", type: "date", id: "st-to", value: to })}
          ${field({ label: "Где", type: "select", id: "st-hotel", options: hotels.map((h) => ({ value: h.id, label: h.emoji + " " + h.name })), value: hotel.id })}
        </div>
        <div class="kv">
          <div class="kv-row"><span class="kv-k">Суток</span><span class="kv-v">${days}</span></div>
          <div class="kv-row"><span class="kv-k">Тариф</span><span class="kv-v">${esc(tariff.name)} · ${money(tariff.price)} / ${esc(tariff.unit)}</span></div>
          <div class="kv-row"><span class="kv-k">Стоимость</span><span class="kv-v">${money(base)}</span></div>
          <div class="kv-row"><span class="kv-k">Скидка ${discount ? "10% (более 7 суток)" : "—"}</span><span class="kv-v">−${money(discount)}</span></div>
          <div class="kv-row"><span class="kv-k"><b>Итого</b></span><span class="kv-v"><b>${money(total)}</b></span></div>
        </div>
        ${days <= 0 ? `<div class="danger-box mt-2">⚠️ Дата выезда должна быть позже даты заезда.</div>` : `<div class="ok-box mt-2">✅ ${esc(hotel.name)}, ${esc(hotel.address)}. ${esc(hotel.note || "")}</div>`}`,
      foot: `<button class="btn btn-primary" data-act="services.bookBoarding" ${days <= 0 ? "disabled" : ""}>📅 Забронировать</button>
             <span class="muted small">${days > 7 ? "Скидка 10% за длительное проживание применена" : "От 8 суток — скидка 10%"}</span>`
    });

    const checkCard = card({
      title: "Что взять с питомцем", icon: "🎒",
      tools: badge(checked + " из " + BOARD_CHECK.length, checked === BOARD_CHECK.length ? "ok" : "muted"),
      body: `
        <div class="chip-row">${BOARD_CHECK.map((c) =>
          `<button class="tag ${ui.tCheck[c.id] ? "active" : ""}" data-act="services.tcheck" data-id="${c.id}">${ui.tCheck[c.id] ? "✅" : c.emoji} ${esc(c.name)}</button>`).join("")}</div>
        ${progress((checked / BOARD_CHECK.length) * 100, checked === BOARD_CHECK.length ? "green" : "orange")}
        <p class="muted small mt-1">${checked === BOARD_CHECK.length ? "Всё собрано — можно ехать 🚗" : "Отметьте пункты, которые уже положили в сумку."}</p>`
    });

    const mineCard = card({
      title: "Мои брони передержки", icon: "📋",
      tools: badge(String(myBookings.length), myBookings.length ? "info" : "muted"),
      body: myBookings.length ? `<div class="stack">${myBookings.map((b) => `
        <div class="cart-line">
          <span style="font-size:1.4rem">🏨</span>
          <span class="cl-name">
            <b>${esc(b.service)}</b><br>
            <span class="muted small">${esc(b.place || "")} · ${esc(fmt.short(b.date))} → ${esc(fmt.short(b.dateTo || b.date))} · ${b.days || 0} ${fmt.plural(b.days || 0, "сутки", "суток", "суток")} · ${money(b.price)}</span>
          </span>
          <span>${badge(b.status || "подтверждена", "ok")}</span>
          <button class="btn btn-xs btn-danger" data-act="services.cancelBooking" data-id="${esc(b.id)}">Отменить</button>
        </div>`).join("")}</div>`
        : empty("🏨", "Броней нет", "Выберите тариф, даты и отель — бронь появится здесь.",
          `<button class="btn btn-primary" data-act="services.newBoardDates">Заполнить даты</button>`)
    });

    return `${tariffCard}<div class="mt-2">${calcCard}</div><div class="mt-2">${checkCard}</div><div class="mt-2">${mineCard}</div>`;
  }

  /* ============================================================ 5. УМНЫЙ ДОМ */
  function deviceActions(d) {
    if (d.type === "feeder") return `<button class="btn btn-xs btn-primary" data-act="services.devFeed" data-id="${esc(d.id)}">🍽 Покормить сейчас</button>`;
    if (d.type === "camera") return `<button class="btn btn-xs btn-primary" data-act="services.devCam" data-id="${esc(d.id)}">📷 Смотреть</button>`;
    if (d.type === "fountain") return `<button class="btn btn-xs btn-soft" data-act="services.devFilter" data-id="${esc(d.id)}">⛲ Промыть фильтр</button>`;
    if (d.type === "collar") return `<button class="btn btn-xs btn-soft" data-act="services.devSync" data-id="${esc(d.id)}">📡 Синхронизировать</button>`;
    return `<button class="btn btn-xs btn-ghost" data-act="services.devInfo" data-id="${esc(d.id)}">📊 Показатели</button>`;
  }

  function renderSmart(pet) {
    const devices = Store.array("devices");
    const online = devices.filter((d) => d.on).length;
    const offline = devices.filter((d) => !d.on);

    const summary = card({
      title: "Сводка по дому", icon: "🏠",
      tools: badge(online + " онлайн из " + devices.length, online === devices.length && devices.length ? "ok" : online ? "warn" : "muted"),
      body: `
        <div class="grid grid-4">
          ${PL.stat({ icon: "📡", value: String(online), label: "Устройств онлайн", kind: online ? "ok" : "warn" })}
          ${PL.stat({ icon: "🔌", value: String(devices.length - online), label: "Выключено" })}
          ${PL.stat({ icon: "🐾", value: esc(pet.name), label: "Под наблюдением" })}
          ${PL.stat({ icon: "📷", value: String(devices.filter((d) => d.type === "camera").length), label: "Камер" })}
        </div>
        ${offline.length ? `<p class="muted small mt-1">Не в сети: ${esc(offline.map((d) => d.name).join(", "))}. Включите переключателем, чтобы вернуть в работу.</p>` : `<p class="muted small mt-1">Все устройства в сети — дом под контролем.</p>`}`,
      foot: `<button class="btn btn-primary" data-act="services.devAdd">➕ Добавить устройство</button>`
    });

    const grid = devices.length ? `<div class="stack mt-2">${devices.map((d) => `
      <div class="device-card ${d.on ? "" : "off"}">
        <div class="device-ico">${d.emoji || DEV_EMOJI[d.type] || "🔌"}</div>
        <div class="med-main">
          <div class="med-name">${esc(d.name)}</div>
          <div class="med-sub">${esc(d.room || "—")} · ${esc(d.state || "")}</div>
          <div class="tiny muted">Последнее действие: ${esc(d.lastAction || "—")}</div>
        </div>
        <div class="chip-row">${deviceActions(d)}</div>
        <button class="switch ${d.on ? "on" : ""}" data-act="services.devToggle" data-id="${esc(d.id)}" title="${d.on ? "Выключить" : "Включить"}" aria-label="Переключатель"></button>
        <button class="btn btn-xs btn-ghost" data-act="services.devDel" data-id="${esc(d.id)}" title="Удалить устройство">🗑</button>
      </div>`).join("")}</div>`
      : empty("📡", "Устройств пока нет", "Добавьте камеру, кормушку или умный ошейник — и управляйте домом из PetLife.",
        `<button class="btn btn-primary" data-act="services.devAdd">Добавить устройство</button>`);

    const tips = card({
      title: "Сценарии заботы", icon: "🤖",
      body: bullets("Что можно автоматизировать", [
        "🍽 Кормушка выдаёт порцию по расписанию 2 раза в день — удобно, если вы задерживаетесь.",
        "📷 Камера пишет облако: посмотрите, как питомец переживает одиночество.",
        "⛲ Фонтанчик с фильтром стимулирует пить больше воды — профилактика МКБ у кошек.",
        "📡 Ошейник считает шаги: если активность ниже 6 000, добавьте прогулку.",
        "🌡 Климат-датчик предупредит о жаре: при 26 °C в комнате включите кондиционер."
      ])
    });

    return summary + grid + `<div class="mt-2">${tips}</div>`;
  }

  /* ===================================================== 6. ЗАКАЗЫ И ЗАПИСИ */
  function renderOrders(pet) {
    const bookings = Store.array("bookings").slice().sort((a, b) => text(b.date).localeCompare(text(a.date)));
    const orders = Store.array("orders").slice().sort((a, b) => text(b.date).localeCompare(text(a.date)));
    const expenses = Store.array("expenses");
    const byPet = Store.pets().map((p) => ({
      label: p.name,
      short: p.name.slice(0, 9),
      value: sum(expenses.filter((e) => e.petId === p.id), "amount"),
      color: p.color || "#2C5F8D"
    }));

    const bookingsCard = card({
      title: "Мои записи", icon: "📅",
      tools: badge(String(bookings.length), bookings.length ? "info" : "muted"),
      body: bookings.length ? table(
        ["Дата", "Время", "Услуга", "Место", "Статус", "Сумма", "Действия"],
        bookings.map((b) => {
          const bpet = petById(b.petId);
          const soon = Store.daysUntil(b.date);
          return [
            `${esc(fmt.short(b.date))}${soon >= 0 && soon <= 3 ? " " + badge("скоро", "warn") : ""}`,
            esc(b.time || "—"),
            `${esc((bpet.emoji || "🐾"))} ${esc(b.service || b.type || "услуга")}`,
            esc(b.place || "—"),
            badge(b.status || "подтверждена", (b.status || "").indexOf("отмен") >= 0 ? "danger" : "ok"),
            `<b>${money(b.price)}</b>`,
            `<button class="btn btn-xs btn-ghost" data-act="services.remind" data-id="${esc(b.id)}">🔔</button>
             <button class="btn btn-xs btn-danger" data-act="services.cancelBooking" data-id="${esc(b.id)}">Отменить</button>`
          ];
        })
      ) : empty("📅", "Записей нет", "Запишитесь на груминг или передержку — записи появятся здесь.",
        `<button class="btn btn-primary" data-act="hub.open" data-panel="services" data-tab="grooming">Записаться на груминг</button>`)
    });

    const ordersCard = card({
      title: "Мои заказы", icon: "📦",
      tools: badge(String(orders.length), orders.length ? "info" : "muted"),
      body: orders.length ? table(
        ["Дата", "Состав", "Статус", "Сумма", "Действия"],
        orders.map((o) => [
          esc(fmt.short(o.date)),
          esc((o.items || []).map((i) => i.name + (i.qty > 1 ? " ×" + i.qty : "")).join(", ") || "—"),
          badge(o.status || "в обработке", (o.status || "").indexOf("отмен") >= 0 ? "danger" : (o.status || "").indexOf("достав") >= 0 ? "ok" : "info"),
          `<b>${money(o.total)}</b>`,
          `<button class="btn btn-xs btn-primary" data-act="services.reorder" data-id="${esc(o.id)}">🔁 Повторить заказ</button>
           <button class="btn btn-xs btn-ghost" data-act="services.delOrder" data-id="${esc(o.id)}">Отменить</button>`
        ])
      ) : empty("📦", "Заказов нет", "Загляните в маркетплейс — корм и игрушки с доставкой.",
        `<button class="btn btn-primary" data-act="hub.open" data-panel="market">В маркетплейс</button>`)
    });

    const petsCard = card({
      title: "Мои питомцы: распределение трат", icon: "🐾",
      body: Charts.bars(byPet, { unit: " ₽", color: "#8E44AD" }) +
        `<div class="kv mt-1">${byPet.map((p) => `<div class="kv-row"><span class="kv-k">${esc(p.label)}</span><span class="kv-v">${money(p.value)}</span></div>`).join("")}</div>`
    });

    return `${bookingsCard}<div class="mt-2">${ordersCard}</div><div class="mt-2">${petsCard}</div>`;
  }

  /* ================================================================= регистрация */
  window.Panels.register("services", {
    title: "Сервисы и бюджет",
    icon: "🧾",
    desc: "Бюджет, страховки, груминг, передержка, умный дом",
    render(view, ctx) {
      const pet = (ctx && ctx.pet) || Store.pet();
      const tab = (ctx && ctx.tab) || "budget";
      syncPet(pet);

      const known = TABS.some((t) => t.id === tab);
      const active = known ? tab : "budget";

      let body;
      if (active === "insurance") body = renderInsurance(pet);
      else if (active === "grooming") body = renderGrooming(pet);
      else if (active === "boarding") body = renderBoarding(pet);
      else if (active === "smart") body = renderSmart(pet);
      else if (active === "orders") body = renderOrders(pet);
      else body = renderBudget(pet);

      view.innerHTML = `
        <div class="panel">
          <div class="panel-head">
            <div>
              <h2>🧾 Сервисы и бюджет · ${esc(pet.name)}</h2>
              <p>Лимит ${money(S().budgetLimit || 0)} в месяц · ${esc(S().owner.premium ? "Premium: −15% на услуги" : "Стандартный тариф")} · записей: ${Store.array("bookings").length}</p>
            </div>
            <div class="panel-tools">
              <button class="btn btn-sm btn-ghost" data-act="services.exportCsv">⬇️ CSV</button>
              <button class="btn btn-sm btn-primary" data-act="services.addExpenseFocus">➕ Расход</button>
            </div>
          </div>
          ${kpiRow()}
          ${tabBar(active)}
          ${body}
        </div>`;

      /* --- поля без кнопок: слушаем change вручную --- */
      if (active === "budget") {
        bind(view, "#sb-month", "change", (e) => { ui.bMonth = e.target.value; refresh(); });
        bind(view, "#sb-limit", "change", (e) => {
          const v = parseFloat(String(e.target.value).replace(",", "."));
          ui.limit = isNaN(v) ? null : Math.max(0, v);
        });
      }
      if (active === "insurance") {
        bind(view, "#si-age", "change", () => {
          ui.insAge = Math.max(0, num("si-age", Math.round(Store.age(pet) * 10) / 10));
          refresh();
        });
        bind(view, "#si-spend", "change", () => {
          ui.insSpend = Math.max(0, num("si-spend", 30000));
          refresh();
        });
      }
      if (active === "grooming") {
        bind(view, "#sg-place", "change", (e) => { ui.gPlace = e.target.value; ui.gSlot = null; refresh(); });
        bind(view, "#sg-date", "change", (e) => { ui.gDate = e.target.value; ui.gSlot = null; refresh(); });
      }
      if (active === "boarding") {
        bind(view, "#st-from", "change", (e) => { ui.tFrom = e.target.value; refresh(); });
        bind(view, "#st-to", "change", (e) => { ui.tTo = e.target.value; refresh(); });
        bind(view, "#st-hotel", "change", (e) => { ui.tHotel = e.target.value; refresh(); });
      }
    }
  });

  /* ================================================================== действия */
  function focusBudget() {
    if (window.Hub) window.Hub.open("services", "budget");
    const el = document.getElementById("sb-amount");
    if (el) { el.focus(); window.PL.scrollToEl(el, 120); }
  }

  function exportCsv() {
    const rows = budgetFilters();
    const head = ["Дата", "Категория", "Питомец", "Сумма", "Заметка"];
    const lines = rows.map((e) => {
      const p = petById(e.petId);
      return [
        text(e.date),
        catById(e.category).name,
        p.name || "—",
        Math.round(+e.amount || 0),
        text(e.note).replace(/[;\r\n]/g, ",")
      ].join(";");
    });
    const csv = "\uFEFF" + [head.join(";")].concat(lines).join("\r\n");
    download("petlife-budget.csv", csv, "text/csv;charset=utf-8");
    toast("Экспортировано " + rows.length + " " + fmt.plural(rows.length, "запись", "записи", "записей") + " в petlife-budget.csv", "ok");
  }

  function withDevice(id, fn) {
    Store.update((s) => {
      if (!Array.isArray(s.devices)) s.devices = [];
      const d = s.devices.find((x) => x.id === id);
      if (d) fn(d, s);
    }, "devices");
  }

  Actions.registerAll({
    /* --------------------------------------------------------------- бюджет */
    "services.addExpense": () => {
      const amount = num("sb-amount", 0);
      if (amount <= 0) { toast("Укажите сумму расхода", "warn"); return; }
      const petId = val("sb-pet") || Store.pet().id;
      const item = {
        id: Store.uid("ex"), petId,
        date: val("sb-date") || fmt.today(),
        category: val("sb-cat") || "other",
        amount: Math.round(amount),
        note: val("sb-note")
      };
      Store.update((s) => { Store.array("expenses").unshift(item); }, "expenses");
      toast("Расход " + money(item.amount) + " (" + catById(item.category).name + ") добавлен", "ok");
    },
    "services.addExpenseFocus": () => focusBudget(),
    "services.focusExpense": () => focusBudget(),
    "services.bcat": (ds) => { ui.bCat = ds.cat; refresh(); },
    "services.saveLimit": () => {
      const v = num("sb-limit", S().budgetLimit || 0);
      if (v <= 0) { toast("Лимит должен быть больше нуля", "warn"); return; }
      ui.limit = v;
      Store.update((s) => { s.budgetLimit = Math.round(v); }, "budgetLimit");
      toast("Лимит бюджета: " + money(v) + " в месяц", "ok");
    },
    "services.delExpense": (ds) => {
      const item = Store.array("expenses").find((e) => e.id === ds.id);
      if (!item) return;
      Store.update((s) => { s.expenses = Store.array("expenses").filter((e) => e.id !== ds.id); }, "expenses");
      toast("Расход " + money(item.amount) + " удалён", "info");
    },
    "services.exportCsv": () => exportCsv(),

    /* ------------------------------------------------------------- страховки */
    "services.insSort": (ds) => { ui.insSort = ds.sort; refresh(); },
    "services.insFilter": () => {
      ui.insNoFranchise = !ui.insNoFranchise;
      refresh();
      toast(ui.insNoFranchise ? "Показаны только тарифы без франшизы" : "Показаны все тарифы", "info");
    },
    "services.insCalc": () => {
      ui.insAge = Math.max(0, num("si-age", 0));
      ui.insSpend = Math.max(0, num("si-spend", 30000));
      refresh();
      const pet = Store.pet();
      const risks = (Store.breed(pet).risks || []).length;
      const best = plansFor(pet)
        .map((i) => Object.assign({ ins: i }, scoreInsurance(i, ui.insAge, risks, ui.insSpend, pet)))
        .sort((a, b) => b.score - a.score)[0];
      toast("Рекомендуем «" + best.ins.company + " " + best.ins.plan + "» — " + money(best.ins.monthly) + " в месяц", "ok");
    },
    "services.insReset": () => {
      ui.insAge = null; ui.insSpend = null; ui.insSort = "price"; ui.insNoFranchise = false;
      refresh();
      toast("Калькулятор сброшен", "info");
    },
    "services.insure": (ds) => {
      const ins = D.insurance.find((i) => i.id === ds.id);
      if (!ins) return;
      const pet = Store.pet();
      const current = S().settings.insurance;
      if (current && current.id === ins.id) { toast("Этот полис уже оформлен", "info"); return; }
      Store.update((s) => {
        Store.array("expenses").unshift({
          id: Store.uid("ex"), petId: pet.id, date: fmt.today(), category: "insurance",
          amount: ins.monthly, note: "Полис «" + ins.company + " " + ins.plan + "»"
        });
        if (!s.settings) s.settings = {};
        s.settings.insurance = {
          id: ins.id, company: ins.company, plan: ins.plan, monthly: ins.monthly,
          coverage: ins.coverage, franchise: ins.franchise, features: ins.features, since: fmt.today()
        };
      }, "insurance");
      toast("Полис оформлен (демо): " + ins.company + " «" + ins.plan + "»", "ok");
    },

    /* --------------------------------------------------------------- груминг */
    "services.gservice": (ds) => { ui.gService = ds.id; refresh(); },
    "services.gslot": (ds) => {
      const places = D.places.filter((p) => p.type === "groomer");
      const place = places.find((p) => p.id === ui.gPlace) || places[0];
      const date = ui.gDate || Store.iso(-1);
      if (slotBusy(place, date, ds.time)) { toast("Этот слот уже занят — выберите другой", "warn"); refresh(); return; }
      ui.gSlot = ds.time;
      refresh();
      toast("Выбрано " + ds.time + " · " + place.name, "info");
    },
    "services.bookGrooming": () => {
      const pet = Store.pet();
      const services = D.services.grooming;
      const places = D.places.filter((p) => p.type === "groomer");
      const svc = services.find((s) => s.id === ui.gService) || services[0];
      const place = places.find((p) => p.id === ui.gPlace) || places[0];
      if (!svc || !place) { toast("Груминг сейчас недоступен", "warn"); return; }
      const date = ui.gDate || Store.iso(-1);
      if (!ui.gSlot) { toast("Выберите удобное время", "warn"); return; }
      if (slotBusy(place, date, ui.gSlot)) { toast("Слот только что заняли — выберите другой", "warn"); ui.gSlot = null; refresh(); return; }
      const premium = !!S().owner.premium;
      const price = premium ? Math.round(svc.price * 0.85) : svc.price;
      Store.update((s) => {
        Store.array("bookings").unshift({
          id: Store.uid("bk"), petId: pet.id, type: "grooming",
          service: svc.name, place: place.name, price, date, time: ui.gSlot, status: "подтверждена"
        });
      }, "bookings");
      toast("Запись на " + fmt.short(date) + " в " + ui.gSlot + " подтверждена: " + svc.name, "ok");
      ui.gSlot = null;
    },
    "services.remind": () => toast("Напоминание о записи отправлено (демо)", "ok"),
    "services.cancelBooking": async (ds) => {
      const b = Store.array("bookings").find((x) => x.id === ds.id);
      if (!b) return;
      const ok = await confirmDialog("Отменить запись «" + (b.service || b.type) + "» на " + fmt.short(b.date) + "?", { ok: "Отменить запись", danger: true, icon: "📅" });
      if (!ok) return;
      Store.update((s) => { s.bookings = Store.array("bookings").filter((x) => x.id !== ds.id); }, "bookings");
      toast("Запись отменена", "info");
    },

    /* ------------------------------------------------------------ передержка */
    "services.ttariff": (ds) => { ui.tTariff = ds.id; refresh(); },
    "services.tcheck": (ds) => {
      ui.tCheck[ds.id] = !ui.tCheck[ds.id];
      refresh();
    },
    "services.newBoardDates": () => {
      ui.tFrom = Store.iso(-1);
      ui.tTo = Store.iso(-5);
      refresh();
      toast("Даты заполнены: заезд завтра, выезд через 5 дней", "info");
    },
    "services.bookBoarding": () => {
      const pet = Store.pet();
      const tariffs = D.services.boarding;
      const hotels = D.places.filter((p) => p.type === "hotel");
      const tariff = tariffs.find((t) => t.id === ui.tTariff) || tariffs[0];
      const hotel = hotels.find((h) => h.id === ui.tHotel) || hotels[0];
      if (!tariff) { toast("Тариф передержки не выбран", "warn"); return; }
      const from = ui.tFrom || Store.iso(-1);
      const to = ui.tTo || Store.iso(-3);
      const days = Math.max(0, dateDiffDays(from, to));
      if (days <= 0) { toast("Проверьте даты: выезд должен быть позже заезда", "warn"); return; }
      const base = days * tariff.price;
      const total = base - (days > 7 ? Math.round(base * 0.1) : 0);
      const packed = BOARD_CHECK.filter((c) => ui.tCheck[c.id]).length;
      Store.update((s) => {
        Store.array("bookings").unshift({
          id: Store.uid("bk"), petId: pet.id, type: "boarding",
          service: tariff.name, place: hotel.name, price: total,
          date: from, dateTo: to, days, status: "подтверждена",
          check: BOARD_CHECK.filter((c) => ui.tCheck[c.id]).map((c) => c.name)
        });
      }, "bookings");
      toast("Забронировано: " + days + " " + fmt.plural(days, "сутки", "суток", "суток") + " · " + money(total) + (days > 7 ? " (скидка 10%)" : ""), "ok");
      toast("Собрано вещей: " + packed + " из " + BOARD_CHECK.length, packed === BOARD_CHECK.length ? "ok" : "warn");
    },

    /* ------------------------------------------------------------- умный дом */
    "services.devToggle": (ds) => {
      let nowOn = false;
      withDevice(ds.id, (d) => {
        d.on = !d.on;
        nowOn = d.on;
        d.lastAction = d.on ? "Включено вручную, " + hhmm() : "Отключено вручную";
      });
      toast(nowOn ? "Устройство включено" : "Устройство выключено", nowOn ? "ok" : "info");
    },
    "services.devFeed": (ds) => {
      const d = Store.array("devices").find((x) => x.id === ds.id);
      if (!d) return;
      const portionOptions = [30, 60, 90, 120].map((g) => ({ value: String(g), label: g + " г" }));
      modal({
        title: "Покормить сейчас", icon: "🍽",
        body: `
          <p class="small">${esc(d.name)} · ${esc(d.room || "")}. Текущее состояние: ${esc(d.state || "—")}.</p>
          ${field({ label: "Порция", type: "select", id: "sf-portion", options: portionOptions, value: "90" })}
          <p class="muted small">Кормушка выдаст корм сразу и запишет действие в журнал устройства. Норма ${esc(Store.pet().name)} — ${Store.portion(Store.pet()).grams} г в день.</p>`,
        actions: [
          { label: "Отмена" },
          {
            label: "Выдать корм", kind: "primary", onClick: (wrap) => {
              const el = wrap.querySelector("#sf-portion");
              const g = parseInt(el ? el.value : "90", 10) || 90;
              const pet = Store.pet();
              withDevice(ds.id, (dev) => {
                dev.on = true;
                dev.state = "Порция " + g + " г выдана";
                dev.lastAction = "Выдача корма в " + hhmm();
              });
              Store.push("meals", {
                id: Store.uid("me"), date: fmt.today(), time: hhmm(),
                food: "Умная кормушка", grams: g, note: "выдано кормушкой"
              }, pet.id);
              toast("Кормушка выдала " + g + " г корма", "ok");
              return true;
            }
          }
        ]
      });
    },
    "services.devCam": (ds) => {
      const d = Store.array("devices").find((x) => x.id === ds.id);
      if (!d) return;
      modal({
        title: d.name, icon: "📷", wide: true,
        body: `
          <div class="receipt center">
            <div style="font-size:2.8rem">📷</div>
            <div><b>Прямой эфир · 1080p · запись в облако</b></div>
            <div class="muted small mt-1">${esc(d.room || "комната")} · соединение стабильное · задержка 0,4 с</div>
            <div class="barcode mt-2"></div>
          </div>
          <div class="kv mt-2">
            <div class="kv-row"><span class="kv-k">Устройство</span><span class="kv-v">${esc(d.name)}</span></div>
            <div class="kv-row"><span class="kv-k">Состояние</span><span class="kv-v">${esc(d.state || "—")}</span></div>
            <div class="kv-row"><span class="kv-k">Последнее действие</span><span class="kv-v">${esc(d.lastAction || "—")}</span></div>
          </div>
          <p class="muted small">Трансляция демонстрационная: реального видео в офлайн-режиме нет, но все действия работают.</p>`,
        actions: [
          { label: "Закрыть" },
          {
            label: "📸 Сделать снимок", kind: "primary", keepOpen: true,
            onClick: () => {
              withDevice(ds.id, (dev) => { dev.lastAction = "Снимок сделан в " + hhmm(); });
              toast("Снимок сохранён в галерею (демо)", "ok");
              return false;
            }
          }
        ]
      });
    },
    "services.devFilter": (ds) => {
      withDevice(ds.id, (d) => {
        d.on = true;
        d.state = "Фильтр 100%, поток сильный";
        d.lastAction = "Фильтр промыт в " + hhmm();
      });
      toast("Фильтр фонтанчика промыт — вода свежая ⛲", "ok");
    },
    "services.devSync": (ds) => {
      const pet = Store.pet();
      let steps = 0;
      withDevice(ds.id, (d, s) => {
        steps = 6000 + Math.round(Math.random() * 4200);
        const minutes = 45 + Math.round(Math.random() * 45);
        if (!s.activity) s.activity = {};
        if (!s.activity[pet.id]) s.activity[pet.id] = [];
        const today = fmt.today();
        const existing = s.activity[pet.id].find((a) => a.date === today);
        if (existing) { existing.steps = steps; existing.minutes = minutes; }
        else s.activity[pet.id].push({ id: Store.uid("ac"), date: today, steps, minutes });
        d.on = true;
        d.state = "Батарея " + (60 + Math.round(Math.random() * 35)) + "%, шаги " + steps.toLocaleString("ru-RU");
        d.lastAction = "Синхронизация в " + hhmm();
      });
      toast("Синхронизировано: " + steps.toLocaleString("ru-RU") + " шагов за сегодня", "ok");
    },
    "services.devInfo": (ds) => {
      const d = Store.array("devices").find((x) => x.id === ds.id);
      if (!d) return;
      modal({
        title: d.name, icon: "📊",
        body: `<div class="kv">
            <div class="kv-row"><span class="kv-k">Тип</span><span class="kv-v">${esc((DEV_TYPES.find((t) => t.id === d.type) || {}).name || d.type)}</span></div>
            <div class="kv-row"><span class="kv-k">Комната</span><span class="kv-v">${esc(d.room || "—")}</span></div>
            <div class="kv-row"><span class="kv-k">Состояние</span><span class="kv-v">${esc(d.state || "—")}</span></div>
            <div class="kv-row"><span class="kv-k">Питание</span><span class="kv-v">${d.on ? "в сети" : "отключено"}</span></div>
          </div>
          <p class="muted small mt-2">Датчик помогает следить за микроклиматом: комфортно 18–24 °C и влажность 40–60%.</p>`
      });
    },
    "services.devAdd": () => {
      const typeOptions = DEV_TYPES.map((t) => ({ value: t.id, label: DEV_EMOJI[t.id] + " " + t.name }));
      modal({
        title: "Новое устройство", icon: "➕",
        body: `
          ${field({ label: "Название", type: "text", id: "sd-name", placeholder: "Например, Камера на кухне" })}
          <div class="grid grid-2">
            ${field({ label: "Тип", type: "select", id: "sd-type", options: typeOptions, value: "camera" })}
            ${field({ label: "Комната", type: "text", id: "sd-room", placeholder: "Кухня" })}
          </div>
          <p class="muted small">Устройство добавится включённым и сразу появится в сводке умного дома.</p>`,
        actions: [
          { label: "Отмена" },
          {
            label: "Добавить", kind: "primary", onClick: (wrap) => {
              const nameEl = wrap.querySelector("#sd-name");
              const typeEl = wrap.querySelector("#sd-type");
              const roomEl = wrap.querySelector("#sd-room");
              const name = (nameEl && nameEl.value.trim()) || "Новое устройство";
              const type = (typeEl && typeEl.value) || "camera";
              const room = (roomEl && roomEl.value.trim()) || "—";
              Store.update((s) => {
                Store.array("devices").push({
                  id: Store.uid("dev"), name, type, emoji: DEV_EMOJI[type] || "🔌",
                  on: true, room, state: "Новое устройство, ожидает настройки", lastAction: "Добавлено только что"
                });
              }, "devices");
              toast(name + " добавлено в умный дом", "ok");
              return true;
            }
          }
        ]
      });
    },
    "services.devDel": async (ds) => {
      const d = Store.array("devices").find((x) => x.id === ds.id);
      if (!d) return;
      const ok = await confirmDialog("Удалить устройство «" + d.name + "» из умного дома?", { ok: "Удалить", danger: true, icon: "🗑" });
      if (!ok) return;
      Store.update((s) => { s.devices = Store.array("devices").filter((x) => x.id !== ds.id); }, "devices");
      toast("Устройство удалено", "info");
    },

    /* ------------------------------------------------------ заказы и записи */
    "services.reorder": (ds) => {
      const order = Store.array("orders").find((o) => o.id === ds.id);
      if (!order) return;
      const items = order.items || [];
      if (!items.length) { toast("В заказе нет товаров", "warn"); return; }
      Store.update((s) => {
        const cart = Store.array("cart");
        items.forEach((i) => cart.push({ id: Store.uid("cart"), name: i.name, price: i.price, qty: i.qty || 1 }));
      }, "cart");
      toast(items.length + " " + fmt.plural(items.length, "товар", "товара", "товаров") + " снова в корзине", "ok");
    },
    "services.delOrder": (ds) => {
      const order = Store.array("orders").find((o) => o.id === ds.id);
      if (!order) return;
      if ((order.status || "").indexOf("отмен") >= 0) { toast("Заказ уже отменён", "info"); return; }
      Store.update((s) => {
        const o = Store.array("orders").find((x) => x.id === ds.id);
        if (o) o.status = "отменён";
      }, "orders");
      toast("Заказ отменён", "info");
    }
  });
})();
