$content = Get-Content "backend\src\services\license.js" -Raw
$content = $content -replace 'datetime\("now"\)', "datetime('now')"
Set-Content "backend\src\services\license.js" $content
Write-Host "Done. Replaced datetime(""now"") with datetime('now')"
