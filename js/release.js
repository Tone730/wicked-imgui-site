// Single source of truth for the Downloads page.
// This build is the local full-access Wicked ImGui Maker portable package.
export const RELEASE = {
  // false until the final portable ZIP is attached; the page shows setup instructions while false.
  attached: true,
  version: '2.4.0',
  date: '2026-11-19',
  bytes: 168518881,
  size: '160.7 MB',
  sha256: '681a1b3050e59eaf7669a340e127720103c9882b71284b25d5a1b92939712a66',
  sha512: 'zfbtA7dyNS0JutMSgoaZTRWoN1DHDxhKGp/aE0EhhRhd8We5N3kZzpxxeVoMILrgMafBiV6Qd4B7r6NIAZirZg==',
  channel: 'stable',
  feedUrl: 'downloads/latest.json',
  electronFeedUrl: 'downloads/latest.yml',
  notes: 'Offline v2.4 expansion: paste-menu understanding, 4 premade templates, style learning and smart prebuilds, an offline community library with import/export packs, generic loader profiles, embedded image assets, expanded fonts/text styles and webhook/Discord actions. Fully local - no sign-in, key or installer required.',
  // File name inside the downloads/ folder (relative to this site's root).
  file: 'WickedImgui-Portable-2.4.0.zip',
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