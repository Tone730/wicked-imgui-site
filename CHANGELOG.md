# Changelog

The one-command publish pipeline reads the newest `## [<version>]` section below.
Every `- [Tag] text` bullet becomes one `changes` entry in `js/release.js`.
Keep the bullets on a single line. When a section for the version being published
does not exist, the pipeline keeps the existing `changes` array unchanged.

## [2.9.2] - 2026-11-20

- [Quality] Folded all 118 kit-board visual baselines into the main regression gate (now 745 checks) and added a single `npm test` command; the PNG harness stays standalone for `--update` baseline regeneration.
- [AI] Documented the offline AI intent contract in `AI_CONTRACT.md` and added `test-ai-contract.js` (34 structural checks) so an edit that drops a batch intent, offline provider or kit hook fails the gate before shipping. Minified artifacts were not rewritten.
- [Updates] The self-hosted update feed is now Ed25519-signed in a new `signatureV2` field. Pinned builds fail closed on a missing or tampered signature; already-shipped builds keep updating. Private key stays outside both repos; setup and rotation are documented in `tools/UPDATE_SIGNING.md`.
- [Verification] Added `verify-release.mjs` as the canonical one-command release check; the gate now also validates the feed signature (14 checks, plus remote asset digest).
- [Doctor] Warns when a widget extends outside its parent panel, with a scrollable-parent exemption; shipped kits use no parent links so there are no false positives.
- [Quality] Added an optional real-browser Playwright screenshot layer that skips cleanly when no browser is installed, so Chromium is never a build dependency. Static validation, updater tests, 67 server tests and 6 export compile checks all pass.

## [2.9.1] - 2026-11-19

- [Licences] Bundled verbatim upstream MIT licence texts for all 13 permissively licensed kits in `licenses/`, generated `THIRD-PARTY-NOTICES.txt`, and added a per-kit Full licence text viewer in the Credits panel. The 9 archive samples with no upstream licence are explicitly labelled as notices, with no licence asserted on their behalf.
- [Packaging] The portable ZIP now ships `THIRD-PARTY-NOTICES.txt` and the `licenses\` folder alongside `README-FIRST.txt`.
- [Quality] Added `compile-exports.mjs`, which compile-checks generated `theme.h`/`credits.h` with g++, `Theme.cs`/`Credits.cs` with .NET 8, and structurally validates Rust output when rustc is absent; unavailable toolchains report SKIP. Added `qa.mjs` as a single six-gate offline QA command. Fixed C++ export to always emit `kavro_assets.h`, which `project.cpp` includes.
- [Verification] Added `tools/verify_release.py` to the publish pipeline: it checks feed/ZIP checksums and sizes, ZIP layout and licence notices, and confirms the ASAR header hash matches the embedded PE `Integrity`/`ElectronAsar` record; `--remote` also compares the GitHub release asset digest.
- [Doctor] Expanded layout checks for partially clipped widgets, negative coordinates, widgets under 8px, non-finite geometry and empty non-start pages.
- [Updates] The updater now rejects plaintext HTTP update feeds and asset URLs except on localhost; HTTPS and the honest offline no-feed path are unchanged.
- [Quality] 624 regression checks, 90-file static validation, updater tests, 67 server tests, export compile checks and 118 visual boards all pass.

## [2.9.0] - 2026-11-19

- [Credits] Added a Credits & attribution panel listing every kit's author, licence, repository and attribution notes, with a copyable plain-text credits block. Attribution metadata now covers all 22 kits.
- [Themes] Split hello_imgui into 17 source-faithful theme boards (plus selector and demo, 19 screens) using exact ImGui RGB/HSV palettes and source-order transforms — no invented colours. UntitledImGuiTheme boards use key names only because the upstream ships no palette values.
- [Kits] Added 5 more permissively-licensed MIT kits as fully editable projects with matching presets and premades: ImThemes browser, Cupertino UI, imgui_styles (Rust), CPStyling.lua and imgui-modern-kit (30 presets→45, 20→25 premades, 22 kits total). Exact source-derived palettes, strings and licence/author data.
- [Export] Generated theme and credits files in every language: C++ `theme.h`/`credits.h`, C# `Theme.cs`/`Credits.cs` and Rust `src/theme.rs`/`src/credits.rs`. Theme constants come from the project palette; credits list all 22 attributions; ui-only export whitelists include the new files.
- [AI] Offline Wicked Local gained project-wide batch intents: rename text across all pages, restyle every page with a named theme, and convert widget types across the whole project. Prompt guidance and Doctor checks for broken kit/preset references added; still fully offline with no sign-in or backend.
- [Quality] Added a dependency-free PNG visual-regression harness covering all 118 kit boards with byte-exact baselines. Regression suite expanded to 612 checks; static validation (90 files), updater tests and 67 server tests all pass. Embedded PE `Integrity`/`ElectronAsar` repatched after ASAR rebuild.

## [2.8.0] - 2026-11-19

- [Kits] Added all 8 public online design kits as fully editable UI kits: ImJson theme demo, VISION overlay menu, dear-imgui-styles collection, ImguiCandy themes, UntitledImGuiTheme editor, Clean ImGui menu (Evicted), Lumin Free ImGui menu and the hello_imgui 17-theme library. Every kit is a normal editable project — open it, change any control or colour, export it.
- [Presets] Added 8 matching style presets and 8 premade templates (20 premades, 40 presets total). Exact tab/control strings, slider ranges, combo options, palettes and font roles are transcribed from each upstream source.
- [AI] Expanded the offline control lexicon and kit suggestions for all 8 new kits; quoted or unquoted exact sampled names (e.g. "Slider Intager", "Aimbot Keybind", "License key required") insert the matching real control. Generic widget requests still reach the base local AI. No sign-in, key or network backend.
- [Offline] Stayed fully local: offline account stays pro/full-access, built-in `local` AI remains the default, community sharing stays offline via import/export packs, and target/loader detection stays generic. All upstream sources were analysed statically — no extracted code or binaries were executed.
- [Quality] Regression suite expanded to 580 checks; static validation (88 files), updater tests and 67 server tests all pass. Embedded PE `Integrity`/`ElectronAsar` resources are repatched after every ASAR rebuild.

## [2.4.0] - 2026-11-19

- [Vision] Paste C++/C#/Rust/JS/JSON menu source and get a fully editable project mockup. Controls, tabs, colours and fonts are recognised from static text only — pasted code is never executed.
- [Templates] Added 4 editable premade templates rebuilt from the attached menu projects: Hackermarket, Fragment, Nexus UI and an approximate Eon-style layout. Archive sources were analysed statically, never run.
- [Learn] Style learning from existing projects plus one-click smart prebuild generation that carries your widgets, colours and fonts into a fresh project.
- [Library] Added a local, offline community library: publish templates, search/filter by tag, and share through portable import/export packs. No account, sign-in or server is contacted.
- [Loaders] Added generic loader/API compatibility profiles with source-based hint detection and a checklist. Nothing is tied to a specific game or engine.
- [Assets] Import images as embedded data-URL assets that travel inside the project and export into C++/C#/Rust byte arrays; export/import reusable asset packs.
- [Widgets] Expanded the font list (Inter, Outfit, JetBrains Mono and more) with text styles, plus webhook, Discord and open-URL actions in the preview and generated code.
- [Editor] New v2.4 Tools tab in the left panel unifies menu understanding, templates, prebuilds, the library, loader profiles and image assets.
- [Quality] Regression suite expanded to 496 checks covering every new module and integration; static validation, updater tests and 67 server tests all pass.

## [2.3.0] - 2026-11-19

- [Menus] Added 8 reusable overlay-menu presets (Trainer, Dashboard, Sidebar, Tabbed, HUD, Settings, Combat, Minimal) that attach to any project and generate real pages/widgets plus a menu source file for C++, C# and Rust.
- [Menus] Added a Menus workspace with a custom menu editor and a local library that can be saved, re-applied, exported and imported as portable JSON.
- [Target] Added offline PE import analysis for loader projects: detects DirectX 9/11/12, OpenGL, Vulkan, Unity/Unreal/Source/Godot hints and XInput/DirectInput without running the executable.
- [Target] Added a Target tab for loader projects with manual overrides; detected settings flow into a generated `loader.config.json` so exports are pre-configured for the game.
- [Animation] Added 4 entrance animations (Pop, Bounce, Zoom, Pulse) and 6 animated backgrounds (Vortex, Sparks, Scanlines, Glitch, Tunnel, DNA).
- [Export] Generated menu code and loader config now compile against the offline C++/C#/Rust compatibility stubs; integration notes explain how to draw the menu each frame.
- [Quality] Functional regression suite expanded to 483 checks; static validation, updater tests and 52 server tests all pass.

## [2.2.1] - 2026-11-19

- [Fix] Fixed an atomic config-save race on first launch that could fail with `ENOENT` when two writes reused `config.json.tmp`.
- [Export] Fixed the exported Rust stub so `macro_rules!` is declared at module scope and compiles with current `rustc`.
- [Quality] All exported runtime stubs (C++ DX11/DX9/DX12/OpenGL3/Vulkan, C#, Rust) now compile and run cleanly with local toolchains; 455 regression checks and 52 server tests pass.

## [2.2.0] - 2026-11-18

- [Editor] Zoom presets, a PNG canvas snapshot button, toggleable rulers, and grouped widget selection with real hierarchy parenting and ungrouping.
- [Editor] Bulk lock, hide, nudge, group, and offset edits from the inspector and command palette.
- [Local AI] Offline intents now duplicate widgets, align/distribute, apply style presets, attach actions, and generate complete pages (login, settings, dashboards).
- [Export] Single-file interactive HTML mockups, portable theme JSON import/export, and project bundles with embedded assets.
- [Safety] Source export now previews line-level diffs, warns before overwrites, writes SOURCE-DIFF.txt, and backs up every replaced file.
- [Commands] Global and editor command palettes expose all new editor power tools and portability actions.
- [Quality] Functional regression suite expanded to 455 checks; static validation covers the new modules and IPC channels.

## [2.1.0] - 2026-11-18

- [Widgets] Added 8 more design widgets — icon button, divider, stat card, tag input, password, search box, sparkline and status bar — bringing the palette to 42 widgets with live previews and C++/C#/Rust export.
- [Themes] Added Midnight Gold, Retro Terminal, Dracula, Nord, Gruvbox, Catppuccin, Tokyo Night and Rose Pine — 23 selectable themes in total.
- [Effects] Added Plasma, Fireworks, Sakura and Lightning animated backgrounds — 22 effects in total.
- [Templates] Added Team Chat, Login Window and Minimal Loader project templates with matching descriptions in the New Project screen.
- [Local AI] Wicked Local now recognises every new widget, theme and effect by natural language, with expanded offline help.
- [Presets] Added dedicated style presets for all new widgets plus success, warning, danger and info toast styles.
- [Doctor] Project Doctor now flags unknown widget types, unknown themes/effects and duplicate page IDs.
- [Commands] Command palette now exposes all new themes and effects.
- [Dashboard] Verify a downloaded ZIP against its published SHA-256 right in the browser, and browse recent builds from the build-history feed.
- [Quality] Functional regression suite expanded to 439 checks covering new widgets, AI intents, templates, presets and doctor diagnostics.

## [2.0.0] - 2026-11-18

- [Full access] Starts as Wicked Local Pro with every renderer and main-process feature gate unlocked. Sign-in, redeem, and usage are fully local with zero network calls, and update checks honestly report offline mode. No login or key needed.
- [Local AI] Built-in Wicked Local provider works offline: add, edit, delete, and describe widgets, pages, themes, effects, and actions.
- [Export] Fixed legacy ImGui header lookup, asset registration, Rust alias, and C++ asset helpers.
- [Offline runtimes] C++, C#, and Rust runtime source stubs work without the encrypted runtimes.pak key. Settings now discloses that native builds need your own ImGui backend.
- [Widgets] Added badge, stat, rating, stepper, breadcrumb, chip, timeline, avatar, progressring, and toggle.
- [Themes] Added Wicked Violet, Cyber Soda, Paper, Neon Noir, Arctic Glass, Sunset Ember, and Deep Ocean.
- [Effects] Added Rings, Confetti, Hearts, and Comet backgrounds with live previews.
- [Templates] Added Setup Wizard, Loader Splash, Settings, and Branded Loader project templates.
- [Workflow] Project Doctor, settings import/export, shortcut editor, asset cleanup, custom blocks, and command-palette keyboard navigation.
- [Workspace] Clear recents, open app data, reset local settings, copy diagnostics, align/distribute, and duplicate page.
- [Limits] 12 recent projects, 150 custom widgets, 200 undo steps, 500 ms history, and 10/120 second autosave options.
- [Compatibility] All required generated identifiers and @page/@widget markers are preserved.
