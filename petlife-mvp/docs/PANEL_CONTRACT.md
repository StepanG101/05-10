# PetLife — контракт модулей кабинета (панелей)

Проект: `C:\Users\stepa\PythonProject_PetLife\petlife-mvp`
Ванильный JS, без библиотек и сборщиков. Всё офлайн. Язык интерфейса — русский.

## Как подключить панель

Файл `js/app/panel-XXX.js` — самодостаточный IIFE, подключается тегом `<script>` уже в `index.html` (порядок: после `js/app/hub.js`).

```js
(function () {
  "use strict";
  const { $, $$, esc, fmt, card, stat, badge, progress, empty, field, table, list, bullets,
          Charts, toast, modal, confirmDialog, promptDialog, Actions } = window.PL;
  const D = window.PL_DATA;        // справочники (породы, корма, токсины, приюты, товары…)
  const S = () => window.Store.state;   // ВСЕГДА вызывать внутри render, не кэшировать!

  window.Panels.register("walk", {
    render(view, ctx) {
      const pet = ctx.pet || window.Store.pet();
      view.innerHTML = `...HTML...`;
    }
  });

  Actions.registerAll({
    "walk.something": (ds, ev, el) => { /* ds — dataset кнопки */ }
  });
})();
```

- `render(view, ctx)` вызывается при каждом открытии панели и при каждом изменении состояния.
  `ctx = { tab, pet, setTab(t) }` — `ctx.tab` приходит из `data-act="hub.open" data-panel="..." data-tab="..."`.
- Кнопки внутри HTML обязаны использовать `data-act="module.action"` (+ любые `data-*` параметры).
  Никаких `onclick="..."` с инлайновым кодом, кроме простых случаев.
- **После любого изменения данных через `window.Store.*` перерисовка происходит сама** (hub подписан на store). Не нужно вызывать render вручную. Если изменение чисто визуальное (раскрыть аккордеон, выбрать слот) — манипулируйте DOM напрямую.

## Работа с данными

```js
const S = window.Store.state;
Store.pet(id?)                 // активный питомец
Store.pets()                   // массив питомцев
Store.setActivePet(id)
Store.breed(pet)               // объект породы из PL_DATA.breeds
Store.ageStage(pet)            // стадия возраста {id,name,tips[],checkups,focus}
Store.ageLabel(pet)            // «4 года 3 мес»
Store.portion(pet, act?)       // {rer, kcal, grams, meals, activity, stage} — норма корма
Store.index(pet)               // {score 0..100, details:[{label,value,hint}]} — PetLife Index
Store.daysUntil("2026-05-01")  // число дней (может быть отрицательным)
Store.nextDose(med)            // Date следующего приёма лекарства
Store.update(s => { ... })     // изменить состояние (+ автосохранение + перерисовка)
Store.push("symptoms", item, petId)   // добавить в бакет питомца (unshift)
Store.remove("symptoms", id, petId)   // удалить из бакета
Store.bucket("weights", petId) // массив бакета активного питомца
Store.array("expenses")        // массив верхнего уровня (расходы, заказы, посты…)
Store.uid("id")                // сгенерировать id
Store.iso(0)                   // YYYY-MM-DD, 0 = сегодня, 7 = неделю назад
```

Бакеты по питомцу: `medical, symptoms, meds, vaccinations, weights, activity, sleep, moods, meals, behavior`.
Верхний уровень: `pets, walks, appointments, contacts, expenses, bookings, devices, cart, orders, adoptions, posts, friends, walkInvites, lostAlerts, chat, aiHistory`, плюс `training[petId] = {done:[],xp,streak,games:[],lastLesson}`, `owner, mission, budgetLimit, donated, settings`.

## Хелперы UI (window.PL / window.UI)

- `card({title, icon, body, foot, tools, className})` — карточка.
- `stat({icon, value, label, hint, kind})` — плитка показателя (`kind`: ok/warn/danger).
- `badge(text, kind)` — kind: `info|ok|warn|danger|muted|violet`.
- `progress(pct, kind)` — полоса (`kind`: green/orange/red).
- `empty(icon, title, text, actionHtml)` — пустое состояние.
- `field({label, type, value, placeholder, options, hint, id, rows, checked, checkLabel, attrs})` — поле ввода (`type`: text/number/date/time/select/textarea/checkbox).
- `table(head[], rows[][], opts)` — таблица (в ячейках можно HTML).
- `list(items[], "tick"|"dot")`, `bullets(title, items[])`.
- `Charts.line(data:[{label,value}], {color,unit,target,min,max,height})`,
  `Charts.bars(data:[{label,value,color,short}], {unit,target,color})`,
  `Charts.donut(parts:[{label,value,color}], {center,centerSub,size,thickness})`,
  `Charts.gauge(value, {label,max,size})`, `Charts.sparkline(values[], {color})`.
- `toast(text, kind)` — kind: `info|ok|warn|error|ai`.
- `modal({title, icon, body, actions:[{label, kind, value, onClick(wrap)}], wide})`,
  `confirmDialog(text, opts) -> Promise<bool>`, `promptDialog(title, {label, value, type}) -> Promise<string|null>`.
- `fmt.num(n, digits)`, `fmt.int(n)`, `fmt.money(n)`, `fmt.temp(n)`, `fmt.date(iso)`, `fmt.short(iso)`, `fmt.time(iso)`, `fmt.today()`, `fmt.ago(iso)`, `fmt.plural(n,one,few,many)`, `fmt.days(n)`.
- `esc(str)`, `$`, `$$`, `PL.download(name, content)`, `PL.observeOnce(node, cb)`.

## Классы CSS (использовать, не изобретать новые без нужды)

Общие: `card card-head card-body card-foot`, `panel panel-head panel-tools panel-grid cols-2 cols-3 span-2 stack`,
`kpi-row kpi k-ico k-value k-label`, `stat`, `badge badge-*`, `progress`, `field field-label field-hint input input-area field-error check`,
`btn btn-primary btn-green btn-orange btn-danger btn-ghost btn-soft btn-sm btn-xs btn-block btn-icon`,
`table-wrap table`, `list tick dot`, `bullets`, `empty`, `timeline tl-item tl-rail tl-dot tl-line tl-body tl-time tl-title tl-kv`,
`kv kv-row kv-k kv-v`, `hint-box ok-box danger-box`, `accordion acc-head acc-arrow acc-body` (открытие: класс `open`),
`chip-row`, `tag` (+`active`), `map-wrap city-map map-marker map-user map-legend map-item mi-ico mi-name mi-sub` (`map-marker` позиционируется inline-стилем `left:x%;top:y%`),
`med-card med-ico med-main med-name med-sub` (`due`, `late`), `device-card off`, `switch` (+`on`),
`course-card course-head course-ico lesson lesson-check lesson-title lesson-how xp-bar xp-level`,
`prod-grid prod-card prod-emoji prod-name prod-price prod-old prod-meta qty cart-line cl-name`,
`post post-head post-text post-actions avatar`, `friend-card`, `shelter-card shelter-top shelter-body`,
`insurance-card best ic-best insurance-price`, `slot slot-row busy active`, `mood-row mood-btn mb-emoji mb-label`,
`emoji-picker emoji-opt`, `thumb upload-mini`, `receipt barcode`, `mission-mini mm-value donation-card`,
`toast-host`, `modal-*`, `donut-wrap`, `chart`, `spark`, `typing-dots`, `chat chat-log msg msg-ai msg-user msg-avatar msg-bubble msg-time quick-q chat-input`,
`hidden`, `muted small tiny center mt-1 mt-2 mt-3 mb-1 mb-2 row row-between grid grid-2 grid-3 grid-4`.

## Требования к качеству

1. Всё кликабельно и осмысленно: добавление, удаление, фильтры, переключение табов, вычисления.
2. Никаких заглушек и «TODO»: если кнопка есть — она работает.
3. Каждая панель, у которой есть подразделы, использует `ctx.tab` и `data-tab` переходы (`<button class="tag" data-act="hub.open" data-panel="health" data-tab="toxic">`).
4. Пустые состояния — через `empty(...)` с рабочей кнопкой.
5. Всё на русском, дружелюбно, с emoji-иконками. Никаких внешних картинок и CDN.
6. Никаких `console.log` (только `console.error` при ошибках). Никаких ошибок в консоли.
7. Файл проверять `node --check путь\к\файлу.js`.
