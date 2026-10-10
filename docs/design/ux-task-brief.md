# VisionMachine — UI/UX Design Task Brief

Постановка задачи для дизайнера: максимальная декомпозиция интерфейса,
вариации действий и функционал, который ещё не реализован (дизайн
опережает код). Рабочая версия приложения: v0.7.6.

## 1. Контекст

**Продукт.** Desktop-приложение (Tauri + Svelte) для генерации AI-видео.
Базовая единица работы — **session** (состав: **pipes**, каждый pipe =
prompt + tags + keyframes + subject references → видео-клип). Итог
сессии — **session video** (сплайс всех клипов). Генерация — через
провайдеров (Agnes: бесплатные + платные модели), локальный ffmpeg.

**Целевой пользователь.** Соло-креатор, который гоняет быстрые тестовые
батчи: описывает pipe → генерирует (один или все сразу) → смотрит
сплайс → итерирует. Сессия работы — 10–40 минут. Ошибки прощаются
не перезапуском, а переделкой одного элемента.

**Цели редизайна.**
1. **Предсказуемость макета** — ничего не «улетает»: панели, top panel
   и composer не рефлоутятся при смене сессии/превью.
2. **Прозрачность состояния** — каждая зона знает, что происходит:
   loading / error / empty / success / disabled видны всегда.
3. **Скорость** — горячие пути (добавить keyframe, запустить гену,
   переименовать) не уходят глубже 1–2 действий; клавиатура равна мышке.
4. **Обучение** — первый сгенерированный видео у нового пользователя
   ≤ 5 минут, без чтения доков.

## 2. Жёсткие ограничения (не обсуждаются)

- Desktop-first, рабочая ширина от 1280px; окно resizable.
- **Top panel (превью-зона) фиксированного размера на этой фазе**:
  появление превью с другим aspect ratio НЕ меняет размер панели
  (картинка вписывается, layout shift = 0).
- Темы: несколько схем с текстурой (sprockets) и направлением теней —
  все макеты проверяются в каждой теме.
- Производительность: drag/timeline 60fps; тяжёлых анимаций в hot-путях
  (drag playhead, sweep по фреймам) не вводить.
- Иконки + эмодзи-кнопки сейчас смешаны — целевое состояние: единый
  иконный сет (см. 4.3).

## 3. Карта текущего UI

Экраны и компоненты (файлы `src/`):

| Зона | Компонент | Роль |
|---|---|---|
| Вход | `App.svelte`, `WelcomeAccounts.svelte`, `WelcomeDeleteModal.svelte` | выбор аккаунта/профиля, welcome-страница (film-stripe band), удаление профиля |
| Каркас | `Workspace.svelte` (монолит 2500+ строк) | layout: левая панель, top panel, composer, тулз-панель, модальные окна |
| Лево | `ProjectsPanel.svelte` | дерево проектов/сессий: создание, rename, copy (stub), delete, open folder |
| Лево | `ProfilePanel.svelte` | профиль: карточка, управление |
| Центр | `ComposerPanel.svelte` | список pipes |
| — | `ComposerRows/PipeHeader.svelte` | заголовок pipe: выбор, rename |
| — | `ComposerRows/KeyframesRow.svelte` | слоты keyframes: url / img2img / txt2img, source |
| — | `ComposerRows/SubjectRefsRow.svelte` | слоты subject references |
| — | `ComposerTimeline/TimelineSection.svelte` | таймлайн pipe: фреймы, drag, ruler |
| Top panel | `.preview-area` внутри `Workspace.svelte` | превью фрейма, `FrameCarousel.svelte` (sweep по фреймам), `FrameRuler.svelte`, mirroring session video |
| Право | `ToolsPanel.svelte` | кнопки generate, compose session video, open preview, focus mode, new session |
| Модальные | `ComposerModals/GenerateModal.svelte` | генерация одного pipe: seed, quality/creativity, prompt |
| | `ComposerModals/SessionGenerateModal.svelte` | генерация сессии целиком (two-pane), conflict list, policy continue/stop |
| | `ComposerModals/GenerationProgressModal.svelte` + `CompactPipesProgress.svelte` | прогресс по pipe'ам, compact view, minimize в pill (D10) |
| | `KeyframeModal / SubjectRefModal / SegmentModal / PipeLengthModal / GlobalPromptModal / TagPromptModal` | редакторы отдельных элементов |
| | `ComposerMenus/AddTrackMenu.svelte`, `TagSelectorMenu.svelte` | меню |
| Настройки | `Settings/SettingsModal / ProviderCard / ProviderStatus / SettingsDefaults / ToolsSettings` | провайдеры, ключи, пресеты, ffmpeg, дефолты |
| Глобально | `ErrorHandler.svelte`, `flashToast`, `Footer.svelte` | ошибки, тосты, футер |

Известная структурная проблема (открытый репорт): при смене сессии с
доступным превью top panel меняет высоту → весь layout сдвигается. P0.

## 4. Глобальный слой (фундамент)

### 4.1 Design tokens
- **Цвет**: base + semantic (success/warn/error/info/accent), варианты
  под каждую тему (темы с текстурой sprockets и направлением теней).
- **Масштаб**: spacing 4/8/12/16/24; radius панелей; типографика 2–3
  уровня (заголовок панели / строка / подпись).
- **Иконки**: единый сет 16/20px, одна толщина штриха; заменимые:
  эмодзи (📂, ⧉, ×, 📋) в `ProjectsPanel`, иконки кнопок в `ToolsPanel`.
- **Motion**: шкала 100/200/300ms, easing; в hot-путях — только
  opacity/transform (без layout-affecting).

### 4.2 Матрица состояний взаимодействий
Для КАЖДОГО интерактивного элемента: `default / hover / active /
focus-visible / disabled / loading / error / success / empty`.
Обязательный охват в ките: кнопки, input, select, toggle, строка
(pipe, keyframe, subject, session), карточка (provider, model),
модальное окно, пункт меню, pill/badge, ruler.

### 4.3 Иконки и лейблы
- Единый иконный сет; лейбл кнопки ≤ 2 слова; tooltip = действие +
  hotkey (если есть).
- Status chip (provider: configured / key needed) — фиксированное
  место на карточке, значение всегда соответствует факту (регрессия
  v0.7.5 не повторить).

### 4.4 Клавиатурный слой (desktop-first)
Глобальная карта (рабочие + проектируемые):
- `Esc` — закрыть модал / выйти из редактирования; `Enter` — commit
  (rename, модалы).
- `⌘/Ctrl+G` — generate active pipe; `⌘/Ctrl+Shift+G` — generate session.
- `⌘/Ctrl+N` — new session; `⌘/Ctrl+D` — duplicate; `Del` — удалить
  активный pipe/keyframe.
- `←/→` — frame step в top panel; `Space` — play/pause.
- `⌘/Ctrl+K` — command palette (нереализовано, 6.4); `?` — шпаргалка
  hotkeys.
Доставка: полная карта + где каждый hotkey виден в UI (tooltip, меню,
шпаргалка).

### 4.5 Доступность
- `focus-visible` ring на всех фокусируемых; модалы: focus trap +
  возврат фокуса; контраст WCAG AA в каждой теме; hit area ≥ 24px;
- `aria-*` частично есть (role=dialog, aria-modal) — добить для меню,
  тостов, progress.

### 4.6 Глобальный фидбек
- **Тосты** (`flashToast`): success/info/warn/error, 3–5s, стек ≤ 3,
  dismiss; у error-тостов действие «copy log».
- **Ошибки**: два уровня — локальная (inline в элементе) и глобальная
  (`ErrorHandler`: баннер с «copy log», redacted — `redactLog` есть).
- **Прогресс**: детерминированные стейджи (keyframes → refs → video →
  compose), % / ETA где известно.
- **Empty state**: у каждой панели свой (projects, session, pipes,
  keyframes, refs, settings, progress) — с primary action.

## 5. Декомпозиция по экранам

Формат каждой зоны: **Статус → Проблемы → Задачи → Варианты действий →
Критерии приёмки**.

### 5.1 Welcome / Onboarding (`WelcomeAccounts`, `WelcomeDeleteModal`)
**Статус.** Выбор аккаунта/профиля; welcome со film-stripe band; модал
удаления профиля.
**Проблемы.** Путь «первый запуск» не спроектирован: новый пользователь
видит пустой state без подсказки; удаление профиля с сессиями не
показывает последствий; welcome визуально оторван от workspace.
**Задачи.**
- Онбординг нового пользователя: профиль → первый проект → первый
  pipe → первая генерация (guided empty state, 3 шага, живые примеры);
- Переключение профилей: карточка, маркер «default», переключение в
  приложении (не только на welcome);
- Удаление профиля с данными: two-step, список содержимого (кол-во
  сессий, ~размер), необратимость.
**Варианты действий.** Профилей: 0 / 1 / N; профиль пустой / с
сессиями; удаление с данными / без.
**Приёмка.** Новый пользователь доходит до «создать сессию» без
задавания вопроса; онбординг пропускается; можно вернуть онбординг.

### 5.2 Workspace Shell (`Workspace.svelte`)
**Статус.** Лево (projects), top panel (превью + carousel + ruler +
session video), центр (composer), право (tools), футер. Монолит.
**Проблемы (открытые репорты).**
- Height top panel меняется при появлении превью с другим AR →
  layout shift;
- «включаю сессию fashion и опять вся верстка улетела» — нестабильность
  при смене сессий;
- На 1280px правая панель теснит composer; нет collapse панелей.
**Задачи.**
- Геометрия top panel: фиксированная высота, content (превью, carousel,
  ruler, session-video toggle) — exact slots; AR-fitting (contain);
- Плотность панелей: дефолтные раскрытия на 1280/1440/1920 + collapse;
- Смена сессии: переход «старое превью → новое» без layout jump
  (crossfade ≤ 200ms, геометрия фикс).
**Варианты действий.** Сессия без pipes / с media / со сгенерированным
видео / generating; 3 брейкпоинта; resize окна.
**Приёмка.** Layout shift при смене сессии ≈ 0; без overflow на 3
брейкпоинтах.

### 5.3 Projects Panel (`ProjectsPanel`)
**Статус.** Дерево проектов/сессий; действия: create, rename (inline),
copy (stub ⧉), delete, open folder.
**Проблемы (открытые репорты).**
- Inline rename перехватывает указатель: клик по сессии чаще входит в
  edit имени, чем переключает сессию («clicking session is not well
  performed — the edit name section usually intercepts pointer»);
- Copy session — сломанный stub (пустой composer, «Untitled»,
  воскресает после рестарта) — сейчас скрыт, но концепция живёт;
- Нет маркеров состояния сессии (in-flight / has-video / stale);
- Нет поиска, bulk, drag reorder.
**Задачи.**
- Ряд дерева: зона клика (выбор) отделена от rename (pencil /
  double-click); состояния: active, in-progress, has-result, stale;
- «Copy session» как полноценный feature (6.1) — меню-акция с
  предпросмотром «что скопируется»;
- Пустой проект: «нет сессий — создать» + CTA;
- Удаление: two-step (click → «точно?» state) или модал с
  содержимым; удаление проекта с сессиями — отдельный сценарий.
**Варианты действий.** Контекстное меню vs кнопки на ряду; сессий: 1/
10/100 (virtualize); drag reorder (6.5); multi-select (6.5);
double-click vs single-click для rename.
**Приёмка.** «Клик = сменить сессию» и «ренейм» — два разных
взаимодействия; у каждого состояния ряда своё оформление.

### 5.4 Top Panel / Превью-зона (`.preview-area`, `FrameCarousel`,
`FrameRuler`, `Frame`)
**Статус.** Превью фрейма + carousel sweep (auto-select owning pipe,
local ruler pin per pipe) + маленький ruler overlay + mirroring
composed session video.
**Проблемы.** Геометрическая нестабильность (P0, см. 5.2); sweep по
carousel и mapping «чей фрейм я смотрю» неочевиден в resting state;
session video и pipe video конкурируют за один слот без явного
переключателя.
**Задачи.**
- Фиксированная панель: slots (превью, carousel strip, ruler, meta)
  с exact размерами; AR-fitting;
- Явный источник превью: переключатель «pipe N» / «session video» +
  владелец; действия «open in preview» в обе стороны;
- Carousel: hover = стоп фрейма, drag = sweep; local ruler pin по
  pipe'ам — сохранить механику, сделать читабельнее; состояния: без
  media / generating / ready / error (карточка с человеческой причиной,
  retry);
- Play controls: play/pause (Space), frame step (←/→), loop.
**Варианты действий.** AR 16:9 / 9:16 / 1:1 / mixed; с аудио / без;
session video нет / есть (несколько версий, 6.2); video generating
(превью недоступно); provider error (400/503) с причиной.
**Приёмка.** 0 layout shift при смене превью; все состояния
спроектированы, включая error + retry.

### 5.5 Composer (`ComposerPanel`, `PipeHeader`, `KeyframesRow`,
`SubjectRefsRow`, `TimelineSection`)
**Статус.** Список pipes; заголовок pipe (выбор, rename); слоты
keyframes (url / img2img / txt2img + source); слоты subject refs;
timeline pipe (фреймы, drag, ruler); tags + prompt.
**Проблемы.**
- Состояния слота keyframe (пустой / Settling / ready / битая ссылка)
  оформлены несистемно;
- Media mode (keyframes vs reference) невиден как эффект: модель может
  тихо «перекатиться» в другой режим — индикатор эффекта (0.7.6)
  нужен, но без дизайн-языка (почему + что сейчас);
- Drag слотов: без affordance, без фидбека при дропе;
- Пустой pipe: нет «что заполнить дальше»;
- Timeline на 1280px: ruler + фреймы тяжело читаются.
**Задачи.**
- Слот: тип (иконка + короткий лейбл), состояние source (empty /
  Settling / ready / broken), add / remove, drag между слотами и
  строками (keyframes ↔ refs), hover-preview картинки;
- Пустой pipe: «next action» CTA — чего не хватает для генерации
  (prompt? keyframe? ref?), одна кнопка;
- Индикатор эффективного media mode на PipeHeader + tooltip «почему»
  (лимиты модели, caps, locked spec);
- Читабельность timeline: zoom (колесо), минимальный tick, лейблы;
  drag: ghost + snap + подсветка зоны вставки.
**Варианты действий.** keyframe-типы txt2img / img2img / url;
sharedArray-модели vs отдельные; locked spec (paid, read-only);
caps (2 keyframes / 5 refs / 3 audios) — лишние слоты disabled c
причиной; drag 1 / N слотов (6.5).
**Приёмка.** «Что дальше для генерации» считывается новым пользователем
за ≤ 2 сек; у каждого precheck-конфликта есть своё визуальное место.

### 5.5.1 Добавление keyframe / subject reference (полная декомпозиция)
**Статус.** Добавление: кнопка «add» в строке + `AddTrackMenu`; новый
слот — пустой «заполни source», дефолтный тип url. Позиции нет, caps
не показаны, дублировать/конвертировать нельзя, клавиатуры нет.
**Задачи (разложить полностью).**
- **Точки входа (покрыть все, варианты):**
  - кнопка «Добавить» в строке (основная, default);
  - контекстное меню строки/слота: «add keyframe», «добавить на
    позицию N», «дублировать слот», «удалить»;
  - `AddTrackMenu` — для нового pipe (добавление pipe = тот же
    паттерн, не потерять);
  - double-click по пустому месту строки — решить (вариант);
  - клавиатура: `K` — keyframe, `R` — subject ref (проектируется, в
    карту 4.4 вписать);
  - CTA из empty state pipe (задача 5.5).
- **Тип и источник при добавлении — три варианта chooser (решение,
  см. раздел 7):**
  - A: пустой слот дефолтного типа (url), заполнить позже;
  - B: мини-chooser за 1 шаг: тип (url / img2img / txt2img) +
    источник (file / URL / из генерации / из буфера обмена);
  - C: источник-специфичные пункты меню: «add keyframe from file / URL
    / generated» — имя действия говорит само за себя.
  Решение: дефолтный вариант + поведение «из генерации» (линковка на
  результат image-gen) + вариант «из буфера» (скачать/сохранить картинку).
- **Позиция:** keyframes упорядочены — добавить в конец / «вставить
  перед слотом N» (контекстное меню); subject refs — неупорядоченные;
  drag reorder + позиция вставки (6.5, P2).
- **Caps (каталог: 2 keyframes / 5 refs / 3 audios, per model):**
  кнопка «add» disabled с причиной в tooltip; счётчик «использовано
  слотов» (1/2) у кнопки; при cap — действие «заменить слот»
  (вариант: заменить / добавить с вытеснением); sharedArray-модели —
  общий счётчик (keyframes + refs вместе), показывать.
- **Состояние сразу после добавления (критично для UX):**
  новый слот подсвечен + фокус на вводе source + CTA «заполни
  источник»; amber-состояние «пустой» в prechecks (5.5); авто-scroll
  к новому слоту.
- **Удаление / обмен / undo:** delete на слот (inline confirm vs
  модал — вариант), обмен типов на месте с миграцией данных (source
  сохранить, где совместим), undo/redo на add/delete (6.6).
- **Batch:** «добавить N слотов сразу» (ввод числа), bulk-копия
  слотов между pipe'ами (P2).
**Вариации действий (матрица для кита, 4.2).**
Тип (3) × источник (5: file / URL / generated / clipboard / пусто) ×
позиция (конец / позиция N / drag) × cap (до / на) × модель
(sharedArray / отдельные) — дизайнер покрывает матрицу в states kit.
**Приёмка.** «Добавить keyframe с file» ≤ 2 действий; при cap —
чёткая причина + счётчик «использовано»; новый слот сразу в
состоянии «заполни»; все точки входа с hotkey в шпаргалке (4.4);
аналогичная декомпозиция — на добавление pipe и tags (не пропустить).

### 5.6 Tools Panel (`ToolsPanel`)
**Статус.** Кнопки: Generate (сессия), Compose session video, Open
preview, focus Generate (второй блок), модал new session.
**Проблемы.** Две кнопки генерации (сессия vs focused pipe) — не ясно,
какая активная; «focus mode» не объяснён; compose-кнопка не показывает
статус последнего compose.
**Задачи.**
- Реструктурировать: primary = «Генерация» (выбор pipe + кнопка),
  secondary = «Session video» (compose + последний результат + статус,
  archive — 6.2), tertiary = «New session»;
- Последний compose: время, длительность, размер файла, действия
  «open» / «archive»;
- Focus mode: язык (сворачивание панелей, индикатор на краю окна) +
  как выйти.
**Варианты действий.** Pipes нет; pipe в прогрессе (повторный старт
блокируется — ясное состояние); последний compose есть / нет; focus
mode вкл / выкл.
**Приёмка.** «Генерация» всегда имеет один видимый активный target.

### 5.7 Генерационные модалы

#### 5.7.1 `GenerateModal` (один pipe)
**Статус.** Seed, quality/creativity, prompt-превью (read-only +
copy), media mode, выбор image/video модели.
**Проблемы.** Нет сводки «что уйдёт» (размер payload, список media);
seed: fixed vs random неочевиден; нет «dry run» (валидация без старта).
**Задачи.**
- Блок-сводка «что уйдёт»: prompt, список media с типами, примерная
  длительность/стоимость для free-моделей;
- Seed: «random» / «fixed N» (иконка кубика), фикс при off «always
  new seed»;
- Кнопка «Check» — prechecks без старта (список конфликтов, fix-CTA
  на каждый).
**Варианты действий.** Пустой prompt; media с битыми ссылками
(conflits inline, красным); paid-модель (read-only блок); «Check»
прошёл / упал.

#### 5.7.2 `SessionGenerateModal` (вся сессия)
**Статус.** Two-pane (список pipes + run controls), policy continue/
stop, conflict list.
**Проблемы.** Конфликты на «языке кодов» (txt2img-no-prompt и т.п.),
не читаются пользователем; policy «continue» с конфликтами — не
виден риск (какие pipes реально полетят, какие нет).
**Задачи.**
- Конфликты человеческим языком + CTA «починить» (например, «у
  keyframe 2 нет картинки — добавить источник»);
- Preview запуска: N полетят / M заблокированы (policy continue);
- Оценка длительности батча (по секундам моделей).
**Варианты действий.** Конфликтов нет; 1–5 конфликтов; все
заблокированы; запуск → переход в progress; отмена в полёте.

#### 5.7.3 Прогресс: `GenerationProgressModal` +
`CompactPipesProgress` + D10 pill
**Статус.** Модал по pipe'ам со стейджами; compact view; minimize в
pill; close guard.
**Проблемы.** 503 queue-full: «ждём» без прогресса (репорт «мы тупо
сидим ждём»); minimize/restore теряет контекст; нет ETA по pipe; fail-
fast vs continue не виден в прогрессе.
**Задачи.**
- Состояния pipe'а: queued (spinner + «в очереди провайдера, ~N c»
  где известно), generating (стейдж + %), done (thumbnail), failed
  (человеческая причина + retry по pipe);
- 503: прогресс «пробуем очередь каждые ~15 c» (заменит 2-мин
  таймаут) — отдельный визуальный state, не «завис»;
- Minimize в pill: pill c прогрессом N/M, expand/collapse; в
  минимизированном окне — pill с действиями (D10);
- Group overview: «X из Y pipes» + стрип по pipe'ам; при fail —
  видно, какие следующие отменены (policy).
**Варианты действий.** 1 pipe / все; успех / partial fail / total;
503; окно минимизировано; закрыто приложение (guard).

#### 5.7.4 Остальные модалы (`KeyframeModal`, `SubjectRefModal`,
`SegmentModal`, `PipeLengthModal`, `GlobalPromptModal`,
`TagPromptModal`, `AddTrackMenu`, `TagSelectorMenu`)
**Задачи.**
- Единая анатомия модалов (group progress уже переведён на shared
  anatomy — распространить на все);
- `KeyframeModal` / `SubjectRefModal`: превью «что уйдёт» (тип
  source: file / URL / generated);
- `PipeLengthModal` / `SegmentModal`: длина с грейдами 8n+1 / fps-grid
  (зависит от модели — данные из каталога), inline-подсказка
  ближайшего валидного;
- `TagSelectorMenu`: поиск по тегам внутри модала.
**Варианты действий.** Source: file / URL / generated; длина вне
caps модели (подсказка + ближайшая валидная); тег-поиск пусто / есть.

### 5.8 Settings (`SettingsModal`, `ProviderCard`, `ProviderStatus`,
`SettingsDefaults`, `ToolsSettings`)
**Статус.** Provider card (base URL + API key), status chip
(configured / key needed), пресеты, каталог моделей c media limits,
ffmpeg (bundled / user / system / not found), дефолты.
**Проблемы.** Нет действия «проверить соединение» — битый key
выявляется в момент генерации; ffmpeg «not found» без онбординга на
установку; paid-модели (read-only) не помечены до раскрытия карточки;
self-heal настроек не виден пользователю.
**Задачи.**
- Provider card: кнопка «Check» (ping c key, chip: ok / 401 / no
  network); key-поле — маска + вставка из буфера;
- Каталог: бейдж «free» / «paid» на модели; media caps (2/5/3)
  видны в строке модели без раскрытия;
- ffmpeg: 3 состояния c CTA (bundled = «в приложении», user path =
  «проверить», not found = «куда скачать» + открыть ссылку);
- Self-heal уведомление: «модель X сменилась → Y» (один раз,
  dismissable).
**Варианты действий.** Ключа нет / валидный / битый; пресетов 0 / 1 /
N; все состояния провайдера.
**Приёмка.** «Могу ли я генерировать прямо сейчас?» ответимо из
settings за 5 сек.

### 5.9 Глобальный слой: тосты, `ErrorHandler`, `Footer`, empty states
**Задачи.**
- Тосты: единый стиль по уровням, позиция (нижний правый), стек;
  у error-тостов — «copy log»;
- `ErrorHandler`: когда баннер, когда диалог; «copy log» c
  redacted-данными (`redactLog` уже есть);
- Футер: версия, «Horizones Machines», ссылка на API key (зафиксировать
  консистентность);
- Матрица empty states по всем панелям (см. 4.6) — один язык,
  primary action.

## 6. Нереализованный функционал (дизайн опережает код)

[Р] = требование, уже принятое пользователем (обязательно);
[П] = предложение (кандидат на roadmap).

### 6.1 Copy Session v2 — полный tooling [Р]
Сейчас: сломанный stub за флагом; копия пишет в `AppData\\...\\media`
(не в каталог данных), UUID'ы не новые, артефакты дублируются, композер
пустой, имя → «Untitled».
**Дизайн:**
- Действие «Copy session…» из меню проекта (и из ToolsPanel) → диалог:
  - имя (дефолт «Copy of X»);
  - что копировать: prompts/tags ✓, keyframes — «структура без картинок»
    (дефолт), refs — то же, pipes — структура ✓;
  - что НЕ копировать: видео, артефакты, результаты генерации;
- Result: новая сессия, полностью новые UUID'ы, media-слоты в состоянии
  «нужно заполнить», артефактов нет;
- Прогресс: «Copying… N/M» + отмена;
- Ошибки: нет места на диске, коллизия имён (авто-«Copy of X (2)»);
- «Copy as template» — в отдельный слот шаблонов (связка c 6.10).

### 6.2 Архив session video [Р]
Сейчас: новый compose перезаписывает `session-video/session.mp4`, истории
нет.
**Дизайн:**
- При перезаписи: старый видео → `archive/` c таймстампом;
- UI «History» (в ToolsPanel или модал): записи (дата, длительность,
  размер, снапшот pipes), действия «восстановить как текущий», «open»,
  «удалить»; empty state «нет версий»;
- Лимит версий / размера + политика eviction + уведомление;
- Индикатор на кнопке compose: «текущая версия #K».

### 6.3 Профильный слой данных [Р]
Решено пользователем: контейнер `...\\VisionMachine<\\profile>\\Projects\\...`,
топ-слой = профиль (заменяет `AppData\\...\\media` как место копий).
**Дизайн:** профильная карточка в `ProfilePanel`: путь данных (read-only
+ «открыть папку»), размер по профилям, маркер default-профиля,
уведомление о миграции старых данных (один раз).

### 6.4 Command palette + шпаргалка hotkeys [П]
`⌘/Ctrl+K`: действия (new/copy session, compose, open folder, focus
mode, смена профиля/темы, generate pipe N). `?` / пункт меню
«Shortcuts»: шпаргалка по зонам, «copy as markdown».

### 6.5 Multi-select pipes + bulk-операции [П]
Ctrl/Shift-клик по pipe'ам; bulk: удалить, вынести fps/длительность
(c caps моделей), «generate selected» (подмножество сессии).

### 6.6 Undo/Redo редактора [П]
Локальная история (prompt, keyframes, refs, length): per-pipe, 20
шагов, `⌘/Ctrl+Z`, индикатор «не сохранено» на pipe.

### 6.7 A/B сравнение compose [П]
В «History» (6.2): side-by-side двух версий c синхронным playhead'ом
(требует роста top panel — решение отложить на P2, не ломает P0-фикс).

### 6.8 Экспорт [П]
Session video: mp4 (есть), + GIF (с лимитом длительности), «copy
frame» (PNG в буфер), «экспорт диапазона фреймов». Pipe: одиночный
клип + JSON-sidecar (prompt, seed, settings).

### 6.9 Shareable log / diagnostics [П]
UI поверх `redactLog`: модал «Diagnostics» — лог последних N событий,
«copy redacted log» для саппорта; статус watchdog/heartbeat строкой.

### 6.10 Пример-сессия / шаблоны [П]
Встроенная «Example session» (2 pipe, заполненные media-placeholder'ами)
— создать при первом запуске или из меню «copy session» (слот
шаблонов).

### 6.11 Поиск [П]
Глобальный по сессиям/pipes: по имени, тегам, тексту prompt; панель
результатов c переходом к pipe.

### 6.12 Темы: консистентность [П]
Аудит схем (текстура sprockets, направление теней, контраст) по всем
компонентам; переключатель темы; state «тема грузится».

## 7. Ключевые решения — варианты (выбрать, аргументировав)

| Решение | Вариант A | Вариант B | Вариант C |
|---|---|---|---|
| Прогресс генерации | Модал (текущий) | Компактная панель справа | Только pill + модал по требованию |
| Конфликты (SessionGenerate) | Блок «Stop» / «Continue» | «Пропустить и продолжить» + список | Без conflicts: генерим только валидные, остальное — список |
| Keyframe-слот | Карточка c превью (текущий) | Компактная строка | Карточка c раскрыванием |
| Добавление keyframe / subject ref | Пустой слот дефолтного типа (A) | Мини-chooser тип+источник (B) | Источник-специфичные действия (C) |
| Rename сессии | Inline по double-click / pencil | Модал | Inline + явная зона (анти-перехват, 5.3) |
| Копирование сессии | Полная (текущий stub) | Только структура (6.1, дефолт) | Шаблон (6.10) |
| Top panel | Фиксированная высота (P0) | Авто c гистерезисом | Пользовательская (drag resize) |
| Focus mode | Сворачивание панелей | Затемнение overlay | «Сцена»: всё скрыто кроме превью + прогресса |
| Ошибка pipe | Inline-красный слот | Тост | Оба: inline + опциональный тост |
| 503 в очереди | Отдельный state c прогрессом «~15 c» (5.7.3) | Ждём с spinner | Прогресс-бар с неопределённой длиной |

Для каждого — мокапы 2–3 выигрышных вариантов c плюсами/минусами,
выбор на ревью с командой.

## 8. Приоритизация

**P0 (блокеры / стабильность — ближайший спринт)**
- Фиксированный top panel + zero reflow при смене сессий (5.2/5.4);
- Анти-перехват rename в дереве сессий (5.3);
- Единая матрица состояний pipe/keyframe/ref (4.2, 5.5);
- Добавление keyframe / subject ref (5.5.1): точки входа, caps, «заполни»-состояние;
- Progress modal: queued/503/fail-fast состояния + pill (5.7.3);
- Empty states по всем панелям (4.6).

**P1 (ближайшие 2 спринта)**
- Copy Session v2 (6.1) + Архив (6.2) + профильный слой (6.3) — [Р];
- Конфликты человеческим языком + preview запуска (5.7.2);
- Settings: «Check», paid-бейджи, ffmpeg-онбординг (5.8);
- Унификация иконок/лейблов (4.3).

**P2 (roadmap)**
- Command palette (6.4), multi-select (6.5), undo/redo (6.6), A/B
(6.7), экспорт (6.8), diagnostics (6.9), примеры/шаблоны (6.10),
поиск (6.11), темы (6.12).

## 9. Deliverables и приёмка

1. **Tokens + иконный сет** — Figma, маппинг на все темы.
2. **States kit** — матрица 4.2: button, input, row, card, modal,
   pill, ruler.
3. **High-fi экраны**: welcome+onboarding, workspace (1280/1440/1920,
   empty/full/in-progress), progress (все состояния 5.7.3), settings,
   дерево проектов (все состояния рядов).
4. **Интерактивные прототипы**: смена сессии без reflow, drag
   keyframe, minimize/restore прогресса, Copy Session v2 (6.1).
5. **Спека для фронта**: переходы (ms), состояния на компонент,
   тексты (plain language, см. `docs/CHANGELOG_STYLE.md`), hotkeys.
6. **Чек-лист приёмки по зонам** (раздел 5): «состояние
cпроектировано + прототип + спека» — только потом старт разработки.

## 10. Верификация и процесс с разработкой

- Макеты проверяются в каждой теме (sprockets/тени/контраст) —
  есть пайплайн pixel-скриншотов (Playwright + decode).
- Zero-reflow: layout shift = 0 при смене сессии/превью (метрика на
  прототипе).
- 60fps: без layout-affecting анимаций в hot-путях (drag, sweep).
- Тексты UI — plain language (стандарт changelog-стиля), без жаргона
  (wire shape, prechecks, backoff…).
- Названия сущностей — консистентно: pipe / keyframe / subject ref /
  session video.

## 11. Риски

- `Workspace.svelte` — монолит (2500+ строк): правки layout могут
  потребовать переупаковки (риск разработки; в специке учитывать
  границы компонентов).
- Fикс top panel (P0) vs A/B-сравнение (6.7, P2): side-by-side
  потребует роста панели — решение отложено до P2.
- Media caps (2/5/3) и лиматы зависят от модели (каталог) — дизайн
  data-driven, не хардкод.
- 16 LSP-ошибок в `tests/unit/mediaMode.test.ts` (fixture-типы) —
  не дизайн-риск, но чинить вместе с rework media mode.
