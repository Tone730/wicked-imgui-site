param(
  [Parameter(Mandatory = $true)]
  [Alias('Zip', 'File')]
  [string] $Exe,

  [string] $Version = '1.0.0',
  [string] $Notes   = 'Community build of Wicked Imgui.',
  [string] $Channel = 'stable',
  [string] $BaseUrl = 'http://127.0.0.1:8124/downloads/',

  # Each item may be [pscustomobject]@{ Tag; Text }, a 2-element array, or a string.
  [object[]] $Changes = @()
)

$ErrorActionPreference = 'Stop'

$root      = Split-Path -Parent $PSScriptRoot
$downloads = Join-Path $root 'downloads'
$releaseJs = Join-Path $root 'js\release.js'

if (-not (Test-Path -LiteralPath $Exe -PathType Leaf)) {
  throw "Portable build not found: $Exe"
}
if (-not (Test-Path -LiteralPath $releaseJs -PathType Leaf)) {
  throw "release.js not found: $releaseJs"
}

New-Item -ItemType Directory -Force -Path $downloads | Out-Null

$source      = (Resolve-Path -LiteralPath $Exe).Path
$fileName    = Split-Path -Leaf $source
$destination = Join-Path $downloads $fileName

if (-not [string]::Equals([IO.Path]::GetFullPath($source), [IO.Path]::GetFullPath($destination), [StringComparison]::OrdinalIgnoreCase)) {
  Copy-Item -LiteralPath $source -Destination $destination -Force
}

$hash       = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
$length     = (Get-Item -LiteralPath $destination).Length
$size       = '{0:N1} MB' -f ($length / 1MB)
$date       = Get-Date -Format 'yyyy-MM-dd'
$releasedAt = (Get-Date).ToUniversalTime().ToString('o')

# electron-updater expects a base64 SHA-512 for the generic provider.
$sha512Hex = (Get-FileHash -LiteralPath $destination -Algorithm SHA512).Hash
$sha512Bytes = [byte[]]::new($sha512Hex.Length / 2)
for ($i = 0; $i -lt $sha512Bytes.Length; $i++) {
  $sha512Bytes[$i] = [Convert]::ToByte($sha512Hex.Substring($i * 2, 2), 16)
}
$sha512 = [Convert]::ToBase64String($sha512Bytes)

function ConvertTo-JsString {
  param([AllowNull()][string] $Value)
  if ($null -eq $Value) { return '' }
  return $Value.Replace("\", "\\").Replace("'", "\'").Replace("`r", ' ').Replace("`n", ' ')
}

# Rewrites ONLY the changes: [ ... ] block. kind and older are left untouched.
function Set-ReleaseChanges {
  param(
    [Parameter(Mandatory = $true)] [string] $Content,
    [object[]] $Items
  )

  if (-not @($Items).Count) { return $Content }

  # Determine indentation first so generated bullets align with the existing style.
  $single = '(?m)^(?<indent>[ \t]*)changes:[ \t]*\[[ \t]*\]'
  $multi  = '(?ms)^(?<indent>[ \t]*)changes:[ \t]*\[.*?^\k<indent>\]'
  $pattern = if ([regex]::IsMatch($Content, $single)) { $single } else { $multi }
  $match = [regex]::Match($Content, $pattern)
  if (-not $match.Success) {
    throw "Could not find a 'changes: [ ... ]' array in $releaseJs; refusing to rewrite release metadata."
  }
  $indent = $match.Groups['indent'].Value
  $innerIndent = $indent + '  '

  $entries = @()
  foreach ($item in @($Items)) {
    if ($null -eq $item) { continue }
    if ($item -is [string]) {
      $tag = 'Change'
      $text = [string] $item
    }
    elseif ($item.PSObject.Properties['Tag']) {
      $tag = [string] $item.Tag
      $text = [string] $item.Text
    }
    elseif (($item -is [array]) -and $item.Count -ge 2) {
      $tag = [string] $item[0]
      $text = [string] $item[1]
    }
    else { continue }

    if ([string]::IsNullOrWhiteSpace($tag)) { $tag = 'Change' }
    $tagEsc  = ConvertTo-JsString $tag
    $textEsc = ConvertTo-JsString $text
    $entries += "$innerIndent['$tagEsc', '$textEsc'],"
  }
  if (-not $entries.Count) { return $Content }

  $body = $indent + "changes: [`n" + ($entries -join "`n") + "`n" + $indent + ']'
  $evaluator = [System.Text.RegularExpressions.MatchEvaluator] { param($m) return $body }
  return [regex]::Replace($Content, $pattern, $evaluator)
}

$esc = {
  param([string] $s)
  return ConvertTo-JsString $s
}
$versionEsc    = & $esc $Version
$notesEsc      = & $esc $Notes
$fileEsc       = & $esc $fileName
$channelEsc    = & $esc $Channel
$baseUrlEsc    = & $esc $BaseUrl

$lines = [IO.File]::ReadAllLines($releaseJs)
for ($i = 0; $i -lt $lines.Count; $i++) {
  $line = $lines[$i]
  if    ($line -match '^\s*attached:')       { $lines[$i] = '  attached: true,' }
  elseif ($line -match '^\s*version:')        { $lines[$i] = "  version: '$versionEsc'," }
  elseif ($line -match '^\s*date:')           { $lines[$i] = "  date: '$date'," }
  elseif ($line -match '^\s*bytes:')          { $lines[$i] = "  bytes: $length," }
  elseif ($line -match '^\s*size:')           { $lines[$i] = "  size: '$size'," }
  elseif ($line -match '^\s*sha256:')         { $lines[$i] = "  sha256: '$hash'," }
  elseif ($line -match '^\s*sha512:')         { $lines[$i] = "  sha512: '$sha512'," }
  elseif ($line -match '^\s*channel:')        { $lines[$i] = "  channel: '$channelEsc'," }
  elseif ($line -match '^\s*feedUrl:')        { $lines[$i] = "  feedUrl: 'downloads/latest.json'," }
  elseif ($line -match '^\s*electronFeedUrl:'){ $lines[$i] = "  electronFeedUrl: 'downloads/latest.yml'," }
  elseif ($line -match '^\s*notes:')          { $lines[$i] = "  notes: '$notesEsc'," }
  elseif ($line -match '^\s*file:')           { $lines[$i] = "  file: '$fileEsc'," }
}

$updated = Set-ReleaseChanges -Content ([string]::Join("`r`n", $lines)) -Items $Changes

# Write to a temp file first so release.js is never observed half-written.
$releaseTmp = $releaseJs + '.publish.tmp'
[IO.File]::WriteAllText($releaseTmp, $updated, [System.Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath $releaseTmp -Destination $releaseJs -Force

# Human-readable feed used by the dashboard's "check for updates" UI.
$base = $BaseUrl.TrimEnd('/')
$manifest = [ordered]@{
  version      = $Version
  date         = $date
  releaseDate  = $releasedAt
  channel      = $Channel
  bytes        = $length
  size         = $size
  sha256       = $hash
  sha512       = $sha512
  file         = $fileName
  url          = "$base/$fileName"
  feed         = "$base/latest.json"
  electronFeed = "$base/latest.yml"
  notes        = $Notes
  kind         = 'Portable build'
}
$json = $manifest | ConvertTo-Json -Depth 4
$latestPath = Join-Path $downloads 'latest.json'
[IO.File]::WriteAllText($latestPath, $json, [Text.UTF8Encoding]::new($false))

# Feed authenticity: sign version + sha256 + bytes with Ed25519 so pinned builds
# fail closed on a missing/tampered feed. The private key lives OUTSIDE both repos
# (WICKED_RELEASE_KEY_FILE or ~/.config/wicked-imgui/release-signing.key). If it
# is absent the build fails rather than emitting an unsigned feed that would
# brick updates for signed clients. See tools/UPDATE_SIGNING.md.
& node (Join-Path $PSScriptRoot 'sign-feed.mjs') --feed $latestPath
if ($LASTEXITCODE -ne 0) { throw "Feed signing failed for $Version (see tools/UPDATE_SIGNING.md)" }
& node (Join-Path $PSScriptRoot 'sign-feed.mjs') --verify --feed $latestPath
if ($LASTEXITCODE -ne 0) { throw "Feed signature verification failed for $Version" }

# electron-updater generic-provider manifest. Point the app's update URL at this folder.
$yaml = "version: $Version`nreleaseDate: '$releasedAt'`npath: $fileName`nsha512: $sha512`nsize: $length`n"
[IO.File]::WriteAllText((Join-Path $downloads 'latest.yml'), $yaml, [Text.UTF8Encoding]::new($false))

Write-Host ''
Write-Host 'Build attached.' -ForegroundColor Green
Write-Host "  File:    downloads\$fileName"
Write-Host "  Size:    $size"
Write-Host "  SHA-256: $hash"
Write-Host "  Feed:    downloads\latest.json + latest.yml"
Write-Host ''
Write-Host 'Reload the Downloads page to see the live download button.' -ForegroundColor Cyan
