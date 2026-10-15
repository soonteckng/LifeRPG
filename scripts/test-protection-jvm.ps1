[CmdletBinding()]
param(
  [string]$GradleLibraryPath,
  [string]$CacheRepository = (Join-Path $env:USERPROFILE '.gradle\caches\modules-2\files-2.1'),
  [string]$JavaExecutable = 'java',
  [string]$OutputDirectory
)

# Uses already installed compiler/test jars; it never installs tooling, changes
# global caches, or requires an Android SDK. EAS separately compiles Android APIs.
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourceRoot = Join-Path $projectRoot 'modules\focus-protection-spike\android\src'
if (-not $OutputDirectory) {
  $OutputDirectory = Join-Path $projectRoot '.native-protection-jvm'
}
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
if (-not $resolvedOutput.StartsWith($projectRoot + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'The JVM test output directory must stay inside this checkout.'
}

if (-not $GradleLibraryPath) {
  $distributionRoot = Join-Path $env:USERPROFILE '.gradle\wrapper\dists'
  if (Test-Path -LiteralPath $distributionRoot) {
    foreach ($distribution in Get-ChildItem -LiteralPath $distributionRoot -Directory | Sort-Object Name -Descending) {
      foreach ($installation in Get-ChildItem -LiteralPath $distribution.FullName -Directory) {
        $candidateLibraries = @(Get-ChildItem -LiteralPath $installation.FullName -Directory | ForEach-Object { Join-Path $_.FullName 'lib' })
        foreach ($candidateLibrary in $candidateLibraries) {
          if ((Test-Path -LiteralPath $candidateLibrary) -and @(Get-ChildItem -LiteralPath $candidateLibrary -Filter 'kotlin-compiler-embeddable-*.jar').Count -gt 0) {
            $GradleLibraryPath = $candidateLibrary
            break
          }
        }
        if ($GradleLibraryPath) { break }
      }
      if ($GradleLibraryPath) { break }
    }
  }
}
if (-not $GradleLibraryPath -or -not (Test-Path -LiteralPath $GradleLibraryPath)) {
  throw 'No cached Kotlin compiler found. Pass an existing Gradle lib folder with -GradleLibraryPath; this script does not download one.'
}

function Find-CachedJar {
  param([string]$Group, [string]$Artifact)
  $artifactRoot = Join-Path (Join-Path $CacheRepository $Group) $Artifact
  if (-not (Test-Path -LiteralPath $artifactRoot)) { throw "Missing cached test dependency: $Group/$Artifact" }
  $jar = Get-ChildItem -LiteralPath $artifactRoot -Filter '*.jar' -File -Recurse |
    Where-Object { $_.Name -notmatch '-sources\.jar$|-javadoc\.jar$' } |
    Sort-Object FullName -Descending | Select-Object -First 1
  if (-not $jar) { throw "Missing cached test jar: $Group/$Artifact" }
  return $jar.FullName
}

$stdlib = Get-ChildItem -LiteralPath $GradleLibraryPath -Filter 'kotlin-stdlib-*.jar' -File |
  Where-Object { $_.Name -match '^kotlin-stdlib-\d' } | Select-Object -First 1
$annotations = Get-ChildItem -LiteralPath $GradleLibraryPath -Filter 'annotations-*.jar' -File | Select-Object -First 1
if (-not $stdlib -or -not $annotations) { throw 'Compiler cache is missing Kotlin stdlib or annotation jars.' }
$junit = Get-ChildItem -LiteralPath $GradleLibraryPath -Filter 'junit-4*.jar' -File | Select-Object -First 1
if (-not $junit) { $junitPath = Find-CachedJar -Group 'junit' -Artifact 'junit' }
else { $junitPath = $junit.FullName }
$jsonPath = Find-CachedJar -Group 'org.json' -Artifact 'json'
$hamcrestPath = Find-CachedJar -Group 'org.hamcrest' -Artifact 'hamcrest-core'
$compileClasspath = @($stdlib.FullName, $annotations.FullName, $junitPath, $jsonPath, $hamcrestPath) -join [System.IO.Path]::PathSeparator

$sourceNames = @('ProtectionPolicy.kt', 'DefaultNetworkState.kt')
$sourceFiles = @($sourceNames | ForEach-Object { Join-Path $sourceRoot "main\java\expo\modules\focusprotection\$_" })
$testRoot = Join-Path $sourceRoot 'test\java\expo\modules\focusprotection'
foreach ($sourceFile in $sourceFiles) {
  if (-not (Test-Path -LiteralPath $sourceFile)) { throw "Missing native policy source: $sourceFile" }
}
if (-not (Test-Path -LiteralPath $testRoot)) { throw 'Native JVM tests are not present yet.' }
$testFiles = @(Get-ChildItem -LiteralPath $testRoot -Filter '*Test.kt' -File | Sort-Object Name | Select-Object -ExpandProperty FullName)
if ($testFiles.Count -eq 0) { throw 'No native JUnit test files found.' }
$testClasses = @($testFiles | ForEach-Object {
  $testText = Get-Content -LiteralPath $_ -Raw
  $testClassMatch = [regex]::Match($testText, '\bclass\s+(\w+Test)\b')
  if (-not $testClassMatch.Success) { throw "Unable to identify the JUnit class in $_" }
  'expo.modules.focusprotection.' + $testClassMatch.Groups[1].Value
})

$runDirectory = Join-Path $resolvedOutput (Get-Date -Format 'yyyyMMddHHmmssfff')
$classesDirectory = Join-Path $runDirectory 'classes'
New-Item -ItemType Directory -Path $classesDirectory -Force | Out-Null
$compilerArguments = @('-cp', (Join-Path $GradleLibraryPath '*'), 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
  '-no-stdlib', '-no-reflect', '-jvm-target', '11', '-classpath', $compileClasspath, '-d', $classesDirectory)
$compilerArguments += $sourceFiles
$compilerArguments += $testFiles
Write-Output 'Compiling the real Kotlin protection policy and JVM tests from source.'
& $JavaExecutable @compilerArguments
if ($LASTEXITCODE -ne 0) { throw "Kotlin compilation failed with exit code $LASTEXITCODE." }

$runtimeClasspath = @($classesDirectory, $compileClasspath) -join [System.IO.Path]::PathSeparator
$junitArguments = @("-Dliferpg.projectRoot=$projectRoot", '-cp', $runtimeClasspath, 'org.junit.runner.JUnitCore')
$junitArguments += $testClasses
Write-Output 'Running JUnit against the compiled Kotlin implementation.'
Push-Location -LiteralPath $projectRoot
try {
  & $JavaExecutable @junitArguments
  if ($LASTEXITCODE -ne 0) { throw "Native JUnit tests failed with exit code $LASTEXITCODE." }
} finally { Pop-Location }
Write-Output 'Native policy/parser JVM checks passed. Android framework compilation and device checks are separate.'
