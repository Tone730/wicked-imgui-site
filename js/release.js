// Single source of truth for the Downloads page.
// This build is the local full-access Wicked ImGui Maker portable package.
export const RELEASE = {
  // false until the final portable ZIP is attached; the page shows setup instructions while false.
  attached: true,
  version: '2.8.0',
  date: '2026-11-19',
  bytes: 168560153,
  size: '160.8 MB',
  sha256: '42c643ab220aff47576160fb1736e9f42d3f7e3d0e9dff403c40b1d660565d15',
  sha512: 'vNXhGTyp20MEAIr1jzLou9ARFDylCYNM7QR/lNv77letWkEUwhZVy2Lrfnn2MlQ0ZwhnHaeOOnkuXBhvADoU2A==',
  channel: 'stable',
  feedUrl: 'downloads/latest.json',
  electronFeedUrl: 'downloads/latest.yml',
  notes: 'Added all 8 public online design kits as fully editable UI projects: ImJson theme demo, VISION overlay menu, dear-imgui-styles collection, ImguiCandy themes, UntitledImGuiTheme editor, Clean ImGui (Evicted), Lumin Free ImGui menu and the hello_imgui 17-theme library. 40 style presets, 20 premades and an expanded offline control lexicon with exact tabs, controls, slider ranges, palettes and font roles transcribed from each source. Fully local/offline: no sign-in, key or backend; all upstream sources analysed statically, no extracted code or binaries executed.',
  // File name inside the downloads/ folder (relative to this site's root).
  file: 'WickedImgui-Portable-2.8.0.zip',
  kind: 'Portable ZIP — extract and run Wicked Imgui Maker.exe',
  changes: [
    ['Kits', 'Added all 8 public online design kits as fully editable UI kits: ImJson theme demo, VISION overlay menu, dear-imgui-styles collection, ImguiCandy themes, UntitledImGuiTheme editor, Clean ImGui menu (Evicted), Lumin Free ImGui menu and the hello_imgui 17-theme library. Every kit is a normal editable project — open it, change any control or colour, export it.'],
    ['Presets', 'Added 8 matching style presets and 8 premade templates (20 premades, 40 presets total). Exact tab/control strings, slider ranges, combo options, palettes and font roles are transcribed from each upstream source.'],
    ['AI', 'Expanded the offline control lexicon and kit suggestions for all 8 new kits; quoted or unquoted exact sampled names (e.g. "Slider Intager", "Aimbot Keybind", "License key required") insert the matching real control. Generic widget requests still reach the base local AI. No sign-in, key or network backend.'],
    ['Offline', 'Stayed fully local: offline account stays pro/full-access, built-in `local` AI remains the default, community sharing stays offline via import/export packs, and target/loader detection stays generic. All upstream sources were analysed statically — no extracted code or binaries were executed.'],
    ['Quality', 'Regression suite expanded to 580 checks; static validation (88 files), updater tests and 67 server tests all pass. Embedded PE `Integrity`/`ElectronAsar` resources are repatched after every ASAR rebuild.'],
  ],
  // Older releases, newest first. Each needs version, date, size, sha256, url, notes.
  older: [],
};