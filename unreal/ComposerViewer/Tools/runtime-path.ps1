function Get-ComposerViewerRuntimeDirectory {
    $userProfile = [Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile)
    if (-not $userProfile -or -not [IO.Path]::IsPathRooted($userProfile)) {
        throw 'Cannot resolve the current Windows user profile.'
    }
    return Join-Path $userProfile '.flow-arts-composer\ComposerViewer'
}
