// Single source of truth for the Downloads page.
// This build is the local full-access Wicked ImGui Maker portable package.
export const RELEASE = {
  // false until the final portable ZIP is attached; the page shows setup instructions while false.
  attached: true,
  version: '2.2.0',
  date: '2026-11-18',
  bytes: 168474152,
  size: '160.7 MB',
  sha256: 'f6682ef716f4a6c71c299c87992122fdc14c9e061675305ebeaa360871d6983d',
  sha512: 'xWdwBByzeUN8oCzTpK8Ae5EFIWXBbPJnesI99/A7SZG4QV2I9mEqvJqIuEdOWwT0HcNvSU88mBv5rDpQMqhdzQ==',
  channel: 'stable',
  feedUrl: 'downloads/latest.json',
  electronFeedUrl: 'downloads/latest.yml',
  notes: 'Local full-access portable build with a self-hosted update feed: updates are checksum-verified and opened for extraction. Extract the ZIP and run Wicked Imgui Maker.exe; no sign-in, license key, or installer is required.',
  // File name inside the downloads/ folder (relative to this site's root).
  file: 'WickedImgui-Portable-2.2.0.zip',
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