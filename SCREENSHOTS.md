# Screenshot capture guide

The README shows 5 concrete workflow moments — **not** a video-manual tour
of the whole app. Each image answers one question a new user has.

Capture in **JetBrains Dark** theme at **landscape layout** (1280×800+),
150% zoom, no personal data in project/session names. Crop to the relevant
UI region — no full-window shots (except #1). Keep each file **< 300 KB**
(JPG for screenshots; only use GIF for a 3–5s motion clip, and keep it
**< 3 MB**).

| # | File | Shows | Where in the app |
|---|---|---|---|
| 1 | `img/screenshot-composer.png` | The whole composer: pipes + keyframes row + timeline with segments/tags + tools panel. The "wow" shot — put it in the hero of the README. | Composer with a populated session |
| 2 | `img/composer-tags.png` | One segment with a **camera** and a **lighting** tag selected, per-zone prompt bar visible. Answers "how do I direct a shot?" | Composer timeline, tag selected |
| 3 | `img/preview-ruler.png` | Generated video playing in the top preview panel **with the frame ruler** (enable it via the ruler control), scrubbed mid-clip. Answers "how do I see what got generated?" | Top Frame panel after a generation |
| 4 | `img/generation-progress.png` | The progress modal with per-stage statuses (keyframes → video) and the cancel control. Answers "what happens while I wait?" | Generation progress modal |
| 5 | `img/projects-panel.png` | Projects/sessions sidebar with stored generations and reference files. Answers "where is my stuff kept?" | Left sidebar |

Optional (only if it stays small): `img/pipe-composition.gif` — 3 s clip
of two pipes connecting into one finished sequence. The "killer feature"
moment.

## Placement rules (GitHub rendering)

- All files live in the repo-root **`img/`** folder and are referenced from
  the README as `img/<name>.png` (relative — works on the GitHub page and
  in the checked-out repo).
- Never reference images outside the repo (no hotlinked URLs) — GitHub
  strips external images in some views, and it breaks offline.
- The README's hero image is #1; the "Screenshot guide" section lists the
  rest with captions.
