<#
.SYNOPSIS
  One-command, fully-local publish pipeline for Wicked ImGui Maker + dashboard.

.DESCRIPTION
  Validates inputs, keeps app/package.json, dashboard js/config.js and js/release.js
  on the same version, rebuilds the app, smoke-tests the executable, syntax-checks
  every app/dashboard JS file, packages the portable ZIP, attaches the release,
  verifies checksums/feeds, and appends a JSONL build history entry.

  No network calls, no installer execution, no VCS operations.

.EXAMPLE
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools\publish.ps1

.EXAMPLE
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools\publish.ps1 -Bump patch -Notes "Fix updater"
#>
param(
  [string] $Version,

  [ValidateSet('none', 'patch', 'minor', 'major')]
  [string] $Bump = 'none',

  [string] $Notes,

  [switch] $SkipSmoke,

  [switch] $Watch
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------- paths
$root       = Split-Path -Parent $PSScriptRoot
$parent     = Split-Path -Parent $root
$appRoot    = Join-Path $parent 'WickedImguiMaker'
$appDir     = Join-Path $appRoot 'app'
$appPkg     = Join-Path $appDir 'package.json'
$buildPs1   = Join-Path $appRoot 'build.ps1'
$distDir    = Join-Path $appRoot 'dist'
$exePath    = Join-Path $distDir 'Wicked ImGui Maker.exe'
$jsDir      = Join-Path $root 'js'
$configJs   = Join-Path $jsDir 'config.js'
$releaseJs  = Join-Path $jsDir 'release.js'
$downloads  = Join-Path $root 'downloads'
$changelog  = Join-Path $root 'CHANGELOG.md'
$packagePs1 = Join-Path $PSScriptRoot 'package-app.ps1'
$modulePath = Join-Path $PSScriptRoot 'changelog.psm1'
$history    = Join-Path $downloads 'build-history.jsonl'

$defaultNotes = 'Local full-access portable build with a self-hosted update feed: updates are checksum-verified and opened for extraction. Extract the ZIP and run Wicked Imgui Maker.exe; no sign-in, license key, or installer is required.'

# ---------------------------------------------------------------- helpers
function Write-Step {
  param([string] $Message)
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Get-PkgVersion {
  param([string] $Path)
  $match = [regex]::Match([IO.File]::ReadAllText($Path), '(?m)^\s*"version"\s*:\s*"([^"]+)"')
  if (-not $match.Success) { throw "No version field found in $Path" }
  return $match.Groups[1].Value.Trim()
}

function Get-JsVersion {
  param([string] $Path)
  $match = [regex]::Match([IO.File]::ReadAllText($Path), '(?m)^\s*version:\s*[''"](\d+\.\d+\.\d+[^''"\s]*)[''"]')
  if (-not $match.Success) { throw "No version field found in $Path" }
  return $match.Groups[1].Value.Trim()
}

function Get-ReleaseScalar {
  param([string] $Name)
  $text = [IO.File]::ReadAllText($releaseJs)
  $match = [regex]::Match($text, "(?m)^\s*${Name}:\s*'([^']*)'")
  if (-not $match.Success) { return $null }
  return $match.Groups[1].Value
}

function Get-UpdatesBaseUrl {
  $text = [IO.File]::ReadAllText($configJs)
  $match = [regex]::Match($text, "(?m)^\s*baseUrl:\s*'([^']*)'")
  if (-not $match.Success) { return 'http://127.0.0.1:8124/downloads/' }
  $value = $match.Groups[1].Value.Trim()
  if ([string]::IsNullOrWhiteSpace($value)) { return 'http://127.0.0.1:8124/downloads/' }
  return $value.TrimEnd('/') + '/'
}

function Set-VersionInFile {
  param(
    [Parameter(Mandatory = $true)] [string] $Path,
    [Parameter(Mandatory = $true)] [string] $Pattern,
    [Parameter(Mandatory = $true)] [string] $Target
  )
  $text = [IO.File]::ReadAllText($Path)
  $evaluator = [System.Text.RegularExpressions.MatchEvaluator] {
    param($m)
    return $m.Groups[1].Value + $Target + $m.Groups[3].Value
  }
  $new = [regex]::Replace($text, $Pattern, $evaluator)
  if ($new -eq $text) { return $false }

  # Atomic-ish replacement: never leave a truncated version file behind.
  $tmp = $Path + '.publish.tmp'
  [IO.File]::WriteAllText($tmp, $new, [Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $tmp -Destination $Path -Force
  return $true
}

function Resolve-PublishVersion {
  param(
    [string] $RequestedVersion,
    [string] $BumpKind
  )

  $vPkg = Get-PkgVersion $appPkg
  $vCfg = Get-JsVersion $configJs
  $vRel = Get-JsVersion $releaseJs

  if ($RequestedVersion) {
    if ($BumpKind -ne 'none') {
      throw 'Use either -Version or -Bump, not both. Pick one and re-run.'
    }
    $target = $RequestedVersion.Trim()
  }
  elseif ($BumpKind -ne 'none') {
    $parts = [regex]::Match($vPkg, '^(\d+)\.(\d+)\.(\d+)([-+][0-9A-Za-z.-]+)?$')
    if (-not $parts.Success) {
      throw "Cannot bump non-standard version '$vPkg' from $appPkg. Pass -Version explicitly."
    }
    $maj = [int] $parts.Groups[1].Value
    $min = [int] $parts.Groups[2].Value
    $pat = [int] $parts.Groups[3].Value
    $suffix = $parts.Groups[4].Value
    switch ($BumpKind) {
      'patch' { $target = "$maj.$min.$($pat + 1)$suffix" }
      'minor' { $target = "$maj.$($min + 1).0$suffix" }
      'major' { $target = "$($maj + 1).0.0$suffix" }
    }
  }
  else {
    $unique = @($vPkg, $vCfg, $vRel) | Sort-Object -Unique
    if ($unique.Count -ne 1) {
      throw ("Version mismatch detected. app\package.json = {0}, js\config.js = {1}, js\release.js = {2}. " +
             "Pass -Version <x.y.z> to sync all three, or fix them before publishing.") -f $vPkg, $vCfg, $vRel
    }
    $target = $vPkg
  }

  if ($target -notmatch '^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$') {
    throw "Invalid version '$target'. Expected MAJOR.MINOR.PATCH with an optional -prerelease/+build suffix."
  }

  $updated = @()
  if (Set-VersionInFile -Path $appPkg -Pattern '(?m)^(\s*"version"\s*:\s*")([^"]+)(")' -Target $target) {
    $updated += 'app\package.json'
  }
  $jsPattern = '(?m)^(\s*version:\s*'')([^'']+)('')'
  if (Set-VersionInFile -Path $configJs -Pattern $jsPattern -Target $target) { $updated += 'js\config.js' }
  if (Set-VersionInFile -Path $releaseJs -Pattern $jsPattern -Target $target) { $updated += 'js\release.js' }
  if ($updated.Count) {
    Write-Host "Synced version $target to: $($updated -join ', ')" -ForegroundColor Yellow
  }

  # Keep the update feed version-agnostic. A version-pinned baseUrl makes every
  # newly built app read the PREVIOUS release's latest.json and miss updates.
  $latestAlias = 'https://github.com/Tone730/wicked-imgui-releases/releases/latest/download/'
  $cfgText = [IO.File]::ReadAllText($configJs)
  $normalizeFeed = [System.Text.RegularExpressions.MatchEvaluator] {
    param($m) return $m.Groups[1].Value + $latestAlias + $m.Groups[2].Value
  }
  $normalized = [regex]::Replace($cfgText, "(?m)^(\s*baseUrl:\s*')[^']*(')", $normalizeFeed)
  if ($normalized -ne $cfgText) {
    [IO.File]::WriteAllText($configJs, $normalized, [Text.UTF8Encoding]::new($false))
    Write-Host "Normalized update baseUrl to the latest-release alias" -ForegroundColor Yellow
  }

  return $target
}

function Assert-NodeSyntax {
  param(
    [Parameter(Mandatory = $true)] [string[]] $Files,
    [Parameter(Mandatory = $true)] [string] $Label
  )

  $failures = @()
  $previous = $ErrorActionPreference
  # node writes syntax errors to stderr; keep them as text instead of ErrorRecords.
  $ErrorActionPreference = 'Continue'
  try {
    foreach ($file in $Files) {
      $output = & node --check $file 2>&1 | Out-String
      if ($LASTEXITCODE -ne 0) {
        $failures += [pscustomobject]@{ File = $file; Output = $output.Trim() }
      }
    }
  }
  finally { $ErrorActionPreference = $previous }

  if ($failures.Count) {
    $detail = ($failures | Select-Object -First 5 | ForEach-Object { "  $($_.File): $($_.Output)" }) -join "`n"
    throw "$Label syntax check failed for $($failures.Count) file(s):`n$detail"
  }
  Write-Host ("  syntax OK: {0} {1} files" -f $Files.Count, $Label) -ForegroundColor Green
}

function Read-DebugTail {
  param(
    [Parameter(Mandatory = $true)] [string] $Path,
    [long] $Offset
  )
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return '' }
  try {
    $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    try {
      if ($stream.Length -le $Offset) { return '' }
      $stream.Position = $Offset
      $reader = New-Object IO.StreamReader($stream)
      return $reader.ReadToEnd()
    }
    finally { $stream.Dispose() }
  }
  catch { return '' }
}

function Invoke-SmokeTest {
  $debugLog = Join-Path $distDir 'debug.log'
  $exeFull = [IO.Path]::GetFullPath($exePath)
  $initialLength = if (Test-Path -LiteralPath $debugLog -PathType Leaf) { (Get-Item -LiteralPath $debugLog).Length } else { 0 }

  # Only clean up processes launched by this smoke test; never touch a user's running app.
  $matchingProcessIds = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
    try {
      $_.Path -and [string]::Equals([IO.Path]::GetFullPath($_.Path), $exeFull, [StringComparison]::OrdinalIgnoreCase)
    }
    catch { $false }
  } | ForEach-Object { $_.Id })

  Write-Step 'Smoke test: running the built app for 10 seconds'
  $proc = Start-Process -FilePath $exePath -WorkingDirectory $distDir -PassThru
  if (-not $proc) { throw "Smoke test failed: could not start $exePath" }

  $tail = ''
  $exitedEarly = $false
  $exitCode = 'unknown'
  try {
    if ($proc.WaitForExit(10000)) {
      $exitedEarly = $true
      try { $exitCode = $proc.ExitCode } catch { }
    }
  }
  finally {
    # Electron spawns GPU/renderer/utility children from the same executable.
    # Stop the whole tree we launched, then remove the recreated debug log.
    $ourIds = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
      try {
        $_.Path -and [string]::Equals([IO.Path]::GetFullPath($_.Path), $exeFull, [StringComparison]::OrdinalIgnoreCase) -and
          ($matchingProcessIds -notcontains $_.Id)
      }
      catch { $false }
    } | ForEach-Object { $_.Id })
    if ($proc.Id -and ($ourIds -notcontains $proc.Id)) { $ourIds += $proc.Id }
    foreach ($id in $ourIds) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 400
    foreach ($id in $ourIds) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }

    # crashpad warnings in debug.log are a known, non-fatal Electron quirk.
    $tail = Read-DebugTail -Path $debugLog -Offset $initialLength
    for ($attempt = 0; $attempt -lt 5 -and (Test-Path -LiteralPath $debugLog -PathType Leaf); $attempt++) {
      try { Remove-Item -LiteralPath $debugLog -Force -ErrorAction Stop; break }
      catch { Start-Sleep -Milliseconds 300 }
    }
    if (Test-Path -LiteralPath $debugLog -PathType Leaf) {
      Write-Host "Warning: could not delete $debugLog" -ForegroundColor Yellow
    }
  }

  if ($exitedEarly) {
    throw "Smoke test failed: the app exited before 10 seconds (exit code $exitCode). Nothing was published."
  }

  $lines = @($tail -split "`r?`n" | Where-Object { $_.Trim() })
  $crashpad = @($lines | Where-Object { $_ -match 'crashpad|registration_protocol_win' })
  if ($crashpad.Count) {
    Write-Host "  ignored $($crashpad.Count) non-fatal crashpad debug warning(s)" -ForegroundColor DarkGray
  }
  $fatal = @($lines | Where-Object { $_ -notmatch 'crashpad|registration_protocol_win' -and $_ -match 'FATAL|fatal error' })
  if ($fatal.Count) {
    throw "Smoke test found fatal debug.log entries: $($fatal -join ' | ')"
  }
  Write-Host '  smoke test passed: app stayed alive for 10 seconds' -ForegroundColor Green
}

function Get-AppJsFiles {
  return @(Get-ChildItem -LiteralPath $appDir -Recurse -File |
    Where-Object { $_.Extension -in '.js', '.cjs' } |
    ForEach-Object { $_.FullName })
}

function Get-DashboardJsFiles {
  return @(Get-ChildItem -LiteralPath $jsDir -File |
    Where-Object { $_.Extension -eq '.js' } |
    ForEach-Object { $_.FullName })
}

function Assert-Release {
  param(
    [Parameter(Mandatory = $true)] [string] $Version
  )

  $zipName = "WickedImgui-Portable-$Version.zip"
  $zipPath = Join-Path $downloads $zipName
  $jsonPath = Join-Path $downloads 'latest.json'
  $ymlPath = Join-Path $downloads 'latest.yml'
  $checks = @()

  $zipOk = Test-Path -LiteralPath $zipPath -PathType Leaf
  $checks += [pscustomobject]@{ Check = 'ZIP exists'; Status = $(if ($zipOk) { 'PASS' } else { 'FAIL' }); Detail = $zipName }
  if (-not $zipOk) {
    $checks | Format-Table -AutoSize | Out-Host
    throw "Verification failed: packaged ZIP not found at $zipPath"
  }
  foreach ($required in @($releaseJs, $jsonPath, $ymlPath)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
      throw "Verification failed: expected release file is missing: $required"
    }
  }

  $actualSha256 = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $actualBytes = (Get-Item -LiteralPath $zipPath).Length
  $sha512Hex = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA512).Hash
  $sha512Bytes = [byte[]]::new($sha512Hex.Length / 2)
  for ($i = 0; $i -lt $sha512Bytes.Length; $i++) {
    $sha512Bytes[$i] = [Convert]::ToByte($sha512Hex.Substring($i * 2, 2), 16)
  }
  $actualSha512 = [Convert]::ToBase64String($sha512Bytes)

  $relText = [IO.File]::ReadAllText($releaseJs)
  $relVersion = Get-ReleaseScalar 'version'
  $relFile = Get-ReleaseScalar 'file'
  $relSha256 = (Get-ReleaseScalar 'sha256').ToLowerInvariant()
  $relSha512 = Get-ReleaseScalar 'sha512'
  $relBytesMatch = [regex]::Match($relText, '(?m)^\s*bytes:\s*(\d+)')
  $relBytes = if ($relBytesMatch.Success) { [int64] $relBytesMatch.Groups[1].Value } else { -1 }
  $attachedOk = [regex]::IsMatch($relText, '(?m)^\s*attached:\s*true\s*,?')
  $preservedOk = [regex]::IsMatch($relText, '(?m)^\s*kind:') -and [regex]::IsMatch($relText, '(?m)^\s*older:')

  $latest = Get-Content -LiteralPath $jsonPath -Raw | ConvertFrom-Json
  $yml = [IO.File]::ReadAllText($ymlPath)
  $ymlVersion = [regex]::Match($yml, '(?m)^version:\s*(\S+)').Groups[1].Value
  $ymlSha512 = [regex]::Match($yml, '(?m)^sha512:\s*(\S+)').Groups[1].Value
  $ymlSizeMatch = [regex]::Match($yml, '(?m)^size:\s*(\d+)')
  $ymlSize = if ($ymlSizeMatch.Success) { [int64] $ymlSizeMatch.Groups[1].Value } else { -1 }

  $appFiles = Get-AppJsFiles
  $dashFiles = Get-DashboardJsFiles
  Assert-NodeSyntax -Files $dashFiles -Label 'dashboard'
  $syntaxOk = $dashFiles.Count -gt 0

  $shortHash = $actualSha256.Substring(0, [Math]::Min(16, $actualSha256.Length))
  $checks += [pscustomobject]@{ Check = 'release.js attached/version/file'; Status = $(if ($attachedOk -and $relVersion -eq $Version -and $relFile -eq $zipName) { 'PASS' } else { 'FAIL' }); Detail = "attached=$attachedOk v=$relVersion file=$relFile" }
  $checks += [pscustomobject]@{ Check = 'release.js SHA-256 == actual'; Status = $(if ($relSha256 -eq $actualSha256) { 'PASS' } else { 'FAIL' }); Detail = $shortHash }
  $checks += [pscustomobject]@{ Check = 'latest.json SHA-256 == actual'; Status = $(if ([string] $latest.sha256 -eq $actualSha256) { 'PASS' } else { 'FAIL' }); Detail = $shortHash }
  $checks += [pscustomobject]@{ Check = 'release.js/latest.json bytes == actual'; Status = $(if ($relBytes -eq $actualBytes -and [int64] $latest.bytes -eq $actualBytes) { 'PASS' } else { 'FAIL' }); Detail = "$actualBytes bytes" }
  $checks += [pscustomobject]@{ Check = 'latest.json version/file'; Status = $(if ($latest.version -eq $Version -and $latest.file -eq $zipName) { 'PASS' } else { 'FAIL' }); Detail = "$($latest.version) / $($latest.file)" }
  $checks += [pscustomobject]@{ Check = 'latest.yml version/size'; Status = $(if ($ymlVersion -eq $Version -and $ymlSize -eq $actualBytes) { 'PASS' } else { 'FAIL' }); Detail = "$ymlVersion / $ymlSize" }
  $checks += [pscustomobject]@{ Check = 'SHA-512: release.js/latest.json/latest.yml/actual'; Status = $(if ($relSha512 -eq $actualSha512 -and [string] $latest.sha512 -eq $actualSha512 -and $ymlSha512 -eq $actualSha512) { 'PASS' } else { 'FAIL' }); Detail = $actualSha512.Substring(0, [Math]::Min(20, $actualSha512.Length)) }
  $checks += [pscustomobject]@{ Check = 'kind/older preserved'; Status = $(if ($preservedOk) { 'PASS' } else { 'FAIL' }); Detail = 'release.js' }
  $checks += [pscustomobject]@{ Check = 'dashboard JS syntax'; Status = $(if ($syntaxOk) { 'PASS' } else { 'FAIL' }); Detail = "$($dashFiles.Count) files" }

  Write-Host ''
  $checks | Format-Table -AutoSize | Out-Host

  $failed = @($checks | Where-Object { $_.Status -ne 'PASS' })
  if ($failed.Count) {
    throw "Verification failed: $(($failed | ForEach-Object { $_.Check }) -join ', ')"
  }

  return [pscustomobject]@{
    Version = $Version
    File    = $zipName
    Bytes   = $actualBytes
    Sha256  = $actualSha256
    Sha512  = $actualSha512
  }
}

function Invoke-PublishOnce {
  param(
    [string] $RequestedVersion,
    [string] $BumpKind = 'none',
    [string] $PublishNotes,
    [switch] $SkipSmokeTest,
    [string] $RunLabel = ''
  )

  if ($RunLabel) { Write-Host "`n===== $RunLabel =====" -ForegroundColor Magenta }

  # 1. validate inputs
  Write-Step 'Validating inputs'
  foreach ($required in @($appPkg, $buildPs1, $distDir, $exePath, $configJs, $releaseJs, $packagePs1, $modulePath)) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Required path is missing: $required" }
  }
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'node.exe was not found on PATH. Install Node.js or add it to PATH.'
  }
  if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw 'python was not found on PATH. build.ps1 needs Python for ASAR repacking.'
  }
  if (-not (Test-Path -LiteralPath $downloads -PathType Container)) {
    New-Item -ItemType Directory -Force -Path $downloads | Out-Null
  }

  # 2. sync versions
  Write-Step 'Synchronizing versions'
  $target = Resolve-PublishVersion -RequestedVersion $RequestedVersion -BumpKind $BumpKind

  # changelog -> changes[] (changelog.psm1 is owned by this pipeline)
  Import-Module $modulePath -Force
  $changeEntry = Get-ReleaseChanges -Path $changelog -Version $target
  $changes = @()
  if ($changeEntry) {
    $changes = @($changeEntry)
    Write-Host "  changelog: $($changes.Count) change(s) for $target" -ForegroundColor Green
  }
  else {
    Write-Host "  no changelog section for $target; existing changes[] will be kept" -ForegroundColor Yellow
  }

  # 3. build
  Write-Step 'Building app (build.ps1)'
  $baseUrl = Get-UpdatesBaseUrl
  $feedUrl = $baseUrl.TrimEnd('/') + '/latest.json'
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $buildOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $buildPs1 -UpdateFeedUrl $feedUrl 2>&1 | Out-String
    $buildExit = $LASTEXITCODE
  }
  finally { $ErrorActionPreference = $previous }
  if ($buildOutput) { Write-Host $buildOutput }
  if ($buildExit -ne 0) { throw "build.ps1 failed with exit code $buildExit" }
  if (-not (Test-Path -LiteralPath $exePath -PathType Leaf)) {
    throw "Build reported success but $exePath is missing"
  }

  # 4. smoke test
  if ($SkipSmokeTest) {
    Write-Host "`n==> Smoke test skipped (-SkipSmoke)" -ForegroundColor Yellow
  }
  else { Invoke-SmokeTest }

  # 5. syntax checks
  Write-Step 'Syntax-checking JavaScript'
  $appFiles = Get-AppJsFiles
  $dashFiles = Get-DashboardJsFiles
  if (-not $appFiles.Count -or -not $dashFiles.Count) {
    throw "No JavaScript files found under $appDir or $jsDir"
  }
  Assert-NodeSyntax -Files $appFiles -Label 'app'
  Assert-NodeSyntax -Files $dashFiles -Label 'dashboard'

  # 6. package + attach
  Write-Step 'Packaging portable ZIP and attaching release'
  $packageArgs = @{ SourceDist = $distDir; Version = $target; Notes = $PublishNotes; BaseUrl = $baseUrl }
  if ($changes.Count) { $packageArgs.Changes = $changes }
  & $packagePs1 @packageArgs

  # 7. verify
  Write-Step 'Verifying release artifacts'
  $result = Assert-Release -Version $target

  # 7b. deep integrity: ZIP layout, licence notices, embedded ASAR record.
  Write-Step 'Verifying ZIP contents and embedded ASAR integrity'
  $verifyScript = Join-Path $PSScriptRoot 'verify_release.py'
  if (-not (Test-Path -LiteralPath $verifyScript -PathType Leaf)) {
    throw "Deep verification script is missing: $verifyScript"
  }
  & python $verifyScript --version $target
  if ($LASTEXITCODE -ne 0) { throw "Deep release verification failed for $target" }

  # 8. build history
  New-Item -ItemType Directory -Force -Path $downloads | Out-Null
  $entry = [ordered]@{
    timestamp = (Get-Date).ToUniversalTime().ToString('o')
    version   = $result.Version
    file      = $result.File
    bytes     = $result.Bytes
    sha256    = $result.Sha256
    notes     = $PublishNotes
  }
  $line = ($entry | ConvertTo-Json -Compress -Depth 4) + "`r`n"
  [IO.File]::AppendAllText($history, $line, [Text.UTF8Encoding]::new($false))

  # 9. compact summary
  $size = '{0:N1} MB' -f ($result.Bytes / 1MB)
  Write-Host "`n===== Publish summary =====" -ForegroundColor Green
  @(
    [pscustomobject]@{ Item = 'Version'; Value = $result.Version }
    [pscustomobject]@{ Item = 'ZIP'; Value = $result.File }
    [pscustomobject]@{ Item = 'Size'; Value = "$($result.Bytes) bytes ($size)" }
    [pscustomobject]@{ Item = 'SHA-256'; Value = $result.Sha256 }
    [pscustomobject]@{ Item = 'SHA-512'; Value = $result.Sha512 }
    [pscustomobject]@{ Item = 'Verification'; Value = 'PASS (all checks)' }
    [pscustomobject]@{ Item = 'History'; Value = 'downloads\build-history.jsonl' }
  ) | Format-Table -AutoSize | Out-Host

  return $result
}

function Invoke-Watch {
  Write-Host "`nWATCH MODE" -ForegroundColor Magenta
  Write-Host "  watching: $($appDir)\src\* (recursive), $($appDir)\main.cjs, $($appDir)\package.json"
  Write-Host '  press Ctrl+C to stop. Debounce: 3 seconds.' -ForegroundColor Cyan

  $script:RunNumber = 0
  Invoke-PublishOnce @script:PublishDefaults -RunLabel 'INITIAL RUN'

  $global:wickedWatchFlag = $false
  $global:wickedWatchPaths = @()
  $global:wickedDebounce = New-Object System.Timers.Timer 3000
  $global:wickedDebounce.AutoReset = $false

  $fileAction = {
    $path = $Event.SourceEventArgs.FullPath
    $name = [IO.Path]::GetFileName($path)
    if ($path -match '\\dist\\') { return }
    if ($name -match '\.(log|tmp|swp|bak)$' -or $name.StartsWith('~') -or $name.StartsWith('.')) { return }
    $global:wickedWatchPaths = @($global:wickedWatchPaths) + $path
    $global:wickedDebounce.Stop()
    $global:wickedDebounce.Start()
  }
  $timerAction = { $global:wickedWatchFlag = $true }

  $watchers = @()
  $subs = @()
  try {
    $specs = @(
      @{ Path = (Join-Path $appDir 'src'); Filter = '*'; Recursive = $true },
      @{ Path = $appDir; Filter = 'main.cjs'; Recursive = $false },
      @{ Path = $appDir; Filter = 'package.json'; Recursive = $false }
    )
    foreach ($spec in $specs) {
      if (-not (Test-Path -LiteralPath $spec.Path)) { throw "Watch path is missing: $($spec.Path)" }
      $watcher = New-Object System.IO.FileSystemWatcher
      $watcher.Path = $spec.Path
      $watcher.Filter = $spec.Filter
      $watcher.IncludeSubdirectories = [bool] $spec.Recursive
      $watcher.NotifyFilter = [IO.NotifyFilters]::LastWrite -bor [IO.NotifyFilters]::FileName -bor [IO.NotifyFilters]::DirectoryName
      $watcher.EnableRaisingEvents = $true
      $watchers += $watcher
      foreach ($eventName in @('Changed', 'Created', 'Deleted', 'Renamed')) {
        $subs += Register-ObjectEvent -InputObject $watcher -EventName $eventName -Action $fileAction
      }
    }
    $subs += Register-ObjectEvent -InputObject $global:wickedDebounce -EventName Elapsed -Action $timerAction

    while ($true) {
      Start-Sleep -Milliseconds 250
      if (-not $global:wickedWatchFlag) { continue }
      $global:wickedWatchFlag = $false
      $changed = @($global:wickedWatchPaths | Select-Object -Unique)
      $global:wickedWatchPaths = @()
      $script:RunNumber++
      Write-Host "`nSource changed: $($changed -join ', ')" -ForegroundColor Cyan
      try {
        Invoke-PublishOnce @script:PublishDefaults -RunLabel "WATCH RUN #$($script:RunNumber)"
      }
      catch {
        Write-Host "Watch run failed: $($_.Exception.Message)" -ForegroundColor Red
      }
    }
  }
  finally {
    foreach ($sub in $subs) { Unregister-Event -SubscriptionId $sub.Id -ErrorAction SilentlyContinue }
    foreach ($watcher in $watchers) {
      try { $watcher.EnableRaisingEvents = $false; $watcher.Dispose() } catch { }
    }
    try { $global:wickedDebounce.Stop(); $global:wickedDebounce.Dispose() } catch { }
    Write-Host 'Watch mode stopped.' -ForegroundColor Cyan
  }
}

# ---------------------------------------------------------------- entry point
$resolvedVersion = Resolve-PublishVersion -RequestedVersion $Version -BumpKind $Bump

if (-not $PSBoundParameters.ContainsKey('Notes') -or [string]::IsNullOrWhiteSpace($Notes)) {
  $existingNotes = Get-ReleaseScalar 'notes'
  $Notes = if ([string]::IsNullOrWhiteSpace($existingNotes)) { $defaultNotes } else { $existingNotes }
}

$script:PublishDefaults = @{
  RequestedVersion = $resolvedVersion
  BumpKind         = 'none'
  PublishNotes     = $Notes
  SkipSmokeTest    = [bool] $SkipSmoke
}

if ($Watch) { Invoke-Watch }
else { Invoke-PublishOnce @script:PublishDefaults | Out-Null }
