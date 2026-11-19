# Changelog parser for the local publish pipeline.
#
# Supported format (see CHANGELOG.md):
#   ## [2.0.0] - 2026-11-18
#   - [Tag] Text of the change
#
# Get-ReleaseChanges returns an array of [pscustomobject]@{ Tag; Text } for the
# newest version section, or $null when there is nothing usable. When -Version
# is supplied, that exact section is preferred.

function Get-ReleaseChanges {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string] $Path,

    [string] $Version
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    Write-Verbose "Changelog not found: $Path"
    return $null
  }

  $lines = [IO.File]::ReadAllLines($Path)
  $sections = @()
  $current = $null

  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^\s*##\s+\[?v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\]?') {
      if ($null -ne $current) {
        $current.End = $i - 1
        $sections += $current
      }
      $current = [pscustomobject]@{
        Version = $Matches[1]
        Start   = $i + 1
        End     = $lines.Count - 1
      }
    }
  }
  if ($null -ne $current) { $sections += $current }
  if (-not $sections.Count) {
    Write-Verbose "No '## [version]' section in $Path"
    return $null
  }

  $section = $null
  if ($Version) {
    $section = $sections | Where-Object { $_.Version -eq $Version } | Select-Object -First 1
  }
  if (-not $section) {
    # Fall back to the newest section in the file.
    $section = $sections[0]
  }

  $changes = @()
  for ($i = $section.Start; $i -le $section.End; $i++) {
    if ($lines[$i] -match '^\s*-\s*\[([^\]]+)\]\s*(.+?)\s*$') {
      $changes += [pscustomobject]@{
        Tag  = $Matches[1].Trim()
        Text = $Matches[2].Trim()
      }
    }
  }

  if (-not $changes.Count) {
    Write-Verbose "No '- [Tag] text' bullets in section $($section.Version) of $Path"
    return $null
  }

  # Unary comma keeps the array intact when it is written to the pipeline.
  return ,$changes
}

Export-ModuleMember -Function Get-ReleaseChanges
