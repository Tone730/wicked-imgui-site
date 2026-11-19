param(
  [Parameter(Mandatory = $true)]
  [string] $BaseUrl,

  [string] $Notes,
  [object[]] $Changes = @(),

  [switch] $SkipBuild,
  [switch] $SkipPackage
)

$ErrorActionPreference = 'Stop'

function Normalize-UpdateBaseUrl {
  param([string] $Url)

  $u = $Url.Trim()
  if ([string]::IsNullOrWhiteSpace($u)) { throw 'BaseUrl is required.' }
  if ($u -notmatch '^https?://') { throw "BaseUrl must start with http:// or https://. Got: $u" }

  $u = $u.TrimEnd('/')
  $isDownloadsDir = ($u -match '/downloads$')
  $isGitHubReleases = ($u -match '^https://github\.com/[^/]+/[^/]+/releases/download/[^/]+$')
  if (-not ($isDownloadsDir -or $isGitHubReleases)) {
    throw "BaseUrl must point at a downloads directory or GitHub Releases tag URL, e.g. https://updates.example.com/downloads or https://github.com/OWNER/REPO/releases/download/TAG. Got: $u"
  }

  $hostPart = ([uri] $u).Host
  if ($u -match '^http://' -and $hostPart -notin @('127.0.0.1', 'localhost')) {
    throw 'Public update hosts must use https://. Only loopback hosts may use http://.'
  }

  return ($u + '/')
}

$base = Normalize-UpdateBaseUrl $BaseUrl
$feedUrl = $base + 'latest.json'

$root = Split-Path -Parent $PSScriptRoot
$appRoot = Join-Path (Split-Path -Parent $root) 'WickedImguiMaker'
$configJs = Join-Path $root 'js\config.js'
$buildScript = Join-Path $appRoot 'build.ps1'
$packageScript = Join-Path $PSScriptRoot 'package-app.ps1'
$latestPath = Join-Path $root 'downloads\latest.json'
$feedConfig = Join-Path $appRoot 'app\update-feed.json'

foreach ($required in @($configJs, $buildScript, $packageScript)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
    throw "Missing required file: $required"
  }
}

# 1. Dashboard display config. The actual download URL comes from the generated manifest.
$config = [IO.File]::ReadAllText($configJs)
$pattern = '(?m)^(?<indent>[ \t]*)baseUrl:[ \t]*''[^'']*''[ \t]*,'
if (-not [regex]::IsMatch($config, $pattern)) {
  throw "Could not find CONFIG.updates.baseUrl in $configJs"
}
$escaped = $base.Replace('\', '\\').Replace("'", "\'")
$replacement = '${indent}baseUrl: ' + "'" + $escaped + "',"
$config = [regex]::Replace($config, $pattern, $replacement)
$configTmp = $configJs + '.publish.tmp'
[IO.File]::WriteAllText($configTmp, $config, [Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath $configTmp -Destination $configJs -Force
Write-Host "Dashboard feed base: $base" -ForegroundColor Green

# 2. Bake the feed URL into the app that will be shipped.
if (-not $SkipBuild) {
  Write-Host "Rebuilding app with feed: $feedUrl" -ForegroundColor Cyan
  & $buildScript -UpdateFeedUrl $feedUrl
  if (-not $?) { throw 'build.ps1 failed.' }
}
else {
  Write-Host 'Skipped app rebuild (-SkipBuild).' -ForegroundColor Yellow
}

# 3. Repackage the portable ZIP and regenerate release manifests with public URLs.
if (-not $SkipPackage) {
  $pkgArgs = @{ BaseUrl = $base }
  if ($Notes) { $pkgArgs.Notes = $Notes }
  if (@($Changes).Count -gt 0) { $pkgArgs.Changes = $Changes }
  Write-Host "Packaging portable ZIP with base: $base" -ForegroundColor Cyan
  & $packageScript @pkgArgs
  if (-not $?) { throw 'package-app.ps1 failed.' }
}
else {
  Write-Host 'Skipped ZIP repackage (-SkipPackage).' -ForegroundColor Yellow
}

# 4. Verify the whole chain is internally consistent.
$m = Get-Content -LiteralPath $latestPath -Raw | ConvertFrom-Json
$downloadsDir = Split-Path -Parent $latestPath
$zip = Join-Path $downloadsDir $m.file
if (-not (Test-Path -LiteralPath $zip -PathType Leaf)) { throw "Release ZIP missing: $zip" }

$bytes = (Get-Item -LiteralPath $zip).Length
$sha = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
$feedInApp = (Get-Content -LiteralPath $feedConfig -Raw | ConvertFrom-Json).feedUrl

if ($bytes -ne $m.bytes) { throw "Size mismatch: disk $bytes, manifest $($m.bytes)" }
if ($sha -ne $m.sha256) { throw "SHA-256 mismatch: disk $sha, manifest $($m.sha256)" }
if (-not $m.url.StartsWith($base)) { throw "Release URL $($m.url) does not start with $base" }
if (-not $SkipBuild -and $feedInApp -ne $feedUrl) { throw "App feed mismatch: $feedInApp" }

Write-Host ''
Write-Host 'Update host wiring is consistent.' -ForegroundColor Green
Write-Host "  Feed URL:   $feedUrl"
Write-Host "  Download:   $($m.url)"
Write-Host "  ZIP bytes:  $bytes"
Write-Host "  SHA-256:    $sha"
Write-Host ''
Write-Host 'Upload these three files to the host, preserving names:' -ForegroundColor Cyan
Write-Host "  $zip"
Write-Host "  $latestPath"
Write-Host "  $(Join-Path $downloadsDir 'latest.yml')"
Write-Host ''
Write-Host 'After upload, the dashboard Downloads page and the app updater will use this host.' -ForegroundColor Cyan
