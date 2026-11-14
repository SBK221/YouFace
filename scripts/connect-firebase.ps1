$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$AppId = 'com.youfacetechnologies.youface'

function Set-EnvValue([string]$Key, [string]$Value) {
  $EnvPath = Join-Path $Root '.env'
  if (-not (Test-Path $EnvPath)) { Copy-Item (Join-Path $Root '.env.example') $EnvPath }
  $Lines = [System.Collections.Generic.List[string]](Get-Content $EnvPath)
  $Found = $false
  for ($i = 0; $i -lt $Lines.Count; $i++) {
    if ($Lines[$i] -match ('^' + [regex]::Escape($Key) + '=')) {
      $Lines[$i] = "$Key=$Value"
      $Found = $true
      break
    }
  }
  if (-not $Found) { $Lines.Add("$Key=$Value") }
  [System.IO.File]::WriteAllLines($EnvPath, $Lines, [System.Text.UTF8Encoding]::new($false))
}

Write-Host ''
Write-Host '==================================================' -ForegroundColor Magenta
Write-Host ' YOUFACE 0.4.2 - CONNEXION FIREBASE REELLE' -ForegroundColor Magenta
Write-Host '==================================================' -ForegroundColor Magenta
Write-Host "Identifiant Android/iOS fixe: $AppId" -ForegroundColor Cyan
Write-Host ''
Write-Host 'Dans Firebase, creez UN SEUL projet YouFace et enregistrez:'
Write-Host "  Android package: $AppId"
Write-Host "  Apple bundle ID: $AppId"
Write-Host '  Une application Web pour obtenir la configuration publique.'
Write-Host ''
Start-Process 'https://console.firebase.google.com/'

$ProjectId = Read-Host 'FIREBASE_PROJECT_ID'
$ApiKey = Read-Host 'FIREBASE_PUBLIC_API_KEY (Web app)'
$AuthDomain = Read-Host 'FIREBASE_PUBLIC_AUTH_DOMAIN (ex: projet.firebaseapp.com)'
$WebAppId = Read-Host 'FIREBASE_PUBLIC_APP_ID (Web app)'
$SenderId = Read-Host 'FIREBASE_PUBLIC_MESSAGING_SENDER_ID'

Set-EnvValue 'FIREBASE_PROJECT_ID' $ProjectId
Set-EnvValue 'FIREBASE_PUBLIC_API_KEY' $ApiKey
Set-EnvValue 'FIREBASE_PUBLIC_AUTH_DOMAIN' $AuthDomain
Set-EnvValue 'FIREBASE_PUBLIC_APP_ID' $WebAppId
Set-EnvValue 'FIREBASE_PUBLIC_MESSAGING_SENDER_ID' $SenderId
Set-EnvValue 'FIREBASE_SERVICE_ACCOUNT_JSON' ''
Set-EnvValue 'FIREBASE_SERVICE_ACCOUNT_FILE' 'secrets/firebase-service-account.json'

$AndroidJson = Read-Host 'Chemin complet vers google-services.json'
if (-not (Test-Path $AndroidJson)) { throw 'google-services.json introuvable.' }
$AndroidConfig = Get-Content $AndroidJson -Raw | ConvertFrom-Json
$Packages = @($AndroidConfig.client | ForEach-Object { $_.client_info.android_client_info.package_name })
if ($Packages -notcontains $AppId) { throw "Package Firebase Android incorrect. Attendu: $AppId. Trouve: $($Packages -join ', ')" }
Copy-Item $AndroidJson (Join-Path $Root 'android/app/google-services.json') -Force
Write-Host 'google-services.json valide et copie.' -ForegroundColor Green

$IosPlist = Read-Host 'Chemin GoogleService-Info.plist (laisser vide si vous faites Android maintenant)'
if ($IosPlist) {
  if (-not (Test-Path $IosPlist)) { throw 'GoogleService-Info.plist introuvable.' }
  $PlistText = Get-Content $IosPlist -Raw
  if ($PlistText -notmatch '<key>BUNDLE_ID</key>\s*<string>' + [regex]::Escape($AppId) + '</string>') {
    throw "Bundle ID Firebase iOS incorrect. Attendu: $AppId"
  }
  Copy-Item $IosPlist (Join-Path $Root 'ios/App/App/GoogleService-Info.plist') -Force
  Write-Host 'GoogleService-Info.plist valide et copie.' -ForegroundColor Green
}

$ServiceAccount = Read-Host 'Chemin JSON du compte de service Firebase Admin'
if (-not (Test-Path $ServiceAccount)) { throw 'Compte de service Firebase Admin introuvable.' }
$ServiceJson = Get-Content $ServiceAccount -Raw | ConvertFrom-Json
if ($ServiceJson.type -ne 'service_account') { throw 'Le JSON fourni n est pas un service_account.' }
if ($ServiceJson.project_id -ne $ProjectId) { throw "Compte de service d un autre projet: $($ServiceJson.project_id)" }
New-Item -ItemType Directory -Force (Join-Path $Root 'secrets') | Out-Null
Copy-Item $ServiceAccount (Join-Path $Root 'secrets/firebase-service-account.json') -Force
Write-Host 'Compte de service copie dans secrets/ (ignore par Git).' -ForegroundColor Green

Write-Host ''
Write-Host 'Installation et validation...' -ForegroundColor Cyan
& npm ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci a echoue.' }
& npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build clients a echoue.' }
& npx cap sync android
if ($LASTEXITCODE -ne 0) { throw 'Capacitor Android sync a echoue.' }
& npm run firebase:preflight
if ($LASTEXITCODE -ne 0) { throw 'Firebase preflight a echoue.' }

Write-Host ''
Write-Host 'Generation des empreintes SHA Android...' -ForegroundColor Cyan
& npm run firebase:fingerprints
if ($LASTEXITCODE -ne 0) {
  Write-Warning 'Empreintes non generees. Ouvrez Android Studio puis relancez npm run firebase:fingerprints.'
} else {
  Write-Host 'IMPORTANT: ajoutez SHA-1 et SHA-256 dans Firebase puis re-telechargez google-services.json.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'CONFIGURATION LOCALE FIREBASE TERMINEE.' -ForegroundColor Green
Write-Host 'Dans Firebase Authentication, activez Phone, Google et Email/Password.' -ForegroundColor Yellow
Write-Host 'Pour Phone, configurez la politique des regions SMS et autorisez vos pays de test.' -ForegroundColor Yellow
Write-Host 'Apres ajout des SHA, remplacez google-services.json par la version mise a jour et relancez 06_VALIDER_FIREBASE.cmd.' -ForegroundColor Yellow
Read-Host 'Appuyez sur Entree pour fermer'
