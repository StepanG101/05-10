/* ============================================================================
 * PetLife — app/panel-health.js
 * Панель «Здоровье»: медицинская карта, дневник симптомов, ИИ-анализ фото,
 * напоминания о лекарствах, календарь вакцинации, запись к ветеринару,
 * отчёт для врача, экстренные контакты, база токсинов и первая помощь.
 * Функции ТЗ: 2, 8, 9, 10, 11, 12, 39, 40, 41, 42.
 * ==========================================================================*/
(function () {
  "use strict";

  const PL = window.PL;
  const { $, $$, esc, fmt, card, badge, progress, empty, field, table, list, bullets,
          Charts, toast, modal, confirmDialog, Actions } = PL;
  const D = window.PL_DATA;
  const Store = window.Store;
  const S = () => window.Store.state;   // состояние читаем только внутри render/обработчиков

  /* ---------------------------------------------------------------- справочники */
  const TABS = [
    ["medcard", "📋", "Медкарта"],
    ["symptoms", "📔", "Симптомы"],
    ["photo", "📷", "ИИ-анализ фото"],
    ["meds", "💊", "Лекарства"],
    ["vaccines", "💉", "Вакцинация"],
    ["vet", "🏥", "Запись к врачу"],
    ["report", "🖨", "Отчёт врачу"],
    ["contacts", "📞", "Экстренные контакты"],
    ["toxic", "☠️", "Токсичные продукты"],
    ["firstaid", "🚑", "Первая помощь"]
  ];

  const MED_TYPES = ["Осмотр", "Анализы", "Вакцинация", "Лечение", "Процедура", "Операция", "Другое"];
  const MED_ICONS = { "Осмотр": "🩺", "Анализы": "🧪", "Вакцинация": "💉", "Лечение": "💊", "Процедура": "🧼", "Операция": "🏥", "Другое": "📌" };

  const SYM_TYPES = ["Кожа", "Глаза", "Уши", "Зубы", "ЖКТ", "Дыхание", "Лапы", "Поведение", "Другое"];
  const SYM_ICONS = { "Кожа": "🩹", "Глаза": "👁", "Уши": "👂", "Зубы": "🦷", "ЖКТ": "🍽", "Дыхание": "🌬", "Лапы": "🐾", "Поведение": "🧠", "Другое": "📌" };
  const SEV_TEXT = ["", "почти незаметно", "слабо", "умеренно", "сильно", "очень сильно"];

  const CONTACT_TYPES = ["Круглосуточная ветклиника", "Наш ветеринар", "Кинолог", "Зоотакси", "Передержка", "Другое"];

  const SLOTS = ["09:00", "11:30", "14:00", "16:30", "18:00", "19:30"];
  const DOCTORS = ["Иванова А. П.", "Смирнов К. В.", "Кузнецова Е. С.", "Петров Д. М.", "Соколова Н. И.", "Орлов В. Г."];

  const PHOTO_TIPS = [
    ["🩹", "Кожа и шерсть", "Снимайте с 15–20 см при дневном свете, раздвиньте шерсть вокруг участка."],
    ["👁", "Глаза", "Снимок сбоку без вспышки: видно выделения, покраснение, помутнение."],
    ["👂", "Уши", "Отогните ухо и снимите внутреннюю поверхность — это ключевое фото при отите."],
    ["🦷", "Зубы и дёсны", "Приподнимите губу: налёт, камни, цвет дёсен и запах."],
    ["🐾", "Лапы и когти", "Подушечки, межпальцевое пространство, длина когтей."],
    ["🧴", "Проплешины", "Снимите всю зону залысин, чтобы ИИ оценил площадь."]
  ];

  /* ---------------------------------------------------------------- локальное состояние UI */
  const ui = {
    medType: "all",
    medQuery: "",
    symType: "all",
    photo: { file: null, url: "", name: "", size: 0, text: "", source: "", busy: false, err: "" },
    toxDanger: "all",
    toxFor: "all",
    toxQuery: "",
    faQuery: "",
    faOpen: null,
    vetClinic: null,
    vetSlot: null,
    vetReason: ""
  };

  /* ---------------------------------------------------------------- утилиты */
  function val(sel) {
    const node = $(sel);
    return node && node.value != null ? String(node.value).trim() : "";
  }

  function focusIt(sel) {
    const node = $(sel);
    if (node) { node.focus(); if (node.select) node.select(); }
  }

  function hash(str) {
    let h = 2166136261;
    const s = String(str == null ? "" : str);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function rnd(seed) { return (hash(seed) % 10000) / 10000; }

  function addDays(isoDate, days) {
    const d = isoDate ? new Date(isoDate) : new Date();
    const base = isNaN(d) ? new Date() : d;
    base.setDate(base.getDate() + days);
    return base.toISOString().slice(0, 10);
  }

  function isoOf(date) { return new Date(date).toISOString().slice(0, 10); }

  function byDateDesc(a, b) { return String(b.date || "").localeCompare(String(a.date || "")); }
  function byDateAsc(a, b) { return String(a.date || "").localeCompare(String(b.date || "")); }

  function withinDays(iso, days) {
    const v = Store.daysUntil(iso);
    return v != null && v <= 0 && v >= -Math.abs(days);
  }

  function daysAgo(iso) {
    const v = Store.daysUntil(iso);
    return v == null ? null : Math.max(0, -v);
  }

  function sevKind(n) { return n >= 4 ? "danger" : n === 3 ? "warn" : "ok"; }
  function sevText(n) { return SEV_TEXT[Math.max(0, Math.min(5, Math.round(+n || 0)))] || ""; }

  function dangerLabel(v) { return v === "high" ? "высокая опасность" : v === "medium" ? "средняя опасность" : "низкая опасность"; }
  function dangerKind(v) { return v === "high" ? "danger" : v === "medium" ? "warn" : "ok"; }
  function forLabel(v) { return v === "dog" ? "собаки" : v === "cat" ? "кошки" : "оба вида"; }

  function phoneHref(phone) {
    const digits = String(phone || "").replace(/[^\d+]/g, "");
    return digits ? "tel:" + digits : "";
  }

  function placeDistance(place) {
    const dx = (+place.x || 50) - 50;
    const dy = (+place.y || 50) - 50;
    return Math.sqrt(dx * dx + dy * dy) / 10; // 10 единиц карты ≈ 1 км
  }

  function clinicByName(name) {
    return (D.places || []).find((p) => p.name === name) || null;
  }

  function nextDays(med) {
    const d = Store.daysUntil(isoOf(Store.nextDose(med)));
    return d == null ? 0 : d;
  }

  function kpiTile(icon, value, label, hint, kind) {
    return `<div class="kpi ${kind || ""}">
      <div class="k-ico">${icon}</div>
      <div>
        <div class="k-value">${value}</div>
        <div class="k-label">${esc(label)}</div>
        ${hint ? `<div class="tiny muted">${hint}</div>` : ""}
      </div>
    </div>`;
  }

  function emergencyContact() {
    const contacts = Store.array("contacts");
    return contacts.find((c) => /клиник|ветеринар|вет/i.test(String(c.type || "") + " " + String(c.name || ""))) || contacts[0] || null;
  }

  /* ============================================================================
   * KPI-строка здоровья (общая для всех подразделов)
   * ==========================================================================*/
  function kpiRow(pet) {
    const medical = Store.bucket("medical", pet.id);
    const symptoms = Store.bucket("symptoms", pet.id);
    const meds = Store.bucket("meds", pet.id);
    const vacs = Store.bucket("vaccinations", pet.id);

    const idx = Store.index(pet);
    const weak = idx.details.slice().sort((a, b) => a.value - b.value)[0];
    const recent = symptoms.filter((s) => withinDays(s.date, 14));
    const avgSev = recent.length ? recent.reduce((a, x) => a + (+x.severity || 0), 0) / recent.length : 0;
    const alarm = recent.some((s) => (+s.severity || 0) >= 4);
    const last = medical.slice().sort(byDateDesc)[0];
    const lateMeds = meds.filter((m) => nextDays(m) < 0).length;
    const overVac = vacs.filter((v) => v.next && Store.daysUntil(v.next) < 0).length;
    const attention = lateMeds + overVac;

    return `<div class="kpi-row mb-3">
      ${kpiTile("💚", String(idx.score), "PetLife Index", weak ? "Слабое место: " + esc(weak.label) : "", idx.score >= 80 ? "green" : idx.score < 60 ? "orange" : "")}
      ${kpiTile("📋", String(medical.length), "Записей в медкарте", last ? "Последний визит: " + esc(fmt.short(last.date)) : "Записей пока нет", "blue")}
      ${kpiTile("🌡", String(recent.length), "Симптомы за 14 дней", recent.length ? "Средняя серьёзность " + fmt.num(avgSev, 1) + "/5" : "Жалоб нет", alarm ? "orange" : "")}
      ${kpiTile("⏰", String(attention), "Требуют внимания", "Лекарства: " + lateMeds + " · Прививки: " + overVac, attention ? "orange" : "green")}
    </div>`;
  }

  function pageHead(pet, tab) {
    const chips = TABS.map(([id, icon, label]) =>
      `<button class="tag ${id === tab ? "active" : ""}" data-act="hub.open" data-panel="health" data-tab="${id}">${icon} ${esc(label)}</button>`).join("");
    return `<div class="panel-head">
        <div>
          <h2>🩺 Здоровье — ${esc(pet.name)}</h2>
          <p>Медкарта, дневник симптомов, ИИ-анализ фото, лекарства, вакцинация, запись к врачу и первая помощь.</p>
        </div>
        <div class="panel-tools">
          <button class="btn btn-soft btn-sm" data-act="hub.open" data-panel="health" data-tab="report">🖨 Отчёт врачу</button>
          <button class="btn btn-primary btn-sm" data-act="hub.open" data-panel="health" data-tab="vet">🏥 Записаться</button>
        </div>
      </div>
      <div class="chip-row mb-3">${chips}</div>`;
  }

  /* ============================================================================
   * 1. Медкарта (функция 2)
   * ==========================================================================*/
  function filterMedical(records) {
    const q = ui.medQuery.trim().toLowerCase();
    return records.slice().sort(byDateDesc).filter((r) => {
      if (ui.medType !== "all" && String(r.type || "Другое") !== ui.medType) return false;
      if (!q) return true;
      return [r.title, r.vet, r.notes, r.type].join(" ").toLowerCase().includes(q);
    });
  }

  function medFiltersHtml() {
    const items = [["all", "🗂 Все"]].concat(MED_TYPES.map((t) => [t, MED_ICONS[t] + " " + t]));
    return items.map(([id, label]) =>
      `<button class="tag ${ui.medType === id ? "active" : ""}" data-act="health.medFilter" data-type="${esc(id)}">${esc(label)}</button>`).join("");
  }

  function medTimelineHtml(records) {
    const rows = filterMedical(records);
    if (!rows.length) {
      return empty("📋", records.length ? "Ничего не найдено" : "Медкарта пуста",
        records.length ? "Сбросьте фильтр по типу или измените поисковый запрос."
          : "Добавьте первую запись — она сразу попадёт в отчёт для ветеринара.",
        records.length
          ? `<button class="btn btn-soft btn-sm" data-act="health.medResetFilter">Сбросить фильтр</button>`
          : `<button class="btn btn-primary btn-sm" data-act="health.focus" data-target="healthMedForm">➕ Добавить запись</button>`);
    }
    return `<div class="timeline">${rows.map((r, i) => `
      <div class="tl-item">
        <div class="tl-rail">
          <div class="tl-dot">${MED_ICONS[r.type] || "📌"}</div>
          ${i < rows.length - 1 ? '<div class="tl-line"></div>' : ""}
        </div>
        <div class="tl-body">
          <div class="tl-time">${esc(fmt.date(r.date))} · ${badge(r.type || "Другое", "info")} · ${esc(fmt.ago(r.date))}</div>
          <div class="tl-title">${esc(r.title || "Без названия")}</div>
          ${r.vet ? `<div class="small muted">👩‍⚕️ ${esc(r.vet)}</div>` : ""}
          ${r.notes ? `<div class="small muted">📝 ${esc(r.notes)}</div>` : ""}
          <div class="mt-1">
            <button class="btn btn-xs btn-ghost" data-act="health.medDel" data-id="${esc(r.id)}">🗑 Удалить</button>
          </div>
        </div>
      </div>`).join("")}</div>`;
  }

  function sectionMedcard(pet) {
    const medical = Store.bucket("medical", pet.id);
    const sorted = medical.slice().sort(byDateDesc);
    const last = sorted[0];
    const lastExam = sorted.find((r) => String(r.type) === "Осмотр") || null;
    const sinceExam = lastExam ? daysAgo(lastExam.date) : null;
    const vets = medical.map((r) => r.vet).filter(Boolean);
    const uniqVets = vets.filter((v, i) => vets.indexOf(v) === i).length;

    const localKpi = `<div class="kpi-row mb-3">
      ${kpiTile("📋", String(medical.length), "Всего записей", "Осмотры, анализы, лечение", "blue")}
      ${kpiTile("🗓", last ? esc(fmt.short(last.date)) : "—", "Последний визит", last ? esc(fmt.ago(last.date)) : "визитов не было", "")}
      ${kpiTile("🩺", sinceExam == null ? "—" : String(sinceExam), "Дней с последнего осмотра", lastExam ? "Тип «Осмотр»" : "Осмотров в карте нет", sinceExam != null && sinceExam > 365 ? "orange" : "green")}
      ${kpiTile("👩‍⚕️", String(uniqVets), "Врачей и клиник", "Ведёт историю питомца", "")}
    </div>`;

    const form = card({
      title: "Новая запись", icon: "➕",
      body: `<div id="healthMedForm" class="panel-grid cols-2">
        ${field({ id: "healthMedDate", label: "Дата", type: "date", value: fmt.today() })}
        ${field({ id: "healthMedType", label: "Тип записи", type: "select", value: "Осмотр", options: MED_TYPES.map((t) => ({ value: t, label: t })) })}
        ${field({ id: "healthMedTitle", label: "Что было", placeholder: "Например: контрольный осмотр уха" })}
        ${field({ id: "healthMedVet", label: "Ветеринар или клиника", placeholder: "Клиника «Айболит»" })}
        <div class="span-2">${field({ id: "healthMedNotes", label: "Заметки и назначения", type: "textarea", rows: 2, placeholder: "Назначения, дозировки, что перепроверить" })}</div>
      </div>`,
      foot: `<button class="btn btn-primary" data-act="health.medAdd">💾 Добавить запись</button>
             <button class="btn btn-ghost" data-act="health.medExport">⬇️ Экспорт medcard.json</button>
             <button class="btn btn-ghost" data-act="hub.open" data-panel="health" data-tab="report">🖨 К отчёту</button>`
    });

    const timeline = card({
      title: "История здоровья", icon: "📋",
      tools: `<span class="muted small">${medical.length} ${esc(fmt.plural(medical.length, "запись", "записи", "записей"))}</span>`,
      body: `<div class="field"><span class="field-label">Поиск по карте</span>
          <input class="input" type="text" id="healthMedSearch" value="${esc(ui.medQuery)}"
            placeholder="Название, ветеринар, назначение…" autocomplete="off"
            data-hsearch="medQuery" data-hrepaint="medList"></div>
        <div class="chip-row mb-2" id="healthMedFilters">${medFiltersHtml()}</div>
        <div id="healthMedList">${medTimelineHtml(medical)}</div>`
    });

    return localKpi + `<div class="stack">${form}${timeline}</div>`;
  }

  /* ============================================================================
   * 2. Дневник симптомов (функция 9)
   * ==========================================================================*/
  function symTimelineHtml(records) {
    const rows = records.slice().sort(byDateDesc);
    if (!rows.length) {
      return empty("📔", "Дневник пуст", "Отмечайте симптомы и их серьёзность — график и советы появятся автоматически.",
        `<button class="btn btn-primary btn-sm" data-act="health.focus" data-target="healthSymForm">➕ Добавить запись</button>`);
    }
    const shown = rows.filter((r) => ui.symType === "all" || String(r.type || "Другое") === ui.symType);
    if (!shown.length) return empty("🔍", "Нет записей этой категории", "Выберите другую категорию или «Все».",
      `<button class="btn btn-soft btn-sm" data-act="health.symFilter" data-type="all">Показать все</button>`);
    return `<div class="timeline">${shown.map((s, i) => {
      const sev = +s.severity || 0;
      return `<div class="tl-item">
        <div class="tl-rail">
          <div class="tl-dot">${SYM_ICONS[s.type] || "📌"}</div>
          ${i < shown.length - 1 ? '<div class="tl-line"></div>' : ""}
        </div>
        <div class="tl-body">
          <div class="tl-time">${esc(fmt.date(s.date))} · ${esc(fmt.ago(s.date))}</div>
          <div class="tl-title">${esc(s.type || "Другое")} ${badge(sev + "/5 · " + sevText(sev), sevKind(sev))}</div>
          ${s.note ? `<div class="small muted">${esc(s.note)}</div>` : ""}
          <div class="mt-1"><button class="btn btn-xs btn-ghost" data-act="health.symDel" data-id="${esc(s.id)}">🗑 Удалить</button></div>
        </div>
      </div>`;
    }).join("")}</div>`;
  }

  function symChartHtml(records) {
    const rows = records.slice().sort(byDateAsc);
    const data = rows.map((s) => ({ label: s.date, value: +s.severity || 0 }));
    return `<div class="card"><header class="card-head"><h3>📈 Динамика серьёзности</h3>
        <span class="muted small">${rows.length} ${esc(fmt.plural(rows.length, "точка", "точки", "точек"))}</span></header>
      <div class="card-body">${Charts.line(data, { color: "#FB8C00", unit: "/5", min: 0, max: 5, target: 3, height: 170 })}</div></div>`;
  }

  function sectionSymptoms(pet) {
    const records = Store.bucket("symptoms", pet.id);
    const recent = records.filter((s) => withinDays(s.date, 14));
    const avg = recent.length ? recent.reduce((a, x) => a + (+x.severity || 0), 0) / recent.length : 0;
    const last3 = records.slice().sort(byDateDesc).slice(0, 3);
    const alarm = last3.some((s) => (+s.severity || 0) >= 4);

    const advice = alarm
      ? `<div class="danger-box">🚨 В последних записях серьёзность 4–5 баллов. Это повод <b>обратиться к ветеринару</b> в ближайшие часы: опишите симптомы, приложите фото и не ждите ухудшения.
          <div class="row mt-2">
            <button class="btn btn-danger btn-sm" data-act="hub.open" data-panel="health" data-tab="contacts">📞 Экстренные контакты</button>
            <button class="btn btn-soft btn-sm" data-act="hub.open" data-panel="health" data-tab="vet">🏥 Записаться</button>
            <button class="btn btn-ghost btn-sm" data-act="hub.open" data-panel="ai">🤖 Спросить ИИ</button>
          </div></div>`
      : recent.length
        ? `<div class="hint-box">🙂 Средняя серьёзность за 14 дней — <b>${fmt.num(avg, 1)}/5</b>. Это умеренный уровень: наблюдайте, продолжайте записи. Если показатель растёт три дня подряд — покажитесь врачу.
            <div class="mt-2"><button class="btn btn-soft btn-sm" data-act="hub.open" data-panel="ai">🤖 Обсудить с ИИ</button></div></div>`
        : `<div class="ok-box">✅ За последние 14 дней жалоб не отмечено. Продолжайте вести дневник — так ИИ заметит проблему раньше.</div>`;

    const form = card({
      title: "Новая запись", icon: "➕",
      body: `<div id="healthSymForm" class="panel-grid cols-2">
        ${field({ id: "healthSymDate", label: "Дата", type: "date", value: fmt.today() })}
        ${field({ id: "healthSymType", label: "Категория", type: "select", value: "Кожа", options: SYM_TYPES.map((t) => ({ value: t, label: t })) })}
        ${field({ id: "healthSymSev", label: "Серьёзность", type: "select", value: "2", options: [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: n + " — " + SEV_TEXT[n] })) })}
        ${field({ id: "healthSymWhere", label: "Где заметили", placeholder: "Например: основание хвоста", hint: "Необязательно" })}
        <div class="span-2">${field({ id: "healthSymNote", label: "Что происходит", type: "textarea", rows: 2, placeholder: "Опишите поведение, кожу, выделения, аппетит" })}</div>
      </div>`,
      foot: `<button class="btn btn-primary" data-act="health.symAdd">💾 Добавить в дневник</button>
             <button class="btn btn-ghost" data-act="hub.open" data-panel="health" data-tab="photo">📷 Проверить по фото</button>`
    });

    const filters = `<div class="chip-row mb-2">
      ${[["all", "🗂 Все"]].concat(SYM_TYPES.map((t) => [t, SYM_ICONS[t] + " " + t])).map(([id, label]) =>
        `<button class="tag ${ui.symType === id ? "active" : ""}" data-act="health.symFilter" data-type="${esc(id)}">${esc(label)}</button>`).join("")}
    </div>`;

    const listCard = card({
      title: "Записи дневника", icon: "📔",
      tools: `<span class="muted small">${records.length} ${esc(fmt.plural(records.length, "запись", "записи", "записей"))}</span>`,
      body: `${filters}<div id="healthSymList">${symTimelineHtml(records)}</div>`
    });

    const kpi = `<div class="kpi-row mb-3">
      ${kpiTile("🌡", String(recent.length), "Записей за 14 дней", recent.length ? "Наблюдение активно" : "Жалоб нет", recent.length ? "blue" : "green")}
      ${kpiTile("📊", recent.length ? fmt.num(avg, 1) + "/5" : "—", "Средняя серьёзность", "За последние 14 дней", avg >= 3 ? "orange" : "green")}
      ${kpiTile("🚨", String(records.filter((s) => (+s.severity || 0) >= 4).length), "Записей 4–5 баллов", "Требуют внимания врача", records.some((s) => (+s.severity || 0) >= 4) ? "orange" : "")}
      ${kpiTile("🗓", records.length ? esc(fmt.short(records.slice().sort(byDateDesc)[0].date)) : "—", "Последняя запись", records.length ? esc(fmt.ago(records[0].date)) : "Дневник пуст", "")}
    </div>`;

    return kpi + `<div class="stack">${advice}${form}${listCard}${symChartHtml(records)}</div>`;
  }

  /* ============================================================================
   * 3. ИИ-анализ фото (функция 8)
   * ==========================================================================*/
  function photoError(file) {
    if (!file) return "Загрузите изображение";
    const type = String(file.type || "");
    const name = String(file.name || "").toLowerCase();
    if (!/^image\//.test(type) && !/\.(png|jpe?g|webp|gif|bmp|heic|heif|avif)$/.test(name)) return "Загрузите изображение";
    if (file.size > 5 * 1024 * 1024) return "Файл слишком большой (макс. 5 МБ)";
    return "";
  }

  function photoBoxHtml() {
    const p = ui.photo;
    if (p.busy) {
      return `<div class="loading-box"><span class="spinner dark lg"></span> Анализируем фото... обычно это занимает 3–10 секунд.</div>`;
    }
    if (p.text) {
      const srcBadge = p.source === "openrouter" ? badge("vision-модель OpenRouter", "violet") : badge("локальный демо-анализ", "muted");
      return `<section class="card">
        <header class="card-head"><h3>🩺 Результат анализа</h3>${srcBadge}</header>
        <div class="card-body">
          <div class="ai-answer" id="healthPhotoText">${esc(p.text)}</div>
          <div class="warn-note">⚠️ Это не заменяет консультацию ветеринара. При боли, отказе от еды, температуре или ухудшении состояния — обратитесь в клинику.</div>
          ${p.url ? `<img class="photo-preview mt-2" src="${esc(p.url)}" alt="Загруженное фото">` : ""}
        </div>
        <footer class="card-foot">
          <button class="btn btn-primary btn-sm" data-act="health.photoSave">📔 Сохранить в дневник симптомов</button>
          <button class="btn btn-soft btn-sm" data-act="hub.open" data-panel="ai">🤖 Спросить ИИ</button>
          <button class="btn btn-ghost btn-sm" data-act="health.photoReset">🔄 Другое фото</button>
        </footer>
      </section>`;
    }
    if (p.err) {
      return `<div class="danger-box">⛔ ${esc(p.err)}</div>
        <div class="row mt-2">
          ${p.file ? `<button class="btn btn-primary btn-sm" data-act="health.photoAnalyze">🔁 Попробовать снова</button>` : ""}
          <button class="btn btn-ghost btn-sm" data-act="health.photoReset">🖼 Выбрать фото</button>
        </div>`;
    }
    if (p.file) {
      return `<div class="row-between">
          <div class="small muted">📎 ${esc(p.name || "фото")} · ${fmt.num((p.size || 0) / 1048576, 2)} МБ</div>
          <button class="btn btn-ghost btn-xs" data-act="health.photoReset">Заменить</button>
        </div>
        <img class="photo-preview mt-2" src="${esc(p.url)}" alt="Загруженное фото">
        <div class="row mt-2">
          <button class="btn btn-primary" data-act="health.photoAnalyze">🤖 Анализировать</button>
          <span class="muted small">ИИ опишет возможные причины и подскажет, к какому врачу идти</span>
        </div>`;
    }
    return `<button type="button" class="drop-zone" data-act="health.photoPick" style="width:100%">
        <span class="dz-ico">📷</span>
        <b>Перетащите фото сюда</b>
        <div class="muted small mt-1">или нажмите, чтобы выбрать файл · PNG, JPG, WEBP до 5 МБ</div>
      </button>`;
  }

  function paintPhoto() {
    const host = $("#healthPhotoBox");
    if (host) host.innerHTML = photoBoxHtml();
  }

  function sectionPhoto(pet) {
    const upload = card({
      title: "ИИ-анализ фото симптомов", icon: "📷",
      body: `<p class="muted small">Загрузите фото проблемного участка — ИИ опишет возможные причины и подскажет, к какому врачу идти. Фото не покидает ваш браузер без вашего действия.</p>
        <input type="file" id="healthPhotoInput" accept="image/*" class="hidden">
        <div id="healthPhotoBox" class="mt-2">${photoBoxHtml()}</div>`
    });

    const tips = card({
      title: "Что сфотографировать", icon: "✅",
      body: list(PHOTO_TIPS.map(([ico, title, hint]) => `<span>${ico} <b>${esc(title)}</b> — ${esc(hint)}</span>`), "tick")
        + `<div class="hint-box mt-2">Чем больше света и резче кадр, тем точнее анализ. Не используйте вспышку в упор и не смазывайте участок.</div>`
    });

    const how = card({
      title: "Как это работает", icon: "🤖",
      body: `<div class="kv">
          <div class="kv-row"><span class="kv-k">1. Загрузка</span><span class="kv-v">фото из галереи или камеры</span></div>
          <div class="kv-row"><span class="kv-k">2. Анализ</span><span class="kv-v">vision-модель OpenRouter или локальный демо-анализ</span></div>
          <div class="kv-row"><span class="kv-k">3. Результат</span><span class="kv-v">описание + что делать дальше</span></div>
          <div class="kv-row"><span class="kv-k">4. Дневник</span><span class="kv-v">сохранение записи в симптомы</span></div>
        </div>
        <div class="warn-note">⚠️ Результат ИИ — подсказка, а не диагноз. Диагноз ставит ветеринар после осмотра.</div>`
    });

    return `<div class="panel-grid cols-2">
      <div class="span-2">${upload}</div>
      ${tips}
      ${how}
      <div class="span-2">${kpiRow(pet)}</div>
    </div>`;
  }

  function bindPhoto(view) {
    const input = $("#healthPhotoInput", view);
    if (input) {
      input.addEventListener("change", () => {
        if (input.files && input.files[0]) setPhotoFile(input.files[0]);
      });
    }
    const box = $("#healthPhotoBox", view);
    if (!box) return;
    const zone = () => $("#healthPhotoBox .drop-zone", view) || box;
    ["dragenter", "dragover"].forEach((name) => box.addEventListener(name, (e) => {
      e.preventDefault();
      zone().classList.add("drag");
    }));
    ["dragleave", "dragend"].forEach((name) => box.addEventListener(name, () => zone().classList.remove("drag")));
    box.addEventListener("drop", (e) => {
      e.preventDefault();
      zone().classList.remove("drag");
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files[0]) setPhotoFile(files[0]);
    });
  }

  function setPhotoFile(file) {
    const err = photoError(file);
    if (err) { toast(err, "error"); return; }
    if (ui.photo.url) { try { URL.revokeObjectURL(ui.photo.url); } catch (e) { /* пусто */ } }
    ui.photo = { file: file, url: URL.createObjectURL(file), name: file.name, size: file.size, text: "", source: "", busy: false, err: "" };
    paintPhoto();
    toast("Фото загружено — можно анализировать", "ok");
  }

  function resetPhoto() {
    if (ui.photo.url) { try { URL.revokeObjectURL(ui.photo.url); } catch (e) { /* пусто */ } }
    ui.photo = { file: null, url: "", name: "", size: 0, text: "", source: "", busy: false, err: "" };
    const input = $("#healthPhotoInput");
    if (input) input.value = "";
    paintPhoto();
  }

  async function analyzePhoto() {
    if (!ui.photo.file) { toast("Сначала выберите фото", "warn"); return; }
    ui.photo.busy = true;
    ui.photo.err = "";
    ui.photo.text = "";
    paintPhoto();
    try {
      if (!window.AI || typeof window.AI.analyzeFile !== "function") {
        throw new Error("Модуль ИИ-анализа не подключён. Обновите страницу и попробуйте снова.");
      }
      const res = await window.AI.analyzeFile(ui.photo.file);
      const text = res && res.text ? String(res.text) : "Анализ завершён, но модель не вернула описание. Попробуйте другое фото.";
      ui.photo.text = text;
      ui.photo.source = res && res.source ? String(res.source) : "local";
      ui.photo.busy = false;
      paintPhoto();
      const node = $("#healthPhotoText");
      if (node && PL.typewriter) PL.typewriter(node, text);
      toast("Анализ готов", "ai");
    } catch (err) {
      ui.photo.busy = false;
      ui.photo.err = (err && err.message) ? String(err.message) : "Не удалось проанализировать фото. Попробуйте позже.";
      paintPhoto();
      toast(ui.photo.err, "error");
    }
  }

  /* ============================================================================
   * 4. Лекарства (функция 10)
   * ==========================================================================*/
  function medCardHtml(med) {
    const d = nextDays(med);
    const cls = d < 0 ? "late" : d <= 1 ? "due" : "";
    const nextIso = isoOf(Store.nextDose(med));
    const status = d < 0 ? "Просрочено на " + fmt.days(Math.abs(d))
      : d === 0 ? "Нужно дать сегодня"
        : d === 1 ? "Нужно дать завтра"
          : "Через " + fmt.days(d);
    const statusBadge = d < 0 ? badge("просрочено", "danger") : d <= 1 ? badge("пора", "warn") : badge("в графике", "ok");
    return `<div class="med-card ${cls}">
      <div class="med-ico">${d < 0 ? "⏰" : "💊"}</div>
      <div class="med-main">
        <div class="med-name">${esc(med.name)} ${statusBadge}</div>
        <div class="med-sub">${esc(med.dose || "доза не указана")} · каждые ${esc(fmt.days(med.every || 1))} · последний приём ${esc(fmt.short(med.last))}</div>
        <div class="med-sub">Следующий приём: <b>${esc(fmt.short(nextIso))}</b> · ${esc(status)}</div>
        ${med.note ? `<div class="tiny muted">📝 ${esc(med.note)}</div>` : ""}
      </div>
      <div class="row" style="gap:6px">
        <button class="btn btn-green btn-sm" data-act="health.medGive" data-id="${esc(med.id)}">✅ Дать сейчас</button>
        <button class="btn btn-ghost btn-sm" data-act="health.medRemove" data-id="${esc(med.id)}">🗑</button>
      </div>
    </div>`;
  }

  function sectionMeds(pet) {
    const meds = Store.bucket("meds", pet.id).slice().sort((a, b) => nextDays(a) - nextDays(b));
    const dueNow = meds.filter((m) => nextDays(m) <= 0);
    const taken = meds.filter((m) => nextDays(m) >= 0).length;
    const late = meds.filter((m) => nextDays(m) < 0).length;
    const pct = meds.length ? Math.round((taken / meds.length) * 100) : 100;

    const today = card({
      title: "Сегодня нужно дать", icon: "⏰",
      body: dueNow.length
        ? `<div class="stack" style="gap:10px">${dueNow.map(medCardHtml).join("")}</div>`
        : `<div class="ok-box">🎉 Всё выдано по графику. Просроченных препаратов нет.
            <div class="mt-2"><button class="btn btn-soft btn-sm" data-act="health.focus" data-target="healthMedsForm">➕ Добавить лекарство</button></div>
          </div>`
    });

    const all = card({
      title: meds.length ? "Все препараты" : "Препараты", icon: "💊",
      tools: `<span class="muted small">Принято по графику: ${taken} из ${meds.length}</span>`,
      body: meds.length
        ? `${progress(pct, pct >= 80 ? "green" : pct >= 50 ? "orange" : "red")}
          <div class="row-between mt-1">
            <span class="small muted">Принято по графику ${taken} из ${meds.length}</span>
            <span class="small muted">${late ? "⚠️ просрочено: " + late : "✅ просрочек нет"}</span>
          </div>
          <div class="stack mt-2" style="gap:10px">${meds.map(medCardHtml).join("")}</div>`
        : empty("💊", "Лекарств нет", "Добавьте препарат — PetLife посчитает дату следующего приёма и напомнит о нём.",
          `<button class="btn btn-primary btn-sm" data-act="health.focus" data-target="healthMedsForm">➕ Добавить лекарство</button>`)
    });

    const form = card({
      title: "Добавить лекарство", icon: "➕",
      body: `<div id="healthMedsForm" class="panel-grid cols-2">
        ${field({ id: "healthMedName", label: "Название", placeholder: "Например: Бравекто (от клещей)" })}
        ${field({ id: "healthMedDose", label: "Доза", placeholder: "1 таблетка 500 мг" })}
        ${field({ id: "healthMedEvery", label: "Периодичность, дней", type: "number", value: "1", hint: "1 — каждый день, 30 — раз в месяц, 84 — раз в квартал" })}
        ${field({ id: "healthMedLast", label: "Последний приём", type: "date", value: fmt.today() })}
        <div class="span-2">${field({ id: "healthMedNote", label: "Заметка", type: "text", placeholder: "Давать с едой, курс 3 месяца" })}</div>
      </div>`,
      foot: `<button class="btn btn-primary" data-act="health.medAddItem">💾 Добавить препарат</button>
             <button class="btn btn-ghost" data-act="hub.open" data-panel="health" data-tab="medcard">📋 Показать в медкарте</button>`
    });

    return `<div class="stack">${today}${all}${form}</div>`;
  }

  /* ============================================================================
   * 5. Календарь вакцинации (функция 11)
   * ==========================================================================*/
  function vacStatus(v) {
    const d = v.next ? Store.daysUntil(v.next) : null;
    if (d == null) return { kind: "muted", label: "нет даты", days: null };
    if (d < 0) return { kind: "danger", label: "просрочена на " + fmt.days(Math.abs(d)), days: d };
    if (d <= 60) return { kind: "warn", label: "действует ещё " + fmt.days(d), days: d };
    return { kind: "ok", label: "защита активна, до " + fmt.date(v.next), days: d };
  }

  function sectionVaccines(pet) {
    const schedule = (D.vaccineSchedule && D.vaccineSchedule[pet.species]) || [];
    const vacs = Store.bucket("vaccinations", pet.id).slice().sort(byDateAsc);
    const overdue = vacs.filter((v) => vacStatus(v).days != null && vacStatus(v).days < 0);
    const soon = vacs.filter((v) => { const d = vacStatus(v).days; return d != null && d >= 0 && d <= 60; });
    const ok = vacs.filter((v) => { const d = vacStatus(v).days; return d != null && d > 60; });
    const protection = vacs.length ? Math.round(((ok.length + soon.length * 0.6) / vacs.length) * 100) : 0;
    const fatal = vacs.filter((v) => v.fatal);

    const scheduleCard = card({
      title: "Рекомендованный календарь", icon: "🗓",
      tools: `<span class="muted small">${esc(pet.species === "cat" ? "для кошек" : "для собак")}</span>`,
      body: schedule.length ? `<div class="stack" style="gap:10px">${schedule.map((v) => `
          <div class="med-card ${v.fatal ? "due" : ""}">
            <div class="med-ico">💉</div>
            <div class="med-main">
              <div class="med-name">${esc(v.name)} ${v.fatal ? badge("критичная", "danger") : badge("по показаниям", "muted")}</div>
              <div class="med-sub">Возраст: ${esc(v.age)} · повтор: ${esc(v.repeat)}</div>
              ${v.fatal ? `<div class="tiny muted">⚠️ Без этой прививки риск смертельных инфекций — не пропускайте ревакцинацию.</div>` : ""}
            </div>
            <button class="btn btn-soft btn-sm" data-act="health.vacScheduleAdd" data-name="${esc(v.name)}" data-fatal="${v.fatal ? "1" : "0"}">➕ В календарь</button>
          </div>`).join("")}</div>`
        : empty("🗓", "Календарь недоступен", "Для этого вида питомца нет рекомендованного графика — добавьте прививки вручную.")
    });

    const myCard = card({
      title: "Мои прививки", icon: "💉",
      tools: `<span class="muted small">${vacs.length} ${esc(fmt.plural(vacs.length, "прививка", "прививки", "прививок"))}</span>`,
      body: `<div class="row-between mb-1">
          <span class="small muted">Защита питомца</span>
          <span class="small muted">${protection}%</span>
        </div>
        ${progress(protection, protection >= 80 ? "green" : protection >= 50 ? "orange" : "red")}
        <div class="row mt-2" style="gap:8px">
          ${badge("активны: " + ok.length, "ok")} ${badge("скоро: " + soon.length, "warn")} ${badge("просрочено: " + overdue.length, "danger")}
        </div>
        <div class="stack mt-2" style="gap:10px">${vacs.length ? vacs.map((v) => {
          const st = vacStatus(v);
          return `<div class="med-card ${st.kind === "danger" ? "late" : st.kind === "warn" ? "due" : ""}">
            <div class="med-ico">${st.kind === "danger" ? "🚨" : "💉"}</div>
            <div class="med-main">
              <div class="med-name">${esc(v.name)} ${badge(st.kind === "danger" ? "просрочена" : st.kind === "warn" ? "скоро" : "ок", st.kind)} ${v.fatal ? badge("критичная", "danger") : ""}</div>
              <div class="med-sub">Сделана: ${esc(fmt.date(v.date))} · действует до: ${esc(v.next ? fmt.date(v.next) : "—")}</div>
              <div class="med-sub">${esc(st.label)}</div>
            </div>
            <button class="btn btn-ghost btn-sm" data-act="health.vacDel" data-id="${esc(v.id)}">🗑</button>
          </div>`;
        }).join("")
          : empty("💉", "Прививок пока нет", "Добавьте прививку из рекомендованного календаря или впишите свою.",
            `<button class="btn btn-primary btn-sm" data-act="health.focus" data-target="healthVacForm">➕ Добавить прививку</button>`)}</div>`
    });

    const form = card({
      title: "Своя прививка", icon: "➕",
      body: `<div id="healthVacForm" class="panel-grid cols-2">
        ${field({ id: "healthVacName", label: "Название", placeholder: "Например: Бешенство" })}
        ${field({ id: "healthVacDate", label: "Дата вакцинации", type: "date", value: fmt.today() })}
        ${field({ id: "healthVacNext", label: "Действует до", type: "date", value: addDays(null, 365), hint: "Обычно через год после вакцинации" })}
        <div class="span-2">${field({ id: "healthVacFatal", label: "", type: "checkbox", checkLabel: "Критичная прививка (защита от смертельных инфекций)" })}</div>
      </div>`,
      foot: `<button class="btn btn-primary" data-act="health.vacAdd">💾 Добавить прививку</button>
             <button class="btn btn-ghost" data-act="hub.open" data-panel="ai">🤖 Спросить про график</button>`
    });

    const kpi = `<div class="kpi-row mb-3">
      ${kpiTile("🛡", protection + "%", "Защита питомца", "По действующим прививкам", protection >= 80 ? "green" : "orange")}
      ${kpiTile("💉", String(vacs.length), "Прививок в карте", "Всего записей", "blue")}
      ${kpiTile("⏳", String(soon.length), "Скоро ревакцинация", "В ближайшие 60 дней", soon.length ? "orange" : "")}
      ${kpiTile("🚨", String(overdue.length), "Просрочено", overdue.length ? "Требуется визит к врачу" : "Всё по графику", overdue.length ? "orange" : "green")}
    </div>`;

    const fatalNote = fatal.length
      ? `<div class="danger-box">☠️ Критичных прививок в карте: <b>${fatal.length}</b>. Просроченная ревакцинация от бешенства, чумы, энтерита и панлейкопении — прямая угроза жизни. Проверьте даты и запишитесь к врачу.</div>`
      : `<div class="hint-box">💡 Отметьте критичные прививки (бешенство, комплексная) галочкой — PetLife выделит их как обязательные.</div>`;

    return kpi + `<div class="stack">${fatalNote}${scheduleCard}${myCard}${form}</div>`;
  }

  /* ============================================================================
   * 6. Запись к ветеринару (функция 12)
   * ==========================================================================*/
  function doctorsFor(place) {
    const start = hash(place.id) % 2;
    return DOCTORS.slice(start, start + 3);
  }

  function slotBusy(placeId, slot) {
    return rnd(placeId + "|" + slot + "|" + fmt.today()) < 0.3;
  }

  function vetClinicsHtml() {
    const clinics = (D.places || []).filter((p) => p.type === "vet").slice().sort((a, b) => placeDistance(a) - placeDistance(b));
    return clinics.map((p) => `<button class="map-item ${ui.vetClinic === p.id ? "active" : ""}" data-act="health.vetPick" data-id="${esc(p.id)}" style="width:100%;text-align:left">
        <span class="mi-ico">${esc(p.emoji || "🏥")}</span>
        <span style="display:grid;gap:3px;flex:1">
          <span class="mi-name">${esc(p.name)} ${badge("⭐ " + fmt.num(p.rating, 1), "info")}</span>
          <span class="mi-sub">📍 ${esc(p.address)} · ⏰ ${esc(p.hours)}</span>
          <span class="mi-sub">📞 ${esc(p.phone)} · ${esc(p.note || "")}</span>
          <span class="mi-sub">🚶 ${fmt.num(placeDistance(p), 1)} км от центра</span>
        </span>
      </button>`).join("");
  }

  function vetSlotsHtml() {
    const placeId = ui.vetClinic || "none";
    return SLOTS.map((t) => {
      const busy = ui.vetClinic ? slotBusy(placeId, t) : false;
      return `<button class="slot ${ui.vetSlot === t ? "active" : ""} ${busy ? "busy" : ""}"
        data-act="health.vetSlot" data-slot="${esc(t)}" data-busy="${busy ? "1" : "0"}">${esc(t)}</button>`;
    }).join("");
  }

  function paintVet() {
    const clinics = $("#healthVetClinics");
    if (clinics) clinics.innerHTML = vetClinicsHtml();
    const slots = $("#healthVetSlots");
    if (slots) slots.innerHTML = vetSlotsHtml();
    const extra = $("#healthVetExtra");
    if (extra) extra.innerHTML = vetExtraHtml();
  }

  function vetExtraHtml() {
    if (!ui.vetClinic) return `<div class="hint-box">Выберите клинику — появятся свободные слоты и список врачей.</div>`;
    const place = (D.places || []).find((p) => p.id === ui.vetClinic);
    if (!place) return `<div class="hint-box">Выберите клинику — появятся свободные слоты и список врачей.</div>`;
    const docs = doctorsFor(place);
    return `<div class="ok-box">Выбрано: <b>${esc(place.name)}</b> · ${esc(place.address)} · ${esc(place.hours)}
        ${phoneHref(place.phone) ? ` · <a href="${esc(phoneHref(place.phone))}">${esc(place.phone)}</a>` : ""}</div>
      <div class="mt-2">${field({ id: "healthVetDoctor", label: "Врач", type: "select", value: docs[0], options: docs.map((d) => ({ value: d, label: d })) })}</div>`;
  }

  function apptCardHtml(a, past) {
    const clinic = clinicByName(a.clinic);
    const tel = clinic ? phoneHref(clinic.phone) : "";
    const d = Store.daysUntil(a.date);
    const when = d == null ? "—" : d > 0 ? "через " + fmt.days(d) : d === 0 ? "сегодня" : fmt.days(Math.abs(d)) + " назад";
    return `<div class="med-card">
      <div class="med-ico">${past ? "🗂" : "🏥"}</div>
      <div class="med-main">
        <div class="med-name">${esc(a.clinic)} ${badge(a.status || "—", a.status === "отменена" ? "muted" : a.status === "подтверждена" ? "ok" : "info")}</div>
        <div class="med-sub">${esc(fmt.date(a.date))} в ${esc(a.time || "—")} · ${esc(when)} · ${esc(a.reason || "без причины")}</div>
        <div class="med-sub">Врач: ${esc(a.doctor || "любой свободный")} · ${esc(fmt.money(a.price))}${clinic ? " · " + esc(clinic.address) : ""}</div>
      </div>
      <div class="row" style="gap:6px">
        ${!past ? `<button class="btn btn-soft btn-sm" data-act="health.vetMove" data-id="${esc(a.id)}">🔁 +7 дней</button>
          <button class="btn btn-ghost btn-sm" data-act="health.vetCancel" data-id="${esc(a.id)}">✖ Отменить</button>` : ""}
        ${tel ? `<a class="btn btn-ghost btn-sm" href="${esc(tel)}">📞 Телефон</a>` : ""}
      </div>
    </div>`;
  }

  function sectionVet(pet) {
    const all = Store.array("appointments").filter((a) => a.petId === pet.id);
    const upcoming = all.filter((a) => { const d = Store.daysUntil(a.date); return d != null && d >= 0 && a.status !== "отменена"; }).sort(byDateAsc);
    const history = all.filter((a) => { const d = Store.daysUntil(a.date); return d == null || d < 0 || a.status === "отменена"; }).sort(byDateDesc);
    const chosen = (D.places || []).find((p) => p.id === ui.vetClinic) || null;

    const booking = card({
      title: "Шаг 1. Клиника", icon: "🏥",
      body: `<div class="stack" style="gap:10px" id="healthVetClinics">${vetClinicsHtml()}</div>`
    });

    const whenCard = card({
      title: "Шаг 2. Время, врач и причина", icon: "🕘",
      body: `<div class="small muted mb-1">Свободные слоты на ${esc(fmt.date(fmt.today()))} (зачёркнутые — заняты)</div>
        <div class="slot-row mb-2" id="healthVetSlots">${vetSlotsHtml()}</div>
        <div id="healthVetExtra">${vetExtraHtml()}</div>
        <div class="mt-2">${field({ id: "healthVetReason", label: "Причина визита", type: "text", value: ui.vetReason, placeholder: "Например: хромает на правую лапу", attrs: 'data-hsearch="vetReason"' })}</div>
        <div class="row">
          <button class="btn btn-primary" data-act="health.vetBook">📅 Записаться</button>
          <span class="muted small">${chosen ? esc(chosen.name) : "Клиника не выбрана"}${ui.vetSlot ? " · " + esc(ui.vetSlot) : ""}</span>
        </div>`
    });

    const listCard = card({
      title: "Предстоящие визиты", icon: "📅",
      tools: `<span class="muted small">${upcoming.length}</span>`,
      body: upcoming.length ? `<div class="stack" style="gap:10px">${upcoming.map((a) => apptCardHtml(a, false)).join("")}</div>`
        : empty("📅", "Записей нет", "Выберите клинику, время и подтвердите — визит появится здесь и попадёт в отчёт.",
          `<button class="btn btn-primary btn-sm" data-act="health.focus" data-target="healthVetSlots">🏥 Выбрать время</button>`)
    });

    const historyCard = card({
      title: "История визитов", icon: "🗂",
      tools: `<span class="muted small">${history.length}</span>`,
      body: history.length ? `<div class="stack" style="gap:10px">${history.map((a) => apptCardHtml(a, true)).join("")}</div>`
        : `<div class="muted small">Прошлых визитов пока нет.</div>`
    });

    return `<div class="stack">${booking}${whenCard}${listCard}${historyCard}</div>`;
  }

  /* ============================================================================
   * 7. Отчёт для ветеринара (функция 39)
   * ==========================================================================*/
  function reportModel(pet) {
    const medical = Store.bucket("medical", pet.id).slice().sort(byDateDesc);
    const symptoms = Store.bucket("symptoms", pet.id).slice().sort(byDateDesc);
    const meds = Store.bucket("meds", pet.id).slice().sort((a, b) => nextDays(a) - nextDays(b));
    const vacs = Store.bucket("vaccinations", pet.id).slice().sort(byDateAsc);
    const weights = Store.bucket("weights", pet.id).slice().sort(byDateAsc);
    const period = weights.filter((w) => withinDays(w.date, 90));
    const active = symptoms.filter((s) => withinDays(s.date, 14));
    const avgSev = active.length ? active.reduce((a, x) => a + (+x.severity || 0), 0) / active.length : 0;
    return {
      pet: pet, breed: Store.breed(pet), stage: Store.ageStage(pet), idx: Store.index(pet),
      medical: medical, symptoms: symptoms, meds: meds, vacs: vacs, weights: weights,
      period: period, active: active, avgSev: avgSev, date: fmt.today()
    };
  }

  function reportSheet(m) {
    const pet = m.pet;
    const owner = S().owner || {};
    const w0 = m.period[0], w1 = m.period[m.period.length - 1];
    const delta = w0 && w1 ? (+w1.kg || 0) - (+w0.kg || 0) : null;

    const vacRows = m.vacs.map((v) => {
      const st = vacStatus(v);
      return [
        esc(v.name) + (v.fatal ? " " + badge("критичная", "danger") : ""),
        esc(fmt.short(v.date)),
        esc(v.next ? fmt.short(v.next) : "—"),
        esc(st.label)
      ];
    });

    const medRows = m.meds.map((md) => {
      const nextIso = isoOf(Store.nextDose(md));
      const d = nextDays(md);
      return [
        esc(md.name),
        esc(md.dose || "—"),
        esc(fmt.days(md.every || 1)),
        esc(fmt.short(nextIso)) + (d < 0 ? " " + badge("просрочен", "danger") : d <= 1 ? " " + badge("пора", "warn") : "")
      ];
    });

    return `<section class="card" id="healthReport">
      <header class="card-head"><h3>🖨 Отчёт для ветеринара — ${esc(pet.name)}</h3>
        <span class="muted small">сформирован ${esc(fmt.date(m.date))}</span></header>
      <div class="card-body">
        <div class="kv">
          <div class="kv-row"><span class="kv-k">Питомец</span><span class="kv-v">${esc(pet.emoji || "🐾")} ${esc(pet.name)}</span></div>
          <div class="kv-row"><span class="kv-k">Вид и порода</span><span class="kv-v">${esc(pet.species === "cat" ? "Кошка" : "Собака")}, ${esc(m.breed.name)}</span></div>
          <div class="kv-row"><span class="kv-k">Возраст</span><span class="kv-v">${esc(Store.ageLabel(pet))} · ${esc(m.stage.name)}</span></div>
          <div class="kv-row"><span class="kv-k">Пол, стерилизация</span><span class="kv-v">${esc(pet.sex || "—")}${pet.sterilized ? ", стерилизован(а)" : ""}</span></div>
          <div class="kv-row"><span class="kv-k">Вес</span><span class="kv-v">${fmt.num(pet.weight, 1)} кг (породная норма ${fmt.num(m.breed.weight, 1)} кг)</span></div>
          <div class="kv-row"><span class="kv-k">Владелец</span><span class="kv-v">${esc(owner.name || "—")} · ${esc(pet.city || owner.city || "—")}</span></div>
          <div class="kv-row"><span class="kv-k">Аллергии</span><span class="kv-v">${esc((pet.allergies || []).join(", ") || "не выявлены")}</span></div>
          <div class="kv-row"><span class="kv-k">Хронические заболевания</span><span class="kv-v">${esc((pet.chronic || []).join(", ") || "нет")}</span></div>
          <div class="kv-row"><span class="kv-k">PetLife Index</span><span class="kv-v">${m.idx.score}/100</span></div>
        </div>

        <h3 class="mt-3">PetLife Index — детали</h3>
        ${table(["Показатель", "Оценка", "Комментарий"], m.idx.details.map((d) => [esc(d.label), esc(String(d.value)) + "%", esc(d.hint || "")]))}

        <h3 class="mt-3">Динамика веса за 90 дней</h3>
        ${m.period.length
          ? table(["Дата", "Вес, кг"], m.period.map((w) => [esc(fmt.short(w.date)), fmt.num(w.kg, 1)]))
            + `<div class="kv"><div class="kv-row"><span class="kv-k">Изменение за период</span><span class="kv-v">${delta == null ? "—" : (delta > 0 ? "+" : "") + fmt.num(delta, 1) + " кг"}</span></div></div>`
          : `<p class="muted small">Измерений за период нет.</p>`}

        <h3 class="mt-3">Активные симптомы (14 дней)</h3>
        ${m.active.length
          ? table(["Дата", "Категория", "Серьёзность", "Заметка"], m.active.map((s) => [esc(fmt.short(s.date)), esc(s.type || "—"), esc(String(+s.severity || 0)) + "/5", esc(s.note || "—")]))
            + (m.avgSev >= 4 ? `<div class="danger-box">Средняя серьёзность ${fmt.num(m.avgSev, 1)}/5 — требуется осмотр в ближайшее время.</div>` : "")
          : `<p class="muted small">Жалоб за последние 2 недели не отмечено.</p>`}

        <h3 class="mt-3">Принимаемые лекарства</h3>
        ${medRows.length ? table(["Препарат", "Доза", "Периодичность", "Следующий приём"], medRows) : `<p class="muted small">Постоянных препаратов нет.</p>`}

        <h3 class="mt-3">Вакцинация</h3>
        ${vacRows.length ? table(["Прививка", "Дата", "Действует до", "Статус"], vacRows) : `<p class="muted small">Прививок в карте нет.</p>`}

        <h3 class="mt-3">Последние записи медкарты</h3>
        ${m.medical.length
          ? table(["Дата", "Тип", "Запись", "Врач"], m.medical.slice(0, 8).map((r) => [esc(fmt.short(r.date)), esc(r.type || "—"), esc(r.title || "—"), esc(r.vet || "—")]))
          : `<p class="muted small">Записей нет.</p>`}

        <p class="small muted mt-3">Отчёт сформирован приложением PetLife по данным владельца и не является медицинским заключением.</p>
      </div>
    </section>`;
  }

  const REPORT_CSS = [
    "body{font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1A2330;margin:24px;line-height:1.5}",
    "h1{font-size:20px;margin:0 0 6px}h3{font-size:15px;margin:18px 0 8px}",
    "table{width:100%;border-collapse:collapse;font-size:13px;margin:6px 0 12px}",
    "th,td{border:1px solid #DDE3EB;padding:6px 8px;text-align:left;vertical-align:top}",
    "th{background:#F4F7FB;font-size:12px;text-transform:uppercase;letter-spacing:.03em}",
    ".kv-row{display:flex;justify-content:space-between;gap:16px;border-bottom:1px dashed #DDE3EB;padding:5px 0;font-size:13px}",
    ".kv-k{color:#5C6B7A}.kv-v{font-weight:600;text-align:right}",
    ".badge{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;background:#EEF1F5;color:#33475B}",
    ".danger-box{border:1px solid #F5C0C0;background:#FFF6F6;border-radius:8px;padding:10px 12px;font-size:13px;color:#8E1D1B;margin-top:8px}",
    ".muted{color:#5C6B7A}.small{font-size:12px}",
    "@media print{body{margin:12mm}}"
  ].join("");

  function reportHtmlDoc(m) {
    const sheet = reportSheet(m)
      .replace(/<section class="card" id="healthReport">[\s\S]*?<\/header>/, "<h1>Отчёт для ветеринара — " + esc(m.pet.name) + "</h1>")
      .replace(/<\/section>\s*$/, "");
    return "<!DOCTYPE html><html lang=\"ru\"><head><meta charset=\"utf-8\">" +
      "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
      "<title>PetLife — отчёт для ветеринара: " + esc(m.pet.name) + "</title>" +
      "<style>" + REPORT_CSS + "</style></head><body>" +
      sheet + "</body></html>";
  }

  function sectionReport(pet) {
    const m = reportModel(pet);
    return `<div class="row mb-2 no-print">
        <button class="btn btn-primary" data-act="health.reportPrint">🖨 Печать / PDF</button>
        <button class="btn btn-soft" data-act="health.reportHtml">⬇️ Скачать HTML</button>
        <button class="btn btn-soft" data-act="health.reportJson">🗂 Скачать JSON</button>
        <span class="muted small">Памятка собирается из ваших данных автоматически — распечатайте и возьмите на приём.</span>
      </div>
      <div class="hint-box mb-2 no-print">Что попадает в отчёт: профиль и порода, PetLife Index, динамика веса за 90 дней, активные симптомы, лекарства, прививки, последние записи медкарты, аллергии и хронические заболевания.</div>
      ${reportSheet(m)}`;
  }

  /* ============================================================================
   * 8. Экстренные контакты (функция 40)
   * ==========================================================================*/
  function copyText(text, onDone) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(onDone).catch(() => legacyCopy(text, onDone));
      return;
    }
    legacyCopy(text, onDone);
  }

  function legacyCopy(text, onDone) {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "readonly");
      area.style.position = "fixed";
      area.style.left = "-1000px";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      if (ok) onDone(); else toast("Не удалось скопировать — выделите номер вручную", "warn");
    } catch (err) {
      toast("Не удалось скопировать — выделите номер вручную", "warn");
    }
  }

  function sectionContacts(pet) {
    const contacts = Store.array("contacts");
    const vets = (D.places || []).filter((p) => p.type === "vet").slice().sort((a, b) => placeDistance(a) - placeDistance(b));
    const first = emergencyContact();

    const emergency = first
      ? `<div class="danger-box">🚨 Экстренная помощь: <b>${esc(first.name)}</b>${first.phone ? " · " + esc(first.phone) : ""}
          <div class="row mt-2">
            ${phoneHref(first.phone) ? `<a class="btn btn-danger btn-sm" href="${esc(phoneHref(first.phone))}">📞 Позвонить сейчас</a>` : ""}
            <button class="btn btn-soft btn-sm" data-act="hub.open" data-panel="health" data-tab="firstaid">🚑 Первая помощь</button>
          </div></div>`
      : `<div class="hint-box">Добавьте телефон круглосуточной клиники — он появится здесь и в подразделе «Первая помощь».</div>`;

    const rows = contacts.length ? `<div class="stack" style="gap:10px">${contacts.map((c) => `
        <div class="med-card">
          <div class="med-ico">📞</div>
          <div class="med-main">
            <div class="med-name">${esc(c.name)} ${badge(c.type || "Контакт", "info")}</div>
            <div class="med-sub">${esc(c.phone || "телефон не указан")}</div>
            ${c.note ? `<div class="tiny muted">📝 ${esc(c.note)}</div>` : ""}
          </div>
          <div class="row" style="gap:6px">
            ${phoneHref(c.phone) ? `<a class="btn btn-green btn-sm" href="${esc(phoneHref(c.phone))}">📞 Позвонить</a>` : ""}
            <button class="btn btn-soft btn-sm" data-act="health.copyPhone" data-phone="${esc(c.phone || "")}">📋 Скопировать</button>
            <button class="btn btn-ghost btn-sm" data-act="health.contactDel" data-id="${esc(c.id)}">🗑</button>
          </div>
        </div>`).join("")}</div>`
      : empty("📞", "Контактов нет", "Добавьте клинику, кинолога или зоотакси — они будут под рукой в экстренной ситуации.",
        `<button class="btn btn-primary btn-sm" data-act="health.focus" data-target="healthContactForm">➕ Добавить контакт</button>`);

    const listCard = card({
      title: "Мои контакты", icon: "📞",
      tools: `<span class="muted small">${contacts.length}</span>`,
      body: rows
    });

    const form = card({
      title: "Добавить контакт", icon: "➕",
      body: `<div id="healthContactForm" class="panel-grid cols-2">
        ${field({ id: "healthContactName", label: "Название", placeholder: "Клиника «Лапа помощи»" })}
        ${field({ id: "healthContactPhone", label: "Телефон", placeholder: "+7 495 000-00-00" })}
        ${field({ id: "healthContactType", label: "Тип", type: "select", value: CONTACT_TYPES[0], options: CONTACT_TYPES.map((t) => ({ value: t, label: t })) })}
        ${field({ id: "healthContactNote", label: "Заметка", placeholder: "Круглосуточно, 1,8 км от дома" })}
      </div>`,
      foot: `<button class="btn btn-primary" data-act="health.contactAdd">💾 Добавить контакт</button>`
    });

    const near = card({
      title: "Клиники рядом", icon: "🗺",
      tools: `<span class="muted small">${vets.length} в радиусе города</span>`,
      body: `<div class="stack" style="gap:10px">${vets.map((p) => `
          <div class="map-item">
            <span class="mi-ico">${esc(p.emoji || "🏥")}</span>
            <span style="display:grid;gap:3px;flex:1">
              <span class="mi-name">${esc(p.name)} ${badge(fmt.num(placeDistance(p), 1) + " км", placeDistance(p) < 2 ? "ok" : "muted")}</span>
              <span class="mi-sub">📍 ${esc(p.address)} · ⏰ ${esc(p.hours)} · ⭐ ${fmt.num(p.rating, 1)}</span>
              <span class="mi-sub">${esc(p.note || "")}</span>
            </span>
            <span class="row" style="gap:6px">
              ${phoneHref(p.phone) ? `<a class="btn btn-ghost btn-sm" href="${esc(phoneHref(p.phone))}">📞</a>` : ""}
              <button class="btn btn-soft btn-sm" data-act="hub.open" data-panel="walk" data-tab="map">🗺 На карте</button>
            </span>
          </div>`).join("")}</div>`
    });

    return `<div class="stack">${emergency}${listCard}${form}${near}</div>`;
  }

  /* ============================================================================
   * 9. База токсичных продуктов (функция 41)
   * ==========================================================================*/
  function toxFiltersHtml() {
    const dangers = [["all", "🗂 Все"], ["high", "🔴 Высокая"], ["medium", "🟠 Средняя"], ["low", "🟢 Низкая"]];
    const fors = [["all", "Все виды"], ["dog", "🐕 Собаки"], ["cat", "🐈 Кошки"], ["both", "🐾 Оба"]];
    return `<div class="chip-row mb-2">${dangers.map(([v, l]) =>
      `<button class="tag ${ui.toxDanger === v ? "active" : ""}" data-act="health.toxDanger" data-danger="${v}">${esc(l)}</button>`).join("")}</div>
      <div class="chip-row mb-2">${fors.map(([v, l]) =>
        `<button class="tag ${ui.toxFor === v ? "active" : ""}" data-act="health.toxFor" data-for="${v}">${esc(l)}</button>`).join("")}</div>`;
  }

  function filterToxins() {
    const q = ui.toxQuery.trim().toLowerCase();
    return (D.toxic || []).filter((t) => {
      if (ui.toxDanger !== "all" && t.danger !== ui.toxDanger) return false;
      if (ui.toxFor !== "all" && t.for !== ui.toxFor && t.for !== "both") return false;
      if (!q) return true;
      return (t.name + " " + t.symptoms + " " + t.action).toLowerCase().includes(q);
    });
  }

  function toxCardsHtml() {
    const total = (D.toxic || []).length;
    const items = filterToxins();
    if (!items.length) {
      return empty("🔍", "Ничего не найдено", "Попробуйте другое название или снимите фильтры опасности.",
        `<button class="btn btn-soft btn-sm" data-act="health.toxClear">Сбросить фильтры</button>`);
    }
    return `<div class="small muted mb-2">Найдено ${items.length} из ${total}</div>
      <div style="display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(290px,1fr))">
        ${items.map((t) => `<div class="tox-item ${esc(t.danger)}">
          <div class="tox-name">${esc(t.emoji || "☠️")} ${esc(t.name)}</div>
          <div class="row mt-1" style="gap:6px">${badge(dangerLabel(t.danger), dangerKind(t.danger))}${badge("опасно для: " + forLabel(t.for), "muted")}</div>
          <div class="small muted mt-1">🤒 Симптомы: ${esc(t.symptoms)}</div>
          <div class="hint-box mt-1"><b>Что делать:</b> ${esc(t.action)}</div>
          <div class="mt-2"><button class="btn btn-danger btn-sm" data-act="health.toxAte"
            data-name="${esc(t.name)}" data-action="${esc(t.action)}" data-emoji="${esc(t.emoji || "☠️")}"
            data-danger="${esc(t.danger)}" data-for="${esc(t.for)}">🚨 Питомец съел это</button></div>
        </div>`).join("")}
      </div>`;
  }

  function sectionToxic(pet) {
    const total = (D.toxic || []).length;
    const high = (D.toxic || []).filter((t) => t.danger === "high").length;
    const kpi = `<div class="kpi-row mb-3">
      ${kpiTile("☠️", String(total), "Продуктов в базе", "Опасные для собак и кошек", "blue")}
      ${kpiTile("🔴", String(high), "Высокая опасность", "Требуют немедленного визита", "orange")}
      ${kpiTile("🐕", String((D.toxic || []).filter((t) => t.for === "dog" || t.for === "both").length), "Опасны собакам", "Включая общие токсины", "")}
      ${kpiTile("🐈", String((D.toxic || []).filter((t) => t.for === "cat" || t.for === "both").length), "Опасны кошкам", "Лилейные — смертельны", "")}
    </div>`;

    return kpi + card({
      title: "Токсичные продукты и вещества", icon: "☠️",
      body: `<div class="danger-box mb-2">При подозрении на отравление не ждите симптомов: позвоните в клинику, сохраните упаковку и не вызывайте рвоту без указания врача.</div>
        <div class="field"><span class="field-label">Поиск по названию</span>
          <input class="input" type="text" id="healthToxSearch" value="${esc(ui.toxQuery)}" placeholder="шоколад, изюм, ксилит…" autocomplete="off"
            data-hsearch="toxQuery" data-hrepaint="toxList"></div>
        <div id="healthToxFilters">${toxFiltersHtml()}</div>
        <div id="healthToxList">${toxCardsHtml()}</div>`
    });
  }

  /* ============================================================================
   * 10. Гид по первой помощи (функция 42)
   * ==========================================================================*/
  function faItemHtml(a) {
    return `<div class="accordion">
      <div class="acc-head" data-act="health.faAcc" role="button" tabindex="0" aria-label="${esc(a.title)}">
        <span>${esc(a.emoji || "🚑")}</span>
        <span>${esc(a.title)}</span>
        <span class="acc-arrow">▾</span>
      </div>
      <div class="acc-body">
        <div class="tiny muted">Когда: ${esc(a.when || "—")}</div>
        <ol style="margin:8px 0 0;padding-left:22px;display:grid;gap:6px">
          ${(a.steps || []).map((s, i) => `<li><b>Шаг ${i + 1}.</b> ${esc(s)}</li>`).join("")}
        </ol>
      </div>
    </div>`;
  }

  function faListHtml() {
    const q = ui.faQuery.trim().toLowerCase();
    const items = (D.firstAid || []).filter((a) => !q
      || (a.title + " " + a.when + " " + (a.steps || []).join(" ")).toLowerCase().includes(q));
    if (!items.length) {
      return empty("🚑", "Ничего не найдено", "Попробуйте другой запрос: «кровотечение», «судороги», «клещ».",
        `<button class="btn btn-soft btn-sm" data-act="health.faClear">Сбросить поиск</button>`);
    }
    return `<div class="stack" style="gap:10px">${items.map(faItemHtml).join("")}</div>`;
  }

  function applyFaOpen(mode) {
    $$("#healthFaList .accordion").forEach((a) => a.classList.toggle("open", mode === "open"));
  }

  function sectionFirstAid(pet) {
    const contact = emergencyContact();
    const tel = contact ? phoneHref(contact.phone) : "";
    const emergency = `<div class="danger-box">🚨 <b>Экстренные контакты.</b> ${contact
        ? esc(contact.name) + (contact.phone ? " · " + esc(contact.phone) : "")
        : "Добавьте телефон клиники в подразделе «Экстренные контакты»."}
      <div class="row mt-2">
        ${tel ? `<a class="btn btn-danger btn-sm" href="${esc(tel)}">📞 Позвонить</a>` : ""}
        <button class="btn btn-soft btn-sm" data-act="hub.open" data-panel="health" data-tab="contacts">📋 Все контакты</button>
        <button class="btn btn-ghost btn-sm" data-act="hub.open" data-panel="health" data-tab="toxic">☠️ Токсины</button>
      </div>
      <div class="tiny mt-1">Не вызывайте рвоту без указания врача. Сохраните упаковку вещества и запишите время.</div></div>`;

    const kit = (D.firstAid || []).find((a) => /аптечк/i.test(String(a.title || "")));
    const kpi = `<div class="kpi-row mb-3">
      ${kpiTile("🚑", String((D.firstAid || []).length), "Инструкций", "Пошаговые алгоритмы", "blue")}
      ${kpiTile("📞", contact ? "24/7" : "—", "Экстренный контакт", contact ? esc(contact.name) : "не добавлен", contact ? "green" : "orange")}
      ${kpiTile("☠️", String((D.toxic || []).filter((t) => t.danger === "high").length), "Высокотоксичных", "Продуктов в базе", "orange")}
      ${kpiTile("🧰", kit ? String((kit.steps || []).length) : "—", "Пунктов в аптечке", "Соберите заранее", "")}
    </div>`;

    return kpi + card({
      title: "Первая помощь: пошаговые алгоритмы", icon: "🚑",
      tools: `<button class="btn btn-soft btn-xs" data-act="health.faToggleAll" data-mode="open">📂 Открыть все</button>
              <button class="btn btn-ghost btn-xs" data-act="health.faToggleAll" data-mode="close">📁 Свернуть все</button>`,
      body: `<div class="field"><span class="field-label">Поиск по ситуации</span>
          <input class="input" type="text" id="healthFaSearch" value="${esc(ui.faQuery)}" placeholder="кровотечение, судороги, клещ, тепловой удар…" autocomplete="off"
            data-hsearch="faQuery" data-hrepaint="faList"></div>
        <div id="healthFaList">${faListHtml()}</div>
        ${emergency}`
    });
  }

  /* ============================================================================
   * Перерисовка отдельных блоков
   * ==========================================================================*/
  const PAINT = {
    medList() {
      const host = $("#healthMedList");
      if (host) host.innerHTML = medTimelineHtml(Store.bucket("medical", Store.pet().id));
      const chips = $("#healthMedFilters");
      if (chips) chips.innerHTML = medFiltersHtml();
    },
    symList() {
      const host = $("#healthSymList");
      if (host) host.innerHTML = symTimelineHtml(Store.bucket("symptoms", Store.pet().id));
    },
    toxList() {
      const host = $("#healthToxList");
      if (host) host.innerHTML = toxCardsHtml();
      const chips = $("#healthToxFilters");
      if (chips) chips.innerHTML = toxFiltersHtml();
    },
    faList() {
      const host = $("#healthFaList");
      if (host) {
        host.innerHTML = faListHtml();
        if (ui.faOpen) applyFaOpen(ui.faOpen);
      }
    },
    vet() { paintVet(); }
  };

  /* ============================================================================
   * Регистрация панели
   * ==========================================================================*/
  window.Panels.register("health", {
    id: "health",
    title: "Здоровье",
    icon: "🩺",
    desc: "Медкарта, симптомы, вакцины, ИИ-анализ фото, первая помощь",

    render(view, ctx) {
      const pet = ctx.pet || Store.pet();
      const tab = TABS.some((t) => t[0] === ctx.tab) ? ctx.tab : "medcard";

      let body;
      if (tab === "symptoms") body = sectionSymptoms(pet);
      else if (tab === "photo") body = sectionPhoto(pet);
      else if (tab === "meds") body = sectionMeds(pet);
      else if (tab === "vaccines") body = sectionVaccines(pet);
      else if (tab === "vet") body = sectionVet(pet);
      else if (tab === "report") body = sectionReport(pet);
      else if (tab === "contacts") body = sectionContacts(pet);
      else if (tab === "toxic") body = sectionToxic(pet);
      else if (tab === "firstaid") body = sectionFirstAid(pet);
      else body = sectionMedcard(pet);

      view.innerHTML = `<div class="panel">
        ${pageHead(pet, tab)}
        ${tab === "photo" ? "" : kpiRow(pet)}
        ${body}
      </div>`;

      /* поиск и фильтры — обновляем только нужный блок, не сбрасывая форму */
      $$("[data-hsearch]", view).forEach((input) => {
        const key = input.dataset.hsearch;
        input.addEventListener("input", () => {
          ui[key] = input.value;
          const repaint = PAINT[input.dataset.hrepaint];
          if (typeof repaint === "function") repaint();
        });
      });

      if (tab === "photo") bindPhoto(view);
      if (tab === "firstaid" && ui.faOpen) applyFaOpen(ui.faOpen);
    }
  });

  /* ============================================================================
   * Действия
   * ==========================================================================*/
  Actions.registerAll({

    /* ------------------------------------------------------------ общее */
    "health.focus": (ds) => {
      const node = ds.target ? $("#" + ds.target) : null;
      if (!node) return;
      if (PL.scrollToEl) PL.scrollToEl(node, 90); else if (node.scrollIntoView) node.scrollIntoView();
      const inner = node.querySelector("input, select, textarea");
      if (inner) inner.focus();
    },

    /* ------------------------------------------------------------ медкарта */
    "health.medAdd": () => {
      const pet = Store.pet();
      const title = val("#healthMedTitle");
      if (!title) { toast("Опишите, что было на приёме", "warn"); focusIt("#healthMedTitle"); return; }
      Store.push("medical", {
        id: Store.uid("m"),
        date: val("#healthMedDate") || fmt.today(),
        type: val("#healthMedType") || "Другое",
        title: title,
        vet: val("#healthMedVet"),
        notes: val("#healthMedNotes")
      }, pet.id);
      toast("Запись добавлена в медкарту", "ok");
    },

    "health.medDel": async (ds) => {
      const pet = Store.pet();
      const record = Store.bucket("medical", pet.id).find((r) => r.id === ds.id);
      if (!record) return;
      const ok = await confirmDialog("Удалить запись «" + (record.title || "без названия") + "» из медкарты?", { ok: "Удалить", danger: true, icon: "🗑" });
      if (!ok) return;
      Store.remove("medical", ds.id, pet.id);
      toast("Запись удалена", "ok");
    },

    "health.medFilter": (ds) => { ui.medType = ds.type || "all"; PAINT.medList(); },

    "health.medResetFilter": () => {
      ui.medType = "all";
      ui.medQuery = "";
      const input = $("#healthMedSearch");
      if (input) input.value = "";
      PAINT.medList();
    },

    "health.medExport": () => {
      const pet = Store.pet();
      const records = Store.bucket("medical", pet.id).slice().sort(byDateAsc);
      PL.download("medcard.json", JSON.stringify({
        pet: { id: pet.id, name: pet.name, species: pet.species, breed: Store.breed(pet).name, birth: pet.birth, weight: pet.weight },
        exportedAt: new Date().toISOString(),
        records: records
      }, null, 2));
      toast("Медкарта выгружена в medcard.json", "ok");
    },

    /* ------------------------------------------------------------ симптомы */
    "health.symAdd": () => {
      const pet = Store.pet();
      const note = val("#healthSymNote");
      const where = val("#healthSymWhere");
      const type = val("#healthSymType") || "Другое";
      const severity = +val("#healthSymSev") || 1;
      if (!note && !where) { toast("Опишите, что заметили", "warn"); focusIt("#healthSymNote"); return; }
      Store.push("symptoms", {
        id: Store.uid("s"),
        date: val("#healthSymDate") || fmt.today(),
        type: type,
        severity: severity,
        note: (where ? "Место: " + where + ". " : "") + (note || "")
      }, pet.id);
      toast("Запись добавлена в дневник симптомов", "ok");
    },

    "health.symDel": async (ds) => {
      const pet = Store.pet();
      const ok = await confirmDialog("Удалить запись из дневника симптомов?", { ok: "Удалить", danger: true, icon: "🗑" });
      if (!ok) return;
      Store.remove("symptoms", ds.id, pet.id);
      toast("Запись удалена", "ok");
    },

    "health.symFilter": (ds) => {
      ui.symType = ds.type || "all";
      const pet = Store.pet();
      const host = $("#healthSymList");
      if (host) host.innerHTML = symTimelineHtml(Store.bucket("symptoms", pet.id));
      $$(".chip-row .tag[data-act='health.symFilter']").forEach((b) => b.classList.toggle("active", b.dataset.type === ui.symType));
    },

    /* ------------------------------------------------------------ фото и ИИ */
    "health.photoPick": () => {
      const input = $("#healthPhotoInput");
      if (input) input.click();
    },
    "health.photoAnalyze": () => { analyzePhoto(); },
    "health.photoReset": () => { resetPhoto(); },

    "health.photoSave": () => {
      if (!ui.photo.text) { toast("Сначала проанализируйте фото", "warn"); return; }
      const pet = Store.pet();
      const srcLabel = ui.photo.source === "openrouter" ? "vision-модель OpenRouter" : "локальный анализ";
      Store.push("symptoms", {
        id: Store.uid("s"),
        date: fmt.today(),
        type: "Другое",
        severity: 2,
        note: "📷 ИИ-анализ фото (" + srcLabel + "): " + ui.photo.text.slice(0, 500)
      }, pet.id);
      toast("Сохранено в дневник симптомов", "ok");
    },

    /* ------------------------------------------------------------ лекарства */
    "health.medAddItem": () => {
      const pet = Store.pet();
      const name = val("#healthMedName");
      if (!name) { toast("Укажите название препарата", "warn"); focusIt("#healthMedName"); return; }
      const every = Math.max(1, Math.round(+val("#healthMedEvery") || 1));
      Store.push("meds", {
        id: Store.uid("md"),
        name: name,
        dose: val("#healthMedDose") || "по инструкции",
        every: every,
        last: val("#healthMedLast") || fmt.today(),
        note: val("#healthMedNote")
      }, pet.id);
      toast("Препарат добавлен — PetLife напомнит о приёме", "ok");
    },

    "health.medGive": (ds) => {
      const pet = Store.pet();
      const med = Store.bucket("meds", pet.id).find((m) => m.id === ds.id);
      if (!med) return;
      const today = fmt.today();
      Store.update((s) => {
        med.last = today;
        Store.bucket("medical", pet.id).unshift({
          id: Store.uid("m"), date: today, type: "Лечение",
          title: "Приём лекарства: " + med.name,
          vet: "",
          notes: "Доза: " + (med.dose || "по инструкции") + ". Отмечено в PetLife."
        });
      }, "meds");
      toast("Отмечено: " + med.name + " ✅", "ok");
    },

    "health.medRemove": async (ds) => {
      const pet = Store.pet();
      const med = Store.bucket("meds", pet.id).find((m) => m.id === ds.id);
      if (!med) return;
      const ok = await confirmDialog("Удалить «" + med.name + "» из списка лекарств?", { ok: "Удалить", danger: true, icon: "🗑" });
      if (!ok) return;
      Store.remove("meds", ds.id, pet.id);
      toast("Препарат удалён", "ok");
    },

    /* ------------------------------------------------------------ вакцинация */
    "health.vacScheduleAdd": (ds) => {
      const pet = Store.pet();
      const name = ds.name || "Прививка";
      const exists = Store.bucket("vaccinations", pet.id).some((v) => v.name === name);
      if (exists) { toast("Такая прививка уже есть в календаре", "warn"); return; }
      Store.push("vaccinations", {
        id: Store.uid("v"),
        name: name,
        date: fmt.today(),
        next: addDays(fmt.today(), 365),
        done: true,
        fatal: ds.fatal === "1"
      }, pet.id);
      toast("Прививка добавлена в календарь", "ok");
    },

    "health.vacAdd": () => {
      const pet = Store.pet();
      const name = val("#healthVacName");
      if (!name) { toast("Укажите название прививки", "warn"); focusIt("#healthVacName"); return; }
      const date = val("#healthVacDate") || fmt.today();
      const box = $("#healthVacFatal");
      Store.push("vaccinations", {
        id: Store.uid("v"),
        name: name,
        date: date,
        next: val("#healthVacNext") || addDays(date, 365),
        done: true,
        fatal: !!(box && box.checked)
      }, pet.id);
      toast("Прививка добавлена", "ok");
    },

    "health.vacDel": async (ds) => {
      const pet = Store.pet();
      const vac = Store.bucket("vaccinations", pet.id).find((v) => v.id === ds.id);
      if (!vac) return;
      const ok = await confirmDialog("Удалить прививку «" + vac.name + "» из карты?", { ok: "Удалить", danger: true, icon: "🗑" });
      if (!ok) return;
      Store.remove("vaccinations", ds.id, pet.id);
      toast("Прививка удалена", "ok");
    },

    /* ------------------------------------------------------------ запись к врачу */
    "health.vetPick": (ds) => {
      ui.vetClinic = ds.id;
      ui.vetSlot = null;
      paintVet();
    },

    "health.vetSlot": (ds) => {
      if (ds.busy === "1") { toast("Это время уже занято — выберите другое", "warn"); return; }
      ui.vetSlot = ds.slot;
      $$("#healthVetSlots .slot").forEach((b) => b.classList.toggle("active", b.dataset.slot === ds.slot));
    },

    "health.vetBook": () => {
      const pet = Store.pet();
      const clinic = (D.places || []).find((p) => p.id === ui.vetClinic);
      if (!clinic) { toast("Выберите клинику", "warn"); return; }
      if (!ui.vetSlot) { toast("Выберите удобное время", "warn"); return; }
      const reason = val("#healthVetReason") || ui.vetReason;
      if (!reason) { toast("Опишите причину визита", "warn"); focusIt("#healthVetReason"); return; }
      const doctor = val("#healthVetDoctor") || DOCTORS[0];
      const price = 1500 + Math.round(rnd(clinic.id + "|" + ui.vetSlot + "|" + pet.id + "|price") * 20) * 100;
      const slot = ui.vetSlot;
      const today = fmt.today();
      Store.update((s) => {
        s.appointments.unshift({
          id: Store.uid("ap"), petId: pet.id, clinic: clinic.name, date: today, time: slot,
          reason: reason, doctor: doctor, status: "подтверждена", price: price,
          place: clinic.address, phone: clinic.phone
        });
      }, "appointments");
      ui.vetSlot = null;
      ui.vetReason = "";
      toast("Запись создана: " + clinic.name + ", " + fmt.date(today) + " в " + slot, "ok");
    },

    "health.vetCancel": async (ds) => {
      const pet = Store.pet();
      const appt = Store.array("appointments").find((a) => a.id === ds.id && a.petId === pet.id);
      if (!appt) return;
      const ok = await confirmDialog("Отменить визит в " + appt.clinic + " " + fmt.short(appt.date) + "?", { ok: "Отменить визит", danger: true, icon: "✖" });
      if (!ok) return;
      Store.update((s) => {
        const item = s.appointments.find((a) => a.id === ds.id);
        if (item) item.status = "отменена";
      }, "appointments");
      toast("Запись отменена", "ok");
    },

    "health.vetMove": (ds) => {
      const pet = Store.pet();
      const appt = Store.array("appointments").find((a) => a.id === ds.id && a.petId === pet.id);
      if (!appt) return;
      const nextDate = addDays(appt.date, 7);
      Store.update((s) => {
        const item = s.appointments.find((a) => a.id === ds.id);
        if (item) { item.date = nextDate; item.status = "подтверждена"; }
      }, "appointments");
      toast("Визит перенесён на " + fmt.date(nextDate), "ok");
    },

    /* ------------------------------------------------------------ отчёт */
    "health.reportPrint": () => {
      toast("Открываю печать — выберите «Сохранить как PDF»", "info");
      window.print();
    },

    "health.reportHtml": () => {
      const pet = Store.pet();
      PL.download("vet-report.html", reportHtmlDoc(reportModel(pet)), "text/html;charset=utf-8");
      toast("HTML-отчёт скачан", "ok");
    },

    "health.reportJson": () => {
      const pet = Store.pet();
      const m = reportModel(pet);
      PL.download("vet-report.json", JSON.stringify({
        generatedAt: new Date().toISOString(),
        pet: {
          name: pet.name, species: pet.species, breed: m.breed.name, birth: pet.birth, sex: pet.sex,
          weight: pet.weight, sterilized: pet.sterilized, allergies: pet.allergies || [],
          chronic: pet.chronic || [], city: pet.city, ageLabel: Store.ageLabel(pet), stage: m.stage.name
        },
        petlifeIndex: m.idx,
        weights: m.weights,
        symptoms: m.symptoms,
        meds: m.meds,
        vaccinations: m.vacs,
        medical: m.medical
      }, null, 2));
      toast("JSON-отчёт скачан", "ok");
    },

    /* ------------------------------------------------------------ контакты */
    "health.contactAdd": () => {
      const name = val("#healthContactName");
      const phone = val("#healthContactPhone");
      if (!name) { toast("Укажите название контакта", "warn"); focusIt("#healthContactName"); return; }
      if (!phone) { toast("Укажите телефон", "warn"); focusIt("#healthContactPhone"); return; }
      Store.update((s) => {
        s.contacts.unshift({
          id: Store.uid("c"), name: name, phone: phone,
          type: val("#healthContactType") || "Другое", note: val("#healthContactNote")
        });
      }, "contacts");
      toast("Контакт добавлен", "ok");
    },

    "health.contactDel": async (ds) => {
      const contact = Store.array("contacts").find((c) => c.id === ds.id);
      if (!contact) return;
      const ok = await confirmDialog("Удалить контакт «" + contact.name + "»?", { ok: "Удалить", danger: true, icon: "🗑" });
      if (!ok) return;
      Store.update((s) => { s.contacts = s.contacts.filter((c) => c.id !== ds.id); }, "contacts");
      toast("Контакт удалён", "ok");
    },

    "health.copyPhone": (ds) => {
      const phone = ds.phone || "";
      if (!phone) { toast("У этого контакта нет номера", "warn"); return; }
      copyText(phone, () => toast("Номер " + phone + " скопирован", "ok"));
    },

    /* ------------------------------------------------------------ токсины */
    "health.toxDanger": (ds) => { ui.toxDanger = ds.danger || "all"; PAINT.toxList(); },
    "health.toxFor": (ds) => { ui.toxFor = ds.for || "all"; PAINT.toxList(); },

    "health.toxClear": () => {
      ui.toxDanger = "all";
      ui.toxFor = "all";
      ui.toxQuery = "";
      const input = $("#healthToxSearch");
      if (input) input.value = "";
      PAINT.toxList();
    },

    "health.toxAte": (ds) => {
      const name = ds.name || "вещество";
      const pet = Store.pet();
      const steps = [
        "Не вызывайте рвоту самостоятельно: при кислотах, бензине и острых предметах это опасно.",
        "Уберите остатки вещества от питомца и сохраните упаковку или этикетку.",
        "Запишите время и примерное количество — это первое, что спросит врач.",
        "Позвоните в клинику и следуйте её инструкции (кнопка «Экстренные контакты» ниже).",
        "Не давайте молоко и активированный уголь «на глаз»."
      ];
      if (ds.action) steps.push("Что делать конкретно: " + ds.action);
      modal({
        title: "Питомец съел: " + name, icon: "🚨", wide: true,
        body: `<div class="danger-box mb-2"><b>Действуйте сразу.</b> Не ждите симптомов — при высокой опасности счёт идёт на минуты.</div>
          ${bullets("Быстрый алгоритм", steps.map((s) => esc(s)))}
          <div class="kv mt-2">
            <div class="kv-row"><span class="kv-k">Вещество</span><span class="kv-v">${esc(ds.emoji || "☠️")} ${esc(name)}</span></div>
            <div class="kv-row"><span class="kv-k">Опасность</span><span class="kv-v">${esc(dangerLabel(ds.danger))}</span></div>
            <div class="kv-row"><span class="kv-k">Опасно для</span><span class="kv-v">${esc(forLabel(ds.for))}</span></div>
            <div class="kv-row"><span class="kv-k">Питомец</span><span class="kv-v">${esc(pet.name)}</span></div>
          </div>`,
        actions: [
          { label: "Закрыть" },
          {
            label: "📞 Экстренные контакты",
            onClick: () => {
              setTimeout(() => window.Hub.open("health", "contacts"), 60);
              return true;
            }
          },
          {
            label: "📔 В дневник симптомов", kind: "primary",
            onClick: () => {
              Store.push("symptoms", {
                id: Store.uid("s"), date: fmt.today(), type: "ЖКТ", severity: 4,
                note: "🚨 Подозрение на отравление: " + name + ". " + (ds.action || "Нужна консультация ветеринара.")
              }, pet.id);
              toast("Запись добавлена в дневник симптомов", "ok");
              return true;
            }
          }
        ]
      });
    },

    /* ------------------------------------------------------------ первая помощь */
    "health.faAcc": (ds, ev, el) => {
      const fromEvent = ev && ev.target && ev.target.closest ? ev.target.closest(".accordion") : null;
      const fromEl = el && el.closest ? el.closest(".accordion") : null;
      const acc = fromEvent || fromEl;
      if (acc) acc.classList.toggle("open");
    },

    "health.faToggleAll": (ds) => {
      ui.faOpen = ds.mode === "open" ? "open" : "close";
      applyFaOpen(ui.faOpen);
    },

    "health.faClear": () => {
      ui.faQuery = "";
      const input = $("#healthFaSearch");
      if (input) input.value = "";
      PAINT.faList();
    }
  });
})();
