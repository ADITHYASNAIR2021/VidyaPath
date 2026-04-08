$ErrorActionPreference = 'Stop'

$root = Join-Path (Split-Path -Parent $PSScriptRoot) 'dataset/cbse_papers'
$outputPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'lib/hfPaperIndex.json'

if (-not (Test-Path $root)) {
  Write-Error "Dataset folder not found: $root"
}

function Get-CanonicalSubject([string]$filename) {
  if ($filename -match 'biology|\bbio\b' -and $filename -notmatch 'biotechnology') { return 'Biology' }
  if ($filename -match 'chem') { return 'Chemistry' }
  if (($filename -match 'physics') -or ($filename -match '(?:^|[^a-z])phy(?:[^a-z]|$)')) { return 'Physics' }
  if ($filename -match 'mathematics|maths|math') { return 'Math' }
  if (($filename -match 'science') -or ($filename -match '(?:^|[^a-z])sci(?:[^a-z]|$)')) {
    if ($filename -notmatch 'social[-_ ]?science|computer[-_ ]?science|home[-_ ]?science|data[-_ ]?science|library[-_ ]?information[-_ ]?science|political[-_ ]?science|applied[-_ ]?mathematics') {
      return 'Science'
    }
  }

  return $null
}

function Get-MathVariant([string]$filename, [string]$relativeLower) {
  if ($filename -match 'basic' -or $relativeLower -match '/math\s*b/') { return 'basic' }
  if ($filename -match 'standard|\bstd\b' -or $relativeLower -match '/math\s*s/') { return 'standard' }
  return 'default'
}

function Get-Score([string]$relativeLower, [string]$filename, [string]$paperType, [string]$subject) {
  $score = 100

  if ($relativeLower -match 'zip_extracted') { $score -= 35 }
  if ($filename -match 'for vi|visually impaired|blind|\(b\)|\bvi\b') { $score -= 45 }
  if ($filename -match 'sample') { $score -= 25 }
  if ($filename -match 'marking|scheme') { $score -= 25 }
  if ($subject -eq 'Math' -and $filename -match 'applied') { $score -= 30 }
  if ($subject -eq 'Science' -and $filename -match 'social') { $score -= 40 }
  if ($filename -match [regex]::Escape($subject.ToLower())) { $score += 15 }
  if ($paperType -eq 'compartment' -and $relativeLower -match 'comptt|compartment') { $score += 10 }

  $score -= [Math]::Floor($relativeLower.Length / 70)
  return $score
}

$index = @{}
$files = Get-ChildItem $root -Recurse -File -Filter *.pdf

foreach ($file in $files) {
  $relativePath = ($file.FullName.Substring($root.Length + 1) -replace '\\', '/')
  if ($relativePath -notmatch '^(?<year>\d{4}(?:-COMPTT)?)/Class_(?<cls>10|12)/') { continue }

  $yearToken = $Matches['year']
  $classLevel = [int]$Matches['cls']
  $paperType = if ($yearToken -like '*-COMPTT') { 'compartment' } else { 'board' }
  $year = [int]$yearToken.Substring(0, 4)

  $filename = $file.Name.ToLower()
  $subject = Get-CanonicalSubject $filename
  if (-not $subject) { continue }

  if ($classLevel -eq 10 -and $subject -in @('Physics', 'Chemistry', 'Biology')) {
    # Class 10 board data is represented as Science in the app domain model.
    $subject = 'Science'
  }

  if ($classLevel -eq 12 -and $subject -eq 'Science') { continue }
  if ($classLevel -eq 10 -and $subject -notin @('Science', 'Math')) { continue }
  if ($classLevel -eq 12 -and $subject -notin @('Physics', 'Chemistry', 'Biology', 'Math')) { continue }

  $variant = if ($subject -eq 'Math' -and $classLevel -eq 10) {
    Get-MathVariant $filename $relativePath.ToLower()
  } else {
    'default'
  }

  $key = "$paperType|$year|$classLevel|$subject|$variant"
  $score = Get-Score $relativePath.ToLower() $filename $paperType $subject

  if (-not $index.ContainsKey($key) -or $score -gt $index[$key].score) {
    $index[$key] = [ordered]@{
      path = $relativePath
      score = $score
    }
  }
}

$output = [ordered]@{}
foreach ($key in ($index.Keys | Sort-Object)) {
  $output[$key] = $index[$key].path
}

$json = $output | ConvertTo-Json -Depth 4
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($outputPath, $json, $utf8NoBom)
Write-Output "Generated $($output.Count) entries at $outputPath"
