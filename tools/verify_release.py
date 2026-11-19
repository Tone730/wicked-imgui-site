"""Deep integrity verification for a published Wicked ImGui Maker release.

Offline by default. Reads the local feed files and the packaged ZIP, checks
checksums/sizes agree everywhere, verifies the ZIP layout, then extracts the
ASAR and executable from the ZIP and confirms the ASAR header hash matches the
embedded ``Integrity``/``ElectronAsar`` PE record.

With --remote, also asks the GitHub API for the uploaded asset digest and size
and compares them with the local ZIP. No extracted code or binary is executed.

    python tools/verify_release.py                 # uses the version in latest.json
    python tools/verify_release.py --version 2.9.0
    python tools/verify_release.py --version 2.9.0 --remote
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import pathlib
import re
import struct
import subprocess
import sys
import tempfile
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
DOWNLOADS = ROOT / "downloads"
JS_DIR = ROOT / "js"
GH = pathlib.Path("C:/Program Files/GitHub CLI/gh.exe")
RELEASES_REPO = "Tone730/wicked-imgui-releases"
PREFIX = "Wicked Imgui Maker/"
REQUIRED = [
    PREFIX + "README-FIRST.txt",
    PREFIX + "Wicked ImGui Maker.exe",
    PREFIX + "resources/app.asar",
    PREFIX + "resources/updater/WickedUpdate.exe",
    PREFIX + "THIRD-PARTY-NOTICES.txt",
]
RECORD_RE = re.compile(
    rb'\[\{"file":"resources\\\\app\.asar","alg":"[^"]+","value":"'
    rb'([0-9a-f]{64})'
    rb'"\}\]'
)

results: list[tuple[str, str, str]] = []


def check(label: str, ok: bool, detail: str = "") -> bool:
    status = "PASS" if ok else "FAIL"
    results.append((label, status, detail))
    print(f"{status:<5} {label}" + (f" — {detail}" if detail else ""))
    return ok


def skip(label: str, detail: str) -> None:
    results.append((label, "SKIP", detail))
    print(f"SKIP  {label} — {detail}")


def sha256_file(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def sha512_b64_file(path: pathlib.Path) -> str:
    h = hashlib.sha512()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return base64.b64encode(h.digest()).decode("ascii")


def scalar(text: str, key: str) -> str:
    m = re.search(r"(?m)^\s*" + re.escape(key) + r":\s*([^,\n}]+)", text)
    return m.group(1).strip().strip("'\"") if m else ""


def asar_header_hash(data: bytes) -> str:
    if data[:4] != b"\x04\x00\x00\x00":
        raise ValueError("unexpected ASAR header prefix")
    size = struct.unpack("<I", data[12:16])[0]
    return hashlib.sha256(data[16 : 16 + size]).hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--version", help="release version (default: version in latest.json)")
    ap.add_argument("--remote", action="store_true", help="compare GitHub release asset digest")
    args = ap.parse_args()

    latest_path = DOWNLOADS / "latest.json"
    yml_path = DOWNLOADS / "latest.yml"
    release_js = JS_DIR / "release.js"
    for p in (latest_path, yml_path, release_js):
        if not p.is_file():
            print(f"FAIL  missing feed file: {p}")
            return 1

    latest = json.loads(latest_path.read_text(encoding="utf-8"))
    version = args.version or str(latest.get("version", ""))
    zip_name = f"WickedImgui-Portable-{version}.zip"
    zip_path = DOWNLOADS / zip_name
    yml = yml_path.read_text(encoding="utf-8")
    rel = release_js.read_text(encoding="utf-8")

    print(f"Verifying {version} ({zip_name})\n")
    if not check("ZIP exists", zip_path.is_file(), str(zip_path)):
        return 1

    size = zip_path.stat().st_size
    sha256 = sha256_file(zip_path)
    sha512 = sha512_b64_file(zip_path)
    short = sha256[:16]

    check("feed version / file", str(latest.get("version")) == version
          and latest.get("file") == zip_name, f"{latest.get('version')} / {latest.get('file')}")
    check("release.js attached / version / file",
          re.search(r"(?m)^\s*attached:\s*true", rel) is not None
          and scalar(rel, "version") == version and scalar(rel, "file") == zip_name)
    check("ZIP size == feeds", size == int(latest.get("bytes", -1))
          and scalar(yml, "size") == str(size) and scalar(rel, "bytes") == str(size),
          f"{size} bytes")
    check("SHA-256 == feeds", sha256 == str(latest.get("sha256", "")).lower()
          and sha256 == scalar(rel, "sha256").lower(), short)
    check("SHA-512 == feeds", sha512 == str(latest.get("sha512", ""))
          and sha512 == scalar(rel, "sha512") and sha512 == scalar(yml, "sha512"),
          sha512[:20])

    # ---- ZIP layout ---------------------------------------------------------
    with zipfile.ZipFile(zip_path) as zf:
        names = set(zf.namelist())
        missing = [n for n in REQUIRED if n not in names]
        check("ZIP required files", not missing,
              "all present" if not missing else "missing " + ", ".join(missing))
        stray = [n for n in names if n and not n.startswith(PREFIX)
                 and "__MACOSX" not in n]
        check("single top-level folder", not stray,
              "only Wicked Imgui Maker/" if not stray else ", ".join(stray[:3]))
        licenses = [n for n in names if n.startswith(PREFIX + "licenses/") and n.endswith(".txt")]
        check("licence texts in ZIP", len(licenses) >= 13, f"{len(licenses)} files")

        asar = zf.read(PREFIX + "resources/app.asar")
        exe = zf.read(PREFIX + "Wicked ImGui Maker.exe")
        try:
            expected = asar_header_hash(asar)
            matches = list(RECORD_RE.finditer(exe))
            check("single embedded integrity record", len(matches) == 1,
                  f"{len(matches)} found")
            if len(matches) == 1:
                actual = matches[0].group(1).decode("ascii")
                check("ASAR header hash == PE integrity record", actual == expected,
                      expected)
        except ValueError as exc:
            check("ASAR header hash == PE integrity record", False, str(exc))

    # ---- remote asset digest -------------------------------------------------
    if args.remote:
        if not GH.is_file():
            skip("GitHub release asset digest", "gh.exe not found")
        else:
            proc = subprocess.run(
                [str(GH), "api", f"repos/{RELEASES_REPO}/releases/tags/v{version}",
                 "--jq", f'.assets[] | select(.name == "{zip_name}") | [.digest, .size] | @tsv'],
                capture_output=True, text=True, timeout=120,
            )
            if proc.returncode != 0 or not proc.stdout.strip():
                check("GitHub release asset digest", False,
                      (proc.stderr or "no asset returned").strip()[:200])
            else:
                digest, asset_size = proc.stdout.strip().split("\t")
                check("GitHub release asset SHA-256",
                      digest.lower() == "sha256:" + sha256, short)
                check("GitHub release asset size", int(asset_size) == size,
                      f"{asset_size} bytes")
    else:
        skip("GitHub release asset digest", "pass --remote to enable")

    failed = [r for r in results if r[1] == "FAIL"]
    print(f"\nverify-release: {len(results)} checks, {len(failed)} failure(s)")
    if failed:
        return 1
    print("verify-release: all green")
    return 0


if __name__ == "__main__":
    sys.exit(main())
