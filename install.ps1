# install.ps1 — Download and install AutoResearch Cockpit binary (Windows)
#
# Usage:
#   irm https://raw.githubusercontent.com/Pana-g/autoresearch-cockpit/main/install.ps1 | iex
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/Pana-g/autoresearch-cockpit/main/install.ps1))) -Uninstall
#
# Or with custom install directory:
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/Pana-g/autoresearch-cockpit/main/install.ps1))) -Dir "C:\tools"
#
param(
    [string]$Dir = "$env:LOCALAPPDATA\Programs\autoresearch-cockpit",
    [string]$Version = "",
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"
$Repo = "Pana-g/autoresearch-cockpit"
$BinaryName = "autoresearch-cockpit"
$Asset = "$BinaryName-windows-x64.exe"

if (-not (Get-Command Invoke-WebRequest -ErrorAction SilentlyContinue)) {
    Write-Error "Invoke-WebRequest is not available in this PowerShell environment. Please update PowerShell and try again."
    exit 1
}

# ── Uninstall ────────────────────────────────────────────
if ($Uninstall) {
    $ExePath = Join-Path $Dir "$BinaryName.exe"
    if (Test-Path $ExePath) {
        Remove-Item $ExePath -Force
        Write-Host "[OK] Removed $ExePath"
    } else {
        Write-Host "Nothing to uninstall - $ExePath not found"
    }

    $DataDir = Join-Path $env:USERPROFILE ".autoresearch"
    if (Test-Path $DataDir) {
        Write-Host ""
        Write-Host "Data directory found at $DataDir"
        Write-Host "  Contains your database and encryption key."
        $confirm = Read-Host "  Delete it? [y/N]"
        if ($confirm -eq 'y' -or $confirm -eq 'Y') {
            Remove-Item $DataDir -Recurse -Force
            Write-Host "[OK] Removed $DataDir"
        } else {
            Write-Host "  Kept $DataDir"
        }
    }

    # Remove from PATH
    $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($UserPath -like "*$Dir*") {
        $NewPath = ($UserPath -split ";" | Where-Object { $_ -ne $Dir }) -join ";"
        [Environment]::SetEnvironmentVariable("Path", $NewPath, "User")
        Write-Host "[OK] Removed $Dir from PATH"
    }
    exit 0
}

# Resolve version
if (-not $Version) {
    Write-Host "Fetching latest release..."
    try {
        $release = Invoke-RestMethod "https://api.github.com/repos/$Repo/releases/latest"
        $Version = $release.tag_name
    } catch {
        Write-Error "Could not determine latest release version: $_"
        exit 1
    }
}

$DownloadUrl = "https://github.com/$Repo/releases/download/$Version/$Asset"

Write-Host "AutoResearch Cockpit installer"
Write-Host "  Version:  $Version"
Write-Host "  Platform: windows-x64"
Write-Host "  Install:  $Dir\$BinaryName.exe"
Write-Host ""

# Create install directory
if (!(Test-Path $Dir)) {
    New-Item -ItemType Directory -Path $Dir -Force | Out-Null
}

# Download
$OutFile = Join-Path $Dir "$BinaryName.exe"
Write-Host "Downloading $DownloadUrl..."
try {
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $OutFile -UseBasicParsing
} catch {
    Write-Error "Download failed. Check that release $Version exists and has asset '$Asset'."
    Write-Host "  Releases: https://github.com/$Repo/releases"
    if (Test-Path $OutFile) { Remove-Item $OutFile }
    exit 1
}

Write-Host ""
Write-Host "[OK] Installed $BinaryName $Version to $OutFile"

# Check if install dir is in PATH
$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($UserPath -notlike "*$Dir*") {
    Write-Host ""
    Write-Host "Adding $Dir to your PATH..."
    [Environment]::SetEnvironmentVariable("Path", "$UserPath;$Dir", "User")
    $env:Path = "$env:Path;$Dir"
    Write-Host "[OK] Added to PATH (restart your terminal to pick it up)"
}

Write-Host ""
Write-Host "Run it:"
Write-Host "  $BinaryName                  # start backend + frontend"
Write-Host "  $BinaryName backend          # backend API only"
Write-Host "  $BinaryName frontend         # frontend only"
Write-Host "  $BinaryName --help           # see all options"
Write-Host ""
Write-Host "Uninstall:"
Write-Host "  & ([scriptblock]::Create((irm https://raw.githubusercontent.com/$Repo/main/install.ps1))) -Uninstall"
