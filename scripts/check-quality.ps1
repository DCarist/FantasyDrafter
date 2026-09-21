<#
.SYNOPSIS
    Runs code quality checks across JavaScript, HTML, CSS, and Python.
.DESCRIPTION
    Convenience wrapper around node scripts/check-quality.mjs.
    Supports running all tools or filtering by specific tool (biome, ruff, ty, py, tests).
.PARAMETER Tool
    Specific tool or suite to run ('all', 'biome', 'ruff', 'ty', 'py', 'tests').
.PARAMETER Fix
    Automatically apply formatting and safe lint fixes.
.EXAMPLE
    .\scripts\check-quality.ps1
    .\scripts\check-quality.ps1 -Tool biome
    .\scripts\check-quality.ps1 -Tool py
    .\scripts\check-quality.ps1 -Fix
#>
[CmdletBinding()]
param(
    [ValidateSet('all', 'biome', 'ruff', 'ty', 'py', 'tests')]
    [string]$Tool = 'all',

    [switch]$Fix
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeScript = Join-Path $scriptDir "check-quality.mjs"

$cmdArgs = @($nodeScript, "--tool=$Tool")
if ($Fix) {
    $cmdArgs += "--fix"
}

node $cmdArgs
exit $LASTEXITCODE

