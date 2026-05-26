#requires -Version 5.1
<#
.SYNOPSIS
  Build a production-ready deploy package for Beget upload.
.DESCRIPTION
  Copies only files needed in production into D:\site-v2\dist\deploy\,
  then zips them to D:\site-v2\dist\ic-farvater-v2-deploy.zip.
  Excludes dev artifacts (git, audits, screenshots, dev scripts, etc).
.NOTES
  Re-runnable. Cleans dist/ before each build.
#>

$ErrorActionPreference = 'Stop'
$ROOT = 'D:\site-v2'
$DIST = Join-Path $ROOT 'dist'
$STAGE = Join-Path $DIST 'deploy'
$ZIP = Join-Path $DIST 'ic-farvater-v2-deploy.zip'

Write-Host "Cleaning dist/..." -ForegroundColor Cyan
if (Test-Path $DIST) { Remove-Item $DIST -Recurse -Force }
New-Item -ItemType Directory -Path $STAGE | Out-Null

Write-Host "Copying production files..." -ForegroundColor Cyan

# Top-level files that ship as-is
$rootFiles = @(
  'index.html',
  '.htaccess',
  'robots.txt',
  'sitemap.xml',
  'llms.txt'
)
foreach ($f in $rootFiles) {
  $src = Join-Path $ROOT $f
  if (Test-Path $src) {
    Copy-Item $src $STAGE
    Write-Host "  + $f" -ForegroundColor DarkGray
  } else {
    Write-Host "  ! $f MISSING" -ForegroundColor Yellow
  }
}

# Directories that ship as-is
$dirs = @(
  @{ Name = 'pages';   Filter = '*.html' },
  @{ Name = 'css';     Filter = '*.css' },
  @{ Name = 'js';      Filter = '*' },     # main.js, animations.js, *-data.js, vendor/
  @{ Name = 'assets';  Filter = '*' },     # fonts, images, favicon, icons
  @{ Name = 'scripts'; Filter = '*.php' }  # ONLY PHP — exclude *.py / *.ps1 dev tools
)
foreach ($d in $dirs) {
  $srcDir = Join-Path $ROOT $d.Name
  $dstDir = Join-Path $STAGE $d.Name
  if (-not (Test-Path $srcDir)) {
    Write-Host "  ! $($d.Name)/ MISSING" -ForegroundColor Yellow
    continue
  }
  New-Item -ItemType Directory -Path $dstDir -Force | Out-Null

  if ($d.Filter -eq '*') {
    # Full recursive copy
    Copy-Item "$srcDir\*" $dstDir -Recurse -Force
  } else {
    # Filtered copy (recursive)
    Get-ChildItem $srcDir -Recurse -File -Filter $d.Filter | ForEach-Object {
      $rel = $_.FullName.Substring($srcDir.Length + 1)
      $dst = Join-Path $dstDir $rel
      $dstParent = Split-Path $dst
      if (-not (Test-Path $dstParent)) { New-Item -ItemType Directory -Path $dstParent -Force | Out-Null }
      Copy-Item $_.FullName $dst -Force
    }
  }
  $count = (Get-ChildItem $dstDir -Recurse -File).Count
  Write-Host "  + $($d.Name)/ ($count files)" -ForegroundColor DarkGray
}

# Summary
$totalFiles = (Get-ChildItem $STAGE -Recurse -File).Count
$totalSize  = (Get-ChildItem $STAGE -Recurse -File | Measure-Object Length -Sum).Sum
$totalMB    = [math]::Round($totalSize / 1MB, 1)
Write-Host "`nStaged: $totalFiles files, $totalMB MB" -ForegroundColor Green

# Build ZIP
Write-Host "`nBuilding $ZIP..." -ForegroundColor Cyan
Compress-Archive -Path "$STAGE\*" -DestinationPath $ZIP -Force
$zipSize = [math]::Round((Get-Item $ZIP).Length / 1MB, 1)
Write-Host "Done: $ZIP ($zipSize MB)" -ForegroundColor Green

Write-Host "`n--- Excluded (dev-only) ---" -ForegroundColor Cyan
$excluded = @(
  '.git/', '.gitignore', '.claude/', '.agents/', '.lazyweb/', '.playwright-mcp/',
  '.youtube-analyze/', '.mcp.json', '.vscode/', '.idea/',
  'scripts/*.py', 'scripts/*.ps1', 'screenshots/', 'docs/', 'dist/',
  'README.md', 'DEPLOY.md', 'HANDOFF.md', 'CLAUDE.md'
)
foreach ($e in $excluded) { Write-Host "  - $e" -ForegroundColor DarkGray }

Write-Host "`nNext: upload $ZIP via Beget file manager OR drop dist\deploy\ via Termius SFTP" -ForegroundColor Yellow
