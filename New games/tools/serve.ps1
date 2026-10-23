# ============================================================
# 開発用のかんたんなサーバー
# このフォルダのファイルを http://localhost:8080/ で見られるようにする
# (JSファイルを分けて作っているため、ファイルを直接ダブルクリックでは動かない)
# 止めるときは Ctrl + C
# ============================================================

param([int]$Port = 8080)

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$types = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.svg'  = 'image/svg+xml'
  '.webp' = 'image/webp'
  '.woff2' = 'font/woff2'
  '.ttf'  = 'font/ttf'
  '.mp3'  = 'audio/mpeg'
  '.wav'  = 'audio/wav'
  '.ogg'  = 'audio/ogg'
  '.txt'  = 'text/plain; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try {
  $listener.Start()
} catch {
  # すでに別のサーバー(別の PowerShell や Claude が立ち上げたもの)が同じ番号で動いている時
  Write-Host ""
  Write-Host "このサーバーは起動しませんでした:$Port 番は、すでに別のサーバーが使っています。" -ForegroundColor Yellow
  Write-Host "→ 別のサーバーが動いているので、そのまま http://localhost:$Port/ を開けば遊べます。" -ForegroundColor Yellow
  Write-Host "→ 開けない時は、ほかの PowerShell の画面を閉じてから、もう一度このコマンドを実行してください。" -ForegroundColor Yellow
  exit 1
}
Write-Host "サーバー起動: http://localhost:$Port/"
Write-Host "(この画面を閉じるか Ctrl + C で止まります)"

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    # 1件の読み込みで失敗しても、サーバー全体は止めない
    try {
      $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
      if ($path -eq '' -or $path.EndsWith('/')) { $path += 'index.html' }
      $file = Join-Path $root $path
      $res = $ctx.Response
      $res.Headers.Add('Cache-Control', 'no-store')
      $full = [IO.Path]::GetFullPath($file)
      if ($full.StartsWith($root.Path) -and (Test-Path $full -PathType Leaf)) {
        $ext = [IO.Path]::GetExtension($full).ToLower()
        $res.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
        $res.Headers.Add('Accept-Ranges', 'bytes')
        $fs = [IO.File]::OpenRead($full)
        try {
          $len = $fs.Length
          $start = [int64]0
          $end = $len - 1
          # 「ここからここまで」の指定(Range)があれば、その部分だけを送る。
          # BGMのような大きいファイルは一度に最大1MBずつにして、サーバーが長くふさがらないようにする
          # (このサーバーは1件ずつしか送れないので、大きいファイルを丸ごと送ると効果音などが待たされる)
          $range = $ctx.Request.Headers['Range']
          if ($range -match '^bytes=(\d*)-(\d*)$') {
            if ($Matches[1] -ne '') {
              $start = [int64]$Matches[1]
              if ($Matches[2] -ne '') { $end = [Math]::Min([int64]$Matches[2], $len - 1) }
            } elseif ($Matches[2] -ne '') {
              $start = [Math]::Max([int64]0, $len - [int64]$Matches[2])
            }
            $end = [Math]::Min($end, $start + 1MB - 1)
            if ($start -ge $len) {
              $res.StatusCode = 416
              $res.Headers.Add('Content-Range', "bytes */$len")
              continue
            }
            $res.StatusCode = 206
            $res.Headers.Add('Content-Range', "bytes $start-$end/$len")
          }
          $count = $end - $start + 1
          $res.ContentLength64 = $count
          # HEAD(中身は要らない問い合わせ)のときは、中身を送らない
          if ($ctx.Request.HttpMethod -ne 'HEAD' -and $count -gt 0) {
            $fs.Seek($start, 'Begin') | Out-Null
            $buf = New-Object byte[] $count
            $read = 0
            while ($read -lt $count) { $read += $fs.Read($buf, $read, $count - $read) }
            $res.OutputStream.Write($buf, 0, $count)
          }
        } finally {
          $fs.Close()
        }
      } else {
        $res.StatusCode = 404
      }
    } catch {
      Write-Host "読み込みエラー: $($_.Exception.Message)"
    } finally {
      try { $ctx.Response.Close() } catch { }
    }
  }
} finally {
  $listener.Stop()
}
