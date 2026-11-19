// Single source of truth for the Downloads page.
// This build is the local full-access Wicked ImGui Maker portable package.
export const RELEASE = {
  // false until the final portable ZIP is attached; the page shows setup instructions while false.
  attached: true,
  version: '2.7.0',
  date: '2026-11-19',
  bytes: 168546946,
  size: '160.7 MB',
  sha256: 'bb22d1bd9408997d84ee8681098e21bd21bff64a94f6ad06efb4f3836d38cf74',
  sha512: 'nMXoKTPKuvpK3sBOXlH0je3wIe/4JrnjPuqy3JitQFLLmpOoaC8mafcBp4Pb1Ilzq7BUXIbrj1ZlNxFRLqNGnw==',
  channel: 'stable',
  feedUrl: 'downloads/latest.json',
  electronFeedUrl: 'downloads/latest.yml',
  notes: 'Added 6 new source-derived UI design systems (exact Eon.WTF, purple Fortnite External, Hackermarket FN External, orange loader template, HAT UI kit, LazyUI combat dashboard) with 12 editable premades, 32 style presets, a reusable 286-name control lexicon that lets the offline AI insert any sampled button/slider/combo by name, and stricter exact-match AI patching so generic widget requests still work. All local/offline; static analysis only.',
  // File name inside the downloads/ folder (relative to this site's root).
  file: 'WickedImgui-Portable-2.7.0.zip',
  kind: 'Portable ZIP — extract and run Wicked Imgui Maker.exe',
  changes: [
    ['Vision', 'Paste C++/C#/Rust/JS/JSON menu source and get a fully editable project mockup. Controls, tabs, colours and fonts are recognised from static text only — pasted code is never executed.'],
    ['Templates', 'Added 4 editable premade templates rebuilt from the attached menu projects: Hackermarket, Fragment, Nexus UI and an approximate Eon-style layout. Archive sources were analysed statically, never run.'],
    ['Learn', 'Style learning from existing projects plus one-click smart prebuild generation that carries your widgets, colours and fonts into a fresh project.'],
    ['Library', 'Added a local, offline community library: publish templates, search/filter by tag, and share through portable import/export packs. No account, sign-in or server is contacted.'],
    ['Loaders', 'Added generic loader/API compatibility profiles with source-based hint detection and a checklist. Nothing is tied to a specific game or engine.'],
    ['Assets', 'Import images as embedded data-URL assets that travel inside the project and export into C++/C#/Rust byte arrays; export/import reusable asset packs.'],
    ['Widgets', 'Expanded the font list (Inter, Outfit, JetBrains Mono and more) with text styles, plus webhook, Discord and open-URL actions in the preview and generated code.'],
    ['Editor', 'New v2.4 Tools tab in the left panel unifies menu understanding, templates, prebuilds, the library, loader profiles and image assets.'],
    ['Quality', 'Regression suite expanded to 496 checks covering every new module and integration; static validation, updater tests and 67 server tests all pass.'],
  ],
  // Older releases, newest first. Each needs version, date, size, sha256, url, notes.
  older: [],
};