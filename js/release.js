// Single source of truth for the Downloads page.
// This build is the local full-access Wicked ImGui Maker portable package.
export const RELEASE = {
  // false until the final portable ZIP is attached; the page shows setup instructions while false.
  attached: true,
  version: '2.9.0',
  date: '2026-11-19',
  bytes: 168576000,
  size: '160.8 MB',
  sha256: 'aeb5341e2efcad74bce5181ba25fac0c4be1f55c10e374a021d968f67232e725',
  sha512: '72AlZKVsY7nUbJzZnh60lVlUiN9mZHKx7mjXNJSy0tkHOlh+MgMB79n2DLvTMNWDZSP0A3cboCxeR1LNlu2fiQ==',
  channel: 'stable',
  feedUrl: 'downloads/latest.json',
  electronFeedUrl: 'downloads/latest.yml',
  notes: 'Added all 8 public online design kits as fully editable UI projects: ImJson theme demo, VISION overlay menu, dear-imgui-styles collection, ImguiCandy themes, UntitledImGuiTheme editor, Clean ImGui (Evicted), Lumin Free ImGui menu and the hello_imgui 17-theme library. 40 style presets, 20 premades and an expanded offline control lexicon with exact tabs, controls, slider ranges, palettes and font roles transcribed from each source. Fully local/offline: no sign-in, key or backend; all upstream sources analysed statically, no extracted code or binaries executed.',
  // File name inside the downloads/ folder (relative to this site's root).
  file: 'WickedImgui-Portable-2.9.0.zip',
  kind: 'Portable ZIP — extract and run Wicked Imgui Maker.exe',
  changes: [
    ['Credits', 'Added a Credits & attribution panel listing every kit\'s author, licence, repository and attribution notes, with a copyable plain-text credits block. Attribution metadata now covers all 22 kits.'],
    ['Themes', 'Split hello_imgui into 17 source-faithful theme boards (plus selector and demo, 19 screens) using exact ImGui RGB/HSV palettes and source-order transforms — no invented colours. UntitledImGuiTheme boards use key names only because the upstream ships no palette values.'],
    ['Kits', 'Added 5 more permissively-licensed MIT kits as fully editable projects with matching presets and premades: ImThemes browser, Cupertino UI, imgui_styles (Rust), CPStyling.lua and imgui-modern-kit (30 presets→45, 20→25 premades, 22 kits total). Exact source-derived palettes, strings and licence/author data.'],
    ['Export', 'Generated theme and credits files in every language: C++ `theme.h`/`credits.h`, C# `Theme.cs`/`Credits.cs` and Rust `src/theme.rs`/`src/credits.rs`. Theme constants come from the project palette; credits list all 22 attributions; ui-only export whitelists include the new files.'],
    ['AI', 'Offline Wicked Local gained project-wide batch intents: rename text across all pages, restyle every page with a named theme, and convert widget types across the whole project. Prompt guidance and Doctor checks for broken kit/preset references added; still fully offline with no sign-in or backend.'],
    ['Quality', 'Added a dependency-free PNG visual-regression harness covering all 118 kit boards with byte-exact baselines. Regression suite expanded to 612 checks; static validation (90 files), updater tests and 67 server tests all pass. Embedded PE `Integrity`/`ElectronAsar` repatched after ASAR rebuild.'],
  ],
  // Older releases, newest first. Each needs version, date, size, sha256, url, notes.
  older: [],
};