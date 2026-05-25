#requires -Version 5.1

param(
  [string]$Repo = 'kaalabs/kltools',
  [string]$InstallDir = $(Join-Path $env:LOCALAPPDATA 'mcporter'),
  [switch]$SkipPathUpdate,
  [string]$TargetArch
)

$ErrorActionPreference = 'Stop'

function Write-Note([string]$Message) {
  Write-Host $Message
}

function Fail([string]$Message) {
  Write-Error $Message
  exit 1
}

function Normalize-Arch([string]$ArchRaw) {
  switch ($ArchRaw.ToLowerInvariant()) {
    'amd64' { return 'amd64' }
    'x64' { return 'amd64' }
    'x86_64' { return 'amd64' }
    default { return $ArchRaw.ToLowerInvariant() }
  }
}

function Get-Host-Arch() {
  if ($TargetArch) {
    return (Normalize-Arch $TargetArch)
  }

  try {
    return (Normalize-Arch ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()))
  } catch {
    return (Normalize-Arch $env:PROCESSOR_ARCHITECTURE)
  }
}

function Add-To-User-Path([string]$Dir) {
  $dirFull = (Resolve-Path -LiteralPath $Dir).Path

  $currentUserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if ([string]::IsNullOrWhiteSpace($currentUserPath)) {
    $currentUserPath = ''
  }

  $parts = $currentUserPath.Split(';') | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  $already = $false
  foreach ($p in $parts) {
    try {
      if ((Resolve-Path -LiteralPath $p -ErrorAction SilentlyContinue).Path -eq $dirFull) {
        $already = $true
        break
      }
    } catch {
      # ignore
    }

    if ($p.TrimEnd('\') -ieq $dirFull.TrimEnd('\')) {
      $already = $true
      break
    }
  }

  if ($already) {
    return
  }

  $newUserPath = ($parts + $dirFull) -join ';'
  [Environment]::SetEnvironmentVariable('Path', $newUserPath, 'User')
  $env:Path = "$env:Path;$dirFull"

  Write-Note "Added to user PATH (restart your terminal for it to take effect everywhere): $dirFull"
}

try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
} catch {
  # ignore
}

if (($PSVersionTable.PSEdition -eq 'Core') -and (($IsLinux) -or ($IsMacOS))) {
  Fail 'This installer is for Windows PowerShell / PowerShell on Windows only.'
}

$arch = Get-Host-Arch

$assetCandidates = @()
switch ($arch) {
  'amd64' {
    $assetCandidates += 'mcporter-latest-windows-amd64.zip'
    $assetCandidates += 'mcporter-latest-windows-x86_64.zip'
  }
  default {
    Fail "Unsupported Windows architecture: $arch"
  }
}

$tempDir = Join-Path ([IO.Path]::GetTempPath()) ([Guid]::NewGuid().ToString('n'))
New-Item -ItemType Directory -Path $tempDir | Out-Null

try {
  $archivePath = Join-Path $tempDir 'mcporter.zip'

  $downloaded = $false
  $downloadUrl = $null

  foreach ($asset in $assetCandidates) {
    $url = "https://github.com/$Repo/releases/latest/download/$asset"
    Write-Note "Downloading: $url"

    try {
      Invoke-WebRequest -Uri $url -OutFile $archivePath -UseBasicParsing
      $downloaded = $true
      $downloadUrl = $url
      break
    } catch {
      Write-Note "  (not found)"
      if (Test-Path -LiteralPath $archivePath) {
        Remove-Item -Force -LiteralPath $archivePath
      }
    }
  }

  if (-not $downloaded) {
    $cands = ($assetCandidates | ForEach-Object { "  - $_" }) -join "`n"
    Fail "No matching release asset found for $Repo on Windows/$arch.`nTried:`n$cands"
  }

  Write-Note "Downloaded: $downloadUrl"
  Write-Note "Installing to: $InstallDir"

  if (Test-Path -LiteralPath $InstallDir) {
    Get-ChildItem -LiteralPath $InstallDir -Force | ForEach-Object {
      Remove-Item -Recurse -Force -LiteralPath $_.FullName
    }
  }

  New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
  Expand-Archive -Path $archivePath -DestinationPath $InstallDir -Force

  $exePath = Join-Path $InstallDir 'mcporter.exe'
  if (-not (Test-Path -LiteralPath $exePath)) {
    Fail "Install failed: mcporter.exe not found in $InstallDir"
  }

  $binDir = Join-Path $InstallDir 'bin'
  New-Item -ItemType Directory -Path $binDir -Force | Out-Null

  $cmdPath = Join-Path $binDir 'mcporter.cmd'
  $cmd = @(
    '@echo off',
    'setlocal',
    "cd /d `"$InstallDir`"",
    '"%CD%\mcporter.exe" %*'
  ) -join "`r`n"

  [IO.File]::WriteAllText($cmdPath, $cmd, [Text.Encoding]::ASCII)

  if (-not $SkipPathUpdate) {
    Add-To-User-Path $binDir
  } else {
    Write-Note "Skipping PATH update. Run with: $cmdPath"
  }

  Write-Note "Installed. Run: mcporter"
} finally {
  if (Test-Path -LiteralPath $tempDir) {
    Remove-Item -Recurse -Force -LiteralPath $tempDir
  }
}
