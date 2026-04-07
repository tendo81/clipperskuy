$WshShell = New-Object -ComObject WScript.Shell
$startupPath = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup\ClipperSkuyBot.lnk")
$Shortcut = $WshShell.CreateShortcut($startupPath)
$Shortcut.TargetPath = "cmd.exe"
$Shortcut.Arguments = '/c "C:\Users\kuyka\Music\opus 1\telebot\watchdog.bat"'
$Shortcut.WindowStyle = 7
$Shortcut.Description = "ClipperSkuy Bot Watchdog"
$Shortcut.Save()
Write-Host "Startup shortcut created at: $startupPath"
