$WshShell = New-Object -ComObject WScript.Shell
$startupPath = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup\ClipperSkuyBot.lnk")
$Shortcut = $WshShell.CreateShortcut($startupPath)
$Shortcut.TargetPath = "wscript.exe"
$Shortcut.Arguments = '"C:\Users\kuyka\Music\opus 1\telebot\run_bot_hidden.vbs"'
$Shortcut.WindowStyle = 7
$Shortcut.WorkingDirectory = "C:\Users\kuyka\Music\opus 1\telebot"
$Shortcut.Description = "ClipperSkuy Bot Auto-Start (Hidden)"
$Shortcut.Save()
Write-Host "Startup shortcut updated to HIDDEN mode!"
Write-Host "Location: $startupPath"
