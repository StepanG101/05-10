/* ============================================================================
 * PetLife — app/panel-social.js
 * Панель «Сообщество и форум» (ТЗ №21–24 + форум владельцев).
 * Подразделы (ctx.tab): forum · friends · lost · adopt · mission.
 * Ванильный JS, без библиотек и внешних ресурсов. Все действия — data-act="social.*".
 * ==========================================================================*/
(function () {
  "use strict";

  const { esc, fmt, card, stat, badge, progress, empty, field, list, bullets,
          toast, modal, confirmDialog, promptDialog, Actions } = window.PL;
  const D = window.PL_DATA;
  const S = () => window.Store.state;

  /* --------------------------------------------------------------- константы */
  const TAGS = ["Дрессировка", "Здоровье", "Питание", "Прогулки", "Миссия", "Лайфхаки", "Вопрос"];
  const GOAL = 20000;            // цель миссии — 20 000 питомцев
  const PREMIUM_PRICE = 399;     // ₽/мес
  const PREMIUM_PLUS_PRICE = 699;
  const RATION_DAY = 63;         // ₽ — дневной рацион подопечного приюта
  const SHARE_LINK = "https://petlife.app/mission";

  const TABS = [
    { id: "forum", icon: "💬", title: "Форум владельцев", sub: "Темы, лайки, комментарии и живой опыт сообщества" },
    { id: "friends", icon: "🤝", title: "Друзья для прогулок", sub: "Соседи с питомцами: район, время, рейтинг" },
    { id: "lost", icon: "🚨", title: "Потеряшки рядом", sub: "Гео-алерты о пропавших питомцах и карта района" },
    { id: "adopt", icon: "❤️", title: "Виртуальное усыновление", sub: "Шефство над питомцами приютов-партнёров" },
    { id: "mission", icon: "🌍", title: "Миссия и волонтёрство", sub: "5% подписки, пожертвования и помощь приютам" }
  ];

  /* онлайн по часам суток — детерминированно, «живой» счётчик */
  const ONLINE_CURVE = [38, 26, 18, 13, 15, 29, 54, 92, 134, 162, 178, 171,
                        158, 174, 188, 183, 169, 196, 222, 238, 214, 178, 128, 82];

  const DISTRICT_XY = {
    "Центральный": [50, 46], "Северный": [48, 14], "Южный": [50, 86],
    "Парковый": [80, 64], "Западный": [14, 50], "Восточный": [86, 46]
  };

  const FORUM_RULES = [
    "Уважайте друг друга: без оскорблений и споров о «правильных» породах.",
    "Совет — не диагноз: при симптомах обращайтесь к ветеринару.",
    "Никакой рекламы, продажи и передачи животных в темах форума.",
    "Личные данные, адреса и телефоны — только в личных сообщениях.",
    "Делитесь своими фото питомцев; чужие — не публикуйте."
  ];

  const HELP_WAYS = [
    "🥣 <b>Корм</b> — передайте корм в приют «Верный друг» или закажите его в маркетплейсе с доставкой в приют.",
    "🙋 <b>Волонтёрство</b> — 3 часа выгула в выходные закрывают потребность 12 собак.",
    "📣 <b>Репост</b> — объявление о потеряшке в среднем видят 400 соседей рядом.",
    "💉 <b>Стерилизация</b> — главный способ снизить число бездомных питомцев на улицах.",
    "🏠 <b>Ответственное владение</b> — чип, адресник и прививки возвращают домой 8 из 10 питомцев."
  ];

  const WEEK_DAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
  const VOLUNTEER_JOBS = [
    { id: "walk", emoji: "🚶", label: "Выгул собак", hours: 3 },
    { id: "photo", emoji: "📸", label: "Фотосъёмка для соцсетей", hours: 2 },
    { id: "drive", emoji: "🚗", label: "Перевозка корма и питомцев", hours: 2 },
    { id: "pr", emoji: "📣", label: "Пиар и репосты", hours: 1 }
  ];

  /* ------------------------------------------------------------ UI-состояние */
  const UI = {
    forum: { q: "", tag: "", sort: "fresh" },
    openComments: {},
    friends: { q: "", district: "", tag: "", time: "", sort: "near" },
    lost: { species: "all", radius: 5, focus: "" },
    adopt: { species: "all", shelter: "" }
  };

  /* ---------------------------------------------------------------- помощники */
  function nl2br(v) { return esc(v).replace(/\n/g, "<br>"); }

  function hash(str) {
    const s = String(str == null ? "" : str);
    let h = 7;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 99991;
    return h;
  }

  function money2(v) { return fmt.num(v, 2) + " ₽"; }

  function repaint(id, html) {
    const node = document.getElementById(id);
    if (node) node.innerHTML = html;
  }

  /* перерисовать ленту форума вместе с боковой колонкой (фильтры, статистика) */
  function repaintForum() {
    repaint("forumArea", forumAreaHtml());
    repaint("forumSide", forumSideHtml());
  }

  /* закрыть модалку, в которой находится кнопка (или верхнюю открытую) */
  function closeTopModal(el) {
    const scope = el && el.closest ? el.closest(".modal-wrap") : null;
    const all = document.querySelectorAll(".modal-wrap");
    const wrap = scope || (all.length ? all[all.length - 1] : null);
    if (wrap) { const x = wrap.querySelector(".modal-x"); if (x) x.click(); }
  }

  function copyText(text, okMsg) {
    const done = () => toast(okMsg || "Скопировано в буфер обмена", "ok");
    const fallback = () => {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        done();
      } catch (err) {
        toast("Не удалось скопировать — текст: " + text, "warn");
      }
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(fallback);
        return;
      }
    } catch (err) { /* используем резервный способ */ }
    fallback();
  }

  function onlineNow() {
    const now = new Date();
    const seed = (now.getDate() * 7 + now.getMonth() * 3) % 19;
    return ONLINE_CURVE[now.getHours()] + seed;
  }

  function subTabs(active, panel) {
    return `<div class="chip-row mb-2">${TABS.map((t) =>
      `<button class="tag ${t.id === active ? "active" : ""}" data-act="hub.open" data-panel="${panel}" data-tab="${t.id}">${t.icon} ${esc(t.title)}</button>`
    ).join("")}</div>`;
  }

  function kpiRow(items) {
    return `<div class="kpi-row">${items.map((i) => stat(i)).join("")}</div>`;
  }

  function missionState() {
    const m = S().mission || {};
    return {
      helped: +m.helped || 0,
      myImpact: +m.myImpact || 0,
      sheltersSupported: +m.sheltersSupported || 0,
      volunteerHours: +m.volunteerHours || 0
    };
  }

  function monthlyShare() {
    const owner = S().owner || {};
    const price = owner.premium ? (owner.premiumPlan === "plus" ? PREMIUM_PLUS_PRICE : PREMIUM_PRICE) : PREMIUM_PRICE;
    return { price, share: price * 0.05, active: !!owner.premium };
  }

  /* инициализация необязательных полей: replies, sightings, служебные массивы */
  function ensureData() {
    const s = S();
    const Store = window.Store;
    let changed = false;

    if (!Array.isArray(s.posts)) { s.posts = []; changed = true; }
    s.posts.forEach((p) => {
      if (!Array.isArray(p.replies)) { p.replies = []; changed = true; }
      if (!Array.isArray(p.tags)) { p.tags = []; changed = true; }
      if (typeof p.likes !== "number") { p.likes = 0; changed = true; }
      if (typeof p.comments !== "number") { p.comments = p.replies.length; changed = true; }
      if (typeof p.liked !== "boolean") { p.liked = false; changed = true; }
      if (typeof p.mine !== "boolean") { p.mine = false; changed = true; }
    });

    if (!Array.isArray(s.lostAlerts)) { s.lostAlerts = []; changed = true; }
    s.lostAlerts.forEach((l) => {
      if (typeof l.sightings !== "number") { l.sightings = 0; changed = true; }
      if (!l.status) { l.status = "ищут"; changed = true; }
    });

    ["friends", "walkInvites", "adoptions", "volunteerShifts", "donations"].forEach((key) => {
      if (!Array.isArray(s[key])) { s[key] = []; changed = true; }
    });

    if (changed) window.Store.save();
  }

  /* возраст темы в минутах — для сортировки «Свежие» */
  function agoMinutes(p) {
    if (p.created) {
      const t = new Date(p.created);
      if (!isNaN(t)) return (Date.now() - t.getTime()) / 60000;
    }
    const a = String(p.ago || "").toLowerCase();
    let m;
    if (a.indexOf("только что") === 0) return 0;
    m = /(\d+)\s*мин/.exec(a); if (m) return +m[1];
    m = /(\d+)\s*час/.exec(a); if (m) return +m[1] * 60;
    if (a.indexOf("вчера") === 0) return 1440;
    m = /(\d+)\s*дн/.exec(a); if (m) return +m[1] * 1440;
    return 99999;
  }

  /* ================================================================ ФОРУМ */
  function postTitle(p) { return p.title ? "<b>" + esc(p.title) + "</b><br>" : ""; }

  function forumTags(list2) {
    const map = {};
    list2.forEach((p) => (p.tags || []).forEach((t) => {
      const k = String(t).toLowerCase();
      map[k] = (map[k] || 0) + 1;
    }));
    return Object.keys(map).map((k) => ({ tag: k, count: map[k] }))
      .sort((a, b) => (b.count - a.count) || a.tag.localeCompare(b.tag, "ru"));
  }

  function forumFiltered() {
    const posts = window.Store.array("posts");
    const q = UI.forum.q.trim().toLowerCase();
    let out = posts.filter((p) => {
      if (UI.forum.tag && !(p.tags || []).some((t) => String(t).toLowerCase() === UI.forum.tag)) return false;
      if (q) {
        const hay = ((p.title || "") + " " + (p.text || "") + " " + (p.author || "") + " " + (p.pet || "")).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    if (UI.forum.sort === "mine") out = out.filter((p) => p.mine);
    if (UI.forum.sort === "popular") {
      out = out.slice().sort((a, b) => ((+b.likes || 0) * 2 + (+b.comments || 0)) - ((+a.likes || 0) * 2 + (+a.comments || 0)));
    } else {
      out = out.slice().sort((a, b) => agoMinutes(a) - agoMinutes(b));
    }
    return out;
  }

  function commentsHtml(p) {
    const replies = p.replies || [];
    const shown = replies.map((r) => `<div style="padding:8px 0;border-bottom:1px dashed var(--line)">
        <div class="small"><b>${esc(r.author)}</b> <span class="muted">· ${esc(r.ago || "только что")}</span></div>
        <div class="small">${nl2br(r.text)}</div>
      </div>`).join("");
    const hidden = (+p.comments || 0) - replies.length;
    return `<div class="mt-2" style="border-top:1px dashed var(--line);padding-top:8px">
      ${replies.length ? shown : `<div class="muted small">Пока никто не ответил — будьте первым, кто поддержит автора 🐾</div>`}
      ${hidden > 0 ? `<div class="muted tiny mt-1">Ещё ${fmt.int(hidden)} ${fmt.plural(hidden, "комментарий", "комментария", "комментариев")} в полной ветке</div>` : ""}
      <div class="chat-input" style="border-top:none;padding-top:8px">
        <input class="input" id="reply-${esc(p.id)}" placeholder="Ваш ответ автору…">
        <button class="btn btn-primary btn-sm" data-act="social.reply" data-id="${esc(p.id)}">Ответить</button>
      </div>
    </div>`;
  }

  function postCard(p) {
    const open = !!UI.openComments[p.id];
    const tags = (p.tags || []).length
      ? `<div class="chip-row mt-2">${p.tags.map((t) =>
          `<button class="tag" data-act="social.tag" data-tag="${esc(String(t).toLowerCase())}">#${esc(t)}</button>`).join("")}</div>`
      : "";
    return `<article class="post" id="post-${esc(p.id)}">
      <div class="post-head">
        <div class="avatar">${esc(p.emoji || "🐾")}</div>
        <div style="flex:1;min-width:0">
          <div><b>${esc(p.author || "Гость")}</b> ${p.mine ? badge("моя тема", "violet") : ""}</div>
          <div class="muted small">${esc(p.pet || "питомец не указан")} · ${esc(p.ago || "недавно")}</div>
        </div>
        <button class="btn btn-xs btn-ghost" data-act="social.more" data-id="${esc(p.id)}">⋯ Ещё</button>
      </div>
      <div class="post-text">${postTitle(p)}${nl2br(p.text)}</div>
      ${tags}
      <div class="post-actions">
        <button class="${p.liked ? "liked" : ""}" data-act="social.like" data-id="${esc(p.id)}">❤️ Нравится · ${fmt.int(p.likes || 0)}</button>
        <button data-act="social.comments" data-id="${esc(p.id)}">💬 Комментарии (${fmt.int(p.comments || 0)})</button>
        <button data-act="social.share" data-id="${esc(p.id)}">🔗 Поделиться</button>
      </div>
      ${open ? commentsHtml(p) : ""}
    </article>`;
  }

  function forumAreaHtml() {
    const posts = window.Store.array("posts");
    const tags = forumTags(posts);
    const shown = forumFiltered();
    const tagChips = [`<button class="tag ${UI.forum.tag ? "" : "active"}" data-act="social.tag" data-tag="">Все темы</button>`]
      .concat(tags.map((t) => `<button class="tag ${UI.forum.tag === t.tag ? "active" : ""}" data-act="social.tag" data-tag="${esc(t.tag)}">#${esc(t.tag)} · ${t.count}</button>`))
      .join("");
    const sorts = [["fresh", "🕒 Свежие"], ["popular", "🔥 Популярные"], ["mine", "🙋 Мои темы"]]
      .map((s) => `<button class="tag ${UI.forum.sort === s[0] ? "active" : ""}" data-act="social.sort" data-sort="${s[0]}">${s[1]}</button>`).join("");
    const body = shown.length
      ? `<div class="stack" style="gap:14px">${shown.map(postCard).join("")}</div>`
      : empty("🧵", "Тем не найдено", "Измените фильтр или создайте свою тему — сообщество ответит.",
          `<button class="btn btn-primary mt-2" data-act="social.newPost">✍️ Создать тему</button>`);
    return `<div class="stack" style="gap:12px">
      <div class="chip-row">${tagChips}</div>
      <div class="row-between">
        <div class="chip-row">${sorts}</div>
        <span class="muted small">Показано ${fmt.int(shown.length)} из ${fmt.int(posts.length)}</span>
      </div>
      ${body}
    </div>`;
  }

  function forumSideHtml() {
    const posts = window.Store.array("posts");
    const authors = {};
    posts.forEach((p) => {
      const key = p.author || "Гость";
      if (!authors[key]) authors[key] = { name: key, emoji: p.emoji || "🐾", posts: 0, likes: 0 };
      authors[key].posts += 1;
      authors[key].likes += +p.likes || 0;
    });
    const top = Object.keys(authors).map((k) => authors[k])
      .sort((a, b) => (b.posts * 10 + b.likes) - (a.posts * 10 + a.likes)).slice(0, 5);
    const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
    const topBody = top.length
      ? `<div class="stack" style="gap:6px">${top.map((a, i) =>
          `<div class="kv-row"><span class="kv-k">${medals[i]} ${esc(a.emoji)} <b>${esc(a.name)}</b></span>
            <span class="kv-v">${fmt.int(a.posts)} ${fmt.plural(a.posts, "тема", "темы", "тем")} · ❤️ ${fmt.int(a.likes)}</span></div>`).join("")}</div>`
      : `<div class="muted small">Активных авторов пока нет — станьте первым!</div>`;

    const tags = forumTags(posts).slice(0, 8);
    const tagsBody = tags.length
      ? `<div class="chip-row">${tags.map((t) =>
          `<button class="tag ${UI.forum.tag === t.tag ? "active" : ""}" data-act="social.tag" data-tag="${esc(t.tag)}">#${esc(t.tag)} · ${t.count}</button>`).join("")}</div>`
      : `<div class="muted small">Теги появятся вместе с первыми темами.</div>`;

    const likes = posts.reduce((s, p) => s + (+p.likes || 0), 0);
    const comments = posts.reduce((s, p) => s + (+p.comments || 0), 0);
    const online = onlineNow();
    const onlineBody = `<div class="kv">
      <div class="kv-row"><span class="kv-k">🟢 Онлайн сейчас</span><span class="kv-v">${fmt.int(online)} владельцев</span></div>
      <div class="kv-row"><span class="kv-k">🐾 Гуляют прямо сейчас</span><span class="kv-v">${fmt.int(Math.round(online * 0.42))}</span></div>
      <div class="kv-row"><span class="kv-k">💬 Сообщений в ленте</span><span class="kv-v">${fmt.int(comments)}</span></div>
      <div class="kv-row"><span class="kv-k">❤️ Лайков за неделю</span><span class="kv-v">${fmt.int(likes)}</span></div>
    </div>
    <p class="muted tiny mt-1">Счётчик обновляется с каждой перерисовкой панели — по часам суток.</p>`;

    return `<div class="stack">
      ${card({ title: "Топ авторов недели", icon: "🏆", body: topBody })}
      ${card({ title: "Популярные теги", icon: "🔥", body: tagsBody })}
      ${card({ title: "Онлайн сейчас", icon: "🟢", body: onlineBody })}
      ${card({ title: "Правила форума", icon: "📜", body: list(FORUM_RULES, "tick") })}
    </div>`;
  }

  function forumHtml() {
    const posts = window.Store.array("posts");
    const likes = posts.reduce((s, p) => s + (+p.likes || 0), 0);
    const comments = posts.reduce((s, p) => s + (+p.comments || 0), 0);
    const mine = posts.filter((p) => p.mine).length;
    return `<div class="stack">
      ${kpiRow([
        { icon: "🧵", value: fmt.int(posts.length), label: "Тем в сообществе", hint: "владельцы рядом делятся опытом" },
        { icon: "❤️", value: fmt.int(likes), label: "Лайков", hint: "самые полезные темы недели" },
        { icon: "💬", value: fmt.int(comments), label: "Комментариев", hint: "живое обсуждение" },
        { icon: "🟢", value: fmt.int(onlineNow()), label: "Онлайн сейчас", hint: "обновляется по часам", kind: "green" }
      ])}
      <div class="panel-grid cols-2">
        <section class="card">
          <header class="card-head">
            <h3><span class="card-ico">💬</span>Лента форума${mine ? ` · ваших тем: ${mine}` : ""}</h3>
          </header>
          <div class="card-body stack" style="gap:12px">
            <input class="input" id="forumSearch" data-live="forum.q" value="${esc(UI.forum.q)}"
                   placeholder="🔍 Поиск по заголовку, тексту или автору…" autocomplete="off">
            <div id="forumArea">${forumAreaHtml()}</div>
          </div>
        </section>
        <div class="stack" id="forumSide">${forumSideHtml()}</div>
      </div>
    </div>`;
  }

  function newPostModal() {
    const pets = window.Store.pets();
    const current = window.Store.pet();
    const body = `
      ${field({ id: "np-title", label: "Заголовок темы", placeholder: "Например: как приучить корги к подъезду" })}
      ${field({ id: "np-text", type: "textarea", rows: 4, label: "Текст", placeholder: "Расскажите, что случилось и что помогло…" })}
      <div class="grid grid-2">
        ${field({ id: "np-tag", type: "select", label: "Тег", value: "Вопрос", options: TAGS.map((t) => ({ value: t, label: t })) })}
        ${field({ id: "np-pet", type: "select", label: "Питомец", value: current ? current.id : "",
                  options: pets.map((p) => ({ value: p.id, label: (p.emoji || "🐾") + " " + p.name })) })}
      </div>
      <p class="muted small">Тема сразу появится в ленте: сообщество отвечает в среднем за 12 минут.</p>`;
    modal({
      title: "Новая тема форума", icon: "✍️", body,
      actions: [
        { label: "Отмена" },
        { label: "Опубликовать", kind: "primary", onClick: (wrap) => {
            const title = wrap.querySelector("#np-title").value.trim();
            const text = wrap.querySelector("#np-text").value.trim();
            if (!title && !text) { toast("Добавьте заголовок или текст темы", "warn"); return false; }
            createPost(title, text, wrap.querySelector("#np-tag").value, wrap.querySelector("#np-pet").value);
            return true;
          } }
      ]
    });
  }

  function createPost(title, text, tag, petId) {
    const pet = window.Store.pet(petId) || {};
    const breed = window.Store.breed(pet);
    const post = {
      id: window.Store.uid("po"),
      author: (S().owner && S().owner.name) || "Вы",
      emoji: pet.emoji || "🐾",
      pet: (pet.name || "Питомец") + (breed ? ", " + breed.name : ""),
      title: title,
      text: text,
      likes: 0,
      comments: 0,
      tags: [String(tag || "Вопрос").toLowerCase()],
      ago: "только что",
      created: new Date().toISOString(),
      liked: false,
      mine: true,
      replies: []
    };
    window.Store.update((s) => {
      if (!Array.isArray(s.posts)) s.posts = [];
      s.posts.unshift(post);
    });
    UI.forum.q = "";
    UI.forum.tag = "";
    UI.forum.sort = "fresh";
    toast("Тема опубликована — владельцы рядом уже читают 🎉", "ok");
  }

  function moreModal(id) {
    const post = window.Store.array("posts").find((p) => p.id === id);
    if (!post) return;
    const body = `<p class="muted small">Тема «${esc(post.title || post.text.slice(0, 60))}» от ${esc(post.author)}.</p>
      <div class="stack" style="gap:8px">
        <button class="btn btn-ghost btn-block" data-act="social.share" data-id="${esc(id)}">🔗 Скопировать ссылку на тему</button>
        <button class="btn btn-ghost btn-block" data-act="social.reportPost" data-id="${esc(id)}">🚩 Пожаловаться модератору</button>
        ${post.mine ? `<button class="btn btn-danger btn-block" data-act="social.delete" data-id="${esc(id)}">🗑 Удалить тему</button>` : ""}
      </div>`;
    modal({ title: "Действия с темой", icon: "⋯", body });
  }

  /* =============================================================== ДРУЗЬЯ */
  function friendsFiltered() {
    const friends = window.Store.array("friends");
    const f = UI.friends;
    const q = f.q.trim().toLowerCase();
    let out = friends.filter((x) => {
      if (q && ((x.name || "") + " " + (x.pet || "") + " " + (x.breed || "")).toLowerCase().indexOf(q) === -1) return false;
      if (f.district && x.district !== f.district) return false;
      if (f.tag && !(x.tags || []).some((t) => String(t).toLowerCase() === f.tag.toLowerCase())) return false;
      if (f.time && f.time !== "любое" && x.time !== f.time && x.time !== "любое") return false;
      return true;
    });
    out = out.slice().sort((a, b) => f.sort === "rating"
      ? ((b.rating || 0) - (a.rating || 0)) || ((a.distance || 0) - (b.distance || 0))
      : ((a.distance || 0) - (b.distance || 0)) || ((b.rating || 0) - (a.rating || 0)));
    return out;
  }

  function friendCard(f) {
    return `<div class="friend-card">
      <div class="avatar">${esc(f.emoji || "🐾")}</div>
      <div style="flex:1;min-width:0">
        <div class="med-name">${esc(f.name)} и ${esc(f.pet)} <span class="muted small">· ${esc(f.breed)}</span></div>
        <div class="med-sub">📍 ${esc(f.district)} · ${fmt.num(f.distance, 1)} км · 🕒 ${esc(f.time)} · ⭐ ${fmt.num(f.rating, 1)}</div>
        <div class="chip-row mt-1">${(f.tags || []).map((t) =>
          `<button class="tag" data-act="social.friendTag" data-tag="${esc(String(t).toLowerCase())}">${esc(t)}</button>`).join("")}</div>
      </div>
      <button class="btn btn-primary btn-sm" data-act="social.invite" data-id="${esc(f.id)}">🤝 Пригласить на прогулку</button>
    </div>`;
  }

  function friendsAreaHtml() {
    const friends = window.Store.array("friends");
    const f = UI.friends;
    const districts = [];
    friends.forEach((x) => { if (x.district && districts.indexOf(x.district) === -1) districts.push(x.district); });
    const times = [];
    friends.forEach((x) => { if (x.time && x.time !== "любое" && times.indexOf(x.time) === -1) times.push(x.time); });
    times.sort();
    const tags = [];
    friends.forEach((x) => (x.tags || []).forEach((t) => { if (tags.indexOf(t) === -1) tags.push(t); }));

    const shown = friendsFiltered();
    const listHtml = shown.length
      ? `<div class="stack" style="gap:12px">${shown.map(friendCard).join("")}</div>`
      : empty("🔍", "Никого не нашли", "Измените район, тег или время прогулки — соседи точно есть.",
          `<button class="btn btn-ghost mt-2" data-act="social.resetFriends">Сбросить фильтры</button>`);

    return `<div class="stack" style="gap:12px">
      <div class="grid grid-2">
        ${field({ id: "fr-district", type: "select", label: "Район", value: f.district, attrs: 'data-live="friends.district"',
                  options: [{ value: "", label: "Все районы" }].concat(districts.map((d) => ({ value: d, label: d }))) })}
        ${field({ id: "fr-time", type: "select", label: "Удобное время", value: f.time, attrs: 'data-live="friends.time"',
                  options: [{ value: "", label: "Любое время" }].concat(times.map((t) => ({ value: t, label: t }))) })}
      </div>
      <div class="chip-row">
        <button class="tag ${f.tag ? "" : "active"}" data-act="social.friendTag" data-tag="">Все интересы</button>
        ${tags.map((t) => `<button class="tag ${f.tag === t.toLowerCase() ? "active" : ""}" data-act="social.friendTag" data-tag="${esc(t.toLowerCase())}">${esc(t)}</button>`).join("")}
      </div>
      <div class="row-between">
        <div class="chip-row">
          <button class="tag ${f.sort === "near" ? "active" : ""}" data-act="social.friendSort" data-sort="near">📍 Ближе</button>
          <button class="tag ${f.sort === "rating" ? "active" : ""}" data-act="social.friendSort" data-sort="rating">⭐ По рейтингу</button>
        </div>
        <span class="muted small">Найдено ${fmt.int(shown.length)} из ${fmt.int(friends.length)}</span>
      </div>
      ${listHtml}
    </div>`;
  }

  function invitesHtml() {
    const invites = window.Store.array("walkInvites");
    const body = invites.length
      ? `<div class="stack" style="gap:12px">${invites.map((i) => {
          const kind = i.status === "принято" ? "ok" : i.status === "отменено" ? "muted" : "warn";
          return `<div class="friend-card">
            <div class="avatar">🐾</div>
            <div style="flex:1;min-width:0">
              <div class="med-name">${esc(i.name)} и ${esc(i.pet)} ${badge(i.status, kind)}</div>
              <div class="med-sub">📅 ${esc(fmt.date(i.date))} · 🕒 ${esc(i.time)} · 🌳 ${esc(i.place)}</div>
            </div>
            <div class="chip-row">
              ${i.status === "ожидает ответа" ? `<button class="btn btn-sm btn-green" data-act="social.confirmInvite" data-id="${esc(i.id)}">🤝 Подтвердить</button>` : ""}
              <button class="btn btn-sm btn-ghost" data-act="social.writeFriend" data-id="${esc(i.id)}">✉️ Написать</button>
              ${i.status === "отменено" ? "" : `<button class="btn btn-sm btn-danger" data-act="social.cancelInvite" data-id="${esc(i.id)}">Отменить</button>`}
            </div>
          </div>`;
        }).join("")}</div>`
      : empty("🤝", "Приглашений пока нет", "Найдите соседа с питомцем и договоритесь о совместной прогулке.",
          `<button class="btn btn-primary mt-2" data-act="social.focusFriends">Найти друзей</button>`);
    return card({ title: "Мои приглашения на прогулку", icon: "📨", body });
  }

  function walkSummaryHtml() {
    const invites = window.Store.array("walkInvites");
    const friends = window.Store.array("friends");
    const accepted = invites.filter((i) => i.status === "принято").length;
    const pending = invites.filter((i) => i.status === "ожидает ответа").length;
    const newFriends = friends.filter((f) => f.invited).length;
    const minutes = accepted * 60;
    const body = `<div class="kv">
        <div class="kv-row"><span class="kv-k">🤝 Приглашений принято</span><span class="kv-v">${fmt.int(accepted)}</span></div>
        <div class="kv-row"><span class="kv-k">⏳ Ждут ответа</span><span class="kv-v">${fmt.int(pending)}</span></div>
        <div class="kv-row"><span class="kv-k">🆕 Новых друзей</span><span class="kv-v">${fmt.int(newFriends)}</span></div>
        <div class="kv-row"><span class="kv-k">⏱ Совместных прогулок</span><span class="kv-v">${fmt.int(accepted)} · ${fmt.int(minutes)} мин</span></div>
      </div>
      ${accepted ? `<p class="muted small mt-2">Отличный результат: ${fmt.plural(accepted, "совместная прогулка", "совместные прогулки", "совместных прогулок")} уже в календаре 🐾</p>`
                 : `<p class="muted small mt-2">Подтвердите приглашение, чтобы прогулка попала в счётчик.</p>`}`;
    return card({ title: "Совместные прогулки", icon: "🐾", body });
  }

  function friendsHtml() {
    const friends = window.Store.array("friends");
    const invites = window.Store.array("walkInvites");
    const near = friends.filter((f) => f.distance <= 1).length;
    return `<div class="stack">
      ${kpiRow([
        { icon: "🐾", value: fmt.int(friends.length), label: "Владельцев рядом", hint: "с питомцами в вашем городе" },
        { icon: "📍", value: fmt.int(near), label: "В радиусе 1 км", hint: "можно встретиться пешком" },
        { icon: "📨", value: fmt.int(invites.filter((i) => i.status === "ожидает ответа").length), label: "Ждут ответа", hint: "приглашения на прогулку" },
        { icon: "🤝", value: fmt.int(invites.filter((i) => i.status === "принято").length), label: "Прогулок согласовано", hint: "совместные выходы", kind: "green" }
      ])}
      <div class="panel-grid cols-2">
        <section class="card">
          <header class="card-head"><h3><span class="card-ico">🔎</span>Поиск друзей для прогулок</h3></header>
          <div class="card-body stack" style="gap:12px">
            <input class="input" id="friendsSearch" data-live="friends.q" value="${esc(UI.friends.q)}"
                   placeholder="🔍 Имя владельца, кличка или порода…" autocomplete="off">
            <div id="friendsArea">${friendsAreaHtml()}</div>
          </div>
        </section>
        <div class="stack">${invitesHtml()}${walkSummaryHtml()}</div>
      </div>
    </div>`;
  }

  function inviteModal(friendId) {
    const f = window.Store.array("friends").find((x) => x.id === friendId);
    if (!f) return;
    const parks = D.places.filter((p) => p.type === "park");
    const tomorrow = window.Store.iso(-1);
    const body = `
      <div class="friend-card mb-2">
        <div class="avatar">${esc(f.emoji || "🐾")}</div>
        <div><div class="med-name">${esc(f.name)} и ${esc(f.pet)}</div>
        <div class="med-sub">${esc(f.breed)} · ${esc(f.district)} · ${fmt.num(f.distance, 1)} км · ⭐ ${fmt.num(f.rating, 1)}</div></div>
      </div>
      <div class="grid grid-2">
        ${field({ id: "iv-date", type: "date", label: "Дата", value: tomorrow })}
        ${field({ id: "iv-time", type: "time", label: "Время", value: f.time && f.time !== "любое" ? f.time : "19:00" })}
      </div>
      ${field({ id: "iv-place", type: "select", label: "Место прогулки",
                options: parks.map((p) => ({ value: p.name, label: p.emoji + " " + p.name + " · " + p.address })) })}
      <p class="muted small">Друг получит приглашение и сможет подтвердить или предложить другое время.</p>`;
    modal({
      title: "Приглашение на прогулку", icon: "🤝", body,
      actions: [
        { label: "Отмена" },
        { label: "Отправить приглашение", kind: "primary", onClick: (wrap) => {
            const invite = {
              id: window.Store.uid("wi"),
              friendId: f.id,
              name: f.name,
              pet: f.pet,
              date: wrap.querySelector("#iv-date").value || tomorrow,
              time: wrap.querySelector("#iv-time").value || "19:00",
              place: wrap.querySelector("#iv-place").value || (parks[0] ? parks[0].name : "Парк"),
              status: "ожидает ответа",
              created: new Date().toISOString()
            };
            window.Store.update((s) => {
              if (!Array.isArray(s.walkInvites)) s.walkInvites = [];
              s.walkInvites.unshift(invite);
              const fr = (s.friends || []).find((x) => x.id === f.id);
              if (fr) fr.invited = true;
            });
            toast("Приглашение отправлено: " + f.name + " и " + f.pet + " 🐾", "ok");
            return true;
          } }
      ]
    });
  }

  /* ============================================================= ПОТЕРЯШКИ */
  function lostPoint(alert) {
    const base = DISTRICT_XY[alert.district] || [50, 50];
    const angle = (hash(alert.id || alert.name) % 360) * Math.PI / 180;
    const r = 6 + Math.min(26, (+alert.distance || 1) * 7);
    const x = Math.max(6, Math.min(94, base[0] + Math.cos(angle) * r * 0.62));
    const y = Math.max(7, Math.min(93, base[1] + Math.sin(angle) * r * 0.62));
    return { x: +x.toFixed(1), y: +y.toFixed(1) };
  }

  function lostFiltered() {
    const alerts = window.Store.array("lostAlerts");
    return alerts.filter((l) => {
      if (UI.lost.species !== "all" && l.species !== UI.lost.species) return false;
      if ((+l.distance || 0) > UI.lost.radius) return false;
      return true;
    }).sort((a, b) => {
      const sa = a.status === "ищут" ? 0 : 1, sb = b.status === "ищут" ? 0 : 1;
      return (sa - sb) || ((+a.distance || 0) - (+b.distance || 0));
    });
  }

  function mapInnerHtml(shown) {
    const places = D.places.map((p) => `<button class="map-marker" style="left:${p.x}%;top:${p.y}%"
        data-act="social.place" data-id="${esc(p.id)}" title="${esc(p.name)}">
        <span class="pin">${p.emoji}</span><span class="pin-label">${esc(p.name)}</span>
      </button>`).join("");
    const lost = shown.map((l) => {
      const pt = lostPoint(l);
      const color = l.status === "ищут" ? "#E53935" : "#43A047";
      return `<button class="map-marker ${UI.lost.focus === l.id ? "active" : ""}" style="left:${pt.x}%;top:${pt.y}%"
        data-act="social.focusLost" data-id="${esc(l.id)}" title="${esc(l.name)}">
        <span class="pin" style="border-color:${color}">${esc(l.emoji || "🐾")}</span>
        <span class="pin-label">${esc(l.name)} · ${esc(l.district)} · ${fmt.num(l.distance, 1)} км</span>
      </button>`;
    }).join("");
    return `${places}${lost}
      <div class="map-user" style="left:50%;top:50%"><span class="radius"></span><span class="pulse"></span></div>`;
  }

  function lostCard(l) {
    const active = l.status === "ищут";
    const phone = String(l.phone || "").replace(/[^\d+]/g, "");
    return `<article class="post" id="lost-${esc(l.id)}" ${UI.lost.focus === l.id ? 'style="border-color:var(--blue);box-shadow:0 0 0 3px rgba(44,95,141,.12)"' : ""}>
      <div class="post-head">
        <div class="avatar" style="font-size:1.7rem">${esc(l.emoji || "🐾")}</div>
        <div style="flex:1;min-width:0">
          <div><b>${esc(l.name)}</b> ${badge(active ? "ищут" : "нашёлся", active ? "danger" : "ok")}
            <span class="muted small">${l.species === "cat" ? "кошка" : "собака"} · ${esc(l.breed)}</span></div>
          <div class="muted small">📍 ${esc(l.district)} · ${fmt.num(l.distance, 1)} км от вас · 🕒 ${esc(l.when)}</div>
        </div>
        <div style="text-align:right">${badge("🎁 " + l.reward, "warn")}</div>
      </div>
      <div class="post-text">🔎 ${esc(l.features)}</div>
      <div class="muted small mt-1">👀 Видели: <b>${fmt.int(l.sightings || 0)}</b> · 📞 ${esc(l.phone)}</div>
      <div class="post-actions">
        <button data-act="social.seen" data-id="${esc(l.id)}">👀 Я видел</button>
        <a class="btn btn-xs btn-ghost" href="tel:${esc(phone)}">📞 Позвонить</a>
        ${active
          ? `<button data-act="social.found" data-id="${esc(l.id)}">✅ Питомец нашёлся</button>`
          : `<button data-act="social.reopen" data-id="${esc(l.id)}">🔁 Возобновить поиск</button>`}
      </div>
    </article>`;
  }

  function lostAreaHtml() {
    const shown = lostFiltered();
    const activeCount = shown.filter((l) => l.status === "ищут").length;
    const speciesChips = [["all", "🐾 Все"], ["dog", "🐕 Собаки"], ["cat", "🐈 Кошки"]]
      .map((s) => `<button class="tag ${UI.lost.species === s[0] ? "active" : ""}" data-act="social.lostSpecies" data-species="${s[0]}">${s[1]}</button>`).join("");
    const radiusChips = [0.5, 1, 3, 5]
      .map((r) => `<button class="tag ${UI.lost.radius === r ? "active" : ""}" data-act="social.lostRadius" data-r="${r}">${fmt.num(r, 1)} км</button>`).join("");
    const cards = shown.length
      ? `<div class="stack" style="gap:14px">${shown.map(lostCard).join("")}</div>`
      : empty("🐾", "В этом радиусе всё спокойно", "Активных объявлений нет — увеличьте радиус поиска.",
          `<button class="btn btn-ghost mt-2" data-act="social.lostRadius" data-r="5">Показать 5 км</button>`);
    return `<div class="stack" style="gap:14px">
      <div class="hint-box">🚨 <b>${fmt.int(activeCount)} ${fmt.plural(activeCount, "активный поиск", "активных поиска", "активных поисков")} рядом</b>
        в радиусе ${fmt.num(UI.lost.radius, 1)} км. Каждый репост увеличивает шанс найти питомца.</div>
      <div class="row-between">
        <div class="chip-row">${speciesChips}</div>
        <div class="chip-row">${radiusChips}</div>
      </div>
      <section class="card">
        <header class="card-head"><h3><span class="card-ico">🗺</span>Карта района</h3>
          <span class="muted small">📍 объекты района · 🔴 потеряшки · 🔵 вы здесь</span></header>
        <div class="card-body">
          <div class="map-wrap">
            <div class="city-map" id="lostMap">${mapInnerHtml(shown)}</div>
            <div class="map-legend">
              <span class="tag">🏥 Ветклиники</span><span class="tag">🌳 Парки</span>
              <span class="tag">🛍 Зоомагазины</span><span class="tag">🏠 Приют</span>
              <span class="tag active">🔴 Потеряшки</span>
            </div>
          </div>
        </div>
      </section>
      ${cards}
    </div>`;
  }

  function newLostModal() {
    const districts = Object.keys(DISTRICT_XY);
    const body = `
      <div class="grid grid-2">
        ${field({ id: "nl-name", label: "Кличка", placeholder: "Например: Бублик" })}
        ${field({ id: "nl-species", type: "select", label: "Вид", value: "dog",
                  options: [{ value: "dog", label: "🐕 Собака" }, { value: "cat", label: "🐈 Кошка" }] })}
      </div>
      <div class="grid grid-2">
        ${field({ id: "nl-breed", label: "Порода или окрас", placeholder: "Джек-рассел, рыжий" })}
        ${field({ id: "nl-district", type: "select", label: "Район пропажи",
                  options: districts.map((d) => ({ value: d, label: d })) })}
      </div>
      ${field({ id: "nl-features", type: "textarea", rows: 3, label: "Приметы",
                placeholder: "Особые отметины, ошейник, характер, реакция на кличку…" })}
      <div class="grid grid-2">
        ${field({ id: "nl-phone", label: "Телефон для связи", placeholder: "+7 916 000-00-00" })}
        ${field({ id: "nl-reward", label: "Вознаграждение", value: "5 000 ₽" })}
      </div>
      <p class="muted small">Объявление увидят владельцы в радиусе 5 км: чем больше примет, тем быстрее найдётся питомец.</p>`;
    modal({
      title: "Сообщить о пропаже", icon: "🚨", body, wide: true,
      actions: [
        { label: "Отмена" },
        { label: "Опубликовать объявление", kind: "danger", onClick: (wrap) => {
            const name = wrap.querySelector("#nl-name").value.trim();
            const phone = wrap.querySelector("#nl-phone").value.trim();
            if (!name) { toast("Укажите кличку питомца", "warn"); return false; }
            if (!phone) { toast("Без телефона хозяева не смогут связаться", "warn"); return false; }
            const species = wrap.querySelector("#nl-species").value;
            const district = wrap.querySelector("#nl-district").value;
            const alert = {
              id: window.Store.uid("la"),
              name: name,
              species: species,
              emoji: species === "cat" ? "🐈" : "🐕",
              breed: wrap.querySelector("#nl-breed").value.trim() || (species === "cat" ? "Домашняя" : "Метис"),
              district: district,
              distance: +(0.3 + (hash(name + district) % 25) / 10).toFixed(1),
              when: "только что",
              reward: wrap.querySelector("#nl-reward").value.trim() || "без вознаграждения",
              phone: phone,
              features: wrap.querySelector("#nl-features").value.trim() || "Приметы уточняются, свяжитесь с хозяином.",
              status: "ищут",
              sightings: 0,
              mine: true
            };
            window.Store.update((s) => {
              if (!Array.isArray(s.lostAlerts)) s.lostAlerts = [];
              s.lostAlerts.unshift(alert);
            });
            UI.lost.species = "all";
            UI.lost.radius = 5;
            UI.lost.focus = alert.id;
            toast("Объявление опубликовано. Держитесь, питомец найдётся! 🐾", "ok");
            return true;
          } }
      ]
    });
  }

  function lostHtml() {
    const alerts = window.Store.array("lostAlerts");
    const active = alerts.filter((l) => l.status === "ищут");
    const found = alerts.length - active.length;
    const sightings = alerts.reduce((s, l) => s + (+l.sightings || 0), 0);
    return `<div class="stack">
      ${kpiRow([
        { icon: "🚨", value: fmt.int(active.length), label: "Активных поисков", hint: "объявления в вашем городе", kind: "orange" },
        { icon: "🏠", value: fmt.int(found), label: "Питомцев нашлось", hint: "с помощью сообщества", kind: "green" },
        { icon: "👀", value: fmt.int(sightings), label: "Сообщений «я видел»", hint: "каждое приближает встречу" },
        { icon: "📍", value: fmt.num(UI.lost.radius, 1) + " км", label: "Текущий радиус", hint: "настройте зону поиска" }
      ])}
      <div class="panel-tools">
        <button class="btn btn-danger btn-sm" data-act="social.newLost">➕ Сообщить о пропаже</button>
      </div>
      <div id="lostArea">${lostAreaHtml()}</div>
    </div>`;
  }

  /* ============================================================ УСЫНОВЛЕНИЕ */
  function monthsSince(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return 1;
    return Math.max(1, Math.round((Date.now() - d.getTime()) / (30 * 86400000)));
  }

  function shelterPetsFiltered() {
    return D.shelterPets.filter((p) => {
      if (UI.adopt.species !== "all" && p.species !== UI.adopt.species) return false;
      if (UI.adopt.shelter && p.shelter !== UI.adopt.shelter) return false;
      return true;
    });
  }

  function shelterCard(p) {
    const shelter = D.shelters.find((s) => s.id === p.shelter) || {};
    const adopted = window.Store.array("adoptions").some((a) => a.petId === p.id);
    return `<div class="shelter-card">
      <div class="shelter-top">${esc(p.emoji)}</div>
      <div class="shelter-body">
        <div class="row-between">
          <b>${esc(p.name)}</b>${adopted ? badge("мой подопечный", "ok") : ""}
        </div>
        <div class="muted small">${esc(p.age)} · ${esc(p.breed)}</div>
        <div class="muted small">🏠 ${esc(shelter.name || "Приют")} · ${esc(shelter.city || "")}</div>
        <div class="small">${esc(p.story)}</div>
        <div class="row-between mt-1">
          <span class="muted small">Шефство</span><b>${fmt.money(p.monthly)} / мес</b>
        </div>
        <button class="btn ${adopted ? "btn-ghost" : "btn-primary"} btn-sm btn-block" data-act="social.sponsor" data-id="${esc(p.id)}">
          ${adopted ? "❤️ Увеличить помощь" : "❤️ Взять шефство"}
        </button>
      </div>
    </div>`;
  }

  function adoptAreaHtml() {
    const pets = shelterPetsFiltered();
    const shelters = D.shelters;
    const shelterChips = [`<button class="tag ${UI.adopt.shelter ? "" : "active"}" data-act="social.adoptShelter" data-shelter="">Все приюты</button>`]
      .concat(shelters.map((s) => `<button class="tag ${UI.adopt.shelter === s.id ? "active" : ""}" data-act="social.adoptShelter" data-shelter="${esc(s.id)}">${s.emoji} ${esc(s.name)}</button>`))
      .join("");
    const speciesChips = [["all", "🐾 Все"], ["dog", "🐕 Собаки"], ["cat", "🐈 Кошки"]]
      .map((s) => `<button class="tag ${UI.adopt.species === s[0] ? "active" : ""}" data-act="social.adoptSpecies" data-species="${s[0]}">${s[1]}</button>`).join("");
    const grid = pets.length
      ? `<div class="prod-grid">${pets.map(shelterCard).join("")}</div>`
      : empty("🐾", "Подопечных не найдено", "Попробуйте другой приют или сбросьте фильтр по виду.",
          `<button class="btn btn-ghost mt-2" data-act="social.resetAdopt">Показать всех</button>`);
    return `<div class="stack" style="gap:14px">
      <div class="prod-grid">
        ${shelters.map((s) => `<div class="shelter-card">
          <div class="shelter-top">${s.emoji}</div>
          <div class="shelter-body">
            <div class="row-between"><b>${esc(s.name)}</b>${badge(s.city, "info")}</div>
            <div class="muted small">С ${s.since} года · ${esc(s.site)}</div>
            <div class="kv-row"><span class="kv-k">Подопечных</span><span class="kv-v">${fmt.int(s.pets)}</span></div>
            <button class="btn btn-ghost btn-sm btn-block" data-act="social.adoptShelter" data-shelter="${esc(s.id)}">Смотреть подопечных</button>
          </div>
        </div>`).join("")}
      </div>
      <div class="row-between">
        <div class="chip-row">${speciesChips}</div>
        <span class="muted small">Найдено ${fmt.int(pets.length)} из ${fmt.int(D.shelterPets.length)}</span>
      </div>
      <div class="chip-row">${shelterChips}</div>
      ${grid}
    </div>`;
  }

  function myAdoptionsHtml() {
    const adoptions = window.Store.array("adoptions");
    const mission = missionState();
    const totalMonths = adoptions.reduce((s, a) => s + monthsSince(a.since), 0);
    const monthly = adoptions.reduce((s, a) => s + (+a.monthly || 0), 0);
    const body = adoptions.length
      ? `<div class="stack" style="gap:12px">${adoptions.map((a) => {
          const months = monthsSince(a.since);
          const shelter = D.shelters.find((s) => s.name === a.shelter);
          return `<div class="friend-card">
            <div class="avatar">${esc(a.emoji || "🐾")}</div>
            <div style="flex:1;min-width:0">
              <div class="med-name">${esc(a.name)} ${badge("вы помогли " + months + " " + fmt.plural(months, "месяц", "месяца", "месяцев"), "ok")}</div>
              <div class="med-sub">🏠 ${esc(a.shelter)}${shelter ? " · " + esc(shelter.city) : ""} · с ${esc(fmt.short(a.since))} · ${fmt.money(a.monthly)}/мес</div>
              <div class="mt-1">${progress(Math.min(100, Math.round((months / 12) * 100)), "green")}</div>
              <div class="chip-row mt-1">
                <button class="btn btn-xs btn-ghost" data-act="social.report" data-id="${esc(a.id)}">📸 Фотоотчёт</button>
                <button class="btn btn-xs btn-ghost" data-act="social.writeShelter" data-id="${esc(a.id)}">💌 Написать в приют</button>
                <button class="btn btn-xs btn-danger" data-act="social.stopSponsor" data-id="${esc(a.id)}">Отказаться от шефства</button>
              </div>
            </div>
          </div>`;
        }).join("")}</div>`
      : empty("❤️", "Вы пока никому не помогаете", "Возьмите шефство — приют отчитается фото и расскажет о питомце.",
          `<button class="btn btn-primary mt-2" data-act="social.focusAdopt">Выбрать подопечного</button>`);

    const goalPct = Math.min(100, (mission.helped / GOAL) * 100);
    const rest = Math.max(0, GOAL - mission.helped);
    return card({
      title: "Мои подопечные", icon: "❤️",
      body: `${body}
        <div class="kv mt-2">
          <div class="kv-row"><span class="kv-k">Подопечных</span><span class="kv-v">${fmt.int(adoptions.length)}</span></div>
          <div class="kv-row"><span class="kv-k">Всего месяцев помощи</span><span class="kv-v">${fmt.int(totalMonths)}</span></div>
          <div class="kv-row"><span class="kv-k">Взносы в месяц</span><span class="kv-v">${fmt.money(monthly)}</span></div>
          <div class="kv-row"><span class="kv-k">Мой вклад за всё время</span><span class="kv-v">${fmt.money(mission.myImpact)}</span></div>
        </div>
        <div class="mt-2">
          <div class="row-between"><span class="small">Цель миссии: ${fmt.int(GOAL)} питомцев</span>
            <span class="small muted">${fmt.int(mission.helped)} уже помогли</span></div>
          ${progress(goalPct, "green")}
          <div class="muted tiny mt-1">До цели осталось ${fmt.int(rest)} ${fmt.plural(rest, "питомец", "питомца", "питомцев")} — каждый взнос приближает финиш.</div>
        </div>`
    });
  }

  function adoptHtml() {
    const adoptions = window.Store.array("adoptions");
    const mission = missionState();
    return `<div class="stack">
      ${kpiRow([
        { icon: "🏠", value: fmt.int(D.shelters.length), label: "Приютов-партнёров", hint: "проверены фондом PetLife" },
        { icon: "🐾", value: fmt.int(D.shelterPets.length), label: "Подопечных в базе", hint: "ждут шефства" },
        { icon: "❤️", value: fmt.int(adoptions.length), label: "Моих подопечных", hint: fmt.money(adoptions.reduce((s, a) => s + (+a.monthly || 0), 0)) + " в месяц", kind: "green" },
        { icon: "🌍", value: fmt.money(mission.myImpact), label: "Мой вклад", hint: "ушло приютам за всё время" }
      ])}
      <div id="adoptArea">${adoptAreaHtml()}</div>
      ${myAdoptionsHtml()}
    </div>`;
  }

  function sponsorModal(petId) {
    const pet = D.shelterPets.find((p) => p.id === petId);
    if (!pet) return;
    const shelter = D.shelters.find((s) => s.id === pet.shelter) || {};
    const amounts = [300, 500, 900, 1200];
    const options = amounts.map((v) => ({ value: String(v), label: fmt.money(v) + " в месяц" + (v === pet.monthly ? " · рекомендовано" : "") }));
    const body = `
      <div class="friend-card mb-2">
        <div class="avatar" style="font-size:1.7rem">${esc(pet.emoji)}</div>
        <div><div class="med-name">${esc(pet.name)}</div>
        <div class="med-sub">${esc(pet.age)} · ${esc(pet.breed)} · ${esc(shelter.name || "Приют")}${shelter.city ? ", " + esc(shelter.city) : ""}</div></div>
      </div>
      <p class="muted small">${esc(pet.story)}</p>
      ${field({ id: "ad-sum", type: "select", label: "Сумма шефства", value: String(pet.monthly), options: options })}
      <div class="hint-box mb-2"><b>Что входит в шефство:</b>
        ${list(["🥣 Корм по норме на месяц", "💊 Лечение, обработки и анализы", "🧸 Игрушки, лежанка и прогулки"], "tick")}
      </div>
      ${field({ id: "ad-monthly", type: "checkbox", checked: true, checkLabel: "Ежемесячный платёж — можно отключить в любой момент" })}`;
    modal({
      title: "Взять шефство", icon: "❤️", body,
      actions: [
        { label: "Отмена" },
        { label: "Помочь", kind: "primary", onClick: (wrap) => {
            const sum = +wrap.querySelector("#ad-sum").value || pet.monthly;
            const recurring = wrap.querySelector("#ad-monthly").checked;
            window.Store.update((s) => {
              if (!Array.isArray(s.adoptions)) s.adoptions = [];
              const already = s.adoptions.find((a) => a.petId === pet.id);
              if (already) {
                already.monthly = sum;
                already.recurring = recurring;
              } else {
                s.adoptions.push({
                  id: window.Store.uid("ad"), petId: pet.id, since: fmt.today(), monthly: sum,
                  name: pet.name, shelter: shelter.name || "Приют", emoji: pet.emoji, recurring: recurring
                });
              }
              s.donated = (+s.donated || 0) + sum;
              if (!s.mission) s.mission = {};
              s.mission.myImpact = (+s.mission.myImpact || 0) + sum;
              s.mission.sheltersSupported = new Set(s.adoptions.map((a) => a.shelter)).size;
            });
            toast("Спасибо! " + pet.name + " получил " + fmt.money(sum) + (recurring ? " ежемесячно" : " разово") + " ❤️", "ok");
            return true;
          } }
      ]
    });
  }

  function adoptReportModal(adoptionId) {
    const a = window.Store.array("adoptions").find((x) => x.id === adoptionId);
    if (!a) return;
    const months = monthsSince(a.since);
    const h = hash(a.id);
    const weight = (a.name.length * 1.3 + (h % 40) / 10).toFixed(1);
    const body = `<div class="receipt">
      <div class="row-between"><b>Фотоотчёт · ${esc(a.name)}</b><span class="muted small">${esc(fmt.short(fmt.today()))}</span></div>
      <hr>
      <div>🏠 ${esc(a.shelter)}</div>
      <div>⚖️ Вес на сегодня: ${esc(weight)} кг (норма для породы)</div>
      <div>🍽 Аппетит: хороший, корм съедает полностью</div>
      <div>💊 Обработки: сделаны по графику, отклонений нет</div>
      <div>🚶 Прогулки: ${fmt.int(2 + (h % 2))} раза в день по ${fmt.int(25 + (h % 20))} минут</div>
      <div>🧸 Любимая игрушка: ${h % 2 ? "мяч-лизунец" : "верёвочная косточка"}</div>
      <hr>
      <div class="small">Спасибо, что помогаете ${months} ${fmt.plural(months, "месяц", "месяца", "месяцев")}! Ваша поддержка — это корм, лечение и забота каждый день.</div>
      <div class="barcode mt-2"></div>
    </div>`;
    modal({ title: "Фотоотчёт из приюта", icon: "📸", body, wide: true, actions: [{ label: "Спасибо!" }] });
  }

  /* ================================================================ МИССИЯ */
  function missionHtml() {
    const mission = missionState();
    const ms = monthlyShare();
    const year = ms.share * 12;
    const rations = Math.floor(year / RATION_DAY);
    const pct = Math.min(100, (mission.helped / GOAL) * 100);
    const rest = Math.max(0, GOAL - mission.helped);
    const shifts = window.Store.array("volunteerShifts");
    const donations = window.Store.array("donations");

    const shiftsBody = shifts.length
      ? `<div class="stack" style="gap:10px">${shifts.map((sh) =>
          `<div class="kv-row"><span class="kv-k">${esc(sh.job)} · ${esc(sh.day)}</span>
            <span class="kv-v">${fmt.int(sh.hours)} ч · ${badge(sh.status || "запланирована", "info")}</span></div>`).join("")}</div>`
      : `<div class="muted small">Смен пока нет — запишитесь волонтёром, это 1–3 часа в неделю.</div>`;

    const donationsBody = donations.length
      ? `<div class="stack" style="gap:10px">${donations.slice(0, 6).map((d) =>
          `<div class="kv-row"><span class="kv-k">${esc(fmt.date(d.date))}</span><span class="kv-v">${fmt.money(d.amount)}</span></div>`).join("")}</div>`
      : `<div class="muted small">Разовых пожертвований пока не было.</div>`;

    return `<div class="stack">
      <div class="mission-mini">
        <h3>🌍 Миссия PetLife</h3>
        <div class="mm-value">${fmt.int(mission.helped)}</div>
        <div>питомцев получили помощь вместе с сообществом</div>
        <div class="mt-2">${progress(pct, "green")}</div>
        <div class="row-between mt-1">
          <span class="small">Цель: ${fmt.int(GOAL)} питомцев</span>
          <span class="small">Осталось ${fmt.int(rest)}</span>
        </div>
        <div class="chip-row mt-2">
          <button class="btn btn-primary btn-sm" data-act="social.volunteer">🙋 Записаться волонтёром</button>
          <button class="btn btn-sm" data-act="social.donate">💚 Пожертвовать разово</button>
          <button class="btn btn-sm" data-act="social.tellFriend">📣 Рассказать другу</button>
        </div>
      </div>

      ${kpiRow([
        { icon: "🐾", value: fmt.int(mission.helped), label: "Питомцев получили помощь", hint: "цель — 20 000", kind: "green" },
        { icon: "💚", value: fmt.money(mission.myImpact), label: "Мой вклад", hint: "шефство и пожертвования" },
        { icon: "🏠", value: fmt.int(mission.sheltersSupported), label: "Приютов поддержано", hint: "из " + fmt.int(D.shelters.length) + " партнёров" },
        { icon: "⏱", value: fmt.int(mission.volunteerHours) + " ч", label: "Волонтёрских часов", hint: "ваше личное время" }
      ])}

      <div class="panel-grid cols-2">
        ${card({ title: "5% от вашей подписки", icon: "💳", body: `
          <div class="donation-card">
            <div class="mm-value" style="font-size:1.6rem;color:#23662B">${money2(ms.share)}</div>
            <div class="small">в месяц уходит в приюты — это 5% от подписки ${fmt.money(ms.price)}</div>
            <div class="mt-2">${ms.active ? badge("Подписка активна — платежи уже идут ❤️", "ok") : badge("Premium не оформлен", "muted")}</div>
            ${ms.active ? "" : `<button class="btn btn-primary btn-sm mt-2" data-act="hub.open" data-panel="market" data-tab="premium">Оформить Premium за ${fmt.money(PREMIUM_PRICE)}</button>`}
          </div>
          <div class="kv mt-2">
            <div class="kv-row"><span class="kv-k">За год в приюты</span><span class="kv-v">${money2(year)}</span></div>
            <div class="kv-row"><span class="kv-k">Это дневных рационов</span><span class="kv-v">${fmt.int(rations)}</span></div>
            <div class="kv-row"><span class="kv-k">Тариф Premium+ (${fmt.money(PREMIUM_PLUS_PRICE)})</span><span class="kv-v">${money2(PREMIUM_PLUS_PRICE * 0.05)} / мес</span></div>
            <div class="kv-row"><span class="kv-k">Всего пожертвовано</span><span class="kv-v">${fmt.money(S().donated || 0)}</span></div>
          </div>
          <p class="muted tiny mt-1">Отчёт по каждому переводу приходит в раздел «Данные и настройки».</p>` })}

        ${card({ title: "Как ещё помочь", icon: "🤲", body: bullets("Пять простых способов", HELP_WAYS) })}
      </div>

      <div class="panel-grid cols-2">
        ${card({ title: "Мои смены в приюте", icon: "🙋", body: shiftsBody })}
        ${card({ title: "История пожертвований", icon: "🧾", body: donationsBody })}
      </div>
    </div>`;
  }

  function volunteerModal() {
    const body = `
      ${field({ id: "vol-day", type: "select", label: "День недели", value: "Суббота",
                options: WEEK_DAYS.map((d) => ({ value: d, label: d })) })}
      ${field({ id: "vol-job", type: "select", label: "Чем займётесь", value: "walk",
                options: VOLUNTEER_JOBS.map((j) => ({ value: j.id, label: j.emoji + " " + j.label + " · " + j.hours + " ч" })) })}
      ${field({ id: "vol-place", type: "select", label: "Приют", value: "s1",
                options: D.shelters.map((s) => ({ value: s.id, label: s.emoji + " " + s.name + " · " + s.city })) })}
      <p class="muted small">Волонтёру нужны только удобная обувь и хорошее настроение. Инвентарь выдаём на месте.</p>`;
    modal({
      title: "Записаться волонтёром", icon: "🙋", body,
      actions: [
        { label: "Отмена" },
        { label: "Записаться", kind: "primary", onClick: (wrap) => {
            const day = wrap.querySelector("#vol-day").value;
            const job = VOLUNTEER_JOBS.find((j) => j.id === wrap.querySelector("#vol-job").value) || VOLUNTEER_JOBS[0];
            const shelter = D.shelters.find((s) => s.id === wrap.querySelector("#vol-place").value) || D.shelters[0];
            window.Store.update((s) => {
              if (!Array.isArray(s.volunteerShifts)) s.volunteerShifts = [];
              s.volunteerShifts.unshift({
                id: window.Store.uid("vs"), day: day, job: job.label, hours: job.hours,
                shelter: shelter.name, status: "запланирована", created: new Date().toISOString()
              });
              if (!s.mission) s.mission = {};
              s.mission.volunteerHours = (+s.mission.volunteerHours || 0) + job.hours;
            });
            toast("Записали: " + job.label + ", " + day + " · +" + job.hours + " ч волонтёрства 🙌", "ok");
            return true;
          } }
      ]
    });
  }

  function donateModal() {
    const body = `
      ${field({ id: "don-sum", type: "select", label: "Сумма", value: "500",
                options: [300, 500, 1000, 3000].map((v) => ({ value: String(v), label: fmt.money(v) })) })}
      ${field({ id: "don-monthly", type: "checkbox", checked: false, checkLabel: "Повторять каждый месяц" })}
      <div class="hint-box">💚 Разовое пожертвование сразу уходит на корм и лечение подопечных приютов-партнёров.
        Отчёт появится в разделе миссии.</div>`;
    modal({
      title: "Пожертвовать разово", icon: "💚", body,
      actions: [
        { label: "Отмена" },
        { label: "Пожертвовать", kind: "primary", onClick: (wrap) => {
            const sum = +wrap.querySelector("#don-sum").value || 500;
            const monthly = wrap.querySelector("#don-monthly").checked;
            window.Store.update((s) => {
              if (!Array.isArray(s.donations)) s.donations = [];
              s.donations.unshift({ id: window.Store.uid("dn"), date: fmt.today(), amount: sum, monthly: monthly });
              s.donated = (+s.donated || 0) + sum;
              if (!s.mission) s.mission = {};
              s.mission.myImpact = (+s.mission.myImpact || 0) + sum;
            });
            toast("Спасибо! " + fmt.money(sum) + " уже в пути к подопечным приютов ❤️", "ok");
            return true;
          } }
      ]
    });
  }

  /* ================================================================= RENDER */
  function headHtml(tab) {
    const meta = TABS.find((t) => t.id === tab) || TABS[0];
    const tools = {
      forum: `<button class="btn btn-primary btn-sm" data-act="social.newPost">✍️ Создать тему</button>`,
      friends: `<button class="btn btn-ghost btn-sm" data-act="social.sortByNear">📍 Ближайшие</button>`,
      lost: `<button class="btn btn-danger btn-sm" data-act="social.newLost">➕ Сообщить о пропаже</button>`,
      adopt: `<button class="btn btn-ghost btn-sm" data-act="hub.open" data-panel="social" data-tab="mission">🌍 Миссия</button>`,
      mission: `<button class="btn btn-primary btn-sm" data-act="social.tellFriend">📣 Рассказать другу</button>`
    };
    return `<div class="panel-head">
      <div><h2>${meta.icon} Сообщество и форум</h2><p>${esc(meta.sub)}</p></div>
      <div class="panel-tools">${tools[tab] || ""}</div>
    </div>`;
  }

  function bodyHtml(tab) {
    if (tab === "friends") return friendsHtml();
    if (tab === "lost") return lostHtml();
    if (tab === "adopt") return adoptHtml();
    if (tab === "mission") return missionHtml();
    return forumHtml();
  }

  function wire(view) {
    view.querySelectorAll("[data-live]").forEach((el) => {
      const key = el.dataset.live;
      const evt = (el.tagName === "SELECT" || el.type === "checkbox") ? "change" : "input";
      el.addEventListener(evt, () => setLive(key, el.value));
    });
  }

  function setLive(key, value) {
    const v = String(value == null ? "" : value);
    if (key === "forum.q") { UI.forum.q = v; repaint("forumArea", forumAreaHtml()); }
    else if (key === "friends.q") { UI.friends.q = v; repaint("friendsArea", friendsAreaHtml()); }
    else if (key === "friends.district") { UI.friends.district = v; repaint("friendsArea", friendsAreaHtml()); }
    else if (key === "friends.time") { UI.friends.time = v; repaint("friendsArea", friendsAreaHtml()); }
  }

  window.Panels.register("social", {
    title: "Сообщество и форум",
    icon: "💬",
    desc: "Форум, друзья для прогулок, потеряшки, усыновление и миссия",
    render(view, ctx) {
      ensureData();
      const tab = ctx && ctx.tab ? ctx.tab : "forum";
      view.innerHTML = `<div class="panel">
        ${headHtml(tab)}
        ${subTabs(tab, "social")}
        ${bodyHtml(tab)}
      </div>`;
      wire(view);
    }
  });

  /* ================================================================ ACTIONS */
  Actions.registerAll({
    /* --- форум --- */
    "social.newPost": () => newPostModal(),
    "social.like": (ds) => {
      window.Store.update((s) => {
        const p = (s.posts || []).find((x) => x.id === ds.id);
        if (!p) return;
        p.liked = !p.liked;
        p.likes = Math.max(0, (+p.likes || 0) + (p.liked ? 1 : -1));
      });
      const p = window.Store.array("posts").find((x) => x.id === ds.id);
      if (p) toast(p.liked ? "Спасибо за поддержку автора ❤️" : "Лайк снят", p.liked ? "ok" : "info");
    },
    "social.comments": (ds) => {
      UI.openComments[ds.id] = !UI.openComments[ds.id];
      repaintForum();
    },
    "social.reply": (ds) => {
      const input = document.getElementById("reply-" + ds.id);
      const text = input ? input.value.trim() : "";
      if (!text) { toast("Напишите пару слов — автор ждёт ответа", "warn"); return; }
      window.Store.update((s) => {
        const p = (s.posts || []).find((x) => x.id === ds.id);
        if (!p) return;
        if (!Array.isArray(p.replies)) p.replies = [];
        p.replies.push({ author: (s.owner && s.owner.name) || "Вы", text: text, ago: "только что" });
        p.comments = (+p.comments || 0) + 1;
      });
      UI.openComments[ds.id] = true;
      toast("Ответ опубликован 💬", "ok");
    },
    "social.share": (ds) => {
      const p = window.Store.array("posts").find((x) => x.id === ds.id);
      if (!p) return;
      const text = "PetLife · Форум: " + (p.title ? p.title + " — " : "") + p.text + " (автор " + p.author + ")";
      copyText(text, "Текст темы скопирован — поделитесь с друзьями 🔗");
    },
    "social.more": (ds) => moreModal(ds.id),
    "social.reportPost": (ds, ev, el) => {
      closeTopModal(el);
      toast("Жалоба отправлена модератору. Спасибо, что бережёте форум!", "ok");
    },
    "social.delete": async (ds, ev, el) => {
      closeTopModal(el);
      const ok = await confirmDialog("Удалить тему? Восстановить её будет нельзя.", { ok: "Удалить", danger: true, icon: "🗑" });
      if (!ok) return;
      window.Store.update((s) => { s.posts = (s.posts || []).filter((p) => p.id !== ds.id); });
      delete UI.openComments[ds.id];
      toast("Тема удалена", "info");
    },
    "social.tag": (ds) => {
      UI.forum.tag = UI.forum.tag === ds.tag ? "" : String(ds.tag || "");
      repaintForum();
    },
    "social.sort": (ds) => {
      UI.forum.sort = ds.sort || "fresh";
      repaintForum();
    },

    /* --- друзья --- */
    "social.friendTag": (ds) => {
      const tag = String(ds.tag || "").toLowerCase();
      UI.friends.tag = UI.friends.tag === tag ? "" : tag;
      repaint("friendsArea", friendsAreaHtml());
    },
    "social.friendSort": (ds) => {
      UI.friends.sort = ds.sort === "rating" ? "rating" : "near";
      repaint("friendsArea", friendsAreaHtml());
    },
    "social.sortByNear": () => {
      UI.friends.sort = "near";
      repaint("friendsArea", friendsAreaHtml());
      toast("Показываем соседей с питомцами от ближайших 📍", "info");
    },
    "social.resetFriends": () => {
      UI.friends = { q: "", district: "", tag: "", time: "", sort: "near" };
      const input = document.getElementById("friendsSearch");
      if (input) input.value = "";
      repaint("friendsArea", friendsAreaHtml());
      toast("Фильтры сброшены", "info");
    },
    "social.focusFriends": () => {
      const input = document.getElementById("friendsSearch");
      if (input) { input.focus(); window.PL.scrollToEl(input, 120); }
    },
    "social.invite": (ds) => inviteModal(ds.id),
    "social.confirmInvite": (ds) => {
      window.Store.update((s) => {
        const i = (s.walkInvites || []).find((x) => x.id === ds.id);
        if (i) i.status = "принято";
      });
      toast("Прогулка согласована! Не забудьте воду и пакетики 🐾", "ok");
    },
    "social.cancelInvite": async (ds) => {
      const ok = await confirmDialog("Отменить приглашение на прогулку?", { ok: "Отменить", danger: true, icon: "🚫" });
      if (!ok) return;
      window.Store.update((s) => {
        const i = (s.walkInvites || []).find((x) => x.id === ds.id);
        if (i) i.status = "отменено";
      });
      toast("Приглашение отменено", "info");
    },
    "social.writeFriend": (ds) => {
      const i = window.Store.array("walkInvites").find((x) => x.id === ds.id);
      if (!i) return;
      toast("Сообщение отправлено: " + i.name + " получит его в чате приложения ✉️", "ok");
    },

    /* --- потеряшки --- */
    "social.lostSpecies": (ds) => {
      UI.lost.species = ds.species || "all";
      repaint("lostArea", lostAreaHtml());
    },
    "social.lostRadius": (ds) => {
      UI.lost.radius = +ds.r || 5;
      repaint("lostArea", lostAreaHtml());
    },
    "social.focusLost": (ds) => {
      const l = window.Store.array("lostAlerts").find((x) => x.id === ds.id);
      if (!l) return;
      UI.lost.focus = ds.id;
      repaint("lostArea", lostAreaHtml());
      const node = document.getElementById("lost-" + ds.id);
      if (node) window.PL.scrollToEl(node, 110);
      toast(l.name + " · " + l.district + " · " + fmt.num(l.distance, 1) + " км · " + l.when, "info");
    },
    "social.place": (ds) => {
      const p = D.places.find((x) => x.id === ds.id);
      if (!p) return;
      toast(p.emoji + " " + p.name + " · " + p.address + " · " + p.hours, "info");
    },
    "social.seen": (ds) => {
      window.Store.update((s) => {
        const l = (s.lostAlerts || []).find((x) => x.id === ds.id);
        if (l) l.sightings = (+l.sightings || 0) + 1;
      });
      toast("Спасибо! Хозяин получил уведомление 🙏", "ok");
    },
    "social.found": (ds) => {
      window.Store.update((s) => {
        const l = (s.lostAlerts || []).find((x) => x.id === ds.id);
        if (l) l.status = "нашёлся";
      });
      toast("Ура! Отметили, что питомец нашёлся 🎉", "ok");
    },
    "social.reopen": (ds) => {
      window.Store.update((s) => {
        const l = (s.lostAlerts || []).find((x) => x.id === ds.id);
        if (l) l.status = "ищут";
      });
      toast("Поиск возобновлён — объявление снова в ленте", "warn");
    },
    "social.newLost": () => newLostModal(),

    /* --- усыновление --- */
    "social.adoptSpecies": (ds) => {
      UI.adopt.species = ds.species || "all";
      repaint("adoptArea", adoptAreaHtml());
    },
    "social.adoptShelter": (ds) => {
      const id = String(ds.shelter || "");
      UI.adopt.shelter = UI.adopt.shelter === id ? "" : id;
      repaint("adoptArea", adoptAreaHtml());
    },
    "social.resetAdopt": () => {
      UI.adopt = { species: "all", shelter: "" };
      repaint("adoptArea", adoptAreaHtml());
    },
    "social.focusAdopt": () => {
      const area = document.getElementById("adoptArea");
      if (area) window.PL.scrollToEl(area, 120);
    },
    "social.sponsor": (ds) => sponsorModal(ds.id),
    "social.report": (ds) => {
      const adoption = window.Store.array("adoptions").find((x) => x.id === ds.id);
      if (adoption) adoptReportModal(ds.id);
    },
    "social.writeShelter": (ds) => {
      const a = window.Store.array("adoptions").find((x) => x.id === ds.id);
      if (!a) return;
      promptDialog("Письмо в приют", { label: "Сообщение для " + a.shelter, value: "Здравствуйте! Как дела у " + a.name + "?", icon: "💌" })
        .then((text) => { if (text) toast("Письмо отправлено в " + a.shelter + " ✉️", "ok"); });
    },
    "social.stopSponsor": async (ds) => {
      const a = window.Store.array("adoptions").find((x) => x.id === ds.id);
      if (!a) return;
      const ok = await confirmDialog("Отказаться от шефства над " + a.name + "? Приют найдёт другого опекуна, но поддержка прекратится.", { ok: "Отказаться", danger: true, icon: "💔" });
      if (!ok) return;
      window.Store.update((s) => {
        s.adoptions = (s.adoptions || []).filter((x) => x.id !== ds.id);
        if (!s.mission) s.mission = {};
        s.mission.sheltersSupported = new Set((s.adoptions || []).map((x) => x.shelter)).size;
      });
      toast("Шефство над " + a.name + " завершено. Спасибо за помощь!", "info");
    },

    /* --- миссия --- */
    "social.volunteer": () => volunteerModal(),
    "social.donate": () => donateModal(),
    "social.tellFriend": () => copyText(SHARE_LINK, "Ссылка на миссию скопирована — спасибо, что рассказываете о нас 📣")
  });
})();
