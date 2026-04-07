$WshShell = New-Object -ComObject WScript.Shell
$startupPath = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup\ClipperSkuyBot.lnk")
$Shortcut = $WshShell.CreateShortcut($startupPath)
$Shortcut.TargetPath = "cmd.exe"
$Shortcut.Arguments = '/c "C:\Users\kuyka\Music\opus 1\telebot\run_bot.bat"'
$Shortcut.WindowStyle = 7
$Shortcut.WorkingDirectory = "C:\Users\kuyka\Music\opus 1\telebot"
$Shortcut.Description = "ClipperSkuy Bot Auto-Start"
$Shortcut.Save()
Write-Host "Startup shortcut updated to run_bot.bat!"
Write-Host "Location: $startupPath"
