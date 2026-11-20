// Single source of truth for the Downloads page.
// This build is the local full-access Wicked ImGui Maker portable package.
export const RELEASE = {
  // false until the final portable ZIP is attached; the page shows setup instructions while false.
  attached: true,
  version: '2.9.2',
  date: '2026-11-20',
  bytes: 168592816,
  size: '160.8 MB',
  sha256: '870d9f01b40386fba6694e0497ad168ab8892a47b7e33ebe0362f6b0d3a0e7a1',
  sha512: 'rZhc52uWlvHjD6xGipX+hn38SdS6e9H2j4Fy5+Zmt0FY42kT0umHc1YFN36h2HRngiDd/AahuepbDw1LZZXQKg==',
  channel: 'stable',
  feedUrl: 'downloads/latest.json',
  electronFeedUrl: 'downloads/latest.yml',
  notes: 'Added all 8 public online design kits as fully editable UI projects: ImJson theme demo, VISION overlay menu, dear-imgui-styles collection, ImguiCandy themes, UntitledImGuiTheme editor, Clean ImGui (Evicted), Lumin Free ImGui menu and the hello_imgui 17-theme library. 40 style presets, 20 premades and an expanded offline control lexicon with exact tabs, controls, slider ranges, palettes and font roles transcribed from each source. Fully local/offline: no sign-in, key or backend; all upstream sources analysed statically, no extracted code or binaries executed.',
  // File name inside the downloads/ folder (relative to this site's root).
  file: 'WickedImgui-Portable-2.9.2.zip',
  kind: 'Portable ZIP — extract and run Wicked Imgui Maker.exe',
  changes: [
    ['Quality', 'Folded all 118 kit-board visual baselines into the main regression gate (now 745 checks) and added a single `npm test` command; the PNG harness stays standalone for `--update` baseline regeneration.'],
    ['AI', 'Documented the offline AI intent contract in `AI_CONTRACT.md` and added `test-ai-contract.js` (34 structural checks) so an edit that drops a batch intent, offline provider or kit hook fails the gate before shipping. Minified artifacts were not rewritten.'],
    ['Updates', 'The self-hosted update feed is now Ed25519-signed in a new `signatureV2` field. Pinned builds fail closed on a missing or tampered signature; already-shipped builds keep updating. Private key stays outside both repos; setup and rotation are documented in `tools/UPDATE_SIGNING.md`.'],
    ['Verification', 'Added `verify-release.mjs` as the canonical one-command release check; the gate now also validates the feed signature (14 checks, plus remote asset digest).'],
    ['Doctor', 'Warns when a widget extends outside its parent panel, with a scrollable-parent exemption; shipped kits use no parent links so there are no false positives.'],
    ['Quality', 'Added an optional real-browser Playwright screenshot layer that skips cleanly when no browser is installed, so Chromium is never a build dependency. Static validation, updater tests, 67 server tests and 6 export compile checks all pass.'],
  ],
  // Older releases, newest first. Each needs version, date, size, sha256, url, notes.
  older: [],
};