/* ============================================================================
 * PetLife — ai.js
 * ИИ-слой проекта:
 *   • analyzeFile(file)  — анализ фото питомца (OpenRouter vision или локальный анализатор);
 *   • sample(kind)       — синтетическое демо-фото (рисуется на canvas, без внешних файлов);
 *   • chat(history, q)   — ИИ-ассистент по данным питомца (LLM или локальная база знаний);
 *   • plan(pet)          — персональный план заботы на неделю;
 *   • dailyTip(pet)      — совет дня с учётом погоды и данных.
 * Всё работает офлайн: если ключа нет, включается локальный интеллект.
 * ==========================================================================*/
(function () {
  "use strict";
  const D = window.PL_DATA;
  const BASE = (window.PETLIFE_CONFIG && window.PETLIFE_CONFIG.API_BASE) || "";

  const PROMPT = "Ты — ветеринарный ассистент. Посмотри на фото питомца. Кратко опиши, что видишь. " +
    "Если есть признаки проблем со здоровьем — укажи. Дай рекомендацию: наблюдать дома или обратиться к ветеринару. " +
    "Отвечай на русском, дружелюбно, максимум 5 предложений.";

  /* ---------------------------------------------------------------- утилиты изображения */
  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Не удалось прочитать файл. Попробуйте другое фото."));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Не удалось открыть изображение. Попробуйте формат JPG или PNG."));
      img.src = src;
    });
  }

  /* Пиксельная статистика: цвет, яркость, контраст, «краснота», «желтизна», плотность краёв */
  function analyzePixels(img) {
    const w = 80, h = 80;
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    let data;
    try { data = ctx.getImageData(0, 0, w, h).data; }
    catch (e) { throw new Error("Не удалось проанализировать изображение в браузере. Попробуйте другое фото."); }

    let r = 0, g = 0, b = 0, count = 0, lum = 0, lum2 = 0;
    const lumMap = new Float32Array(w * h);
    for (let i = 0; i < data.length; i += 4) {
      const R = data[i], G = data[i + 1], B = data[i + 2], A = data[i + 3];
      if (A < 20) continue;
      r += R; g += G; b += B; count++;
      const l = 0.299 * R + 0.587 * G + 0.114 * B;
      lum += l; lum2 += l * l;
      lumMap[count - 1] = l;
    }
    if (!count) throw new Error("На фото не найдено изображение. Загрузите другое фото.");
    r /= count; g /= count; b /= count; lum /= count;
    const variance = Math.max(0, lum2 / count - lum * lum);
    const contrast = Math.sqrt(variance);

    let edges = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const dx = Math.abs(lumMap[i] - lumMap[i + 1]);
        const dy = Math.abs(lumMap[i] - lumMap[i + w]);
        if (dx + dy > 42) edges++;
      }
    }
    const redness = r - (g + b) / 2;
    const yellowness = (r + g) / 2 - b;
    const brightness = lum;
    const saturation = 1 - Math.min(r, g, b) / (Math.max(r, g, b) || 1);
    const seed = Math.round((r * 7 + g * 13 + b * 17 + edges + contrast * 3) % 1000);
    return { r, g, b, brightness, contrast, edges, edgeDensity: edges / (w * h), redness, yellowness, saturation, seed, count };
  }

  /* ---------------------------------------------------------------- локальная «диагностика» */
  const LOCAL_TEMPLATES = {
    red: [
      { title: "Покраснение кожи", see: "На фото заметен участок с усиленным красным оттенком — кожа выглядит раздражённой.",
        causes: ["аллергическая реакция на корм или шампунь", "контактный дерматит после прогулки", "укус насекомого или блошиный дерматит"],
        advice: "Промойте участок тёплой водой без мыла, не давайте расчёсывать. Если покраснение держится больше суток или появились ранки — покажитесь ветеринару." },
      { title: "Покраснение в области глаз или ушей", see: "Оттенок и распределение цвета указывают на локальное покраснение — часто это глаза или внутренняя поверхность уха.",
        causes: ["конъюнктивит или отит", "попавшая пыль/пыльца", "начало инфекции"],
        advice: "Осмотрите симметричность: если покраснел только один глаз или ухо, а питомец трясёт головой, — к врачу в течение дня." },
      { title: "Раздражение на подушечках лап", see: "Красноватый оттенок в нижней части кадра и повышенный контраст — похоже на раздражение подушечек лап.",
        causes: ["горячий асфальт", "реагенты зимой", "мелкая трещина или порез"],
        advice: "Проверьте лапы на порезы, промойте и нанесите заживляющий крем для животных. Не гуляйте по асфальту горячее 40 °C." }
    ],
    yellow: [
      { title: "Налёт на зубах", see: "Желтоватый оттенок в области пасти характерен для зубного налёта и камня.",
        causes: ["редкая чистка зубов", "мягкий корм без твёрдых частиц", "склонность породы к пародонтиту"],
        advice: "Начните чистить зубы пастой для животных 3 раза в неделю и добавьте твёрдые лакомства. При запахе из пасти и кровоточивости дёсен нужна ультразвуковая чистка." },
      { title: "Пожелтение белков глаз", see: "На фото белки глаз выглядят желтоватыми — это может быть вариант нормы при тёплом освещении, но требует проверки.",
        causes: ["тёплый свет в кадре", "нарушение работы печени (иктеричность)", "повышенный билирубин"],
        advice: "Сфотографируйте питомца при дневном свете. Если желтизна сохраняется — сдайте биохимию крови в течение 2–3 дней." },
      { title: "Жёлтые выделения", see: "Желтоватые следы в кадре могут быть выделениями из глаз, носа или ушей.",
        causes: ["бактериальная инфекция", "аллергия", "попавшая пыль"],
        advice: "Протирайте мягким тампоном, смоченным физраствором. Гнойные или обильные выделения — повод для визита к ветеринару." }
    ],
    dark: [
      { title: "Тёмное пятно или пигментация", see: "На фото есть локальное потемнение — это может быть пигментное пятно, корочка или загрязнение.",
        causes: ["естественная пигментация", "засохшая корочка после расчёса", "гиперпигментация при воспалении"],
        advice: "Понаблюдайте 3–5 дней и измерьте пятно линейкой. Если оно растёт, мокнет или меняет цвет — к дерматологу." },
      { title: "Тёмный налёт на коже", see: "Потемнение в складках кожи характерно для скопления кожного секрета.",
        causes: ["складки кожи (мопс, шарпей, французский бульдог)", "дрожжевая инфекция", "недостаточная гигиена складок"],
        advice: "Протирайте складки специальным лосьоном ежедневно и просушивайте. Запах и зуд — признак инфекции, нужен врач." },
      { title: "Слишком тёмное фото", see: "Кадр получился тёмным, часть деталей не видна — по нему сложно судить о состоянии питомца.",
        causes: ["недостаточное освещение", "съёмка против света", "тень от руки"],
        advice: "Переснимите при дневном свете: кожа, глаза и уши должны быть видны крупно и чётко. Качество фото напрямую влияет на точность анализа." }
    ],
    calm: [
      { title: "Визуальных признаков проблем не найдено", see: "Цвет, контраст и структура кадра соответствуют здоровой шерсти и коже без выраженных изменений.",
        causes: [],
        advice: "Продолжайте обычный уход: осмотр раз в неделю, обработка от паразитов по графику, чистка зубов 2–3 раза в неделю. Сфотографируйте питомца снова через 5–7 дней для сравнения." },
      { title: "Питомец выглядит ухоженным", see: "Шерсть ровная, без выраженных залысин, кожа без покраснений и потемнений.",
        causes: [],
        advice: "Хороший момент, чтобы занести фото в дневник наблюдений — так появится история и врачу будет с чем сравнивать." },
      { title: "Спокойное состояние", see: "Признаков воспаления, выделений или повреждений на фото не видно.",
        causes: [],
        advice: "Если есть жалобы, которые не видно на фото (хромота, отказ от еды, вялость), — опишите их в дневнике симптомов или задайте вопрос ИИ-ассистенту." }
    ]
  };

  function localVision(stats) {
    let group = "calm";
    if (stats.redness > 26 && stats.saturation > 0.28) group = "red";
    else if (stats.yellowness > 60 && stats.brightness > 90) group = "yellow";
    else if (stats.brightness < 78 || (stats.edgeDensity > 0.16 && stats.contrast > 46)) group = "dark";
    if (stats.brightness < 55) group = "dark";
    const list = LOCAL_TEMPLATES[group];
    const t = list[stats.seed % list.length];
    const lines = [
      "Что вижу: " + t.see,
      t.causes.length ? "Возможные причины: " + t.causes.join(", ") + "." : "Подозрительных изменений кожи, глаз или зубов не видно.",
      "Рекомендация: " + t.advice,
      "Показатели кадра: яркость " + Math.round(stats.brightness) + "/255, контраст " + Math.round(stats.contrast) + ", насыщенность " + window.PL.fmt.num(stats.saturation * 100, 0) + "%."
    ];
    return {
      text: lines.join("\n"),
      title: t.title,
      group,
      findings: [
        { label: "Яркость", value: Math.round((stats.brightness / 255) * 100), hint: stats.brightness < 90 ? "кадр тёмный" : "нормальное освещение" },
        { label: "Краснота (воспаление)", value: Math.min(100, Math.round((stats.redness + 20) * 1.4)), hint: stats.redness > 26 ? "повышена" : "в пределах нормы" },
        { label: "Желтизна (налёт)", value: Math.min(100, Math.round(stats.yellowness / 1.6)), hint: stats.yellowness > 60 ? "повышена" : "в пределах нормы" },
        { label: "Детализация", value: Math.min(100, Math.round(stats.edgeDensity * 400)), hint: stats.edgeDensity < 0.06 ? "мало деталей" : "достаточно для анализа" }
      ]
    };
  }

  /* ---------------------------------------------------------------- синтетические демо-фото */
  function sample(kind) {
    const c = document.createElement("canvas");
    c.width = 480; c.height = 360;
    const x = c.getContext("2d");
    const kinds = {
      skin: { bg: "#F6E3D3", patch: "#E8A07A", label: "Демо: участок кожи", icon: "🐾", ring: "#D9734A" },
      eyes: { bg: "#EFE6DC", patch: "#E9B7B7", label: "Демо: область глаз", icon: "👁", ring: "#C86B6B" },
      teeth: { bg: "#F1EAE0", patch: "#E4D08A", label: "Демо: пасть и зубы", icon: "🦷", ring: "#C9A227" },
      coat: { bg: "#E8E2D6", patch: "#CBBBA0", label: "Демо: шерсть и кожа", icon: "🐕", ring: "#8C7A5B" }
    };
    const k = kinds[kind] || kinds.coat;
    const grad = x.createLinearGradient(0, 0, 480, 360);
    grad.addColorStop(0, k.bg); grad.addColorStop(1, "#FFFFFF");
    x.fillStyle = grad; x.fillRect(0, 0, 480, 360);
    // шерстинки
    for (let i = 0; i < 900; i++) {
      x.strokeStyle = "rgba(120,100,80," + (0.05 + Math.random() * 0.12) + ")";
      x.lineWidth = 1;
      x.beginPath();
      const sx = Math.random() * 480, sy = Math.random() * 360;
      x.moveTo(sx, sy); x.lineTo(sx + (Math.random() - 0.5) * 14, sy + 10 + Math.random() * 8);
      x.stroke();
    }
    // «питомец»
    x.fillStyle = "rgba(180,150,120,.35)";
    x.beginPath(); x.ellipse(240, 210, 140, 110, 0, 0, Math.PI * 2); x.fill();
    x.font = "110px serif"; x.textAlign = "center"; x.fillText(k.icon, 240, 250);
    // проблемная зона
    x.strokeStyle = k.ring; x.lineWidth = 4; x.setLineDash([9, 7]);
    x.beginPath(); x.ellipse(320, 170, 62, 48, 0.2, 0, Math.PI * 2); x.stroke();
    x.setLineDash([]);
    x.fillStyle = k.patch + "66";
    x.beginPath(); x.ellipse(320, 170, 60, 46, 0.2, 0, Math.PI * 2); x.fill();
    // подпись
    x.fillStyle = "rgba(26,26,26,.72)"; x.font = "bold 20px sans-serif"; x.textAlign = "left";
    x.fillText(k.label, 18, 32);
    x.font = "14px sans-serif"; x.fillStyle = "rgba(26,26,26,.5)";
    x.fillText("синтетическое изображение для демонстрации", 18, 54);
    return c.toDataURL("image/jpeg", 0.86);
  }

  /* ---------------------------------------------------------------- основное API */
  const AI = {
    sample,
    fileName: "",

    async analyzeDataUrl(dataUrl, opts) {
      const o = opts || {};
      // 1) сервер с ключом OpenRouter
      try {
        const res = await fetch(BASE + "/api/analyze", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: dataUrl })
        });
        const data = await res.json();
        if (data && data.text) return { text: data.text, source: data.source || "openrouter", findings: null };
        if (data && data.error && /API-ключа|Слишком много запросов/.test(data.error)) throw new Error(data.error);
      } catch (err) {
        if (err && err.message && /ключ|запрос|Загрузите|большой/i.test(err.message)) throw err;
        /* сервер недоступен — работаем локально */
      }
      // 2) локальный анализатор
      const img = await loadImage(dataUrl);
      const stats = analyzePixels(img);
      const local = localVision(stats);
      return { text: local.text, source: "local", title: local.title, findings: local.findings };
    },

    async analyzeFile(file) {
      if (!file) throw new Error("Загрузите изображение");
      if (!/^image\//.test(file.type)) throw new Error("Загрузите изображение");
      if (file.size > 5 * 1024 * 1024) throw new Error("Файл слишком большой (макс. 5 МБ)");
      const dataUrl = await fileToDataUrl(file);
      const res = await this.analyzeDataUrl(dataUrl);
      res.preview = dataUrl;
      res.name = file.name;
      return res;
    },

    async analyzeSample(kind) {
      const dataUrl = sample(kind);
      const res = await this.analyzeDataUrl(dataUrl);
      res.preview = dataUrl;
      res.name = "demo-" + kind + ".jpg";
      return res;
    },

    /* -------------------------------------------------------- ИИ-ассистент */
    context(pet) {
      const S = window.Store.state;
      const p = pet || window.Store.pet();
      const breed = window.Store.breed(p);
      const portion = window.Store.portion(p);
      const idx = window.Store.index(p);
      const stage = window.Store.ageStage(p);
      const w = S.lastWeather;
      return {
        pet: p, breed, portion, index: idx, stage,
        age: window.Store.ageLabel(p),
        vaccinations: (S.vaccinations[p.id] || []).map((v) => v.name + " (до " + v.next + ")"),
        meds: (S.meds[p.id] || []).map((m) => m.name),
        symptoms: (S.symptoms[p.id] || []).slice(0, 5).map((s) => s.date + ": " + s.type + " " + s.severity + "/5"),
        weather: w ? { city: w.cityName, temp: w.temp, asphalt: w.asphalt, advice: w.advice.text } : null,
        allergies: p.allergies, chronic: p.chronic
      };
    },

    buildContext() {
      const c = this.context();
      return [
        "Питомец: " + c.pet.name + ", " + c.breed.name + ", " + window.Store.ageLabel(c.pet) + ", вес " + c.pet.weight + " кг, " + (c.pet.sterilized ? "стерилизован" : "не стерилизован") + ".",
        "Аллергии: " + (c.allergies.length ? c.allergies.join(", ") : "нет") + ". Хронические: " + (c.chronic.length ? c.chronic.join(", ") : "нет") + ".",
        "Норма корма: " + c.portion.grams + " г/день (" + c.portion.kcal + " ккал), " + c.portion.meals + " кормления.",
        "PetLife Index: " + c.index.score + "/100.",
        "Стадия: " + c.stage.name + ", профилактика: " + c.stage.checkups + ".",
        c.weather ? "Погода: " + c.weather.city + ", " + c.weather.temp + " °C, асфальт " + c.weather.asphalt + " °C." : "Погода ещё не запрашивалась."
      ].join(" ");
    },

    /* локальная база знаний — работает без ключей */
    localAnswer(question) {
      const q = (question || "").toLowerCase();
      const c = this.context();
      const p = c.pet, breed = c.breed, portion = c.portion;
      const has = (...words) => words.some((w) => q.includes(w));

      if (has("привет", "здравств", "хай")) {
        return "Привет! 🐾 Я знаю, что " + p.name + " — " + breed.name.toLowerCase() + ", " + window.Store.ageLabel(p) + ", вес " + p.weight + " кг. Спросите про кормление, прогулку, симптомы, прививки или дрессировку — отвечу по вашим данным.";
      }
      if (has("корм", "порци", "сколько давать", "еда", "питани", "ккал")) {
        return "Для " + p.name + " норма — примерно " + portion.grams + " г сухого корма в день (" + portion.kcal + " ккал, RER " + portion.rer + "), это " + portion.meals + " " + window.PL.fmt.plural(portion.meals, "кормление", "кормления", "кормлений") + ".\n" +
          (c.allergies.length ? "⚠️ Учитываю аллергии: " + c.allergies.join(", ") + " — выбирайте корма без этих ингредиентов (подбор есть в разделе «Питание»)." : "Аллергий в профиле нет — можно подбирать корм по возрасту и активности.") + "\n" +
          "Ориентир: " + breed.tips[0] + ".";
      }
      if (has("гуля", "прогул", "асфальт", "погод", "жар", "мороз")) {
        if (c.weather) {
          return "Сейчас в " + c.weather.city + ": " + c.weather.temp + " °C, асфальт около " + c.weather.asphalt + " °C. " + c.weather.advice + "\n" +
            "Для породы " + breed.name + " комфортный диапазон: от " + breed.tempMin + " до " + breed.tempMax + " °C, норма прогулки — " + breed.walk + " минут в день.";
        }
        return "Откройте раздел «Прогулка и погода» — я запрошу погоду, посчитаю температуру асфальта, AQI, UV и подберу лучшее время. Для " + breed.name + " норма — " + breed.walk + " минут в день, комфортно от " + breed.tempMin + " до " + breed.tempMax + " °C.";
      }
      if (has("чеш", "зуд", "кож", "шерст", "сыпь", "покрасн")) {
        return "Зуд и покраснения — топ-3 причины обращений. Что делать сейчас:\n" +
          "1. Осмотрите кожу: где именно (спина, лапы, живот), есть ли залысины и корочки.\n" +
          "2. Вспомните, что менялось за 5–7 дней: корм, шампунь, место прогулки.\n" +
          "3. Обработайте от паразитов, если срок подошёл, и промойте участок тёплой водой без мыла.\n" +
          (c.allergies.length ? "4. Исключите аллергены из профиля: " + c.allergies.join(", ") + ".\n" : "4. Заведите дневник: сфотографируйте участок сейчас и через 3 дня.\n") +
          "К врачу — если зуд не проходит 3 дня, появились мокнущие участки или питомец расчёсывает до крови. Можно загрузить фото в раздел «Здоровье → ИИ-анализ фото».";
      }
      if (has("ветеринар", "врач", "к врачу", "срочно", "тревог")) {
        return "Красные флаги, при которых нужен ветеринар в течение часа: отказ от еды больше суток, рвота чаще 3 раз, кровь в стуле или моче, судороги, температура выше 39,5 °C, тяжёлое дыхание, поедание токсичного продукта.\n" +
          "Экстренные контакты и гид по первой помощи — в разделе «Здоровье → Первая помощь». Там же база токсичных продуктов, если что-то съел.";
      }
      if (has("привив", "вакцин", "бешенств")) {
        const vacs = c.vaccinations;
        return (vacs.length ? "В карте " + p.name + ": " + vacs.join("; ") + ".\n" : "Прививок в карте пока нет. ") +
          "Рекомендованный график для " + (p.species === "cat" ? "кошки" : "собаки") + ": комплексная в 8–9 недель, ревакцинация через 3–4 недели, бешенство в 12 недель, далее ежегодно. " +
          "Актуальный календарь с напоминаниями — в разделе «Здоровье → Вакцинация».";
      }
      if (has("дрессиров", "команд", "послушан", "трюк", "воспитан")) {
        return "С " + breed.name + " лучше работают короткие сессии по 5 минут, 2–3 раза в день, всегда с лакомством и без наказаний.\n" +
          "Начните с базы: «сидеть» → «лежать» → «ко мне» → «место». Для " + p.name + " (" + c.stage.name.toLowerCase() + ") оптимально " + (c.stage.id === "puppy" ? "3 сессии в день по 3 минуты" : "2 сессии по 5–7 минут") + ".\n" +
          "В разделе «Дрессировка» есть курсы с пошаговыми инструкциями, XP за уроки и клик-тренажёр, который учит правильно поощрять в нужный момент.";
      }
      if (has("игра", "скучно", "занять", "остав", "один дома", "активн")) {
        return "Умственная нагрузка утомляет сильнее физической. Топ-3 для " + p.name + ":\n" +
          "• нюхательный коврик или разбросанный корм — 10 минут;\n" +
          "• лизунец с замороженным паштетом — 20 минут спокойствия;\n" +
          "• игра «стаканчики» с лакомством под одним из трёх стаканов.\n" +
          "Плюс: " + breed.tips[2] + ". Все игры с таймерами — в разделе «Дрессировка → Игры».";
      }
      if (has("вес", "худ", "потолст", "ожирен")) {
        const w = (window.Store.state.weights[p.id] || []);
        const last = w.length ? w[w.length - 1].kg : p.weight;
        const dev = Math.round((last - breed.weight) / breed.weight * 100);
        return "Текущий вес " + p.name + " — " + last + " кг, породная норма около " + breed.weight + " кг (отклонение " + (dev > 0 ? "+" : "") + dev + "%).\n" +
          (Math.abs(dev) > 15 ? "⚠️ Отклонение больше 15% — стоит показать питомца ветеринару и пересчитать порцию.\n" : "Отклонение в допустимых пределах.\n") +
          "Что делать: измеряйте вес раз в 2 недели, уменьшите лакомства на 10%, добавьте 15 минут активности. Динамика — в разделе «Трекеры → Вес».";
      }
      if (has("аллерг")) {
        return c.allergies.length
          ? "В профиле " + p.name + " отмечены аллергии: " + c.allergies.join(", ") + ". Я исключаю их при подборе корма и рецептов, а также предупреждаю в маркетплейсе."
          : "В профиле аллергии не отмечены. Если заметили реакцию (зуд, покраснение, расстройство ЖКТ), добавьте аллерген в профиль — я сразу начну исключать его из подбора корма.";
      }
      if (has("порода", "пород", "особенн")) {
        return breed.name + ": " + breed.tips.join(". ") + ".\nПородные риски: " + breed.risks.join(", ") + ". Уход: " + breed.grooming.toLowerCase() + ". Продолжительность жизни — около " + breed.life + " лет.";
      }
      if (has("возраст", "стар", "пожил", "щенок", "котен", "стади")) {
        return "Стадия " + p.name + " — " + c.stage.name.toLowerCase() + " (профилактика: " + c.stage.checkups + ", фокус: " + c.stage.focus.toLowerCase() + ").\n" + c.stage.tips.map((t) => "• " + t).join("\n");
      }
      if (has("план", "расписан", "недел", "режим")) {
        return this.plan(p);
      }
      if (has("токсич", "отрав", "съел", "шоколад", "виноград", "лук")) {
        const item = D.toxic.find((t) => q.includes(t.name.toLowerCase().split(" ")[0]));
        if (item) return item.emoji + " " + item.name + " — " + (item.danger === "high" ? "ВЫСОКАЯ опасность" : item.danger === "medium" ? "средняя опасность" : "низкая опасность") + ".\nСимптомы: " + item.symptoms + ".\nЧто делать: " + item.action + ".";
        return "Самое опасное для питомцев: шоколад, виноград и изюм, лук и чеснок, ксилит (жвачки), алкоголь, кофеин, макадамия, трубчатые кости, лилейные растения для кошек.\n" +
          "При подозрении на отравление: не вызывайте рвоту самостоятельно, сохраните упаковку, позвоните в клинику. Полная база — в разделе «Здоровье → Токсичные продукты».";
      }
      if (has("мисси", "приют", "помоч", "усынов", "донат")) {
        const m = window.Store.state.mission;
        return "PetLife передаёт 5% от каждого Premium-платежа в приюты. Всего через сообщество помощь получили " + window.PL.fmt.int(m.helped) + " питомцев, ваша личная помощь — " + window.PL.fmt.money(window.Store.state.donated) + ".\n" +
          "Можно взять шефство над конкретным питомцем из приюта (раздел «Сообщество → Усыновление») — вы будете получать фотоотчёты, а приют — деньги на корм и лечение.";
      }
      if (has("форум", "сообществ", "друз", "совместн")) {
        return "В разделе «Сообщество» есть форум владельцев, поиск друзей для прогулок рядом с вами и гео-алерты о потерянных питомцах.\n" +
          "Совет: найдите пару для прогулок — совместные прогулки снижают тревожность и улучшают социализацию. Рядом с вами сейчас " + (window.Store.state.friends || []).length + " владельцев.";
      }
      if (has("индекс", "благополуч", "оценк", "petlife index")) {
        const idx = window.Store.index(p);
        return "PetLife Index " + p.name + " — " + idx.score + "/100.\n" + idx.details.map((d) => "• " + d.label + ": " + d.value + "% — " + d.hint).join("\n") +
          "\nИндекс растёт от регулярных прогулок, стабильного веса, свежих прививок и хорошего настроения.";
      }
      return "Я PetLife AI и отвечаю по данным вашего питомца. Могу помочь с:\n" +
        "• кормлением и порциями (" + portion.grams + " г/день для " + p.name + ");\n" +
        "• прогулками и безопасностью асфальта;\n" +
        "• симптомами: что наблюдать, а когда к врачу;\n" +
        "• прививками, весом, активностью и настроением;\n" +
        "• дрессировкой, играми и планом заботы на неделю.\n" +
        "Сформулируйте вопрос чуть конкретнее — например: «сколько корма давать?» или «что делать, если чешется лапа?»";
    },

    async chat(question) {
      const c = this.context();
      const history = (window.Store.state.chat || []).slice(-6).map((m) => ({ role: m.role, content: m.text }));
      try {
        const res = await fetch(BASE + "/api/ai/chat", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, history, context: this.buildContext() })
        });
        const data = await res.json();
        if (data && data.text) return { text: data.text, source: data.source || "openrouter" };
      } catch (err) { /* локальный ответ */ }
      return { text: this.localAnswer(question), source: "local" };
    },

    /* -------------------------------------------------------- план заботы и советы */
    plan(pet) {
      const p = pet || window.Store.pet();
      const breed = window.Store.breed(p);
      const portion = window.Store.portion(p);
      const stage = window.Store.ageStage(p);
      const S = window.Store.state;
      const meds = (S.meds[p.id] || []).map((m) => m.name);
      const vacs = (S.vaccinations[p.id] || []).filter((v) => window.Store.daysUntil(v.next) < 45);
      const days = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
      const plan = days.map((day, i) => {
        const items = [];
        items.push("Кормление: " + Math.round(portion.grams / portion.meals) + " г × " + portion.meals + " (" + (i % 2 ? "PetLife Daily" : "по норме") + ")");
        items.push(breed.walk + " мин прогулки" + (i >= 5 ? " (двойная, выходной)" : "") + (i % 3 === 0 ? " + нюхательный коврик" : ""));
        if (i === 1) items.push("Взвешивание и запись в трекер");
        if (i === 2 && stage.id !== "puppy") items.push("Дрессировка: 5 минут, команда «рядом»");
        if (i === 3 && meds.length) items.push("Лекарства: " + meds.join(", "));
        if (i === 4) items.push("Осмотр: кожа, уши, зубы, лапы (5 минут)");
        if (i === 5) items.push("Игры для ума: 15 минут");
        if (i === 6) items.push("Чистка зубов и расчёсывание");
        if (vacs.length && i === 0) items.push("⚠️ Скоро прививка: " + vacs[0].name + " (до " + window.PL.fmt.date(vacs[0].next) + ")");
        return { day, items };
      });
      const header = "План заботы для " + p.name + " (" + breed.name + ", " + window.Store.ageLabel(p) + ")\n" +
        "Норма корма: " + portion.grams + " г/день · прогулки: " + breed.walk + " мин/день · профилактика: " + stage.checkups;
      return header + "\n\n" + plan.map((d) => "📅 " + d.day + "\n" + d.items.map((i) => "   • " + i).join("\n")).join("\n");
    },

    dailyTip(pet) {
      const p = pet || window.Store.pet();
      const S = window.Store.state;
      const breed = window.Store.breed(p);
      const idx = window.Store.index(p);
      const w = S.lastWeather;
      const tips = [];
      if (w && w.asphalt > 45) tips.push("🔥 Асфальт " + w.asphalt + " °C — гуляйте до 10:00 или после 20:00, проверяйте лапы.");
      if (w && w.air && (w.air.european_aqi || 0) > 60) tips.push("😮‍💨 Качество воздуха неважное — сократите прогулку и избегайте дорог.");
      const stage = window.Store.ageStage(p);
      if (idx.details.find((d) => d.label === "Прогулки" && d.value < 55)) tips.push("🚶 " + breed.name + " нуждается в " + breed.walk + " мин активности — сегодня стоит добавить прогулку.");
      if (idx.details.find((d) => d.label === "Вакцинация" && d.value < 60)) tips.push("💉 Есть просроченная прививка — обновите календарь вакцинации.");
      const overdue = (S.meds[p.id] || []).filter((m) => window.Store.daysUntil(window.Store.nextDose(m).toISOString()) < 0);
      if (overdue.length) tips.push("💊 Просрочен приём: " + overdue.map((m) => m.name).join(", ") + ".");
      const moods = (S.moods[p.id] || []).slice(-3);
      if (moods.length === 3 && moods.every((m) => (D.moods.find((x) => x.id === m.mood) || {}).score <= 3)) tips.push("🙂 Настроение снижено 3 дня подряд — проверьте здоровье и добавьте любимую игру.");
      if (!tips.length) tips.push("✅ Всё по плану! " + (stage.id === "puppy" ? "Не забудьте про социализацию: 5 новых объектов в неделю." : breed.tips[0] + "."));
      tips.push("📚 Совет по породе: " + breed.tips[1] + ".");
      return tips;
    }
  };

  window.AI = AI;
})();
