# Changelog

The one-command publish pipeline reads the newest `## [<version>]` section below.
Every `- [Tag] text` bullet becomes one `changes` entry in `js/release.js`.
Keep the bullets on a single line. When a section for the version being published
does not exist, the pipeline keeps the existing `changes` array unchanged.

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
