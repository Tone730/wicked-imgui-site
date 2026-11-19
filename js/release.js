// Single source of truth for the Downloads page.
// This build is the local full-access Wicked ImGui Maker portable package.
export const RELEASE = {
  // false until the final portable ZIP is attached; the page shows setup instructions while false.
  attached: true,
  version: '2.2.1',
  date: '2026-11-18',
  bytes: 168474146,
  size: '160.7 MB',
  sha256: '5e6a7e98a47bde4c3edd8f7fb9a751ab32052009a8e2bf445757170f7df091ed',
  sha512: 'W90eHxhxOTSFklRMB2jRe1qawsYfPbQjttch2kkzPwyRGDJwp4dmVJ5FhCaJNUdJdIykgPUBrzBsBgCA5DeYvQ==',
  channel: 'stable',
  feedUrl: 'downloads/latest.json',
  electronFeedUrl: 'downloads/latest.yml',
  notes: 'Patched build: fixed config save race and Rust exported-source compile error.',
  // File name inside the downloads/ folder (relative to this site's root).
  file: 'WickedImgui-Portable-2.2.1.zip',
  kind: 'Portable ZIP — extract and run Wicked Imgui Maker.exe',
  changes: [
    ['Editor', 'Zoom presets, a PNG canvas snapshot button, toggleable rulers, and grouped widget selection with real hierarchy parenting and ungrouping.'],
    ['Editor', 'Bulk lock, hide, nudge, group, and offset edits from the inspector and command palette.'],
    ['Local AI', 'Offline intents now duplicate widgets, align/distribute, apply style presets, attach actions, and generate complete pages (login, settings, dashboards).'],
    ['Export', 'Single-file interactive HTML mockups, portable theme JSON import/export, and project bundles with embedded assets.'],
    ['Safety', 'Source export now previews line-level diffs, warns before overwrites, writes SOURCE-DIFF.txt, and backs up every replaced file.'],
    ['Commands', 'Global and editor command palettes expose all new editor power tools and portability actions.'],
    ['Quality', 'Functional regression suite expanded to 455 checks; static validation covers the new modules and IPC channels.'],
  ],
  // Older releases, newest first. Each needs version, date, size, sha256, url, notes.
  older: [],
};