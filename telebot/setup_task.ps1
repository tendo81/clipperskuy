# Remove old task
Unregister-ScheduledTask -TaskName "ClipperSkuyBot" -Confirm:$false -ErrorAction SilentlyContinue

# Create trigger: every 3 minutes
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 3) -RepetitionDuration (New-TimeSpan -Days 9999)

# Action: run keep_alive.bat
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument '/c "C:\Users\kuyka\Music\opus 1\telebot\keep_alive.bat"'

# Settings
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

# Register without elevated
Register-ScheduledTask -TaskName "ClipperSkuyBot" -Trigger $trigger -Action $action -Settings $settings -Description "Auto-restart ClipperSkuy bot every 3 minutes" -Force

Write-Host "Task Scheduler created successfully!"
