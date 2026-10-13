# VisionMachine — Copyright & License Notice

## Copyright

© 2026 @Horizones Machines. All rights reserved.

VisionMachine, originally developed by @Horizones Machines.

## License

This software is licensed under the **GNU General Public License v3 or
later (GPL-3.0-or-later)**, with the following additional attribution
condition (a permitted extra term under GPLv3 §7).

## Attribution Addendum (additional term, GPLv3 §14)

- The name "VisionMachine" is the project's name. Modified forks that
  are **distributed** must clearly indicate that they are a modification
  of VisionMachine and credit the original project at
  <https://github.com/hi4c0ck/visionMachine> at the point of
  first launch and in their top-level source distribution.
- Forks do NOT need to inherit this addendum unless they themselves are
  distributed as a modified VisionMachine (plain re-licenses of
  clean-room rewrites are out of scope).

The full license text and the complete addendum are in [LICENSE](LICENSE).
Where the addendum conflicts with the GPL, the GPL governs.

## Bundled Third-Party Components

VisionMachine is distributed as a self-contained desktop app. Most of its
runtime stack (Svelte, Tauri, Rust, SQLite, and their licenses — MIT/Apache
2.0/BSD) is compiled into VisionMachine's own code and is therefore covered by
VisionMachine's **GPL-3.0-or-later** license as a combined work. No separate
source offer is required for those.

The **only third-party program shipped as a standalone binary** is the
FFmpeg sidecar, which is present **only in the full (bundled-ffmpeg) build
variant** and is not linked into VisionMachine's code:

| Component | Source / provenance | License | How it ships |
|-----------|---------------------|---------|--------------|
| FFmpeg + ffprobe (sidecar) | [BtbN/FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds), pinned tag `autobuild-2026-10-11-13-04`, rev `N-127367-gb5902e69c7` | FFmpeg core **GPLv2+** / **LGPL-2.1+** (dual-licensed); this build is the GPL-enabled variant with GPL codec dependencies (x264, x265, etc.) | Shipped as a separate `ffmpeg`/`ffprobe` executable sidecar in the full-variant installer. The **tiny variant does not bundle it.** |

Because the FFmpeg sidecar is a *separate, independent* program placed on the
same medium as VisionMachine (a **GPLv3 "aggregate"** under §5), it does not
infect VisionMachine's own code, and VisionMachine's GPLv3 source obligations
do not extend to it. However, the FFmpeg binary **is itself a GPL program**,
so distributing it in object-code form carries its own source-offer duty
(documented below).

## FFmpeg Source Offer (GPL §6 compliance)

To comply with the GPL source-offer obligation for the FFmpeg + ffprobe
sidecar in the **full-variant** installer, the corresponding source is
available at no charge:

- **FFmpeg release tag / revision:** `autobuild-2026-10-11-13-04` ·
  `N-127367-gb5902e69c7` (the exact build staged by
  [scripts/build/fetch-ffmpeg.mjs](scripts/build/fetch-ffmpeg.mjs)).
- **Corresponding source** (GPL FFmpeg source, matching that revision):
  - [https://ffmpeg.org/download.html](https://ffmpeg.org/download.html)
  - or the build source tree via FFmpeg's Git:
    [https://git.ffmpeg.org/gitweb/ffmpeg.git](https://git.ffmpeg.org/gitweb/ffmpeg.git)
  - the exact asset the binary was built from:
    [https://github.com/BtbN/FFmpeg-Builds/releases](https://github.com/BtbN/FFmpeg-Builds/releases)
- **Written offer:** this URL statement is the written offer of the
  corresponding source, valid for **three years** from the date of
  distribution. Recipients may obtain the source at no cost beyond the cost
  of copying/interchange; the offer stays valid as long as spare parts or
  support are offered for the product model.
- **GPL codec dependencies** (x264, x265, and others linked into this
  GPL build) are source-available from their respective upstream projects
  listed on [FFmpeg's download page](https://ffmpeg.org/download.html).
- Full provenance, pin, and SHA-256 verification for the staged binary are
  recorded in [src-tauri/binaries/NOTICE.txt](src-tauri/binaries/NOTICE.txt).

This source-offer requirement applies **only to the full-variant installer**.
The tiny variant ships no FFmpeg binary and has no such obligation.

## What this means in practice

| You...                                   | Requirement                                                                                         |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Use the app unmodified                   | No obligation beyond reading this notice.                                                             |
| Fork for personal use, not distributed   | No obligation.                                                                                        |
| Distribute a **modified** fork          | Keep this license + addendum, keep this copyright notice, credit the original project at first launch. |
| Distribute the **unmodified** app       | Keep this license + this copyright notice.                                                            |
| Link it into your own separate program   | Governed by the GPL (viral for the combined work); see the GPL text.                                 |
