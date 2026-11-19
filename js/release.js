// Single source of truth for the Downloads page.
// This build is the local full-access Wicked ImGui Maker portable package.
export const RELEASE = {
  // false until the final portable ZIP is attached; the page shows setup instructions while false.
  attached: true,
  version: '2.3.0',
  date: '2026-11-19',
  bytes: 168489465,
  size: '160.7 MB',
  sha256: '2a68eef64f58666c97ded4078935ef0994faed1ed34115ba9c2a708f96993278',
  sha512: 'qgvKWGWWqz5w4r6Lm25Qb7yifqxYpaInsSFRvbUg+A2JJ0y6K7iQOq91J+Y0dY4HsIsVaH6AGPBacDKqUvbrLg==',
  channel: 'stable',
  feedUrl: 'downloads/latest.json',
  electronFeedUrl: 'downloads/latest.yml',
  notes: 'New reusable overlay menus with local library, offline PE target detection that generates loader.config.json, 4 new animations and 6 new background effects.',
  // File name inside the downloads/ folder (relative to this site's root).
  file: 'WickedImgui-Portable-2.3.0.zip',
  kind: 'Portable ZIP — extract and run Wicked Imgui Maker.exe',
  changes: [
    ['Menus', 'Added 8 reusable overlay-menu presets (Trainer, Dashboard, Sidebar, Tabbed, HUD, Settings, Combat, Minimal) that attach to any project and generate real pages/widgets plus a menu source file for C++, C# and Rust.'],
    ['Menus', 'Added a Menus workspace with a custom menu editor and a local library that can be saved, re-applied, exported and imported as portable JSON.'],
    ['Target', 'Added offline PE import analysis for loader projects: detects DirectX 9/11/12, OpenGL, Vulkan, Unity/Unreal/Source/Godot hints and XInput/DirectInput without running the executable.'],
    ['Target', 'Added a Target tab for loader projects with manual overrides; detected settings flow into a generated `loader.config.json` so exports are pre-configured for the game.'],
    ['Animation', 'Added 4 entrance animations (Pop, Bounce, Zoom, Pulse) and 6 animated backgrounds (Vortex, Sparks, Scanlines, Glitch, Tunnel, DNA).'],
    ['Export', 'Generated menu code and loader config now compile against the offline C++/C#/Rust compatibility stubs; integration notes explain how to draw the menu each frame.'],
    ['Quality', 'Functional regression suite expanded to 483 checks; static validation, updater tests and 52 server tests all pass.'],
  ],
  // Older releases, newest first. Each needs version, date, size, sha256, url, notes.
  older: [],
};