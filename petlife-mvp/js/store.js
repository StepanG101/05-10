/* ============================================================================
 * PetLife — store.js
 * Единое состояние приложения: питомцы, здоровье, трекеры, заказы, миссия.
 * Хранение — localStorage (никакого бэкенда и БД, как требует ТЗ).
 * ==========================================================================*/
(function () {
  "use strict";

  const KEY = "petlife.state.v2";
  const D = window.PL_DATA;

  const uid = (p) => (p || "id") + "-" + Math.random().toString(36).slice(2, 9);
  const iso = (daysAgo) => {
    const d = new Date();
    d.setDate(d.getDate() - (daysAgo || 0));
    return d.toISOString().slice(0, 10);
  };

  /* ------------------------------------------------------------------ демо-данные */
  function demoWeight(base, days, drift) {
    const out = [];
    for (let i = days; i >= 0; i -= 7) {
      const wobble = Math.sin(i / 9) * (drift * 0.5);
      out.push({ id: uid("w"), date: iso(i), kg: +(base + drift * (days - i) / days + wobble).toFixed(1) });
    }
    return out;
  }

  function demoPet(over) {
    const base = {
      id: uid("pet"), name: "Барон", emoji: "🐕", species: "dog", breedId: "corgi", size: "medium",
      sex: "мальчик", birth: "2021-04-12", weight: 13.4, sterilized: true, photo: "",
      allergies: ["курица"], chronic: [], city: "Москва",
      note: "Любит апортт и обожает плавать. Боится салютов.",
      color: "#2C5F8D"
    };
    return Object.assign(base, over || {});
  }

  function demoState() {
    const pet = demoPet();
    const cat = demoPet({ id: uid("pet"), name: "Мурка", emoji: "🐈", species: "cat", breedId: "british", size: "medium",
      sex: "девочка", birth: "2019-08-30", weight: 5.2, allergies: ["рыба"], city: "Москва",
      note: "Царственно игнорирует всех, кроме холодильника.", color: "#8E44AD" });
    const pets = [pet, cat];
    const pid = pet.id, cid = cat.id;

    return {
      version: 2,
      createdAt: new Date().toISOString(),
      owner: { name: "Алексей", email: "", city: "Москва", premium: true, premiumSince: iso(120), familyCode: "PETLIFE-7K2M",
        members: [{ id: uid("m"), name: "Алексей", role: "Владелец" }, { id: uid("m"), name: "Ирина", role: "Семья" }] },
      pets,
      activePetId: pid,
      medical: {
        [pid]: [
          { id: uid("m"), date: iso(400), type: "Осмотр", title: "Ежегодная диспансеризация", vet: "Клиника «Айболит»", notes: "Вес в норме, зубы чистые, рекомендована обработка от клещей." },
          { id: uid("m"), date: iso(120), type: "Анализы", title: "Общий анализ крови", vet: "Ветцентр «ЗооМед»", notes: "Все показатели в референсе, гемоглобин 168 г/л." },
          { id: uid("m"), date: iso(35), type: "Лечение", title: "Отит правого уха", vet: "Клиника «Айболит»", notes: "Капли «Отодектин» 7 дней, повторный осмотр через 2 недели." },
          { id: uid("m"), date: iso(30), type: "Процедура", title: "Чистка зубов ультразвуком", vet: "Ветцентр «ЗооМед»", notes: "Налёт удалён, назначена паста 3 раза в неделю." }
        ],
        [cid]: [{ id: uid("m"), date: iso(200), type: "Осмотр", title: "Вакцинация + осмотр", vet: "Клиника «Лапа помощи»", notes: "Здорова, вес стабилен." }]
      },
      symptoms: {
        [pid]: [
          { id: uid("s"), date: iso(2), type: "Кожа", severity: 2, note: "Покусывает основание хвоста, кожа без покраснений" },
          { id: uid("s"), date: iso(9), type: "Уши", severity: 3, note: "Потряхивает правым ухом, есть небольшой запах" }
        ], [cid]: []
      },
      meds: {
        [pid]: [
          { id: uid("md"), name: "Бравекто (от клещей)", dose: "1 таблетка 500 мг", every: 84, last: iso(20), note: "Давать с едой" },
          { id: uid("md"), name: "Омега-3 для суставов", dose: "1 капсула", every: 1, last: iso(1), note: "Курс 3 месяца" }
        ],
        [cid]: [{ id: uid("md"), name: "Милбемакс (от паразитов)", dose: "1/2 таблетки", every: 90, last: iso(45), note: "" }]
      },
      vaccinations: {
        [pid]: [
          { id: uid("v"), name: "Комплексная (чума, энтерит, гепатит)", date: iso(340), next: iso(-25), done: true },
          { id: uid("v"), name: "Бешенство", date: iso(338), next: iso(27), done: true },
          { id: uid("v"), name: "Лептоспироз", date: iso(300), next: iso(65), done: true }
        ],
        [cid]: [
          { id: uid("v"), name: "Комплексная (панлейкопения, ринотрахеит)", date: iso(200), next: iso(165), done: true },
          { id: uid("v"), name: "Бешенство", date: iso(190), next: iso(175), done: true }
        ]
      },
      appointments: [
        { id: uid("ap"), petId: pid, clinic: "Ветцентр «ЗооМед»", date: iso(-4), time: "11:30", reason: "Контрольный осмотр уха", doctor: "Иванова А. П.", status: "подтверждена", price: 1500 },
        { id: uid("ap"), petId: cid, clinic: "Клиника «Лапа помощи»", date: iso(-16), time: "18:00", reason: "Вакцинация", doctor: "Смирнов К. В.", status: "запланирована", price: 2200 }
      ],
      contacts: [
        { id: uid("c"), name: "Клиника «Лапа помощи»", phone: "+7 495 908-11-02", type: "Круглосуточная ветклиника", note: "Ближайшая экстренная помощь, 1,8 км" },
        { id: uid("c"), name: "Ветцентр «ЗооМед»", phone: "+7 495 331-77-20", type: "Наш ветеринар", note: "Иванова А. П., ведёт Барона" },
        { id: uid("c"), name: "Кинолог Сергей", phone: "+7 916 222-33-44", type: "Кинолог", note: "Занятия по послушанию" },
        { id: uid("c"), name: "Зоотакси «Зверопоезд»", phone: "+7 495 000-77-77", type: "Зоотакси", note: "Перевозка в клинику 24/7" }
      ],
      walks: [
        { id: uid("wl"), petId: pid, date: iso(0), city: "Москва", temp: 18, asphalt: 23, minutes: 62, distance: 3.4, route: "Парк «Сосновый» → пруд", rating: 5 },
        { id: uid("wl"), petId: pid, date: iso(1), city: "Москва", temp: 27, asphalt: 47, minutes: 25, distance: 1.2, route: "Двор и сквер", rating: 3 },
        { id: uid("wl"), petId: pid, date: iso(2), city: "Москва", temp: 12, asphalt: 17, minutes: 74, distance: 4.1, route: "Набережная", rating: 5 },
        { id: uid("wl"), petId: cid, date: iso(0), city: "Москва", temp: 18, asphalt: 23, minutes: 15, distance: 0, route: "Балкон и коридор", rating: 4 }
      ],
      weights: { [pid]: demoWeight(13.4, 84, 0.6), [cid]: demoWeight(5.2, 84, 0.3) },
      activity: {
        [pid]: Array.from({ length: 14 }, (_, i) => ({ id: uid("ac"), date: iso(13 - i), steps: 7200 + Math.round(Math.sin(i) * 1600) + i * 90, minutes: 55 + Math.round(Math.cos(i) * 18) })),
        [cid]: Array.from({ length: 14 }, (_, i) => ({ id: uid("ac"), date: iso(13 - i), steps: 900 + Math.round(Math.sin(i) * 300), minutes: 12 + Math.round(Math.cos(i) * 6) }))
      },
      sleep: {
        [pid]: Array.from({ length: 14 }, (_, i) => ({ id: uid("sl"), date: iso(13 - i), hours: +(11 + Math.sin(i / 2) * 1.4).toFixed(1), quality: 3 + (i % 3) })),
        [cid]: Array.from({ length: 14 }, (_, i) => ({ id: uid("sl"), date: iso(13 - i), hours: +(14.5 + Math.sin(i / 3) * 1.8).toFixed(1), quality: 4 }))
      },
      moods: {
        [pid]: Array.from({ length: 10 }, (_, i) => ({ id: uid("mo"), date: iso(9 - i), mood: ["happy", "calm", "happy", "tired", "happy", "calm", "anxious", "happy", "calm", "happy"][i] })),
        [cid]: Array.from({ length: 10 }, (_, i) => ({ id: uid("mo"), date: iso(9 - i), mood: ["calm", "tired", "calm", "happy", "calm", "calm", "tired", "calm", "happy", "calm"][i] }))
      },
      meals: { [pid]: [{ id: uid("me"), date: iso(0), food: "PetLife Daily Adult", grams: 180, time: "08:00" }, { id: uid("me"), date: iso(0), food: "PetLife Daily Adult", grams: 180, time: "19:00" }], [cid]: [] },
      training: {
        [pid]: { done: ["l1", "l2", "l3", "l4", "l6"], xp: 340, streak: 5, games: [{ id: "g1", date: iso(1), minutes: 10 }], lastLesson: iso(1) },
        [cid]: { done: ["l15"], xp: 60, streak: 1, games: [], lastLesson: iso(4) }
      },
      behavior: { [pid]: [Object.assign({ id: uid("bh"), date: iso(12), score: 78 }, { advice: "Много энергии — добавьте умственные игры и работу с подзывом." })], [cid]: [] },
      expenses: [
        { id: uid("ex"), petId: pid, date: iso(2), category: "food", amount: 2450, note: "Корм 3 кг" },
        { id: uid("ex"), petId: pid, date: iso(6), category: "vet", amount: 1500, note: "Осмотр уха" },
        { id: uid("ex"), petId: pid, date: iso(9), category: "toys", amount: 890, note: "Игрушка-лизунец" },
        { id: uid("ex"), petId: pid, date: iso(14), category: "grooming", amount: 3200, note: "Комплексный груминг" },
        { id: uid("ex"), petId: pid, date: iso(20), category: "meds", amount: 1790, note: "Витамины для суставов" },
        { id: uid("ex"), petId: pid, date: iso(28), category: "insurance", amount: 990, note: "Страховка «Оптима»" },
        { id: uid("ex"), petId: cid, date: iso(5), category: "food", amount: 1990, note: "Корм для кошки" },
        { id: uid("ex"), petId: cid, date: iso(18), category: "vet", amount: 2200, note: "Вакцинация" }
      ],
      budgetLimit: 9000,
      bookings: [
        { id: uid("bk"), petId: pid, type: "grooming", service: "Комплексная стрижка + купание", date: iso(-3), time: "12:00", price: 3200, status: "подтверждена", place: "Груминг «Пушистик»" }
      ],
      devices: [
        { id: "dev1", name: "Камера PetLife Home", type: "camera", emoji: "📷", on: true, room: "Гостиная", state: "Онлайн, запись в облако", lastAction: "Просмотр 5 минут назад" },
        { id: "dev2", name: "Умная кормушка", type: "feeder", emoji: "🍽", on: true, room: "Кухня", state: "Порция 90 г, 2 раза в день", lastAction: "Выдача корма в 08:00" },
        { id: "dev3", name: "Фонтанчик для воды", type: "fountain", emoji: "⛲", on: true, room: "Коридор", state: "Фильтр 78%, поток средний", lastAction: "Замена воды 2 дня назад" },
        { id: "dev4", name: "Умный ошейник PetLife Track", type: "collar", emoji: "📡", on: true, room: "—", state: "Батарея 84%, шаги 7 240", lastAction: "Синхронизация 10 минут назад" },
        { id: "dev5", name: "Климат-датчик", type: "sensor", emoji: "🌡", on: false, room: "Спальня", state: "22,4 °C, влажность 46%", lastAction: "Отключён вручную" }
      ],
      cart: [],
      orders: [
        { id: uid("or"), date: iso(11), items: [{ name: "Корм PetLife Sensitive Lamb 2,5 кг", price: 2890, qty: 1 }], total: 2890, status: "доставлен", donation: 145 }
      ],
      donated: 1450,
      adoptions: [
        { id: uid("ad"), petId: "sp2", since: iso(45), monthly: 900, name: "Лада", shelter: "Фонд «Верный друг»", emoji: "🐕" }
      ],
      posts: D.posts.map((p) => Object.assign({}, p, { liked: false, mine: false })),
      friends: D.friends.map((f) => Object.assign({}, f, { invited: false })),
      walkInvites: [],
      lostAlerts: D.lostAlerts.map((l) => Object.assign({}, l)),
      chat: [
        { role: "assistant", text: "Привет! Я PetLife AI 🐾 Знаю всё о ваших питомцах: породу, возраст, вес, прививки и даже погоду за окном. Спросите что угодно — или выберите готовый вопрос ниже." }
      ],
      aiHistory: [],
      mission: { helped: 12847, myImpact: 1450, sheltersSupported: 4, volunteerHours: 12 },
      settings: { units: "metric", notifications: true, demoMode: true },
      lastWeather: null
    };
  }

  function emptyState() {
    const pet = demoPet({ name: "Мой питомец", breedId: "domestic", species: "cat", emoji: "🐈", allergies: [], note: "" });
    return {
      version: 2, createdAt: new Date().toISOString(),
      owner: { name: "Владелец", email: "", city: "Москва", premium: false, familyCode: "PETLIFE-" + Math.random().toString(36).slice(2, 6).toUpperCase(), members: [] },
      pets: [pet], activePetId: pet.id,
      medical: {}, symptoms: {}, meds: {}, vaccinations: {}, appointments: [], contacts: [], walks: [],
      weights: {}, activity: {}, sleep: {}, moods: {}, meals: {}, training: {}, behavior: {},
      expenses: [], budgetLimit: 8000, bookings: [], devices: [], cart: [], orders: [], donated: 0,
      adoptions: [], posts: D.posts.map((p) => Object.assign({}, p, { liked: false })), friends: D.friends.map((f) => Object.assign({}, f, { invited: false })),
      walkInvites: [], lostAlerts: D.lostAlerts.map((l) => Object.assign({}, l)),
      chat: [{ role: "assistant", text: "Привет! Я PetLife AI 🐾 Чем помочь вашему питомцу сегодня?" }],
      aiHistory: [],
      mission: { helped: 12847, myImpact: 0, sheltersSupported: 0, volunteerHours: 0 },
      settings: { units: "metric", notifications: true, demoMode: true },
      lastWeather: null
    };
  }

  /* ------------------------------------------------------------------ хранилище */
  let state = null;
  const listeners = [];

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.pets && parsed.pets.length) return parsed;
      }
    } catch (err) { console.warn("PetLife: не удалось прочитать сохранение", err); }
    return demoState();
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (err) { console.warn("PetLife: не удалось сохранить состояние", err); }
  }

  const Store = {
    get state() { return state; },
    init() {
      state = load();
      Store.normalize();
      save();
      return state;
    },
    normalize() {
      // Гарантируем наличие всех ключей — защита от старого сохранения.
      const base = emptyState();
      Object.keys(base).forEach((k) => { if (state[k] === undefined) state[k] = base[k]; });
      state.pets.forEach((p) => {
        ["medical", "symptoms", "meds", "vaccinations", "weights", "activity", "sleep", "moods", "meals", "behavior"].forEach((bucket) => {
          if (!state[bucket][p.id]) state[bucket][p.id] = [];
        });
        if (!state.training[p.id]) state.training[p.id] = { done: [], xp: 0, streak: 0, games: [], lastLesson: null };
        if (!p.photo) p.photo = "";
        if (!p.allergies) p.allergies = [];
        if (!p.chronic) p.chronic = [];
      });
      if (!state.pets.some((p) => p.id === state.activePetId)) state.activePetId = state.pets[0] && state.pets[0].id;
      return state;
    },
    save,
    uid,
    iso,
    subscribe(fn) { listeners.push(fn); return () => listeners.splice(listeners.indexOf(fn), 1); },
    emit(reason) { listeners.forEach((fn) => { try { fn(state, reason); } catch (e) { console.error(e); } }); },
    update(mutator, reason) {
      if (typeof mutator === "function") mutator(state);
      if (window.PETLIFE_CONFIG && !window.PETLIFE_CONFIG.__noSave) { Store.normalize(); save(); }
      Store.emit(reason || "update");
      return state;
    },
    /* ------- доступ к состоянию ------- */
    pets() { return state.pets; },
    pet(id) { return state.pets.find((p) => p.id === (id || state.activePetId)) || state.pets[0]; },
    setActivePet(id) { Store.update((s) => { s.activePetId = id; }, "pet"); },
    bucket(name, petId) {
      const id = petId || state.activePetId;
      if (!state[name][id]) state[name][id] = [];
      return state[name][id];
    },
    push(bucket, item, petId) { return Store.update(() => { Store.bucket(bucket, petId).unshift(item); }, bucket); },
    remove(bucket, id, petId) { return Store.update(() => { state[bucket][petId || state.activePetId] = Store.bucket(bucket, petId).filter((i) => i.id !== id); }, bucket); },
    array(name) { if (!Array.isArray(state[name])) state[name] = []; return state[name]; },
    reset(demo) { state = demo ? demoState() : emptyState(); Store.normalize(); save(); Store.emit("reset"); return state; },
    export() { return JSON.stringify(state, null, 2); },
    import(json) {
      const parsed = JSON.parse(json);
      if (!parsed || !parsed.pets) throw new Error("bad-format");
      state = parsed; Store.normalize(); save(); Store.emit("import"); return state;
    },
    /* ------- вычисления ------- */
    ageStage(pet) {
      const years = Store.age(pet);
      return D.ageStages.find((s) => years >= s.range[0] && years < s.range[1]) || D.ageStages[D.ageStages.length - 1];
    },
    age(pet) {
      if (!pet || !pet.birth) return 0;
      const b = new Date(pet.birth);
      if (isNaN(b)) return 0;
      return Math.max(0, (Date.now() - b.getTime()) / (365.25 * 24 * 3600 * 1000));
    },
    ageLabel(pet) {
      const y = Store.age(pet);
      if (y < 1) return Math.round(y * 12) + " " + window.PL.fmt.plural(Math.round(y * 12), "месяц", "месяца", "месяцев");
      const years = Math.floor(y), months = Math.round((y - years) * 12);
      return years + " " + window.PL.fmt.plural(years, "год", "года", "лет") + (months ? " " + months + " мес" : "");
    },
    breed(pet) { return D.breedById(pet && pet.breedId); },
    /* норма корма: RER = 70 * вес^0.75, коэффициент по активности/возрасту */
    portion(pet, activity) {
      const w = +pet.weight || 5;
      const rer = 70 * Math.pow(w, 0.75);
      const act = activity || (D.breedById(pet.breedId).activity === "очень высокая" ? 1.8 : D.breedById(pet.breedId).activity === "высокая" ? 1.6 : 1.3);
      const stage = Store.ageStage(pet).id;
      let k = act;
      if (stage === "puppy") k = 2.8;
      else if (stage === "junior") k = 2.0;
      else if (stage === "senior") k = 1.15;
      else if (stage === "geriatric") k = 1.05;
      if (pet.sterilized && stage === "adult") k -= 0.15;
      const kcal = rer * k;
      const dry = kcal / 3.6; // ~3,6 ккал на грамм сухого корма
      return { rer: Math.round(rer), kcal: Math.round(kcal), grams: Math.round(dry), meals: stage === "puppy" ? 4 : stage === "junior" ? 3 : 2, activity: act, stage };
    },
    daysUntil(dateStr) {
      if (!dateStr) return null;
      const d = new Date(dateStr);
      if (isNaN(d)) return null;
      return Math.ceil((d.getTime() - Date.now()) / 86400000);
    },
    nextDose(med) {
      const last = new Date(med.last || Date.now());
      const next = new Date(last.getTime() + (med.every || 1) * 86400000);
      return next;
    },
    /* PetLife Index — интегральный показатель благополучия 0..100 */
    index(pet) {
      const id = pet.id;
      let score = 40;
      const details = [];
      const weights = (state.weights[id] || []).slice().sort((a, b) => a.date.localeCompare(b.date));
      if (weights.length >= 2) {
        const first = weights[0].kg, last = weights[weights.length - 1].kg;
        const breed = D.breedById(pet.breedId);
        const ideal = breed.weight;
        const dev = Math.abs(last - ideal) / ideal;
        const trend = (last - first) / first;
        let s = 12;
        if (dev < 0.1) s = 18; else if (dev < 0.2) s = 13; else s = 6;
        if (Math.abs(trend) < 0.03) s += 4; else if (Math.abs(trend) < 0.08) s += 1; else s -= 3;
        score += s;
        details.push({ label: "Вес", value: Math.round((s / 22) * 100), hint: "Отклонение от породной нормы " + Math.round(dev * 100) + "%" });
      } else details.push({ label: "Вес", value: 40, hint: "Нужно минимум 2 измерения" });

      const walks = (state.walks || []).filter((w) => w.petId === id).slice(0, 7);
      const avgWalk = walks.length ? walks.reduce((s, w) => s + w.minutes, 0) / walks.length : 0;
      const breedWalk = D.breedById(pet.breedId).walk || 60;
      let ws = Math.min(18, (avgWalk / Math.max(20, breedWalk)) * 18);
      score += ws;
      details.push({ label: "Прогулки", value: Math.round((ws / 18) * 100), hint: Math.round(avgWalk) + " мин в среднем (норма " + breedWalk + " мин)" });

      const moods = (state.moods[id] || []).slice(-7);
      const moodScore = moods.length ? moods.reduce((s, m) => s + ((D.moods.find((x) => x.id === m.mood) || { score: 3 }).score), 0) / moods.length : 3;
      const ms = (moodScore / 5) * 14;
      score += ms;
      details.push({ label: "Настроение", value: Math.round((moodScore / 5) * 100), hint: "Средняя оценка " + window.PL.fmt.num(moodScore, 1) + "/5" });

      const vacs = state.vaccinations[id] || [];
      const overdue = vacs.filter((v) => v.next && Store.daysUntil(v.next) < 0).length;
      const vs = vacs.length ? Math.max(0, 12 - overdue * 6) : 6;
      score += vs;
      details.push({ label: "Вакцинация", value: Math.round((vs / 12) * 100), hint: overdue ? overdue + " просроченных прививок" : "Всё по графику" });

      const sleeps = (state.sleep[id] || []).slice(-7);
      const avgSleep = sleeps.length ? sleeps.reduce((s, x) => s + x.hours, 0) / sleeps.length : 10;
      const norm = pet.species === "cat" ? 14 : 12;
      const ss = Math.max(0, 12 - Math.abs(avgSleep - norm) * 2.5);
      score += ss;
      details.push({ label: "Сон", value: Math.round((ss / 12) * 100), hint: window.PL.fmt.num(avgSleep, 1) + " ч в сутки (норма ~" + norm + " ч)" });

      const meds = state.meds[id] || [];
      const lateMeds = meds.filter((m) => Store.daysUntil(Store.nextDose(m).toISOString()) < 0).length;
      const medScore = meds.length ? Math.max(0, 8 - lateMeds * 4) : 8;
      score += medScore;
      details.push({ label: "Лекарства", value: Math.round((medScore / 8) * 100), hint: lateMeds ? lateMeds + " просрочено" : "Приём по графику" });

      const symptoms = (state.symptoms[id] || []).filter((s) => (Date.now() - new Date(s.date).getTime()) / 86400000 < 14);
      const sev = symptoms.reduce((s, x) => s + (+x.severity || 0), 0);
      const symScore = Math.max(0, 8 - sev * 1.5);
      score += symScore;
      details.push({ label: "Симптомы", value: Math.round((symScore / 8) * 100), hint: symptoms.length ? symptoms.length + " записей за 2 недели" : "Жалоб нет" });

      return { score: Math.max(5, Math.min(100, Math.round(score))), details };
    },
    /* статистика по всем питомцам — для обзорной панели */
    summary() {
      const S = state;
      const active = Store.pet();
      const idx = Store.index(active);
      const walks = (S.walks || []).filter((w) => w.petId === active.id);
      const monthExpenses = (S.expenses || []).filter((e) => (Date.now() - new Date(e.date).getTime()) / 86400000 < 30)
        .reduce((s, e) => s + (+e.amount || 0), 0);
      return { index: idx, walks: walks.length, monthExpenses, pets: S.pets.length, donations: S.donated || 0 };
    }
  };

  window.Store = Store;
})();
