/* ============================================================================
 * PetLife — app/panel-market.js
 * Панель «Маркетплейс» (ТЗ №25): каталог, корзина, заказы и подписка Premium.
 * Подразделы (ctx.tab): catalog · cart · orders · premium.
 * Ванильный JS, без библиотек и внешних ресурсов. Действия — data-act="market.*".
 * ==========================================================================*/
(function () {
  "use strict";

  const { esc, fmt, card, stat, badge, progress, empty, field, table, list,
          toast, modal, confirmDialog, Actions } = window.PL;
  const D = window.PL_DATA;
  const S = () => window.Store.state;

  /* --------------------------------------------------------------- константы */
  const DELIVERY = 299;
  const FREE_FROM = 3000;
  const RATION_DAY = 63;          // ₽ — дневной рацион подопечного приюта
  const PROMO_CODES = {
    PETLIFE10: { pct: 10, bonus: 0, note: "скидка 10% на весь заказ" },
    MISSION: { pct: 5, bonus: 100, note: "скидка 5% и ещё 100 ₽ в приюты" }
  };
  const CATEGORY_ORDER = ["Корм", "Игрушки", "Гаджеты", "Аксессуары", "Одежда", "Уход", "Здоровье", "Услуги"];

  const TABS = [
    { id: "catalog", icon: "🛍", title: "Каталог", sub: "Корма, игрушки, гаджеты и услуги с доставкой" },
    { id: "cart", icon: "🛒", title: "Корзина", sub: "Промокоды, доставка и оформление заказа" },
    { id: "orders", icon: "📦", title: "Заказы", sub: "История покупок и повторный заказ в один клик" },
    { id: "premium", icon: "❤️", title: "Premium", sub: "Подписка PetLife: ИИ без лимитов и 5% в приюты" }
  ];

  const PLANS = [
    { id: "free", name: "Бесплатный", price: 0, emoji: "🐾", best: false,
      features: ["Профиль одного питомца", "Медкарта и напоминания", "Расчёт порций корма",
                 "5 запросов к ИИ в день", "Каталог маркетплейса"] },
    { id: "premium", name: "PetLife Premium", price: 399, emoji: "❤️", best: true,
      features: ["До 5 питомцев в семье", "ИИ-ассистент без ограничений", "ИИ-анализ фото симптомов",
                 "Отчёт для ветеринара", "Скидка 5% в маркетплейсе", "5% подписки → в приюты"] },
    { id: "plus", name: "PetLife Premium+", price: 699, emoji: "👑", best: false,
      features: ["Всё из Premium", "Семейный доступ до 5 человек", "Страхование питомца",
                 "Приоритетная поддержка 24/7", "Скидка 10% в маркетплейсе", "Скидка 15% на груминг и передержку"] }
  ];

  const REVIEWS = [
    { by: "Анна и Марсик", text: "Заказываем второй раз: курьер приехал вовремя, корги доволен." },
    { by: "Дмитрий и Бусинка", text: "Цена ниже, чем в офлайне, плюс 5% уходит в приюты — приятно." },
    { by: "Марина и Симба", text: "Качество отличное, упаковка целая, приложение напомнило о заказе." },
    { by: "Игорь и Гром", text: "Для хаски самое то: выдержало две недели активных прогулок." },
    { by: "Ольга и Пуша", text: "Взяли по совету из форума PetLife — не пожалели." }
  ];

  const GENERIC_SPECS = {
    "Игрушки": [["Материал", "безопасный силикон и текстиль"], ["Можно мыть", "да, вручную"], ["Для кого", "собаки и кошки"]],
    "Гаджеты": [["Питание", "аккумулятор до 14 дней"], ["Защита", "IPX7, влагозащита"], ["Приложение", "PetLife Home (iOS, Android)"]],
    "Аксессуары": [["Материал", "нейлон и гипоаллергенный текстиль"], ["Уход", "стирка при 30 °C"], ["Гарантия", "12 месяцев"]],
    "Одежда": [["Материал", "мембрана + утеплитель"], ["Уход", "стирка при 30 °C"], ["Размеры", "XS–XL по обхвату груди"]],
    "Уход": [["Состав", "гипоаллергенная база без парабенов"], ["Объём", "400 мл"], ["Для кого", "чувствительная кожа"]],
    "Здоровье": [["Форма выпуска", "таблетки / капли"], ["Курс", "по инструкции ветеринара"], ["Хранение", "до 25 °C, вне доступа детей"]],
    "Услуги": [["Формат", "онлайн или выезд специалиста"], ["Длительность", "60 минут"], ["Запись", "через PetLife, перенос бесплатно"]],
    "Корм": [["Состав", "мясо, злаки, витаминно-минеральный комплекс"], ["Вес упаковки", "уточняется"], ["Для кого", "взрослые питомцы"]]
  };

  const STAGE_LABEL = { junior: "щенки и котята", adult: "взрослые", senior: "пожилые", any: "любой возраст" };
  const SIZE_LABEL = { small: "мелкие", medium: "средние", large: "крупные", cat: "кошки" };

  /* ------------------------------------------------------------ UI-состояние */
  const UI = { catalog: { q: "", cat: "", sort: "popular" }, promo: "" };
  let CURRENT = "catalog";

  /* ---------------------------------------------------------------- помощники */
  function hash(str) {
    const s = String(str == null ? "" : str);
    let h = 11;
    for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) % 99991;
    return h;
  }

  function money2(v) { return fmt.num(v, 2) + " ₽"; }

  function repaint(id, html) {
    const node = document.getElementById(id);
    if (node) node.innerHTML = html;
  }

  function subTabs(active) {
    const inCart = window.Store.array("cart").reduce((s, i) => s + (+i.qty || 0), 0);
    const orders = window.Store.array("orders").length;
    return `<div class="chip-row mb-2">${TABS.map((t) => {
      let extra = "";
      if (t.id === "cart" && inCart) extra = " · " + fmt.int(inCart);
      if (t.id === "orders" && orders) extra = " · " + fmt.int(orders);
      return `<button class="tag ${t.id === active ? "active" : ""}" data-act="hub.open" data-panel="market" data-tab="${t.id}">${t.icon} ${esc(t.title)}${extra}</button>`;
    }).join("")}</div>`;
  }

  function kpiRow(items) { return `<div class="kpi-row">${items.map((i) => stat(i)).join("")}</div>`; }

  function ensureData() {
    const s = S();
    let changed = false;
    ["cart", "orders", "adoptions", "donations"].forEach((key) => {
      if (!Array.isArray(s[key])) { s[key] = []; changed = true; }
    });
    s.cart.forEach((i) => {
      if (typeof i.qty !== "number" || i.qty < 1) { i.qty = 1; changed = true; }
      const p = categoryFor(i.id) || categoryFor(i.name);
      if (!i.emoji) { i.emoji = p ? p.emoji : "📦"; changed = true; }
      if (!i.category) { i.category = p ? p.category : ""; changed = true; }
    });
    if (!s.owner) { s.owner = {}; changed = true; }
    if (typeof s.donated !== "number") { s.donated = 0; changed = true; }
    if (changed) window.Store.save();
  }

  /* сопоставление товара и корма из справочника: имена товаров содержат вес и префикс */
  function foodFor(product) {
    if (!product) return null;
    const exact = D.foods.find((f) => f.name === product.name);
    if (exact) return exact;
    const norm = String(product.name || "").toLowerCase();
    const found = D.foods.filter((f) => norm.indexOf(String(f.name).toLowerCase()) >= 0);
    found.sort((a, b) => b.name.length - a.name.length);
    return found[0] || null;
  }

  function categoryFor(name) {
    const byId = D.products.find((x) => x.id === name);
    if (byId) return byId;
    const norm = String(name || "").toLowerCase();
    return D.products.find((x) => norm.indexOf(String(x.name).toLowerCase()) >= 0) || null;
  }

  function productCategories() {
    const used = [];
    D.products.forEach((p) => { if (used.indexOf(p.category) === -1) used.push(p.category); });
    return used.sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a), ib = CATEGORY_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b, "ru");
    });
  }

  function popularity(p, index) {
    let score = (p.rating || 0) * 10 - index * 0.1;
    if ((p.tags || []).indexOf("хит") >= 0) score += 12;
    if (p.old && p.old > p.price) score += 4;
    return score;
  }

  function productsFiltered() {
    const q = UI.catalog.q.trim().toLowerCase();
    let out = D.products.filter((p) => {
      if (UI.catalog.cat && p.category !== UI.catalog.cat) return false;
      if (q && ((p.name || "") + " " + (p.category || "") + " " + (p.tags || []).join(" ")).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    const withIndex = out.map((p, i) => ({ p: p, i: i }));
    if (UI.catalog.sort === "cheap") withIndex.sort((a, b) => a.p.price - b.p.price);
    else if (UI.catalog.sort === "expensive") withIndex.sort((a, b) => b.p.price - a.p.price);
    else if (UI.catalog.sort === "rating") withIndex.sort((a, b) => (b.p.rating || 0) - (a.p.rating || 0));
    else withIndex.sort((a, b) => popularity(b.p, b.i) - popularity(a.p, a.i));
    return withIndex.map((x) => x.p);
  }

  function cartQty(id) {
    const line = window.Store.array("cart").find((i) => i.id === id);
    return line ? (+line.qty || 0) : 0;
  }

  function addToCart(product, qty) {
    const n = qty || 1;
    window.Store.update((s) => {
      if (!Array.isArray(s.cart)) s.cart = [];
      const line = s.cart.find((i) => i.id === product.id);
      if (line) line.qty = (+line.qty || 0) + n;
      else s.cart.push({ id: product.id, name: product.name, emoji: product.emoji, price: product.price, category: product.category, qty: n });
    });
    toast(product.name + " — в корзине 🛒", "ok");
  }

  function cartTotals() {
    const cart = window.Store.array("cart");
    const subtotal = cart.reduce((s, i) => s + (+i.price || 0) * (+i.qty || 0), 0);
    const promo = PROMO_CODES[UI.promo] ? UI.promo : "";
    const pct = promo ? PROMO_CODES[promo].pct : 0;
    const bonus = promo ? PROMO_CODES[promo].bonus : 0;
    const discount = Math.round(subtotal * pct / 100);
    const afterDiscount = Math.max(0, subtotal - discount);
    const delivery = (subtotal === 0 || afterDiscount >= FREE_FROM) ? 0 : DELIVERY;
    const total = afterDiscount + delivery;
    const donation = Math.round(total * 0.05) + bonus;
    return { cart, subtotal, promo, pct, bonus, discount, delivery, total, donation, toFree: Math.max(0, FREE_FROM - afterDiscount) };
  }

  /* рекомендации под питомца с учётом аллергий */
  function recommendFor(pet) {
    const allergies = ((pet && pet.allergies) || []).map((a) => String(a).toLowerCase());
    const isCat = pet && pet.species === "cat";
    const items = D.products.map((p, i) => {
      const food = foodFor(p);
      if (food) {
        const conflict = food.allergens.some((a) => allergies.indexOf(String(a).toLowerCase()) >= 0);
        if (conflict) return null;
        const forCat = food.sizes.indexOf("cat") >= 0;
        if (isCat && !forCat) return null;
        if (!isCat && forCat) return null;
      }
      let score = (p.rating || 0) * 10 - i * 0.1;
      if (food) score += 20;
      if (food && allergies.length && !food.allergens.length) score += 14;
      if (food && pet && STAGE_LABEL[food.stage] && ((pet.species === "cat" && food.stage === "junior") || food.stage === "adult")) score += 5;
      if ((p.tags || []).indexOf("хит") >= 0) score += 8;
      if (p.category === "Игрушки") score += 6;
      if (p.category === "Здоровье") score += 4;
      return { p: p, food: food, score: score };
    }).filter(Boolean);
    items.sort((a, b) => b.score - a.score);
    return items.slice(0, 3);
  }

  function allergenBadge(food, allergies) {
    if (!food) return "";
    if (!food.allergens.length) return badge("без аллергенов", "ok");
    const safe = !food.allergens.some((a) => allergies.indexOf(String(a).toLowerCase()) >= 0);
    return safe ? badge("без аллергии питомца", "ok") : "";
  }

  /* --------------------------------------------------------------- КАТАЛОГ */
  function productCard(p) {
    const qty = cartQty(p.id);
    const old = p.old && p.old > p.price ? `<span class="prod-old">${fmt.money(p.old)}</span>` : "";
    return `<div class="prod-card">
      <div class="prod-emoji">${esc(p.emoji || "📦")}</div>
      <div class="prod-name">${esc(p.name)}</div>
      <div><span class="prod-price">${fmt.money(p.price)}</span>${old}</div>
      <div class="prod-meta">
        <span>⭐ ${fmt.num(p.rating, 1)}</span>
        <span>${(p.tags || []).slice(0, 1).map((t) => esc(t)).join("")}</span>
      </div>
      <div class="chip-row mt-1">
        <button class="btn btn-primary btn-sm btn-block" data-act="market.add" data-id="${esc(p.id)}">🛒 В корзину</button>
        <button class="btn btn-ghost btn-sm btn-block" data-act="market.detail" data-id="${esc(p.id)}">👁 Подробнее</button>
      </div>
      ${qty ? `<div class="muted small center">В корзине: ${fmt.int(qty)} шт · <button class="tag" data-act="hub.open" data-panel="market" data-tab="cart">перейти</button></div>` : ""}
    </div>`;
  }

  function catalogAreaHtml() {
    const cats = productCategories();
    const shown = productsFiltered();
    const catChips = [`<button class="tag ${UI.catalog.cat ? "" : "active"}" data-act="market.cat" data-cat="">Все категории</button>`]
      .concat(cats.map((c) => {
        const n = D.products.filter((p) => p.category === c).length;
        return `<button class="tag ${UI.catalog.cat === c ? "active" : ""}" data-act="market.cat" data-cat="${esc(c)}">${esc(c)} · ${n}</button>`;
      })).join("");
    const sorts = [["popular", "🔥 Популярные"], ["cheap", "💸 Дешевле"], ["expensive", "💎 Дороже"], ["rating", "⭐ По рейтингу"]]
      .map((s) => `<button class="tag ${UI.catalog.sort === s[0] ? "active" : ""}" data-act="market.sort" data-sort="${s[0]}">${s[1]}</button>`).join("");
    const grid = shown.length
      ? `<div class="prod-grid">${shown.map(productCard).join("")}</div>`
      : empty("🔍", "Товары не найдены", "Измените запрос или выберите другую категорию.",
          `<button class="btn btn-ghost mt-2" data-act="market.resetCatalog">Показать всё</button>`);
    return `<div class="stack" style="gap:14px">
      <div class="chip-row">${catChips}</div>
      <div class="row-between">
        <div class="chip-row">${sorts}</div>
        <span class="muted small">Найдено ${fmt.int(shown.length)} из ${fmt.int(D.products.length)}</span>
      </div>
      ${grid}
    </div>`;
  }

  function recommendHtml(pet) {
    const recs = recommendFor(pet);
    if (!recs.length) return "";
    const allergies = ((pet && pet.allergies) || []);
    const body = `<div class="prod-grid">${recs.map((r) => `<div class="prod-card">
        <div class="prod-emoji">${esc(r.p.emoji || "📦")}</div>
        <div class="prod-name">${esc(r.p.name)}</div>
        <div>${r.food ? allergenBadge(r.food, allergies) : badge("подходит питомцу", "info")}</div>
        <div><span class="prod-price">${fmt.money(r.p.price)}</span></div>
        <button class="btn btn-primary btn-sm btn-block" data-act="market.add" data-id="${esc(r.p.id)}">🛒 Добавить</button>
      </div>`).join("")}</div>
      <p class="muted small mt-2">Подобрано для ${esc((pet && pet.name) || "питомца")} ·
        аллергии: ${allergies.length ? esc(allergies.join(", ")) : "не указаны"} · корма с аллергенами скрыты.</p>`;
    return card({ title: "PetLife рекомендует", icon: "✨", body: body });
  }

  function catalogHtml() {
    const pet = window.Store.pet();
    const inCart = window.Store.array("cart").reduce((s, i) => s + (+i.qty || 0), 0);
    return `<div class="stack">
      <div class="hint-box">
        <b>🚚 Бесплатная доставка от ${fmt.money(FREE_FROM)}</b> · <b>❤️ 5% от заказа идёт в приюты</b> —
        доставка по городу за 1–2 дня, самовывоз из PetLife Store в день заказа.
      </div>
      ${recommendHtml(pet)}
      <div class="panel-tools">
        ${inCart ? `<button class="btn btn-ghost btn-sm" data-act="hub.open" data-panel="market" data-tab="cart">🛒 В корзине: ${fmt.int(inCart)} шт</button>` : ""}
        <button class="btn btn-ghost btn-sm" data-act="market.promoHint">🎁 Промокоды</button>
      </div>
      <input class="input" id="marketSearch" data-live="market.q" value="${esc(UI.catalog.q)}"
             placeholder="🔍 Поиск: корм, ошейник, выгул, витамины…" autocomplete="off">
      <div id="marketArea">${marketAreaHtml()}</div>
    </div>`;
  }

  function productModal(id) {
    const p = D.products.find((x) => x.id === id);
    if (!p) return;
    const food = foodFor(p);
    const specs = food
      ? [["Тип корма", food.kind],
         ["Вес упаковки", fmt.num(food.kg, food.kg % 1 ? 1 : 0) + " кг"],
         ["Белок / жир", fmt.num(food.protein, 0) + " % / " + fmt.num(food.fat, 0) + " %"],
         ["Аллергены", food.allergens.length ? food.allergens.join(", ") : "нет"],
         ["Возраст", STAGE_LABEL[food.stage] || "любой"],
         ["Размеры", food.sizes.map((s) => SIZE_LABEL[s] || s).join(", ")]]
      : (GENERIC_SPECS[p.category] || GENERIC_SPECS["Корм"]);
    const base = hash(p.id) % REVIEWS.length;
    const reviews = [0, 1, 2].map((i) => REVIEWS[(base + i) % REVIEWS.length]);
    const stars = "★".repeat(Math.round(p.rating || 0)) + "☆".repeat(Math.max(0, 5 - Math.round(p.rating || 0)));
    const body = `
      <div class="friend-card mb-2">
        <div class="avatar" style="font-size:1.8rem">${esc(p.emoji || "📦")}</div>
        <div style="flex:1">
          <div class="med-name">${esc(p.name)}</div>
          <div class="med-sub">${esc(p.category)} · ${stars} ${fmt.num(p.rating, 1)} · ${(p.tags || []).map((t) => "#" + esc(t)).join(" ")}</div>
        </div>
        <div style="text-align:right">
          <div class="prod-price">${fmt.money(p.price)}</div>
          ${p.old && p.old > p.price ? `<div class="prod-old" style="margin:0">${fmt.money(p.old)}</div>` : ""}
        </div>
      </div>
      <p class="small">${esc(p.name)} — позиция из категории «${esc(p.category)}». Отправляем со склада PetLife,
        проверяем сроки годности и целостность упаковки. 5% от покупки уходит подопечным приютов.</p>
      <div class="grid grid-2">
        <div>
          <div class="muted small mb-1">Характеристики</div>
          <div class="kv">${specs.map((s) => `<div class="kv-row"><span class="kv-k">${esc(s[0])}</span><span class="kv-v">${esc(s[1])}</span></div>`).join("")}</div>
        </div>
        <div>
          <div class="muted small mb-1">Отзывы покупателей</div>
          <div class="stack" style="gap:8px">${reviews.map((r) =>
            `<div class="hint-box" style="padding:10px"><b class="small">${esc(r.by)}</b>
              <div class="tiny muted">${stars}</div>
              <div class="small">${esc(r.text)}</div></div>`).join("")}</div>
        </div>
      </div>
      <div class="ok-box mt-2">🚚 Доставка ${fmt.money(DELIVERY)}, бесплатно от ${fmt.money(FREE_FROM)} ·
        возврат в течение 14 дней.</div>`;
    modal({
      title: "Товар", icon: "👁", body, wide: true,
      actions: [
        { label: "Закрыть" },
        { label: "🛒 В корзину", kind: "primary", onClick: () => { addToCart(p); return true; } }
      ]
    });
  }

  /* ---------------------------------------------------------------- КОРЗИНА */
  function cartLineHtml(i) {
    const sum = (+i.price || 0) * (+i.qty || 0);
    return `<div class="cart-line">
      <div class="avatar">${esc(i.emoji || "📦")}</div>
      <div class="cl-name">${esc(i.name)}<br><span class="muted small">${fmt.money(i.price)} за шт</span></div>
      <div class="qty">
        <button data-act="market.qty" data-id="${esc(i.id)}" data-d="-1" aria-label="Меньше">−</button>
        <b>${fmt.int(i.qty)}</b>
        <button data-act="market.qty" data-id="${esc(i.id)}" data-d="1" aria-label="Больше">+</button>
      </div>
      <b>${fmt.money(sum)}</b>
      <button class="btn btn-xs btn-danger" data-act="market.remove" data-id="${esc(i.id)}">✕</button>
    </div>`;
  }

  function bundleHtml() {
    const cart = window.Store.array("cart");
    const inCart = cart.map((i) => i.id);
    const cats = cart.map((i) => i.category);
    const pool = D.products.filter((p) => inCart.indexOf(p.id) === -1)
      .map((p, i) => ({ p: p, i: i, score: (cats.indexOf(p.category) >= 0 ? 40 : 0) + (p.rating || 0) * 5 - i * 0.1 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3).map((x) => x.p);
    if (!pool.length) return "";
    const body = `<div class="stack" style="gap:10px">${pool.map((p) => `<div class="cart-line">
        <div class="avatar">${esc(p.emoji)}</div>
        <div class="cl-name">${esc(p.name)}<br><span class="muted small">${fmt.money(p.price)}</span></div>
        <button class="btn btn-sm btn-ghost" data-act="market.add" data-id="${esc(p.id)}">Добавить</button>
      </div>`).join("")}</div>
      <p class="muted tiny mt-1">Владельцы часто берут эти позиции вместе с вашей корзиной.</p>`;
    return card({ title: "Часто покупают вместе", icon: "🧺", body: body });
  }

  function cartAreaHtml() {
    const t = cartTotals();
    if (!t.cart.length) {
      return `<div class="stack">${empty("🛒", "Корзина пуста",
        "Добавьте корм, игрушки или услугу — оформим заказ за минуту.",
        `<button class="btn btn-primary mt-2" data-act="hub.open" data-panel="market" data-tab="catalog">В каталог</button>`)}
        ${bundleHtml()}</div>`;
    }
    const lines = `<div class="stack" style="gap:10px">${t.cart.map(cartLineHtml).join("")}</div>`;
    const freeHint = t.delivery
      ? `<div class="mt-2">${progress((t.subtotal - t.discount) / FREE_FROM * 100, "orange")}
         <div class="muted tiny mt-1">До бесплатной доставки осталось ${fmt.money(t.toFree)}</div></div>`
      : `<div class="ok-box mt-2">🚚 Доставка бесплатно — заказ больше ${fmt.money(FREE_FROM)}</div>`;
    const promoBody = `
      <label class="field">
        <span class="field-label">Промокод</span>
        <div class="row" style="gap:8px">
          <input class="input" id="promoInput" value="${esc(UI.promo)}" placeholder="PETLIFE10 или MISSION" autocomplete="off">
          <button class="btn btn-ghost btn-sm" data-act="market.applyPromo">Применить</button>
        </div>
      </label>
      ${t.promo ? `<div class="ok-box">🎁 ${esc(t.promo)}: ${esc(PROMO_CODES[t.promo].note)}${t.bonus ? ` (+${fmt.money(t.bonus)} в приюты)` : ""}
        <button class="btn btn-xs btn-ghost" data-act="market.clearPromo">убрать</button></div>`
        : `<div class="muted tiny">Подсказка: <b>PETLIFE10</b> — скидка 10%, <b>MISSION</b> — скидка 5% и +100 ₽ в приюты.</div>`}`;
    const summary = `<div class="kv">
        <div class="kv-row"><span class="kv-k">Товары (${fmt.int(t.cart.reduce((s, i) => s + (+i.qty || 0), 0))} шт)</span><span class="kv-v">${fmt.money(t.subtotal)}</span></div>
        <div class="kv-row"><span class="kv-k">Скидка по промокоду</span><span class="kv-v">${t.discount ? "−" + fmt.money(t.discount) : "—"}</span></div>
        <div class="kv-row"><span class="kv-k">Доставка</span><span class="kv-v">${t.delivery ? fmt.money(t.delivery) : "бесплатно"}</span></div>
        <div class="kv-row"><span class="kv-k"><b>Итого</b></span><span class="kv-v"><b>${fmt.money(t.total)}</b></span></div>
        <div class="kv-row"><span class="kv-k">❤️ В приюты (5%)</span><span class="kv-v">${fmt.money(t.donation)}</span></div>
      </div>
      ${freeHint}
      <button class="btn btn-primary btn-block mt-2" data-act="market.checkout">✅ Оформить заказ · ${fmt.money(t.total)}</button>
      <button class="btn btn-ghost btn-block mt-1" data-act="market.clearCart">Очистить корзину</button>`;
    return `<div class="panel-grid cols-2">
      <section class="card">
        <header class="card-head"><h3><span class="card-ico">🛒</span>Ваша корзина</h3>
          <span class="muted small">${fmt.int(t.cart.length)} ${fmt.plural(t.cart.length, "позиция", "позиции", "позиций")}</span></header>
        <div class="card-body">${lines}</div>
      </section>
      <div class="stack">
        ${card({ title: "Оформление", icon: "🧾", body: promoBody + summary })}
        ${bundleHtml()}
      </div>
    </div>`;
  }

  function receiptModal(order) {
    const rows = order.items.map((i) =>
      `<div class="row-between"><span>${esc(i.emoji || "📦")} ${esc(i.name)} × ${fmt.int(i.qty)}</span><span>${fmt.money((+i.price || 0) * (+i.qty || 0))}</span></div>`).join("");
    const body = `<div class="receipt">
      <div class="row-between"><b>PetLife Маркетплейс</b><span>Заказ ${esc(order.number)}</span></div>
      <div class="muted small">${esc(fmt.date(order.date))} · ${esc((S().owner && S().owner.city) || "Москва")} · статус: ${esc(order.status)}</div>
      <hr>
      ${rows}
      <hr>
      <div class="row-between"><span>Товары</span><span>${fmt.money(order.subtotal != null ? order.subtotal : order.total)}</span></div>
      ${order.discount ? `<div class="row-between"><span>Скидка</span><span>−${fmt.money(order.discount)}</span></div>` : ""}
      <div class="row-between"><span>Доставка</span><span>${order.delivery ? fmt.money(order.delivery) : "бесплатно"}</span></div>
      <div class="row-between"><b>Итого</b><b>${fmt.money(order.total)}</b></div>
      <hr>
      <div class="ok-box">❤️ 5% (${fmt.money(order.donation)}) → в приюты${order.promoBonus ? ` (+${fmt.money(order.promoBonus)} по промокоду)` : ""}</div>
      <div class="barcode mt-2"></div>
      <div class="center tiny muted mt-1">Спасибо, что помогаете подопечным приютов!</div>
    </div>`;
    modal({ title: "Заказ оформлен", icon: "🧾", body, wide: true, actions: [{ label: "Отлично!" }, { label: "Мои заказы", kind: "primary", onClick: () => { window.Hub.open("market", "orders"); return true; } }] });
  }

  function checkout() {
    const t = cartTotals();
    if (!t.cart.length) { toast("Корзина пуста — добавьте товары из каталога", "warn"); return; }
    const number = "PL-" + (100000 + window.Store.array("orders").length + 1);
    const order = {
      id: window.Store.uid("or"),
      number: number,
      date: fmt.today(),
      items: t.cart.map((i) => ({ id: i.id, name: i.name, emoji: i.emoji, price: i.price, qty: i.qty })),
      subtotal: t.subtotal,
      discount: t.discount,
      delivery: t.delivery,
      total: t.total,
      status: "в обработке",
      donation: t.donation,
      promo: t.promo,
      promoBonus: t.bonus
    };
    window.Store.update((s) => {
      if (!Array.isArray(s.orders)) s.orders = [];
      s.orders.unshift(order);
      s.cart = [];
      s.donated = (+s.donated || 0) + order.donation;
    });
    UI.promo = "";
    toast("Заказ " + number + " оформлен! Курьер приедет в течение 1–2 дней 🚚", "ok");
    receiptModal(order);
  }

  /* ----------------------------------------------------------------- ЗАКАЗЫ */
  function statusKind(status) {
    if (status === "доставлен") return "ok";
    if (status === "отменён") return "danger";
    if (status === "в пути") return "info";
    return "warn";
  }

  function ordersAreaHtml() {
    const orders = window.Store.array("orders");
    if (!orders.length) {
      return `<div class="stack">${empty("📦", "Заказов пока нет",
        "Первая покупка может быть с бесплатной доставкой — соберите корзину от 3000 ₽.",
        `<button class="btn btn-primary mt-2" data-act="hub.open" data-panel="market" data-tab="catalog">В каталог</button>`)}</div>`;
    }
    const rows = orders.map((o) => {
      const items = (o.items || []).map((i) => `${i.emoji || "📦"} ${esc(i.name)} × ${fmt.int(i.qty)}`);
      return `<div class="med-card">
        <div class="med-ico">📦</div>
        <div class="med-main">
          <div class="med-name">Заказ ${esc(o.number || o.id)} · ${fmt.money(o.total)} ${badge(o.status, statusKind(o.status))}</div>
          <div class="med-sub">${esc(fmt.date(o.date))} · ${items.join(" · ")}</div>
          <div class="med-sub">❤️ в приюты: ${fmt.money(o.donation || 0)}${o.promo ? " · промокод " + esc(o.promo) : ""}</div>
        </div>
        <div class="chip-row">
          <button class="btn btn-sm btn-ghost" data-act="market.repeat" data-id="${esc(o.id)}">🔁 Повторить заказ</button>
          ${o.status === "отменён" ? "" : `<button class="btn btn-sm btn-danger" data-act="market.cancelOrder" data-id="${esc(o.id)}">Отменить</button>`}
        </div>
      </div>`;
    }).join("");
    return `<div class="stack" style="gap:12px">${rows}</div>`;
  }

  function ordersHtml() {
    const orders = window.Store.array("orders");
    const spent = orders.reduce((s, o) => s + (+o.total || 0), 0);
    const donated = orders.reduce((s, o) => s + (+o.donation || 0), 0);
    const avg = orders.length ? spent / orders.length : 0;
    const active = orders.filter((o) => o.status === "в обработке").length;
    return `<div class="stack">
      ${kpiRow([
        { icon: "📦", value: fmt.int(orders.length), label: "Заказов всего", hint: active ? active + " в обработке" : "все доставлены" },
        { icon: "💳", value: fmt.money(spent), label: "Потрачено", hint: "за всё время" },
        { icon: "❤️", value: fmt.money(donated), label: "Пожертвовано приютам", hint: "5% с каждого заказа", kind: "green" },
        { icon: "🧾", value: fmt.money(avg), label: "Средний чек", hint: "по всем заказам" }
      ])}
      <div id="marketArea">${ordersAreaHtml()}</div>
    </div>`;
  }

  /* ---------------------------------------------------------------- PREMIUM */
  function premiumAreaHtml() {
    const owner = S().owner || {};
    const active = !!owner.premium;
    const planId = active ? (owner.premiumPlan === "plus" ? "plus" : "premium") : "";
    const currentPrice = active ? (planId === "plus" ? 699 : 399) : 399;
    const share = currentPrice * 0.05;
    const year = share * 12;
    const rations = Math.floor(year / RATION_DAY);
    const mission = S().mission || {};

    const cards = PLANS.map((p) => `<div class="insurance-card ${p.best || planId === p.id ? "best" : ""}">
      ${p.best && planId !== p.id ? `<span class="ic-best">Рекомендуем</span>` : ""}
      ${planId === p.id ? `<span class="ic-best">Ваш тариф</span>` : ""}
      <div class="row-between"><b>${p.emoji} ${esc(p.name)}</b></div>
      <div class="insurance-price">${p.price ? fmt.money(p.price) : "0 ₽"}<span class="muted small"> / мес</span></div>
      ${list(p.features, "tick")}
      ${p.id === planId
        ? `<button class="btn btn-ghost btn-block mt-2" data-act="market.manage">⚙️ Управлять подпиской</button>`
        : p.price
          ? `<button class="btn btn-primary btn-block mt-2" data-act="market.subscribe" data-plan="${p.id}">Оформить ${esc(p.name)}</button>`
          : `<button class="btn btn-ghost btn-block mt-2" data-act="market.freePlan">Остаться на бесплатном</button>`}
    </div>`).join("");

    const rows = [
      ["Профилей питомцев", "1", "до 5", "до 10"],
      ["Медкарта, вакцины, напоминания", "✓", "✓", "✓"],
      ["Расчёт порций и подбор корма", "✓", "✓", "✓"],
      ["ИИ-ассистент", "5 запросов в день", "без ограничений", "без ограничений"],
      ["ИИ-анализ фото симптомов", "—", "✓", "✓"],
      ["Отчёт для ветеринара", "—", "✓", "✓"],
      ["Скидка в маркетплейсе", "—", "5%", "10%"],
      ["Семейный доступ", "—", "2 участника", "5 участников"],
      ["Страхование питомца", "—", "—", "включено"],
      ["5% подписки в приюты", "—", "19,95 ₽/мес", "34,95 ₽/мес"]
    ];

    const body = `<div class="stack" style="gap:14px">
      ${active
        ? `<div class="ok-box">${badge("Активен с " + fmt.date(owner.premiumSince || fmt.today()), "ok")}
            Ваш тариф: <b>${esc(planId === "plus" ? "PetLife Premium+" : "PetLife Premium")}</b> · списание ${fmt.money(currentPrice)} в месяц ·
            автопродление: <b>${owner.autoRenew === false ? "выключено" : "включено"}</b>.</div>`
        : `<div class="hint-box">Premium открывает ИИ без лимитов, отчёт для ветеринара и скидку 5% в маркетплейсе.
            А ещё 5% подписки уходят в приюты-партнёры.</div>`}
      <div class="panel-grid cols-3">${cards}</div>
      ${card({ title: "Сравнение тарифов", icon: "📊", body: table(
        ["Возможность", "Бесплатный · 0 ₽", "Premium · 399 ₽", "Premium+ · 699 ₽"], rows) })}
      <div class="panel-grid cols-2">
        ${card({ title: "Ваш вклад в приюты", icon: "❤️", body: `
          <div class="donation-card">
            <div class="mm-value" style="font-size:1.6rem;color:#23662B">${money2(share)}</div>
            <div class="small">в месяц — 5% от подписки ${fmt.money(currentPrice)}</div>
          </div>
          <div class="kv mt-2">
            <div class="kv-row"><span class="kv-k">5% за месяц</span><span class="kv-v">${money2(share)}</span></div>
            <div class="kv-row"><span class="kv-k">5% за год</span><span class="kv-v">${money2(year)}</span></div>
            <div class="kv-row"><span class="kv-k">Прокормите за год</span><span class="kv-v">${fmt.int(rations)} ${fmt.plural(rations, "дневной рацион", "дневных рациона", "дневных рационов")}</span></div>
            <div class="kv-row"><span class="kv-k">Вместе с сообществом</span><span class="kv-v">${fmt.int(mission.helped || 0)} питомцев</span></div>
          </div>
          <p class="muted tiny mt-1">Один дневной рацион подопечного приюта — около ${fmt.money(RATION_DAY)}: корм, витамины и обработки.</p>` })}
        ${card({ title: "Что даёт подписка", icon: "🎁", body: list([
          "🤖 ИИ-ассистент по вашим данным — без лимита запросов",
          "📷 Анализ фото симптомов и динамика изменений",
          "🖨 Отчёт для ветеринара в один клик",
          "🛍 Скидка 5% (Premium+) 10% на всё в маркетплейсе",
          "👨‍👩‍👧 Семейный доступ к профилям питомцев",
          "❤️ 5% подписки — подопечным приютов-партнёров"
        ], "tick") })}
      </div>
    </div>`;
    return body;
  }

  function premiumHtml() {
    const owner = S().owner || {};
    const active = !!owner.premium;
    const price = active && owner.premiumPlan === "plus" ? 699 : 399;
    const share = price * 0.05;
    return `<div class="stack">
      ${kpiRow([
        { icon: "❤️", value: active ? "Активен" : "Не оформлен", label: "PetLife Premium", hint: active ? "с " + fmt.date(owner.premiumSince || fmt.today()) : "399 ₽ в месяц", kind: active ? "green" : "orange" },
        { icon: "💚", value: money2(share), label: "5% в приюты ежемесячно", hint: "с вашей подписки" },
        { icon: "🐾", value: fmt.int(Math.floor((share * 12) / RATION_DAY)), label: "Дневных рационов за год", hint: "для подопечных приюта" },
        { icon: "🏠", value: fmt.money(S().donated || 0), label: "Всего пожертвовано", hint: "заказы и шефство" }
      ])}
      <div id="marketArea">${premiumAreaHtml()}</div>
    </div>`;
  }

  function manageModal() {
    const owner = S().owner || {};
    const planId = owner.premiumPlan === "plus" ? "plus" : "premium";
    const body = `
      <div class="kv">
        <div class="kv-row"><span class="kv-k">Тариф</span><span class="kv-v">${esc(planId === "plus" ? "PetLife Premium+ · 699 ₽" : "PetLife Premium · 399 ₽")}</span></div>
        <div class="kv-row"><span class="kv-k">Активен с</span><span class="kv-v">${esc(fmt.date(owner.premiumSince || fmt.today()))}</span></div>
        <div class="kv-row"><span class="kv-k">Автопродление</span><span class="kv-v">${owner.autoRenew === false ? "выключено" : "включено"}</span></div>
        <div class="kv-row"><span class="kv-k">5% в приюты</span><span class="kv-v">${money2((planId === "plus" ? 699 : 399) * 0.05)} / мес</span></div>
      </div>
      <p class="muted small mt-2">Управляйте подпиской в один клик — данные питомцев сохранятся при любом изменении тарифа.</p>`;
    modal({
      title: "Управление подпиской", icon: "⚙️", body,
      actions: [
        { label: "Сменить тариф", onClick: () => {
            window.Store.update((s) => { s.owner.premiumPlan = planId === "plus" ? "premium" : "plus"; s.owner.premium = true; });
            toast("Тариф изменён на " + (planId === "plus" ? "PetLife Premium (399 ₽)" : "PetLife Premium+ (699 ₽)"), "ok");
            return true;
          } },
        { label: "Отключить автопродление", onClick: () => {
            window.Store.update((s) => { s.owner.autoRenew = false; });
            toast("Автопродление выключено — подписка завершится в конце периода", "warn");
            return true;
          } },
        { label: "Отменить подписку", kind: "danger", onClick: () => {
            confirmDialog("Отменить подписку PetLife? Профили питомцев и история останутся, но ИИ-функции станут ограничены.", { ok: "Отменить подписку", danger: true, icon: "💔" })
              .then((ok) => {
                if (!ok) return;
                window.Store.update((s) => { s.owner.premium = false; s.owner.premiumPlan = "free"; s.owner.autoRenew = false; });
                toast("Подписка отменена. Спасибо, что были с нами ❤️", "info");
              });
            return false;
          } }
      ]
    });
  }

  /* ================================================================= RENDER */
  function headHtml(tab) {
    const meta = TABS.find((t) => t.id === tab) || TABS[0];
    const cartCount = window.Store.array("cart").reduce((s, i) => s + (+i.qty || 0), 0);
    const tools = {
      catalog: `<button class="btn btn-ghost btn-sm" data-act="market.promoHint">🎁 Промокоды</button>
        <button class="btn btn-primary btn-sm" data-act="hub.open" data-panel="market" data-tab="cart">🛒 Корзина${cartCount ? " · " + fmt.int(cartCount) : ""}</button>`,
      cart: `<button class="btn btn-ghost btn-sm" data-act="hub.open" data-panel="market" data-tab="catalog">🛍 В каталог</button>`,
      orders: `<button class="btn btn-ghost btn-sm" data-act="hub.open" data-panel="market" data-tab="catalog">🛍 В каталог</button>`,
      premium: `<button class="btn btn-ghost btn-sm" data-act="hub.open" data-panel="market" data-tab="orders">📦 Мои заказы</button>`
    };
    return `<div class="panel-head">
      <div><h2>${meta.icon} Маркетплейс</h2><p>${esc(meta.sub)}</p></div>
      <div class="panel-tools">${tools[tab] || ""}</div>
    </div>`;
  }

  function marketAreaHtml() {
    if (CURRENT === "cart") return cartAreaHtml();
    if (CURRENT === "orders") return ordersAreaHtml();
    if (CURRENT === "premium") return premiumAreaHtml();
    return catalogAreaHtml();
  }

  function bodyHtml(tab) {
    if (tab === "cart") return `<div class="stack"><div id="marketArea">${cartAreaHtml()}</div></div>`;
    if (tab === "orders") return ordersHtml();
    if (tab === "premium") return premiumHtml();
    return catalogHtml();
  }

  function wire(view) {
    view.querySelectorAll("[data-live]").forEach((el) => {
      const key = el.dataset.live;
      const evt = (el.tagName === "SELECT" || el.type === "checkbox") ? "change" : "input";
      el.addEventListener(evt, () => setLive(key, el.value));
    });
  }

  function setLive(key, value) {
    if (key === "market.q") {
      UI.catalog.q = String(value == null ? "" : value);
      repaint("marketArea", marketAreaHtml());
    }
  }

  window.Panels.register("market", {
    title: "Маркетплейс",
    icon: "🛒",
    desc: "Корма, игрушки, гаджеты, услуги, заказы и подписка Premium",
    render(view, ctx) {
      ensureData();
      const tab = ctx && ctx.tab ? ctx.tab : "catalog";
      CURRENT = tab;
      view.innerHTML = `<div class="panel">
        ${headHtml(tab)}
        ${subTabs(tab)}
        ${bodyHtml(tab)}
      </div>`;
      wire(view);
    }
  });

  /* ================================================================ ACTIONS */
  Actions.registerAll({
    /* --- каталог --- */
    "market.add": (ds) => {
      const p = D.products.find((x) => x.id === ds.id);
      if (!p) return;
      addToCart(p);
    },
    "market.detail": (ds) => productModal(ds.id),
    "market.cat": (ds) => {
      UI.catalog.cat = String(ds.cat || "");
      repaint("marketArea", marketAreaHtml());
    },
    "market.sort": (ds) => {
      UI.catalog.sort = ds.sort || "popular";
      repaint("marketArea", marketAreaHtml());
    },
    "market.resetCatalog": () => {
      UI.catalog = { q: "", cat: "", sort: "popular" };
      const input = document.getElementById("marketSearch");
      if (input) input.value = "";
      repaint("marketArea", marketAreaHtml());
      toast("Фильтры сброшены — показываем весь каталог", "info");
    },
    "market.promoHint": () => {
      modal({
        title: "Промокоды PetLife", icon: "🎁",
        body: `<div class="stack" style="gap:10px">
          <div class="hint-box"><b>PETLIFE10</b> — скидка 10% на весь заказ.</div>
          <div class="hint-box"><b>MISSION</b> — скидка 5% и дополнительно 100 ₽ в приюты.</div>
          <div class="muted small">Промокод вводится в корзине. Скидка применяется к сумме товаров, доставка считается после скидки.</div>
        </div>`,
        actions: [{ label: "Понятно" }, { label: "В корзину", kind: "primary", onClick: () => { window.Hub.open("market", "cart"); return true; } }]
      });
    },

    /* --- корзина --- */
    "market.qty": (ds) => {
      const d = +ds.d || 1;
      window.Store.update((s) => {
        const line = (s.cart || []).find((i) => i.id === ds.id);
        if (!line) return;
        line.qty = Math.max(1, (+line.qty || 1) + d);
      });
    },
    "market.remove": (ds) => {
      const line = window.Store.array("cart").find((i) => i.id === ds.id);
      window.Store.update((s) => { s.cart = (s.cart || []).filter((i) => i.id !== ds.id); });
      toast((line ? line.name : "Товар") + " убран из корзины", "info");
    },
    "market.clearCart": async () => {
      const ok = await confirmDialog("Очистить корзину полностью?", { ok: "Очистить", danger: true, icon: "🗑" });
      if (!ok) return;
      window.Store.update((s) => { s.cart = []; });
      UI.promo = "";
      toast("Корзина очищена", "info");
    },
    "market.applyPromo": () => {
      const input = document.getElementById("promoInput");
      const code = String((input && input.value) || "").trim().toUpperCase();
      if (!code) { toast("Введите промокод", "warn"); return; }
      if (!PROMO_CODES[code]) {
        UI.promo = "";
        toast("Промокод не найден. Попробуйте PETLIFE10 или MISSION", "error");
        repaint("marketArea", marketAreaHtml());
        return;
      }
      UI.promo = code;
      repaint("marketArea", marketAreaHtml());
      toast("Промокод " + code + " применён: " + PROMO_CODES[code].note, "ok");
    },
    "market.clearPromo": () => {
      UI.promo = "";
      repaint("marketArea", marketAreaHtml());
      toast("Промокод снят", "info");
    },
    "market.checkout": () => checkout(),

    /* --- заказы --- */
    "market.repeat": (ds) => {
      const order = window.Store.array("orders").find((o) => o.id === ds.id);
      if (!order) return;
      let added = 0;
      window.Store.update((s) => {
        if (!Array.isArray(s.cart)) s.cart = [];
        (order.items || []).forEach((it) => {
          const product = D.products.find((p) => p.id === it.id || p.name === it.name);
          const id = product ? product.id : (it.id || ("custom-" + hash(it.name)));
          const line = s.cart.find((i) => i.id === id);
          if (line) line.qty = (+line.qty || 0) + (+it.qty || 1);
          else s.cart.push({
            id: id, name: it.name, emoji: it.emoji || (product ? product.emoji : "📦"),
            price: it.price, category: product ? product.category : "", qty: +it.qty || 1
          });
          added += 1;
        });
      });
      toast("Позиции заказа (" + added + " шт) снова в корзине 🛒", "ok");
    },
    "market.cancelOrder": async (ds) => {
      const ok = await confirmDialog("Отменить заказ? Возврат придёт на карту в течение 3 дней.", { ok: "Отменить заказ", danger: true, icon: "🚫" });
      if (!ok) return;
      window.Store.update((s) => {
        const o = (s.orders || []).find((x) => x.id === ds.id);
        if (o) o.status = "отменён";
      });
      toast("Заказ отменён", "info");
    },

    /* --- premium --- */
    "market.subscribe": (ds) => {
      const plan = ds.plan === "plus" ? "plus" : "premium";
      const price = plan === "plus" ? 699 : 399;
      window.Store.update((s) => {
        s.owner.premium = true;
        s.owner.premiumPlan = plan;
        s.owner.autoRenew = true;
        if (!s.owner.premiumSince) s.owner.premiumSince = fmt.today();
      });
      toast("Подписка " + (plan === "plus" ? "Premium+" : "Premium") + " активна: " + fmt.money(price) + " в месяц, 5% — в приюты ❤️", "ok");
    },
    "market.freePlan": () => {
      window.Store.update((s) => { s.owner.premium = false; s.owner.premiumPlan = "free"; });
      toast("Остались на бесплатном тарифе — базовые функции доступны всегда", "info");
    },
    "market.manage": () => manageModal()
  });
})();
