param(
  [switch] $CheckOnly,
  [string] $UsageDir
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not [string]::IsNullOrWhiteSpace($UsageDir)) {
  $usageDir = $UsageDir
} elseif ($env:CODEX_USAGE_ASSISTANT_DATA_DIR) {
  $usageDir = $env:CODEX_USAGE_ASSISTANT_DATA_DIR
} else {
  $base = $env:LOCALAPPDATA
  if (-not $base) {
    $base = Join-Path $env:USERPROFILE "AppData\Local"
  }
  $usageDir = Join-Path $base "AIUsageAssistant\usage"
}
$summaryPath = Join-Path $usageDir "latest-user-summary.json"
$snapshotPath = Join-Path $usageDir "latest-usage.json"
$centerPath = Join-Path $usageDir "usage-center.html"
$collectorPath = Join-Path $scriptDir "collector.mjs"
$pidPath = Join-Path $usageDir "widget.pid"
$nodePath = "C:\nvm4w\nodejs\node.exe"

if (-not (Test-Path -LiteralPath $nodePath)) {
  $nodePath = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
}

function Invoke-CollectorCommand {
  param(
    [string[]] $CollectorArgs,
    [switch] $Wait
  )

  if (-not $nodePath -or -not (Test-Path -LiteralPath $collectorPath)) {
    return
  }

  $args = @("`"$collectorPath`"") + $CollectorArgs + @("--out", "`"$usageDir`"")
  $process = Start-Process -FilePath $nodePath -ArgumentList $args -WindowStyle Hidden -PassThru
  if ($Wait -and $process) {
    [void] $process.WaitForExit(15000)
  }
}

function Invoke-Collector([switch] $Wait) {
  if ($Wait) {
    Invoke-CollectorCommand -CollectorArgs @("scan", "--quiet") -Wait
  } else {
    Invoke-CollectorCommand -CollectorArgs @("scan", "--quiet")
  }
}

function Set-SessionLock([string] $SessionId) {
  if (-not $SessionId) {
    return
  }
  Invoke-CollectorCommand -CollectorArgs @("lock", "--session", $SessionId, "--quiet") -Wait
}

function Clear-SessionLock {
  Invoke-CollectorCommand -CollectorArgs @("unlock", "--quiet") -Wait
}

function Read-UsageSummary {
  if (-not (Test-Path -LiteralPath $summaryPath)) {
    Invoke-Collector -Wait
  }

  if (-not (Test-Path -LiteralPath $summaryPath)) {
    return $null
  }

  $raw = Get-Content -Raw -Encoding UTF8 -LiteralPath $summaryPath
  if (-not $raw.Trim()) {
    return $null
  }

  return $raw | ConvertFrom-Json
}

function Read-UsageSnapshot {
  if (-not (Test-Path -LiteralPath $snapshotPath)) {
    Invoke-Collector -Wait
  }

  if (-not (Test-Path -LiteralPath $snapshotPath)) {
    return $null
  }

  $raw = Get-Content -Raw -Encoding UTF8 -LiteralPath $snapshotPath
  if (-not $raw.Trim()) {
    return $null
  }

  return $raw | ConvertFrom-Json
}

function Format-CompactNumber($value) {
  $n = 0.0
  if ($null -ne $value) {
    $n = [double] $value
  }
  if ($n -ge 1000000) {
    return ("{0:0.#}M" -f ($n / 1000000))
  }
  if ($n -ge 1000) {
    return ("{0:0.#}k" -f ($n / 1000))
  }
  return ("{0:0}" -f $n)
}

function Format-Percent($value) {
  $n = 0.0
  if ($null -ne $value) {
    $n = [double] $value
  }
  return ("{0:0.#}%" -f ($n * 100))
}

function Get-LevelColor($level) {
  switch ($level) {
    "great" { return [Drawing.Color]::FromArgb(20, 125, 104) }
    "ok" { return [Drawing.Color]::FromArgb(42, 101, 173) }
    "watch" { return [Drawing.Color]::FromArgb(156, 94, 24) }
    "danger" { return [Drawing.Color]::FromArgb(170, 60, 60) }
    default { return [Drawing.Color]::FromArgb(42, 101, 173) }
  }
}

function T($base64) {
  return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($base64))
}

function Get-MonitorTitle($data) {
  if (-not $data) {
    return T "6K+75Y+W5LitLi4u"
  }

  $taskTitle = [string] $data.taskTitle
  if ([string]::IsNullOrWhiteSpace($taskTitle) -and $data.latestTask) {
    $taskTitle = Get-TaskDisplayName $data.latestTask
  }
  if ([string]::IsNullOrWhiteSpace($taskTitle)) {
    $taskTitle = [string] $data.activeSession.effectiveSessionId
  }
  if ([string]::IsNullOrWhiteSpace($taskTitle)) {
    $taskTitle = T "6K+75Y+W5LitLi4u"
  }

  if ($data.activeSession -and $data.activeSession.mode -eq "locked") {
    if ($data.activeSession.matched) {
      return (T "5q2j5Zyo55uR5o6n77ya") + $taskTitle
    }
    return (T "5pyq5om+5Yiw77ya") + [string] $data.activeSession.requestedSessionId
  }

  return (T "5q2j5Zyo55uR5o6n77ya") + $taskTitle
}

function Get-MonitorModeText($data) {
  if ($data -and $data.activeSession -and $data.activeSession.mode -eq "locked" -and -not $data.activeSession.matched) {
    return (T "5pyq5om+5Yiw77ya") + [string] $data.activeSession.requestedSessionId
  }

  if ($data) {
    $taskTitle = [string] $data.taskTitle
    if ([string]::IsNullOrWhiteSpace($taskTitle) -and $data.latestTask) {
      $taskTitle = Get-TaskDisplayName $data.latestTask
    }
    if (-not [string]::IsNullOrWhiteSpace($taskTitle)) {
      return (T "5b2T5YmN5Lya6K+d77ya") + $taskTitle
    }
  }

  if ($data -and $data.activeSession -and $data.activeSession.mode -eq "locked") {
    if ($data.activeSession.matched) {
      return T "6ZSB5a6a77ya5Y+q55yL6L+Z5Liq5Lya6K+d"
    }
    return T "6ZSB5a6a5bey5aSx5pWI77yM6K+36YeN5paw6YCJ5oup"
  }

  return T "6Ieq5Yqo77ya5pyA6L+R5rS76LeD5Lya6K+d"
}

if ($CheckOnly) {
  $summary = Read-UsageSummary
  if (-not $summary) {
    throw "No usage summary found."
  }

  [pscustomobject]@{
    status = $summary.statusLabel
    task = $summary.taskTitle
    mode = $summary.activeSession.mode
    session = $summary.activeSession.effectiveSessionId
    contextUsage = Format-Percent $summary.contextUsageRate
    lastInput = Format-CompactNumber $summary.last.inputTokens
    lastOutput = Format-CompactNumber $summary.last.outputTokens
    avgInput = Format-CompactNumber $summary.total.avgInputTokens
  } | ConvertTo-Json -Compress
  return
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;

public class CodexUsageNative {
  [DllImport("Gdi32.dll", EntryPoint = "CreateRoundRectRgn")]
  public static extern IntPtr CreateRoundRectRgn(int left, int top, int right, int bottom, int width, int height);

  [DllImport("user32.dll")]
  public static extern bool ReleaseCapture();

  [DllImport("user32.dll")]
  public static extern IntPtr SendMessage(IntPtr hWnd, int msg, int wParam, int lParam);
}

public class CodexUsageSessionItem {
  public string Text { get; set; }
  public string SessionId { get; set; }
  public bool IsAuto { get; set; }

  public override string ToString() {
    return Text;
  }
}
"@

$createdNew = $false
$mutex = New-Object Threading.Mutex($true, "Global\UsageAssistantWidget", [ref] $createdNew)
if (-not $createdNew) {
  return
}

if (-not (Test-Path -LiteralPath $usageDir)) {
  New-Item -ItemType Directory -Force -Path $usageDir | Out-Null
}
Set-Content -LiteralPath $pidPath -Value $PID -Encoding ASCII

[Windows.Forms.Application]::EnableVisualStyles()
[Windows.Forms.Application]::SetCompatibleTextRenderingDefault($false)

$fontFamily = "Microsoft YaHei UI"
$ink = [Drawing.Color]::FromArgb(24, 32, 42)
$muted = [Drawing.Color]::FromArgb(99, 111, 128)
$soft = [Drawing.Color]::FromArgb(244, 246, 248)
$line = [Drawing.Color]::FromArgb(218, 224, 232)

$form = New-Object Windows.Forms.Form
$form.Text = T "QUkg55So6YeP5Yqp5omL"
$form.FormBorderStyle = [Windows.Forms.FormBorderStyle]::None
$form.StartPosition = [Windows.Forms.FormStartPosition]::Manual
$form.Size = New-Object Drawing.Size(338, 204)
$form.BackColor = [Drawing.Color]::White
$form.TopMost = $true
$form.ShowInTaskbar = $false
$form.Opacity = 0.98

$workArea = [Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$form.Location = New-Object Drawing.Point(($workArea.Right - $form.Width - 18), ($workArea.Bottom - $form.Height - 18))
$form.Region = [Drawing.Region]::FromHrgn([CodexUsageNative]::CreateRoundRectRgn(0, 0, $form.Width, $form.Height, 18, 18))

$title = New-Object Windows.Forms.Label
$title.Text = T "QUkg55So6YeP5Yqp5omL"
$title.Font = New-Object Drawing.Font($fontFamily, 10.5, [Drawing.FontStyle]::Bold)
$title.ForeColor = $ink
$title.Location = New-Object Drawing.Point(18, 14)
$title.Size = New-Object Drawing.Size(110, 24)

$status = New-Object Windows.Forms.Label
$status.Text = T "562J5b6F"
$status.Font = New-Object Drawing.Font($fontFamily, 8.5, [Drawing.FontStyle]::Bold)
$status.ForeColor = [Drawing.Color]::White
$status.TextAlign = [Drawing.ContentAlignment]::MiddleCenter
$status.Location = New-Object Drawing.Point(224, 14)
$status.Size = New-Object Drawing.Size(74, 24)
$status.BackColor = Get-LevelColor "ok"
$status.Region = [Drawing.Region]::FromHrgn([CodexUsageNative]::CreateRoundRectRgn(0, 0, $status.Width, $status.Height, 12, 12))

$closeButton = New-Object Windows.Forms.Label
$closeButton.Text = "X"
$closeButton.Font = New-Object Drawing.Font($fontFamily, 8.5, [Drawing.FontStyle]::Bold)
$closeButton.ForeColor = $muted
$closeButton.BackColor = [Drawing.Color]::White
$closeButton.TextAlign = [Drawing.ContentAlignment]::MiddleCenter
$closeButton.Location = New-Object Drawing.Point(306, 16)
$closeButton.Size = New-Object Drawing.Size(18, 18)
$closeButton.Cursor = [Windows.Forms.Cursors]::Hand
$closeButton.Add_MouseEnter({
  $closeButton.BackColor = [Drawing.Color]::FromArgb(248, 240, 240)
  $closeButton.ForeColor = Get-LevelColor "danger"
})
$closeButton.Add_MouseLeave({
  $closeButton.BackColor = [Drawing.Color]::White
  $closeButton.ForeColor = $muted
})
$closeButton.Add_Click({
  $form.Close()
})

$task = New-Object Windows.Forms.Label
$task.Text = T "6K+75Y+W5LitLi4u"
$task.Font = New-Object Drawing.Font($fontFamily, 8.2, [Drawing.FontStyle]::Bold)
$task.ForeColor = $ink
$task.Location = New-Object Drawing.Point(18, 42)
$task.Size = New-Object Drawing.Size(302, 20)
$task.AutoEllipsis = $true

$contextValue = New-Object Windows.Forms.Label
$contextValue.Text = "0%"
$contextValue.Font = New-Object Drawing.Font($fontFamily, 26, [Drawing.FontStyle]::Bold)
$contextValue.ForeColor = $ink
$contextValue.Location = New-Object Drawing.Point(17, 64)
$contextValue.Size = New-Object Drawing.Size(142, 52)

$contextLabel = New-Object Windows.Forms.Label
$contextLabel.Text = T "5LiK5LiL5paH5Y2g5q+U"
$contextLabel.Font = New-Object Drawing.Font($fontFamily, 8.2)
$contextLabel.ForeColor = $muted
$contextLabel.Location = New-Object Drawing.Point(17, 113)
$contextLabel.Size = New-Object Drawing.Size(110, 20)

$barTrack = New-Object Windows.Forms.Panel
$barTrack.Location = New-Object Drawing.Point(160, 79)
$barTrack.Size = New-Object Drawing.Size(160, 10)
$barTrack.BackColor = $soft
$barTrack.Region = [Drawing.Region]::FromHrgn([CodexUsageNative]::CreateRoundRectRgn(0, 0, $barTrack.Width, $barTrack.Height, 8, 8))

$barFill = New-Object Windows.Forms.Panel
$barFill.Location = New-Object Drawing.Point(0, 0)
$barFill.Size = New-Object Drawing.Size(1, 10)
$barFill.BackColor = Get-LevelColor "ok"
$barFill.Region = [Drawing.Region]::FromHrgn([CodexUsageNative]::CreateRoundRectRgn(0, 0, $barFill.Width, $barFill.Height, 8, 8))
$barTrack.Controls.Add($barFill)

$hint = New-Object Windows.Forms.Label
$hint.Text = T "5q+P6L2u57uT5p2f5ZCO6Ieq5Yqo5pu05paw"
$hint.Font = New-Object Drawing.Font($fontFamily, 8.2)
$hint.ForeColor = $muted
$hint.Location = New-Object Drawing.Point(160, 99)
$hint.Size = New-Object Drawing.Size(160, 18)
$hint.AutoEllipsis = $true

function New-MetricLabel($x, $caption) {
  $panel = New-Object Windows.Forms.Panel
  $panel.Location = New-Object Drawing.Point($x, 156)
  $panel.Size = New-Object Drawing.Size(86, 38)

  $value = New-Object Windows.Forms.Label
  $value.Text = "-"
  $value.Font = New-Object Drawing.Font($fontFamily, 11.5, [Drawing.FontStyle]::Bold)
  $value.ForeColor = $ink
  $value.Location = New-Object Drawing.Point(0, 0)
  $value.Size = New-Object Drawing.Size(86, 19)
  $value.TextAlign = [Drawing.ContentAlignment]::MiddleLeft

  $label = New-Object Windows.Forms.Label
  $label.Text = $caption
  $label.Font = New-Object Drawing.Font($fontFamily, 7.6)
  $label.ForeColor = $muted
  $label.Location = New-Object Drawing.Point(0, 20)
  $label.Size = New-Object Drawing.Size(86, 16)

  $panel.Controls.Add($value)
  $panel.Controls.Add($label)
  $form.Controls.Add($panel)
  return $value
}

$inputMetric = New-MetricLabel 21 (T "5pys6L2u6L6T5YWl")
$outputMetric = New-MetricLabel 117 (T "5pys6L2u6L6T5Ye6")
$avgMetric = New-MetricLabel 213 (T "5bmz5Z2H6L6T5YWl")

$script:isUpdatingSessionCombo = $false
$sessionCombo = New-Object Windows.Forms.ComboBox
$sessionCombo.Font = New-Object Drawing.Font($fontFamily, 8.0)
$sessionCombo.DropDownStyle = [Windows.Forms.ComboBoxStyle]::DropDownList
$sessionCombo.FlatStyle = [Windows.Forms.FlatStyle]::Flat
$sessionCombo.DrawMode = [Windows.Forms.DrawMode]::OwnerDrawFixed
$sessionCombo.ItemHeight = 18
$sessionCombo.BackColor = [Drawing.Color]::White
$sessionCombo.ForeColor = $ink
$sessionCombo.Location = New-Object Drawing.Point(160, 119)
$sessionCombo.Size = New-Object Drawing.Size($barTrack.Width, 24)
$sessionCombo.MaxDropDownItems = 8
$sessionCombo.Add_DrawItem({
  param($sender, $eventArgs)

  $text = [string] $sender.Text
  if ($eventArgs.Index -ge 0 -and $eventArgs.Index -lt $sender.Items.Count) {
    $text = [string] $sender.Items[$eventArgs.Index]
  }

  $isSelected = (($eventArgs.State -band [Windows.Forms.DrawItemState]::Selected) -ne 0)
  $backColor = $sender.BackColor
  if ($isSelected -and $sender.DroppedDown) {
    $backColor = [Drawing.Color]::FromArgb(238, 243, 248)
  }

  $backBrush = New-Object Drawing.SolidBrush($backColor)
  try {
    $eventArgs.Graphics.FillRectangle($backBrush, $eventArgs.Bounds)
  } finally {
    $backBrush.Dispose()
  }

  $textBounds = New-Object Drawing.Rectangle(($eventArgs.Bounds.X + 6), $eventArgs.Bounds.Y, ($eventArgs.Bounds.Width - 8), $eventArgs.Bounds.Height)
  $flags = [Windows.Forms.TextFormatFlags]::VerticalCenter -bor [Windows.Forms.TextFormatFlags]::EndEllipsis -bor [Windows.Forms.TextFormatFlags]::NoPrefix
  [Windows.Forms.TextRenderer]::DrawText($eventArgs.Graphics, $text, $sender.Font, $textBounds, $sender.ForeColor, $flags)
})
$sessionCombo.Add_SelectionChangeCommitted({
  if ($script:isUpdatingSessionCombo) {
    return
  }

  $selected = $sessionCombo.SelectedItem
  if (-not $selected) {
    return
  }

  if ($selected.IsAuto) {
    Clear-SessionLock
  } elseif (-not [string]::IsNullOrWhiteSpace([string] $selected.SessionId)) {
    Set-SessionLock ([string] $selected.SessionId)
  }
  Invoke-Collector -Wait
  Update-Widget
})

$form.Controls.AddRange(@($title, $status, $closeButton, $task, $contextValue, $contextLabel, $barTrack, $hint, $sessionCombo))
$closeButton.BringToFront()
$sessionCombo.BringToFront()

function Enable-Drag($control) {
  $control.Add_MouseDown({
    if ($_.Button -eq [Windows.Forms.MouseButtons]::Left) {
      [void] [CodexUsageNative]::ReleaseCapture()
      [void] [CodexUsageNative]::SendMessage($form.Handle, 0xA1, 0x2, 0)
    }
  })
}

@($form, $title, $task, $contextValue, $contextLabel, $hint) | ForEach-Object { Enable-Drag $_ }

function Get-TaskDisplayName($TaskItem) {
  $titleText = [string] $TaskItem.title
  if (-not [string]::IsNullOrWhiteSpace($titleText) -and -not $titleText.Contains([char] 0xfffd)) {
    return $titleText
  }

  $cwd = [string] $TaskItem.cwd
  if (-not [string]::IsNullOrWhiteSpace($cwd)) {
    $leaf = Split-Path -Leaf $cwd
    if (-not [string]::IsNullOrWhiteSpace($leaf)) {
      return $leaf
    }
  }

  return [string] $TaskItem.id
}

function New-SessionComboItem([string] $Text, [string] $SessionId, [bool] $IsAuto) {
  $item = New-Object CodexUsageSessionItem
  $item.Text = $Text
  $item.SessionId = $SessionId
  $item.IsAuto = $IsAuto
  return $item
}

function Sync-SessionCombo($summary) {
  if ($sessionCombo.DroppedDown) {
    return
  }

  $snapshot = $null
  try {
    $snapshot = Read-UsageSnapshot
  } catch {
    $snapshot = $null
  }

  $active = $null
  if ($snapshot -and $snapshot.activeSession) {
    $active = $snapshot.activeSession
  } elseif ($summary -and $summary.activeSession) {
    $active = $summary.activeSession
  }

  $tasks = @()
  if ($snapshot -and $snapshot.recentTasks) {
    $tasks = @($snapshot.recentTasks)
  } elseif ($snapshot -and $snapshot.latestTask) {
    $tasks = @($snapshot.latestTask)
  } elseif ($summary -and $summary.task) {
    $tasks = @($summary.task)
  }

  $activeId = ""
  if ($active) {
    $activeId = [string] $active.effectiveSessionId
    if ($active.mode -eq "locked" -and -not [string]::IsNullOrWhiteSpace([string] $active.requestedSessionId)) {
      $activeId = [string] $active.requestedSessionId
    }
  }

  $script:isUpdatingSessionCombo = $true
  try {
    $sessionCombo.BeginUpdate()
    $sessionCombo.Items.Clear()

    $autoText = T "6Lef6ZqP5pyA5paw5Lya6K+d"
    if ($active -and $active.mode -eq "auto" -and $summary -and -not [string]::IsNullOrWhiteSpace([string] $summary.taskTitle)) {
      $autoText = (T "6Lef6ZqP5pyA5paw77ya") + [string] $summary.taskTitle
    }
    [void] $sessionCombo.Items.Add((New-SessionComboItem $autoText "" $true))

    $selectedIndex = 0
    $index = 1
    foreach ($taskItem in $tasks) {
      $itemId = [string] $taskItem.id
      if ([string]::IsNullOrWhiteSpace($itemId)) {
        continue
      }

      $itemText = Get-TaskDisplayName $taskItem
      [void] $sessionCombo.Items.Add((New-SessionComboItem $itemText $itemId $false))
      if (-not [string]::IsNullOrWhiteSpace($activeId) -and $activeId -eq $itemId) {
        $selectedIndex = $index
      }
      $index += 1
    }

    if ($sessionCombo.Items.Count -gt 0) {
      $sessionCombo.SelectedIndex = [Math]::Min($selectedIndex, $sessionCombo.Items.Count - 1)
    }
  } finally {
    $sessionCombo.EndUpdate()
    $script:isUpdatingSessionCombo = $false
  }
}

function Show-SessionPicker {
  Invoke-Collector -Wait
  $snapshot = Read-UsageSnapshot
  $tasks = @()
  if ($snapshot -and $snapshot.recentTasks) {
    $tasks = @($snapshot.recentTasks)
  }

  if (-not $tasks.Count) {
    [void] [Windows.Forms.MessageBox]::Show((T "5rKh5pyJ5Y+v6YCJ5oup55qE5Lya6K+d"), (T "5Lya6K+d6YCJ5oup"))
    return
  }

  $dialog = New-Object Windows.Forms.Form
  $dialog.Text = T "5Lya6K+d6YCJ5oup"
  $dialog.StartPosition = [Windows.Forms.FormStartPosition]::CenterParent
  $dialog.Size = New-Object Drawing.Size(540, 420)
  $dialog.FormBorderStyle = [Windows.Forms.FormBorderStyle]::FixedDialog
  $dialog.MaximizeBox = $false
  $dialog.MinimizeBox = $false
  $dialog.ShowInTaskbar = $false
  $dialog.BackColor = [Drawing.Color]::White
  $dialog.Font = New-Object Drawing.Font($fontFamily, 9)

  $active = $snapshot.activeSession
  $modeText = Get-MonitorTitle $snapshot

  $modeInfo = New-Object Windows.Forms.Label
  $modeInfo.Text = $modeText
  $modeInfo.ForeColor = $muted
  $modeInfo.Location = New-Object Drawing.Point(16, 14)
  $modeInfo.Size = New-Object Drawing.Size(492, 22)
  $modeInfo.AutoEllipsis = $true

  $list = New-Object Windows.Forms.ListView
  $list.View = [Windows.Forms.View]::Details
  $list.FullRowSelect = $true
  $list.HideSelection = $false
  $list.MultiSelect = $false
  $list.Location = New-Object Drawing.Point(16, 42)
  $list.Size = New-Object Drawing.Size(492, 280)
  [void] $list.Columns.Add((T "5Lya6K+d"), 210)
  [void] $list.Columns.Add((T "5bel5L2c55uu5b2V"), 260)

  foreach ($taskItem in $tasks) {
    $item = New-Object Windows.Forms.ListViewItem((Get-TaskDisplayName $taskItem))
    [void] $item.SubItems.Add([string] $taskItem.cwd)
    $item.Tag = [string] $taskItem.id
    $isCurrent = $active -and (
      $active.effectiveSessionId -eq $taskItem.id -or
      ($active.mode -eq "locked" -and $active.requestedSessionId -eq $taskItem.id)
    )
    if ($isCurrent) {
      $item.BackColor = [Drawing.Color]::FromArgb(238, 243, 248)
      $item.Font = New-Object Drawing.Font($fontFamily, 9, [Drawing.FontStyle]::Bold)
      $item.Selected = $true
    }
    [void] $list.Items.Add($item)
  }

  if ($list.SelectedItems.Count -eq 0 -and $list.Items.Count -gt 0) {
    $list.Items[0].Selected = $true
  }

  $autoButton = New-Object Windows.Forms.Button
  $autoButton.Text = T "6Ieq5Yqo"
  $autoButton.Location = New-Object Drawing.Point(16, 338)
  $autoButton.Size = New-Object Drawing.Size(82, 28)

  $lockButton = New-Object Windows.Forms.Button
  $lockButton.Text = T "55uR5o6n"
  $lockButton.Location = New-Object Drawing.Point(334, 338)
  $lockButton.Size = New-Object Drawing.Size(82, 28)

  $cancelButton = New-Object Windows.Forms.Button
  $cancelButton.Text = T "5Y+W5raI"
  $cancelButton.Location = New-Object Drawing.Point(426, 338)
  $cancelButton.Size = New-Object Drawing.Size(82, 28)

  $autoButton.Add_Click({
    Clear-SessionLock
    Invoke-Collector -Wait
    Update-Widget
    $dialog.Close()
  })

  $lockAction = {
    if ($list.SelectedItems.Count -gt 0) {
      $selectedId = [string] $list.SelectedItems[0].Tag
      Set-SessionLock $selectedId
      Invoke-Collector -Wait
      Update-Widget
      $dialog.Close()
    }
  }

  $lockButton.Add_Click($lockAction)
  $list.Add_DoubleClick($lockAction)
  $cancelButton.Add_Click({ $dialog.Close() })

  $dialog.Controls.AddRange(@($modeInfo, $list, $autoButton, $lockButton, $cancelButton))
  [void] $dialog.ShowDialog($form)
}

function Update-Widget {
  try {
    $summary = Read-UsageSummary
    if (-not $summary) {
      $task.Text = T "6L+Y5rKh5pyJ55So6YeP5pWw5o2u"
      $status.Text = T "562J5b6F"
      return
    }

    $accent = Get-LevelColor $summary.level
    $status.BackColor = $accent
    $status.Text = [string] $summary.statusLabel
    $barFill.BackColor = $accent

    $task.Text = Get-MonitorTitle $summary
    $contextValue.Text = Format-Percent $summary.contextUsageRate
    $inputMetric.Text = Format-CompactNumber $summary.last.inputTokens
    $outputMetric.Text = Format-CompactNumber $summary.last.outputTokens
    $avgMetric.Text = Format-CompactNumber $summary.total.avgInputTokens
    Sync-SessionCombo $summary

    $rate = 0.0
    if ($null -ne $summary.contextUsageRate) {
      $rate = [double] $summary.contextUsageRate
    }
    if ($rate -lt 0) { $rate = 0 }
    if ($rate -gt 1) { $rate = 1 }
    $fillWidth = [Math]::Max(1, [int] [Math]::Round($barTrack.Width * $rate))
    $barFill.Size = New-Object Drawing.Size($fillWidth, $barTrack.Height)
    $barFill.Region = [Drawing.Region]::FromHrgn([CodexUsageNative]::CreateRoundRectRgn(0, 0, $barFill.Width, $barFill.Height, 8, 8))

    $updated = (Get-Item -LiteralPath $summaryPath).LastWriteTime
    $hint.Text = (T "5pu05pawIA==") + $updated.ToString("HH:mm:ss")
    $notifyIcon.Text = (T "QUkg55So6YeP5Yqp5omL") + " " + (T "6L6T5YWl") + " " + (Format-CompactNumber $summary.last.inputTokens) + " / " + (T "6L6T5Ye6") + " " + (Format-CompactNumber $summary.last.outputTokens)
  } catch {
    $task.Text = T "6K+75Y+W5aSx6LSl77yM54K55Ye75Yi35paw"
    $status.Text = T "5byC5bi4"
    $status.BackColor = Get-LevelColor "danger"
  }
}

$menu = New-Object Windows.Forms.ContextMenuStrip
$showItem = $menu.Items.Add((T "5pi+56S6L+makOiXjw=="))
$openItem = $menu.Items.Add((T "5omT5byA55So6YeP5Lit5b+D"))
$selectItem = $menu.Items.Add((T "6YCJ5oup5Lya6K+d"))
$autoItem = $menu.Items.Add((T "5YiH5o2i6Ieq5Yqo"))
$refreshItem = $menu.Items.Add((T "5Yi35paw"))
[void] $menu.Items.Add("-")
$exitItem = $menu.Items.Add((T "6YCA5Ye6"))

$notifyIcon = New-Object Windows.Forms.NotifyIcon
$notifyIcon.Icon = [Drawing.SystemIcons]::Information
$notifyIcon.Text = T "QUkg55So6YeP5Yqp5omL"
$notifyIcon.Visible = $true
$notifyIcon.ContextMenuStrip = $menu

$showItem.Add_Click({
  $form.Visible = -not $form.Visible
})

$openItem.Add_Click({
  if (Test-Path -LiteralPath $centerPath) {
    Start-Process -FilePath $centerPath
  }
})

$selectItem.Add_Click({
  Show-SessionPicker
})

$autoItem.Add_Click({
  Clear-SessionLock
  Invoke-Collector -Wait
  Update-Widget
})

$refreshItem.Add_Click({
  Invoke-Collector -Wait
  Update-Widget
})

$exitItem.Add_Click({
  $notifyIcon.Visible = $false
  $notifyIcon.Dispose()
  $form.Close()
})

$notifyIcon.Add_DoubleClick({
  $form.Visible = -not $form.Visible
})

$timer = New-Object Windows.Forms.Timer
$timer.Interval = 2500
$timer.Add_Tick({ Update-Widget })
$timer.Start()

Invoke-Collector -Wait
Update-Widget

[Windows.Forms.Application]::Run($form)

$timer.Stop()
$notifyIcon.Visible = $false
$notifyIcon.Dispose()
if (Test-Path -LiteralPath $pidPath) {
  $recordedPid = (Get-Content -Raw -LiteralPath $pidPath).Trim()
  if ($recordedPid -eq [string] $PID) {
    Remove-Item -LiteralPath $pidPath -Force
  }
}
[void] $mutex.ReleaseMutex()
