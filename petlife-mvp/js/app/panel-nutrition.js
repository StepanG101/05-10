/* ============================================================================
 * PetLife — app/panel-nutrition.js
 * Панель «Питание» (функции ТЗ 13–16):
 *   13. Расчёт порций корма (RER, ккал, граммы, кормления).
 *   14. Подбор корма без аллергенов питомца.
 *   15. Рецепты из того, что есть дома.
 *   16. Рецепты лакомств.
 *   + Дневник кормления и сравнение съеденного с нормой.
 * Подразделы: portion | picker | recipes | treats | journal.
 * ==========================================================================*/
(function () {
  "use strict";

  const PL = window.PL;
  const { $, esc, fmt, card, badge, progress, empty, field, table, Charts, toast, modal, confirmDialog, Actions } = PL;
  const D = window.PL_DATA;
  const Store = window.Store;
  const S = () => window.Store.state;

  /* ========================================================== состояние интерфейса
   * Живёт между перерисовками панели: выбор ингредиентов, фильтры, активность и т.п.
   * Данные питомца всегда читаются заново внутри render. */
  const ACT = [
    { id: "low", name: "Низкая", breed: "низкая", k: 1.2, emoji: "🛋" },
    { id: "mid", name: "Средняя", breed: "средняя", k: 1.4, emoji: "🚶" },
    { id: "high", name: "Высокая", breed: "высокая", k: 1.6, emoji: "🏃" },
    { id: "max", name: "Очень высокая", breed: "очень высокая", k: 1.8, emoji: "🏅" },
    { id: "sport", name: "Очень высокая + спорт", breed: "—", k: 2.0, emoji: "🔥" }
  ];

  const TABS = [
    { id: "portion", name: "Порции", emoji: "⚖️" },
    { id: "picker", name: "Подбор корма", emoji: "🎯" },
    { id: "recipes", name: "Рецепты", emoji: "🥘" },
    { id: "treats", name: "Лакомства", emoji: "🍪" },
    { id: "journal", name: "Дневник", emoji: "📔" }
  ];

  const ui = {
    petId: null,
    weight: null,       // null → берём вес из профиля
    actId: null,        // null → берём активность породы
    sterilized: null,   // null → как в профиле
    picked: {},         // выбранные ингредиенты (рецепты + лакомства)
    tried: false,       // нажата кнопка «Подобрать блюда»
    treatFor: "all",    // all | dog | cat
    favOnly: false,     // показывать только избранные лакомства
    picker: { noAllergens: true, grainFree: false, stage: true, hit: false, size: true, sort: "match", min: 0, max: 4000 }
  };

  /* ==================================================================== утилиты */
  const val = (id) => { const el = document.getElementById(id); return el ? el.value : ""; };
  const num = (id, def) => {
    const v = parseFloat(String(val(id)).replace(",", "."));
    return isNaN(v) ? (def == null ? 0 : def) : v;
  };
  const isChk = (id) => { const el = document.getElementById(id); return !!(el && el.checked); };
  const hhmm = () => {
    const d = new Date();
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  };
  function bind(view, sel, evt, fn) { const el = $(sel, view); if (el) el.addEventListener(evt, fn); }
  const refresh = () => { if (window.Hub && window.Hub.refresh) window.Hub.refresh(); };

  function syncPet(pet) {
    if (ui.petId === pet.id) return;
    ui.petId = pet.id;
    ui.weight = null;
    ui.actId = null;
    ui.sterilized = null;
    ui.picked = {};
    ui.tried = false;
    ui.treatFor = "all";
    ui.favOnly = false;
  }

  const actById = (id) => ACT.find((a) => a.id === id) || ACT[1];
  function actIdFromBreed(pet) {
    const breedAct = (Store.breed(pet) || {}).activity || "";
    const found = ACT.find((a) => a.breed === breedAct);
    return found ? found.id : "mid";
  }
  const curAct = (pet) => actById(ui.actId || actIdFromBreed(pet));

  /* Питомец с учётом ползунков панели — чтобы расчёт реагировал без правки профиля. */
  function calcPet(pet) {
    const w = ui.weight == null ? (+pet.weight || 5) : ui.weight;
    const st = ui.sterilized == null ? !!pet.sterilized : ui.sterilized;
    return Object.assign({}, pet, { weight: w, sterilized: st });
  }
  const portionOf = (pet, k) => Store.portion(calcPet(pet), k);
  /* Значения для <input type="number"> — только точка, иначе браузер обнулит поле. */
  const dec = (v) => String(Math.round((+v || 0) * 10) / 10);

  const ingById = (id) => D.ingredients.find((i) => i.id === id) || { id, name: id, emoji: "🥄" };
  const ingName = (id) => ingById(id).name;
  const stageName = (id) => (D.ageStages.find((s) => s.id === id) || { name: "любая" }).name;
  function sizeLabel(pet) {
    if (pet.species === "cat") return "кошка";
    return { small: "мелкая порода", medium: "средняя порода", large: "крупная порода" }[pet.size] || "средняя порода";
  }
  function allergyList(pet) {
    return (pet.allergies || []).map((a) => String(a).toLowerCase().trim()).filter(Boolean);
  }
  function allergyHits(pet, names) {
    const al = allergyList(pet);
    if (!al.length) return [];
    return names.filter((n) => {
      const low = String(n).toLowerCase();
      return al.some((a) => low.includes(a) || a.includes(low));
    });
  }
  function stars(rating) {
    const full = Math.max(0, Math.min(5, Math.round(+rating || 0)));
    return `<span title="${esc(fmt.num(rating, 1))} из 5" style="color:#FFB300;letter-spacing:1px">${"★".repeat(full)}<span style="color:#D7DEE7">${"☆".repeat(5 - full)}</span></span>`;
  }
  const kpi = (icon, value, label, kind) =>
    `<div class="kpi ${kind || ""}"><span class="k-ico">${icon}</span><div><div class="k-value">${value}</div><div class="k-label">${esc(label)}</div></div></div>`;

  function tabBar(tab) {
    return `<div class="chip-row mb-2">${TABS.map((t) =>
      `<button class="tag ${t.id === tab ? "active" : ""}" data-act="hub.open" data-panel="nutrition" data-tab="${t.id}">${t.emoji} ${esc(t.name)}</button>`
    ).join("")}</div>`;
  }

  function kpiRow(pet) {
    const norm = Store.portion(pet);
    const today = fmt.today();
    const todayMeals = Store.bucket("meals", pet.id).filter((m) => m.date === today);
    const eaten = todayMeals.reduce((s, m) => s + (+m.grams || 0), 0);
    const pct = norm.grams ? Math.round((eaten / norm.grams) * 100) : 0;
    const kind = !pct ? "" : (pct < 90 || pct > 110) ? "orange" : "green";
    return `<div class="kpi-row mb-2">
      ${kpi("🎯", norm.grams + " г", "Норма в день", "")}
      ${kpi("🍽", eaten + " г", "Съедено сегодня", kind)}
      ${kpi("📊", pct + "%", "От нормы", kind)}
      ${kpi("⏱", String(todayMeals.length), "Кормлений сегодня", "")}
    </div>`;
  }

  /* ============================================================ 1. ПОРЦИИ КОРМА */
  function renderPortion(pet) {
    const breed = Store.breed(pet);
    const stage = Store.ageStage(pet);
    const act = curAct(pet);
    const w = calcPet(pet).weight;
    const p = portionOf(pet, act.k);
    const per = Math.max(1, Math.round(p.grams / Math.max(1, p.meals)));
    const dev = breed.weight ? (w - breed.weight) / breed.weight : 0;
    const devPct = Math.round(Math.abs(dev) * 100);

    const weightWarn = Math.abs(dev) > 0.15
      ? `<div class="${dev > 0 ? "danger-box" : "hint-box"} mt-2">
           <b>${dev > 0 ? "⚠️ Вес выше породной нормы" : "ℹ️ Вес ниже породной нормы"}</b><br>
           Для породы «${esc(breed.name)}» типичный вес — ${fmt.num(breed.weight, 1)} кг, у ${esc(pet.name)} — ${fmt.num(w, 1)} кг
           (отклонение ${devPct}%). ${dev > 0 ? "Снизьте порцию на 10–15% и добавьте активность." : "Проверьте, не худеет ли питомец, и покажите его ветеринару."}
         </div>`
      : `<div class="ok-box mt-2">✅ Вес ${fmt.num(w, 1)} кг близок к породной норме ${fmt.num(breed.weight, 1)} кг (отклонение ${devPct}%).</div>`;

    const stageHint = stage.id !== "adult"
      ? `<p class="muted small mt-1">Для стадии «${esc(stage.name)}» коэффициент фиксирован (${fmt.num(act.k, 1)} → ${stage.id === "puppy" ? "2,8" : stage.id === "junior" ? "2,0" : stage.id === "senior" ? "1,15" : "1,05"}), поэтому активность влияет слабее.</p>`
      : (calcPet(pet).sterilized ? `<p class="muted small mt-1">Учтена стерилизация: коэффициент снижен на 0,15.</p>` : "");

    const chartData = ACT.map((a) => {
      const g = portionOf(pet, a.k).grams;
      return { label: a.name + " (" + fmt.num(a.k, 1) + ")", short: fmt.num(a.k, 1), value: g, color: a.id === act.id ? "#2C5F8D" : "#4CAF50" };
    });

    return `
      ${card({
        title: "Расчёт порции", icon: "⚖️",
        body: `
          <div class="grid grid-3">
            <div>
              ${field({ label: "Вес питомца, кг", type: "number", id: "n-weight", value: dec(w), attrs: 'min="0.5" max="120" step="0.1"' })}
              <input type="range" id="n-weight-range" min="1" max="${Math.max(30, Math.ceil(w * 2))}" step="0.1" value="${w}" style="width:100%" aria-label="Вес питомца">
            </div>
            <div>
              ${field({
                label: "Активность", type: "select", id: "n-act", value: act.id,
                options: ACT.map((a) => ({ value: a.id, label: a.emoji + " " + a.name + " · коэффициент " + fmt.num(a.k, 1) }))
              })}
              ${field({ label: "Стерилизован", type: "checkbox", id: "n-ster", checked: calcPet(pet).sterilized, checkLabel: "Да, стерилизован(а)" })}
            </div>
            <div>
              <div class="stat">
                <div class="stat-ico">${pet.emoji || "🐾"}</div>
                <div class="stat-main">
                  <div class="stat-value">${esc(pet.name)}</div>
                  <div class="stat-label">${esc(breed.name)} · ${esc(Store.ageLabel(pet))}</div>
                  <div class="stat-hint">Стадия: ${esc(stage.name)} · ${esc(stage.checkups)}</div>
                </div>
              </div>
            </div>
          </div>
          <div class="kv mt-2">
            <div class="kv-row"><span class="kv-k">Стадия возраста</span><span class="kv-v">${esc(stage.emoji || "")} ${esc(stage.name)} — ${esc(stage.focus)}</span></div>
            <div class="kv-row"><span class="kv-k">Активность породы</span><span class="kv-v">${esc((breed.activity || "средняя"))}</span></div>
            <div class="kv-row"><span class="kv-k">Кормлений в день</span><span class="kv-v">${p.meals}</span></div>
          </div>
          ${weightWarn}
          ${stageHint}
        `,
        foot: `
          <button class="btn btn-primary" data-act="nutrition.meal">🍽 Записать кормление</button>
          <button class="btn btn-green" data-act="nutrition.saveNorm">💾 Сохранить норму в профиль</button>
          <button class="btn btn-ghost" data-act="nutrition.recalc">🔄 Пересчитать</button>
        `
      })}
      <div class="panel-grid cols-3 mt-2">
        ${card({ title: "Суточная норма", icon: "🥣", body: `
          <div style="font-size:2.6rem;font-weight:800;line-height:1.1">${p.grams} <span class="small muted">г</span></div>
          <div class="muted small">${p.kcal} ккал в день · около ${per} г на кормление (${p.meals} раза)</div>
          <div class="muted small mt-1">Проверьте норму на вкладке «Дневник» — там видно, сколько съедено сегодня.</div>
        ` })}
        ${card({ title: "Энергия покоя (RER)", icon: "🔥", body: `
          <div style="font-size:2.6rem;font-weight:800;line-height:1.1">${p.rer} <span class="small muted">ккал</span></div>
          <div class="muted small">RER = 70 × вес<sup>0,75</sup>. Рабочий коэффициент — ${fmt.num(act.k, 1)} (${esc(act.name.toLowerCase())}).</div>
        ` })}
        ${card({ title: "Ккал и кормления", icon: "⏱", body: `
          <div class="kv">
            <div class="kv-row"><span class="kv-k">Ккал в день</span><span class="kv-v">${p.kcal} ккал</span></div>
            <div class="kv-row"><span class="kv-k">Кормлений</span><span class="kv-v">${p.meals} раза</span></div>
            <div class="kv-row"><span class="kv-k">Грамм на кормление</span><span class="kv-v">${per} г</span></div>
            <div class="kv-row"><span class="kv-k">Ккал на кормление</span><span class="kv-v">${Math.round(p.kcal / Math.max(1, p.meals))} ккал</span></div>
          </div>
        ` })}
      </div>
      <div class="mt-2">
        ${card({
          title: "Порция при разной активности", icon: "📊",
          body: Charts.bars(chartData, { unit: " г", target: p.grams, color: "#4CAF50" }) +
            `<p class="muted small mt-1">Синим выделен выбранный режим. Целевая линия — ${p.grams} г в сутки.</p>`
        })}
      </div>`;
  }

  /* ========================================================= 2. ПОДБОР КОРМА */
  function matchFood(food, pet, stage) {
    const al = allergyList(pet);
    let score = 55;
    const reasons = [];
    const bad = (food.allergens || []).filter((a) => {
      const low = String(a).toLowerCase();
      return al.some((p) => low.includes(p) || p.includes(low));
    });
    if (bad.length) { score -= 30 * bad.length; reasons.push({ ok: false, text: "Содержит аллерген: " + bad.join(", ") }); }
    else if (al.length) { score += 12; reasons.push({ ok: true, text: "Без аллергенов питомца (" + al.join(", ") + ")" }); }
    else { score += 8; reasons.push({ ok: true, text: "Аллергии в профиле не указаны" }); }

    const grainFree = !(food.allergens || []).some((a) => String(a).toLowerCase().includes("злак"));
    if (grainFree) reasons.push({ ok: true, text: "Без злаков" });

    const stageOk = food.stage === "any" || food.stage === stage.id;
    if (stageOk) { score += 12; reasons.push({ ok: true, text: "Для стадии «" + stage.name + "»" }); }
    else { score -= 18; reasons.push({ ok: false, text: "Корм для стадии «" + stageName(food.stage) + "»" }); }

    const sizeOk = (food.sizes || []).includes(pet.size) || (pet.species === "cat" && (food.sizes || []).includes("cat"));
    if (sizeOk) { score += 12; reasons.push({ ok: true, text: "Подходит по размеру: " + sizeLabel(pet) }); }
    else { score -= 20; reasons.push({ ok: false, text: "Не для размера: " + sizeLabel(pet) }); }

    score += Math.round(((+food.rating || 4.5) - 4.5) * 10);
    return { score: Math.max(0, Math.min(100, score)), reasons, bad, grainFree, stageOk, sizeOk };
  }

  function foodById(id) { return D.foods.find((f) => f.id === id); }
  const perKg = (food) => Math.max(1, Math.round(food.price / Math.max(0.05, food.kg)));

  function renderPicker(pet) {
    const stage = Store.ageStage(pet);
    const f = ui.picker;
    const tagBtn = (key, label) => `<button class="tag ${f[key] ? "active" : ""}" data-act="nutrition.pfilter" data-key="${key}">${label}</button>`;
    const sortBtn = (key, label) => `<button class="tag ${f.sort === key ? "active" : ""}" data-act="nutrition.psort" data-sort="${key}">${label}</button>`;

    let items = D.foods.map((food) => ({ food, m: matchFood(food, pet, stage) }));
    if (f.noAllergens) items = items.filter((i) => !i.m.bad.length);
    if (f.grainFree) items = items.filter((i) => i.m.grainFree);
    if (f.stage) items = items.filter((i) => i.m.stageOk);
    if (f.hit) items = items.filter((i) => (i.food.tags || []).includes("хит"));
    if (f.size) items = items.filter((i) => i.m.sizeOk);
    items = items.filter((i) => perKg(i.food) >= (+f.min || 0) && perKg(i.food) <= (+f.max || 99999));

    if (f.sort === "price") items.sort((a, b) => perKg(a.food) - perKg(b.food));
    else if (f.sort === "price-desc") items.sort((a, b) => perKg(b.food) - perKg(a.food));
    else if (f.sort === "rating") items.sort((a, b) => (b.food.rating || 0) - (a.food.rating || 0));
    else items.sort((a, b) => b.m.score - a.m.score);

    const bestId = items.length ? items[0].food.id : null;

    const filters = card({
      title: "Фильтры и сортировка", icon: "🎛",
      body: `
        <div class="chip-row mb-2">
          ${tagBtn("noAllergens", "🚫 Без аллергенов питомца")}
          ${tagBtn("grainFree", "🌾 Без злаков")}
          ${tagBtn("stage", "🎂 Для стадии «" + esc(stage.name) + "»")}
          ${tagBtn("hit", "🔥 Хиты")}
          ${tagBtn("size", "📏 По размеру (" + esc(sizeLabel(pet)) + ")")}
        </div>
        <div class="chip-row mb-2">
          <span class="muted small">Сортировка:</span>
          ${sortBtn("match", "По совпадению")}
          ${sortBtn("price", "Сначала дешёвые")}
          ${sortBtn("price-desc", "Сначала дорогие")}
          ${sortBtn("rating", "По рейтингу")}
        </div>
        <div class="grid grid-2">
          ${field({ label: "Цена за кг, от", type: "number", id: "np-min", value: f.min, attrs: 'min="0" step="50"' })}
          ${field({ label: "Цена за кг, до", type: "number", id: "np-max", value: f.max, attrs: 'min="0" step="50"' })}
        </div>
        <p class="muted small">Всего в каталоге ${D.foods.length} кормов, после фильтров — ${items.length}.</p>
      `,
      foot: `<button class="btn btn-ghost btn-sm" data-act="nutrition.preset">♻️ Сбросить фильтры</button>
             <span class="muted small">Аллергии ${esc(pet.name)}: ${esc((pet.allergies || []).join(", ") || "не указаны")}</span>`
    });

    let listHtml;
    if (!D.foods.length) {
      listHtml = empty("🥣", "Каталог пуст", "Корма появятся позже.");
    } else if (!items.length) {
      listHtml = card({
        body: empty("🔍", "Ничего не подошло", "Ослабьте фильтры или расширьте диапазон цены.",
          `<button class="btn btn-primary" data-act="nutrition.preset">Сбросить фильтры</button>`)
      });
    } else {
      listHtml = `<div class="stack">${items.map(({ food, m }) => {
        const ideal = food.id === bestId && m.score >= 75;
        const reasonsHtml = `<ul class="list ${m.score >= 60 ? "tick" : "dot"}" style="margin-top:8px">
          ${m.reasons.map((r) => `<li>${r.ok ? "✅" : "⛔"} <span>${esc(r.text)}</span></li>`).join("")}
        </ul>`;
        return card({
          title: food.name + " · " + food.kg + " кг", icon: "🥣",
          tools: `${ideal ? badge("Идеально для " + pet.name, "ok") : ""} ${badge(m.score + "% совпадение", m.score >= 75 ? "ok" : m.score >= 50 ? "warn" : "danger")}`,
          body: `
            <div class="grid grid-3">
              <div class="kv">
                <div class="kv-row"><span class="kv-k">Бренд</span><span class="kv-v">${esc(food.brand)}</span></div>
                <div class="kv-row"><span class="kv-k">Тип</span><span class="kv-v">${esc(food.kind)}</span></div>
                <div class="kv-row"><span class="kv-k">Стадия</span><span class="kv-v">${esc(stageName(food.stage))}</span></div>
              </div>
              <div class="kv">
                <div class="kv-row"><span class="kv-k">Цена</span><span class="kv-v">${fmt.money(food.price)}</span></div>
                <div class="kv-row"><span class="kv-k">Цена за кг</span><span class="kv-v">${fmt.money(perKg(food))}</span></div>
                <div class="kv-row"><span class="kv-k">Б/Ж</span><span class="kv-v">${food.protein}% / ${food.fat}%</span></div>
              </div>
              <div class="kv">
                <div class="kv-row"><span class="kv-k">Рейтинг</span><span class="kv-v">${stars(food.rating)} ${fmt.num(food.rating, 1)}</span></div>
                <div class="kv-row"><span class="kv-k">Теги</span><span class="kv-v">${esc((food.tags || []).join(", ") || "—")}</span></div>
                <div class="kv-row"><span class="kv-k">Размеры</span><span class="kv-v">${esc((food.sizes || []).join(", "))}</span></div>
              </div>
            </div>
            ${progress(m.score, m.score >= 75 ? "green" : m.score >= 50 ? "orange" : "red")}
            ${reasonsHtml}
          `,
          foot: `
            <button class="btn btn-sm btn-primary" data-act="nutrition.cart" data-food="${food.id}">🛒 В корзину</button>
            <button class="btn btn-sm btn-ghost" data-act="nutrition.food" data-food="${food.id}">Подробнее</button>
          `
        });
      }).join("")}</div>`;
    }

    return filters + `<div class="mt-2">${listHtml}</div>`;
  }

  /* ============================================== 3–4. РЕЦЕПТЫ И ЛАКОМСТВА */
  function ingredientChips() {
    return `<div class="chip-row">${D.ingredients.map((i) =>
      `<button class="tag ${ui.picked[i.id] ? "active" : ""}" data-act="nutrition.ing" data-id="${i.id}">${i.emoji} ${esc(i.name)}</button>`
    ).join("")}</div>`;
  }

  function recipeCards(pet, type) {
    const pickCount = D.ingredients.filter((i) => ui.picked[i.id]).length;
    const compatible = D.recipes.filter((r) => r.type === type && (r.for === "both" || r.for === pet.species));
    const filtered = type === "treat" && ui.treatFor !== "all"
      ? compatible.filter((r) => r.for === ui.treatFor || r.for === "both")
      : compatible;
    const chosen = type === "treat" && ui.favOnly ? filtered.filter((r) => isFav(r.id)) : filtered;

    const rows = chosen.map((r) => {
      const names = r.ingredients.map(ingName);
      const hits = allergyHits(pet, names);
      const missing = r.ingredients.filter((id) => !ui.picked[id]);
      const used = r.ingredients.filter((id) => ui.picked[id]);
      return { r, names, hits, missing, used, full: missing.length === 0, safe: hits.length === 0 };
    });
    const full = rows.filter((x) => x.full);
    const partial = rows.filter((x) => !x.full && x.used.length > 0);
    const rest = rows.filter((x) => !x.full && !x.used.length);

    const body = (x) => `
      <div class="row-between mb-1">
        <div class="chip-row">
          ${badge("⏱ " + x.r.minutes + " мин", "info")}
          ${badge("🔥 " + x.r.kcal + " ккал", "muted")}
          ${badge(x.r.for === "both" ? "🐾 Собакам и кошкам" : x.r.for === "dog" ? "🐕 Для собак" : "🐈 Для кошек", "info")}
          ${x.safe ? badge("Подходит по аллергиям", "ok") : badge("Аллергены: " + x.hits.join(", "), "danger")}
        </div>
      </div>
      <div class="small muted mb-1">Ингредиенты: ${x.r.ingredients.map((id) => (ui.picked[id] ? "✅ " : "▫️ ") + esc(ingName(id))).join(" · ")}</div>
      ${x.missing.length ? `<div class="hint-box mb-2">Не хватает: <b>${esc(x.missing.map(ingName).join(", "))}</b></div>` : `<div class="ok-box mb-2">Все ингредиенты есть дома 🎉</div>`}
      <ol class="small" style="margin:0;padding-left:20px">${x.r.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
      ${x.r.note ? `<p class="muted small mt-1">📝 ${esc(x.r.note)}</p>` : ""}`;

    const foot = (x) => `
      <button class="btn btn-sm btn-primary" data-act="nutrition.cooked" data-id="${x.r.id}">👩‍🍳 Приготовил</button>
      <button class="btn btn-sm btn-ghost" data-act="nutrition.plan" data-id="${x.r.id}">📔 В дневник</button>
      ${type === "treat" ? `<button class="btn btn-sm ${isFav(x.r.id) ? "btn-orange" : "btn-soft"}" data-act="nutrition.fav" data-id="${x.r.id}">${isFav(x.r.id) ? "⭐ В избранном" : "☆ Сделать избранным"}</button>` : ""}`;

    if (!rows.length) {
      const favEmpty = type === "treat" && ui.favOnly;
      return empty("🍪", favEmpty ? "В избранном пока пусто" : "Нет подходящих рецептов",
        favEmpty ? "Отметьте лакомство звёздочкой — оно появится здесь." : "Для этого вида питомца рецептов пока нет.",
        favEmpty
          ? `<button class="btn btn-primary" data-act="nutrition.favOnly">Показать все лакомства</button>`
          : `<button class="btn btn-ghost" data-act="nutrition.ingAll">Отметить все продукты</button>`);
    }

    let out = "";
    if (!ui.tried) {
      out += `<div class="hint-box mb-2">Отметьте продукты, которые есть дома${pickCount ? " (уже выбрано: " + pickCount + ")" : ""}, и нажмите <b>«Подобрать блюда»</b>. Мы покажем блюда, которые можно приготовить прямо сейчас, и подскажем, чего не хватает.</div>`;
    } else if (!pickCount) {
      out += `<div class="hint-box mb-2">Ни один продукт не отмечен — показываем все рецепты. Отметьте то, что есть дома, чтобы получить точные совпадения.</div>`;
    } else {
      out += `<div class="ok-box mb-2">Готовить можно <b>${full.length}</b> ${fmt.plural(full.length, "блюдо", "блюда", "блюд")} прямо сейчас, ещё ${partial.length} — с частичным набором продуктов.</div>`;
    }

    if (ui.tried) {
      if (full.length) {
        out += `<h3 class="mb-1">✅ Можно приготовить сейчас (${full.length})</h3><div class="grid grid-2 mb-2">${full.map((x) =>
          card({ title: x.r.name, icon: "🥘", body: body(x), foot: foot(x) })).join("")}</div>`;
      }
      if (partial.length) {
        out += `<h3 class="mb-1 mt-2">🟡 Не хватает пары продуктов (${partial.length})</h3><div class="grid grid-2 mb-2">${partial.map((x) =>
          card({ title: x.r.name, icon: "🟡", body: body(x), foot: foot(x) })).join("")}</div>`;
      }
      if (!full.length && !partial.length) {
        out += empty("🧺", "Пусто на кухне", "Отметьте продукты, которые есть дома — и мы подберём блюдо.",
          `<button class="btn btn-primary" data-act="nutrition.ingAll">Отметить все продукты</button>`);
      }
      if (rest.length) {
        const restHtml = rest.filter((x) => x.r.ingredients.length).map((x) =>
          `<button class="tag" data-act="nutrition.ing" data-id="${esc(x.r.ingredients[0])}">➕ ${esc(x.r.name)} — нет продуктов</button>`).join("");
        out += `<div class="muted small mt-2 mb-1">Ещё ${rest.length} ${fmt.plural(rest.length, "рецепт", "рецепта", "рецептов")} недоступны — нет ни одного ингредиента. Нажмите, чтобы добавить первый продукт в список:</div><div class="chip-row">${restHtml}</div>`;
      }
    }
    return out;
  }

  const isFav = (id) => (S().settings.favoriteTreats || []).indexOf(id) >= 0;

  function renderRecipes(pet) {
    const pickCount = D.ingredients.filter((i) => ui.picked[i.id]).length;
    return card({
      title: "Что есть дома", icon: "🧺",
      tools: badge("Выбрано: " + pickCount + " из " + D.ingredients.length, pickCount ? "ok" : "muted"),
      body: ingredientChips() +
        `<p class="muted small mt-2">Совместимость с видом: ${pet.species === "cat" ? "🐈 кошка" : "🐕 собака"}. Аллергии: ${esc((pet.allergies || []).join(", ") || "не указаны")}.</p>`,
      foot: `
        <button class="btn btn-primary" data-act="nutrition.pick">🥘 Подобрать блюда</button>
        <button class="btn btn-ghost" data-act="nutrition.ingAll">Отметить всё</button>
        <button class="btn btn-ghost" data-act="nutrition.ingNone">Снять всё</button>
      `
    }) + `<div class="mt-2">${recipeCards(pet, "meal")}</div>`;
  }

  function renderTreats(pet) {
    const pickCount = D.ingredients.filter((i) => ui.picked[i.id]).length;
    const forBtn = (key, label) => `<button class="tag ${ui.treatFor === key ? "active" : ""}" data-act="nutrition.tfor" data-for="${key}">${label}</button>`;
    const favs = (S().settings.favoriteTreats || []).filter((id) => D.recipes.some((r) => r.id === id && r.type === "treat"));
    return card({
      title: "Лакомства из того, что есть дома", icon: "🍪",
      tools: badge("В избранном: " + favs.length, favs.length ? "ok" : "muted"),
      body: `
        <div class="chip-row mb-2">
          ${forBtn("all", "🐾 Всем")}${forBtn("dog", "🐕 Для собак")}${forBtn("cat", "🐈 Для кошек")}
          <button class="tag ${ui.favOnly ? "active" : ""}" data-act="nutrition.favOnly">⭐ Только избранные (${favs.length})</button>
        </div>
        ${ingredientChips()}
        <p class="muted small mt-2">Лакомства не должны превышать 10% суточной калорийности (${Math.round(Store.portion(pet).kcal * 0.1)} ккал для ${esc(pet.name)}). Выбрано продуктов: ${pickCount}.</p>
      `,
      foot: `
        <button class="btn btn-primary" data-act="nutrition.pick">🍪 Подобрать лакомства</button>
        <button class="btn btn-ghost" data-act="nutrition.ingAll">Отметить всё</button>
      `
    }) + `<div class="mt-2">${recipeCards(pet, "treat")}</div>`;
  }

  /* ========================================================== 5. ДНЕВНИК */
  function renderJournal(pet) {
    const norm = Store.portion(pet);
    const all = Store.bucket("meals", pet.id).slice().sort((a, b) => String(b.date + (b.time || "")).localeCompare(String(a.date + (a.time || ""))));
    const today = fmt.today();
    const todayMeals = all.filter((m) => m.date === today);
    const eaten = todayMeals.reduce((s, m) => s + (+m.grams || 0), 0);
    const kcal = Math.round(eaten * 3.6);
    const pct = norm.grams ? Math.round((eaten / norm.grams) * 100) : 0;
    const status = !all.length ? { text: "Нет данных", kind: "muted" }
      : pct < 90 ? { text: "Недокорм (" + pct + "% нормы)", kind: "warn" }
        : pct > 110 ? { text: "Перекорм (" + pct + "% нормы)", kind: "danger" }
          : { text: "Норма (" + pct + "% нормы)", kind: "ok" };

    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = Store.iso(i);
      const g = all.filter((m) => m.date === d).reduce((s, m) => s + (+m.grams || 0), 0);
      days.push({ label: d, short: fmt.short(d), value: g, color: g > norm.grams ? "#FB8C00" : "#4CAF50" });
    }

    const foodOptions = D.foods.map((f) => ({ value: f.name, label: f.name + " (" + f.kg + " кг)" }));
    foodOptions.push({ value: "Домашняя еда", label: "🏠 Домашняя еда" });
    foodOptions.push({ value: "Лакомство", label: "🍪 Лакомство" });

    const formCard = card({
      title: "Добавить запись", icon: "➕",
      body: `<div class="grid grid-4">
          ${field({ label: "Дата", type: "date", id: "nj-date", value: today })}
          ${field({ label: "Корм", type: "select", id: "nj-food", options: foodOptions, value: foodOptions[0].value })}
          ${field({ label: "Граммы", type: "number", id: "nj-grams", value: Math.round(norm.grams / Math.max(1, norm.meals)), attrs: 'min="1" step="5"' })}
          ${field({ label: "Время", type: "time", id: "nj-time", value: hhmm() })}
        </div>
        <p class="muted small">Норма: ${norm.grams} г и ${norm.kcal} ккал в день (${norm.meals} кормления). Ккал считаем как 3,6 ккал на грамм сухого корма.</p>`,
      foot: `<button class="btn btn-primary" data-act="nutrition.addMeal">📔 Записать в дневник</button>
             <button class="btn btn-ghost" data-act="nutrition.meal">⚡ Быстрая запись по норме</button>`
    });

    const statsCard = card({
      title: "Сегодня", icon: "📅",
      tools: badge(status.text, status.kind),
      body: `
        <div class="grid grid-3">
          ${PL.stat({ icon: "🥣", value: eaten + " г", label: "Съедено", kind: pct > 110 ? "warn" : pct >= 90 ? "ok" : pct ? "warn" : "" })}
          ${PL.stat({ icon: "🔥", value: kcal + " ккал", label: "Калорий" })}
          ${PL.stat({ icon: "🎯", value: norm.grams + " г", label: "Норма" })}
        </div>
        ${progress(norm.grams ? Math.round((eaten / norm.grams) * 100) : 0, pct > 110 ? "orange" : pct >= 90 ? "green" : "orange")}
        <p class="muted small mt-1">${eaten === 0 ? "Записей за сегодня нет — добавьте кормление." : "Баланс: " + (eaten - norm.grams >= 0 ? "+" : "") + (eaten - norm.grams) + " г к норме."}</p>
      `
    });

    const chartCard = card({
      title: "Последние 7 дней", icon: "📊",
      body: Charts.bars(days, { unit: " г", target: norm.grams, color: "#4CAF50" }) +
        `<p class="muted small mt-1">Оранжевые столбцы — дни с перекормом больше нормы.</p>`
    });

    const journalCard = card({
      title: "Дневник кормления", icon: "📔",
      tools: badge(all.length + " " + fmt.plural(all.length, "запись", "записи", "записей"), "muted"),
      body: all.length ? table(
        ["Дата", "Время", "Корм", "Граммы", "Ккал", "Действия"],
        all.slice(0, 60).map((m) => [
          esc(fmt.short(m.date)),
          esc(m.time || "—"),
          `${m.note && m.note.indexOf("рецепт") >= 0 ? "🥘 " : ""}${esc(m.food || "—")}`,
          `<b>${fmt.num(m.grams, 0)} г</b>`,
          fmt.num(Math.round((+m.grams || 0) * 3.6), 0),
          `<button class="btn btn-xs btn-danger" data-act="nutrition.delMeal" data-id="${esc(m.id)}">Удалить</button>`
        ])
      ) : empty("📔", "Дневник пуст", "Запишите первое кормление — и увидите, как съеденное соотносится с нормой.",
        `<button class="btn btn-primary" data-act="nutrition.meal">Записать кормление</button>`)
    });

    return `<div class="panel-grid cols-2">${formCard}${statsCard}</div><div class="mt-2">${chartCard}</div><div class="mt-2">${journalCard}</div>`;
  }

  /* ================================================================= регистрация */
  window.Panels.register("nutrition", {
    title: "Питание",
    icon: "🍽",
    desc: "Порции, подбор корма, рецепты и лакомства",
    render(view, ctx) {
      const pet = (ctx && ctx.pet) || Store.pet();
      const tab = (ctx && ctx.tab) || "portion";
      syncPet(pet);

      const known = TABS.some((t) => t.id === tab);
      const active = known ? tab : "portion";

      let body;
      if (active === "picker") body = renderPicker(pet);
      else if (active === "recipes") body = renderRecipes(pet);
      else if (active === "treats") body = renderTreats(pet);
      else if (active === "journal") body = renderJournal(pet);
      else body = renderPortion(pet);

      view.innerHTML = `
        <div class="panel">
          <div class="panel-head">
            <div>
              <h2>🍽 Питание · ${esc(pet.name)}</h2>
              <p>${esc(Store.breed(pet).name)} · ${esc(Store.ageLabel(pet))} · ${fmt.num(pet.weight, 1)} кг · аллергии: ${esc((pet.allergies || []).join(", ") || "нет")}</p>
            </div>
            <div class="panel-tools">
              <button class="btn btn-sm btn-primary" data-act="nutrition.meal">🍽 Записать кормление</button>
            </div>
          </div>
          ${kpiRow(pet)}
          ${tabBar(active)}
          ${body}
        </div>`;

      /* --- чисто визуальные элементы и поля без кнопок --- */
      if (active === "portion") {
        const wInput = $("#n-weight", view);
        const wRange = $("#n-weight-range", view);
        const applyWeight = (v, live) => {
          ui.weight = Math.max(0.5, v);
          if (wInput) wInput.value = dec(ui.weight);
          if (wRange) wRange.value = ui.weight;
          if (!live) refresh();
        };
        if (wInput) wInput.addEventListener("change", () => {
          const v = parseFloat(String(wInput.value).replace(",", "."));
          applyWeight(isNaN(v) ? (+pet.weight || 5) : v, false);
        });
        if (wRange) {
          wRange.addEventListener("input", () => applyWeight(parseFloat(wRange.value) || 5, true));
          wRange.addEventListener("change", () => applyWeight(parseFloat(wRange.value) || 5, false));
        }
        bind(view, "#n-act", "change", (e) => { ui.actId = e.target.value; refresh(); });
        bind(view, "#n-ster", "change", (e) => { ui.sterilized = !!e.target.checked; refresh(); });
      }

      if (active === "picker") {
        const readRange = () => {
          ui.picker.min = num("np-min", 0);
          ui.picker.max = num("np-max", 4000);
          refresh();
        };
        bind(view, "#np-min", "change", readRange);
        bind(view, "#np-max", "change", readRange);
      }
    }
  });

  /* ================================================================== действия */
  function mealModal(presetGrams) {
    const pet = Store.pet();
    const norm = Store.portion(pet);
    const foodOptions = D.foods.map((f) => ({ value: f.name, label: f.name + " (" + f.kg + " кг)" }));
    foodOptions.push({ value: "Домашняя еда", label: "🏠 Домашняя еда" });
    const grams = Math.max(1, Math.round(presetGrams || norm.grams / Math.max(1, norm.meals)));
    modal({
      title: "Записать кормление", icon: "🍽",
      body: `
        <div class="grid grid-2">
          ${field({ label: "Дата", type: "date", id: "nm-date", value: fmt.today() })}
          ${field({ label: "Время", type: "time", id: "nm-time", value: hhmm() })}
        </div>
        ${field({ label: "Корм", type: "select", id: "nm-food", options: foodOptions, value: foodOptions[0].value })}
        ${field({ label: "Граммы", type: "number", id: "nm-grams", value: grams, attrs: 'min="1" step="5"' })}
        <p class="muted small">Норма ${esc(pet.name)} — ${norm.grams} г и ${norm.kcal} ккал в день, это ${norm.meals} кормления по ${Math.round(norm.grams / Math.max(1, norm.meals))} г.</p>`,
      actions: [
        { label: "Отмена" },
        {
          label: "Записать", kind: "primary", onClick: (wrap) => {
            const g = (function () {
              const el = wrap.querySelector("#nm-grams");
              const v = parseFloat(String(el ? el.value : "").replace(",", "."));
              return isNaN(v) ? 0 : v;
            })();
            if (g <= 0) { toast("Укажите количество граммов", "warn"); return false; }
            const dateEl = wrap.querySelector("#nm-date");
            const timeEl = wrap.querySelector("#nm-time");
            const foodEl = wrap.querySelector("#nm-food");
            Store.push("meals", {
              id: Store.uid("me"),
              date: (dateEl && dateEl.value) || fmt.today(),
              time: (timeEl && timeEl.value) || hhmm(),
              food: (foodEl && foodEl.value) || "Домашняя еда",
              grams: Math.round(g)
            }, pet.id);
            toast("Кормление записано: " + Math.round(g) + " г", "ok");
            return true;
          }
        }
      ]
    });
  }

  function foodModal(id) {
    const food = foodById(id);
    if (!food) { toast("Корм не найден", "error"); return; }
    const pet = Store.pet();
    const stage = Store.ageStage(pet);
    const m = matchFood(food, pet, stage);
    modal({
      title: food.name, icon: "🥣", wide: true,
      body: `
        <div class="grid grid-2">
          <div class="kv">
            <div class="kv-row"><span class="kv-k">Бренд</span><span class="kv-v">${esc(food.brand)}</span></div>
            <div class="kv-row"><span class="kv-k">Тип корма</span><span class="kv-v">${esc(food.kind)}</span></div>
            <div class="kv-row"><span class="kv-k">Вес упаковки</span><span class="kv-v">${fmt.num(food.kg, 2)} кг</span></div>
            <div class="kv-row"><span class="kv-k">Стадия</span><span class="kv-v">${esc(stageName(food.stage))}</span></div>
            <div class="kv-row"><span class="kv-k">Белки / жиры</span><span class="kv-v">${food.protein}% / ${food.fat}%</span></div>
          </div>
          <div class="kv">
            <div class="kv-row"><span class="kv-k">Цена</span><span class="kv-v">${fmt.money(food.price)}</span></div>
            <div class="kv-row"><span class="kv-k">Цена за кг</span><span class="kv-v">${fmt.money(perKg(food))}</span></div>
            <div class="kv-row"><span class="kv-k">Рейтинг</span><span class="kv-v">${stars(food.rating)} ${fmt.num(food.rating, 1)}</span></div>
            <div class="kv-row"><span class="kv-k">Размеры</span><span class="kv-v">${esc((food.sizes || []).join(", "))}</span></div>
            <div class="kv-row"><span class="kv-k">Совпадение</span><span class="kv-v">${m.score}%</span></div>
          </div>
        </div>
        <h4 class="mt-2 mb-1">Состав и теги</h4>
        <div class="chip-row">${(food.tags || []).map((t) => badge(t, "info")).join("") || badge("без тегов", "muted")}</div>
        <p class="muted small mt-1">Аллергены: ${esc((food.allergens || []).join(", ") || "нет")}.</p>
        <h4 class="mt-2 mb-1">Почему подходит или нет</h4>
        <ul class="list">${m.reasons.map((r) => `<li>${r.ok ? "✅" : "⛔"} <span>${esc(r.text)}</span></li>`).join("")}</ul>
        <p class="muted small mt-1">Суточная норма такого корма для ${esc(pet.name)} — около ${Store.portion(pet).grams} г в день.</p>`,
      actions: [
        { label: "Закрыть" },
        {
          label: "В корзину", kind: "primary", onClick: () => {
            addToCart(food.id);
            toast(food.name + " добавлен в корзину", "ok");
            return true;
          }
        }
      ]
    });
  }

  function addToCart(id) {
    const food = foodById(id);
    if (!food) return;
    Store.update((s) => {
      if (!Array.isArray(s.cart)) s.cart = [];
      s.cart.push({
        id: Store.uid("cart"), foodId: food.id, emoji: "🥣",
        name: food.name + " · " + food.kg + " кг", price: food.price, qty: 1
      });
    }, "cart");
  }

  function recipeById(id) { return D.recipes.find((r) => r.id === id); }

  function recordRecipe(recipe, grams, date, time, note) {
    const pet = Store.pet();
    Store.push("meals", {
      id: Store.uid("me"),
      date: date || fmt.today(),
      time: time || hhmm(),
      food: recipe.name,
      grams: Math.max(1, Math.round(grams)),
      note: note || ""
    }, pet.id);
  }

  Actions.registerAll({
    /* ---- порции ---- */
    "nutrition.recalc": () => {
      const pet = Store.pet();
      const w = num("n-weight", +pet.weight || 5);
      ui.weight = w > 0 ? w : (+pet.weight || 5);
      ui.actId = val("n-act") || ui.actId;
      ui.sterilized = isChk("n-ster");
      refresh();
      toast("Порция пересчитана", "ok");
    },
    "nutrition.saveNorm": () => {
      const pet = Store.pet();
      /* синхронизируем ui с тем, что сейчас видно на экране */
      const w = num("n-weight", +pet.weight || 5);
      if (w > 0) ui.weight = w;
      if (val("n-act")) ui.actId = val("n-act");
      if (document.getElementById("n-ster")) ui.sterilized = isChk("n-ster");
      const act = curAct(pet);
      const p = portionOf(pet, act.k);
      const per = Math.max(1, Math.round(p.grams / Math.max(1, p.meals)));
      Store.update((s) => {
        if (!s.settings) s.settings = {};
        s.settings.nutritionNorm = {
          petId: pet.id, grams: p.grams, kcal: p.kcal, rer: p.rer,
          meals: p.meals, perMeal: per, activity: act.name,
          weight: calcPet(pet).weight, updated: new Date().toISOString()
        };
      }, "settings");
      toast("Норма сохранена в профиль: " + p.grams + " г в день", "ok");
    },
    "nutrition.meal": () => {
      const pet = Store.pet();
      const p = portionOf(pet, curAct(pet).k);
      mealModal(Math.round(p.grams / Math.max(1, p.meals)));
    },

    /* ---- подбор корма ---- */
    "nutrition.pfilter": (ds) => {
      ui.picker[ds.key] = !ui.picker[ds.key];
      refresh();
    },
    "nutrition.psort": (ds) => { ui.picker.sort = ds.sort; refresh(); },
    "nutrition.preset": () => {
      ui.picker = { noAllergens: true, grainFree: false, stage: true, hit: false, size: true, sort: "match", min: 0, max: 4000 };
      refresh();
      toast("Фильтры сброшены", "info");
    },
    "nutrition.cart": (ds) => {
      const food = foodById(ds.food);
      if (!food) { toast("Корм не найден", "error"); return; }
      addToCart(ds.food);
      toast(food.name + " — в корзине (" + fmt.money(food.price) + ")", "ok");
    },
    "nutrition.food": (ds) => foodModal(ds.food),

    /* ---- рецепты и лакомства ---- */
    "nutrition.ing": (ds) => {
      ui.picked[ds.id] = !ui.picked[ds.id];
      refresh();
    },
    "nutrition.ingAll": () => {
      const all = {};
      D.ingredients.forEach((i) => { all[i.id] = true; });
      ui.picked = all;
      ui.tried = true;
      refresh();
      toast("Отмечены все продукты из справочника", "info");
    },
    "nutrition.ingNone": () => {
      ui.picked = {};
      ui.tried = false;
      refresh();
      toast("Выбор продуктов снят", "info");
    },
    "nutrition.pick": () => {
      ui.tried = true;
      refresh();
      const count = D.ingredients.filter((i) => ui.picked[i.id]).length;
      toast(count ? "Подобрали блюда из " + count + " " + fmt.plural(count, "продукта", "продуктов", "продуктов") : "Отметьте продукты, которые есть дома", count ? "ok" : "warn");
    },
    "nutrition.tfor": (ds) => { ui.treatFor = ds.for; ui.tried = true; refresh(); },
    "nutrition.favOnly": () => {
      ui.favOnly = !ui.favOnly;
      ui.tried = true;
      refresh();
      toast(ui.favOnly ? "Показаны только избранные лакомства" : "Показаны все лакомства", "info");
    },
    "nutrition.fav": (ds) => {
      const recipe = recipeById(ds.id);
      let added = false;
      Store.update((s) => {
        if (!s.settings) s.settings = {};
        if (!Array.isArray(s.settings.favoriteTreats)) s.settings.favoriteTreats = [];
        const i = s.settings.favoriteTreats.indexOf(ds.id);
        if (i >= 0) s.settings.favoriteTreats.splice(i, 1);
        else { s.settings.favoriteTreats.push(ds.id); added = true; }
      }, "settings");
      toast(added ? "«" + (recipe ? recipe.name : "Лакомство") + "» в избранном ⭐" : "Убрано из избранного", added ? "ok" : "info");
    },
    "nutrition.cooked": (ds) => {
      const recipe = recipeById(ds.id);
      if (!recipe) return;
      const pet = Store.pet();
      const p = portionOf(pet, curAct(pet).k);
      const grams = Math.max(20, Math.round(p.grams / Math.max(1, p.meals)));
      recordRecipe(recipe, grams, fmt.today(), hhmm(), recipe.type === "treat" ? "лакомство по рецепту" : "приготовлено по рецепту");
      toast("«" + recipe.name + "» записано в дневник (" + grams + " г)", "ok");
    },
    "nutrition.plan": (ds) => {
      const recipe = recipeById(ds.id);
      if (!recipe) return;
      modal({
        title: "Записать в дневник", icon: "📔",
        body: `
          <p class="small">«${esc(recipe.name)}» — ${recipe.kcal} ккал на порцию.</p>
          <div class="grid grid-2">
            ${field({ label: "Дата", type: "date", id: "nr-date", value: fmt.today() })}
            ${field({ label: "Время", type: "time", id: "nr-time", value: hhmm() })}
          </div>
          ${field({ label: "Граммы", type: "number", id: "nr-grams", value: 100, attrs: 'min="1" step="10"' })}`,
        actions: [
          { label: "Отмена" },
          {
            label: "Записать", kind: "primary", onClick: (wrap) => {
              const gEl = wrap.querySelector("#nr-grams");
              const g = parseFloat(String(gEl ? gEl.value : "").replace(",", "."));
              if (isNaN(g) || g <= 0) { toast("Укажите граммы", "warn"); return false; }
              const dEl = wrap.querySelector("#nr-date");
              const tEl = wrap.querySelector("#nr-time");
              recordRecipe(recipe, g, dEl && dEl.value, tEl && tEl.value, "по рецепту");
              toast("Запись добавлена в дневник", "ok");
              return true;
            }
          }
        ]
      });
    },

    /* ---- дневник ---- */
    "nutrition.addMeal": () => {
      const pet = Store.pet();
      const g = num("nj-grams", 0);
      if (g <= 0) { toast("Укажите количество граммов больше нуля", "warn"); return; }
      const date = val("nj-date") || fmt.today();
      const time = val("nj-time") || hhmm();
      const food = val("nj-food") || "Домашняя еда";
      Store.push("meals", { id: Store.uid("me"), date, time, food, grams: Math.round(g) }, pet.id);
      const norm = Store.portion(pet);
      const eaten = Store.bucket("meals", pet.id).filter((m) => m.date === date).reduce((s, m) => s + (+m.grams || 0), 0);
      toast("Записано " + Math.round(g) + " г. За день " + eaten + " г из " + norm.grams + " г", eaten > norm.grams * 1.1 ? "warn" : "ok");
    },
    "nutrition.delMeal": async (ds) => {
      const pet = Store.pet();
      const meal = Store.bucket("meals", pet.id).find((m) => m.id === ds.id);
      if (!meal) return;
      const ok = await confirmDialog("Удалить запись «" + (meal.food || "кормление") + "» от " + fmt.short(meal.date) + "?", { ok: "Удалить", danger: true, icon: "🗑" });
      if (!ok) return;
      Store.remove("meals", ds.id, pet.id);
      toast("Запись удалена", "info");
    }
  });
})();
