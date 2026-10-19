$ErrorActionPreference = 'Stop'
$toolDir = Split-Path -Parent $PSCommandPath
. (Join-Path $toolDir 'runtime-path.ps1')

$profileDirectory = [Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile)
$expected = Join-Path $profileDirectory '.flow-arts-composer\ComposerViewer'
$actual = Get-ComposerViewerRuntimeDirectory
if ($actual -ne $expected) { throw "Unexpected runtime path: $actual" }

$outside = Join-Path $profileDirectory 'ComposerViewer-outside-runtime'
foreach ($name in @('stage-runtime.ps1', 'native-control.ps1')) {
    $ErrorActionPreference = 'Continue'
    $output = & powershell.exe -NoProfile -NonInteractive -File (Join-Path $toolDir $name) -RuntimeRoot $outside 2>&1 | Out-String
    $ErrorActionPreference = 'Stop'
    if ($LASTEXITCODE -eq 0 -or $output -notmatch 'RuntimeRoot must be inside') {
        throw "$name did not reject a runtime outside $expected"
    }
}
Write-Output "ComposerViewer runtime path and boundary checks passed: $expected"
