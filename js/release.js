// Single source of truth for the Downloads page.
// This build is the local full-access Wicked ImGui Maker portable package.
export const RELEASE = {
  // false until the final portable ZIP is attached; the page shows setup instructions while false.
  attached: true,
  version: '2.9.1',
  date: '2026-11-19',
  bytes: 168592425,
  size: '160.8 MB',
  sha256: '12a39281406599c89199ab9de37deaf84b4758177b73327de15836eeefab2a9c',
  sha512: 'McwCFyhs1jKwMtcxOhfoDLbL4WFlw20+jTyegYfU/vU1dCEcLovMd5nBAcUOQpjCKhJOYZqWiN484a/S65coKg==',
  channel: 'stable',
  feedUrl: 'downloads/latest.json',
  electronFeedUrl: 'downloads/latest.yml',
  notes: 'Added all 8 public online design kits as fully editable UI projects: ImJson theme demo, VISION overlay menu, dear-imgui-styles collection, ImguiCandy themes, UntitledImGuiTheme editor, Clean ImGui (Evicted), Lumin Free ImGui menu and the hello_imgui 17-theme library. 40 style presets, 20 premades and an expanded offline control lexicon with exact tabs, controls, slider ranges, palettes and font roles transcribed from each source. Fully local/offline: no sign-in, key or backend; all upstream sources analysed statically, no extracted code or binaries executed.',
  // File name inside the downloads/ folder (relative to this site's root).
  file: 'WickedImgui-Portable-2.9.1.zip',
  kind: 'Portable ZIP — extract and run Wicked Imgui Maker.exe',
  changes: [
    ['Licences', 'Bundled verbatim upstream MIT licence texts for all 13 permissively licensed kits in `licenses/`, generated `THIRD-PARTY-NOTICES.txt`, and added a per-kit Full licence text viewer in the Credits panel. The 9 archive samples with no upstream licence are explicitly labelled as notices, with no licence asserted on their behalf.'],
    ['Packaging', 'The portable ZIP now ships `THIRD-PARTY-NOTICES.txt` and the `licenses\\` folder alongside `README-FIRST.txt`.'],
    ['Quality', 'Added `compile-exports.mjs`, which compile-checks generated `theme.h`/`credits.h` with g++, `Theme.cs`/`Credits.cs` with .NET 8, and structurally validates Rust output when rustc is absent; unavailable toolchains report SKIP. Added `qa.mjs` as a single six-gate offline QA command. Fixed C++ export to always emit `kavro_assets.h`, which `project.cpp` includes.'],
    ['Verification', 'Added `tools/verify_release.py` to the publish pipeline: it checks feed/ZIP checksums and sizes, ZIP layout and licence notices, and confirms the ASAR header hash matches the embedded PE `Integrity`/`ElectronAsar` record; `--remote` also compares the GitHub release asset digest.'],
    ['Doctor', 'Expanded layout checks for partially clipped widgets, negative coordinates, widgets under 8px, non-finite geometry and empty non-start pages.'],
    ['Updates', 'The updater now rejects plaintext HTTP update feeds and asset URLs except on localhost; HTTPS and the honest offline no-feed path are unchanged.'],
    ['Quality', '624 regression checks, 90-file static validation, updater tests, 67 server tests, export compile checks and 118 visual boards all pass.'],
  ],
  // Older releases, newest first. Each needs version, date, size, sha256, url, notes.
  older: [],
};