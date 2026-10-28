$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $root 'content\02-intersection\source-manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$jpegEncoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
foreach ($page in $manifest.pages) {
  foreach ($picture in $page.pictures) {
    $isPhoto = $page.page -in @(22,25,29,32,34)
    $isEmf = [System.IO.Path]::GetExtension($picture.file) -eq '.emf'
    if (!$isPhoto -and !$isEmf) { continue }
    $originalPath = Join-Path $root $picture.file
    $image = [System.Drawing.Image]::FromFile($originalPath)
    try {
      $scale = if ($isEmf) { [Math]::Min([double]1,[double](1600/$image.Height)) } else { [Math]::Min([double]1,[double](1600/[Math]::Max($image.Width,$image.Height))) }
      $width = [Math]::Max(1,[int][Math]::Round($image.Width*$scale))
      $height = [Math]::Max(1,[int][Math]::Round($image.Height*$scale))
      $folder = (Split-Path -Parent $picture.file).Replace('\','/') + '/web'
      [System.IO.Directory]::CreateDirectory((Join-Path $root $folder)) | Out-Null
      $extension = if ($isEmf) { '.png' } else { '.jpg' }
      $webPath = $folder + '/' + [System.IO.Path]::GetFileNameWithoutExtension($picture.file) + $extension
      $bitmap = [System.Drawing.Bitmap]::new($width,$height)
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.Clear($(if($isEmf){[System.Drawing.Color]::Transparent}else{[System.Drawing.Color]::White}))
        $graphics.InterpolationMode = 'HighQualityBicubic'
        $graphics.SmoothingMode = 'HighQuality'
        $graphics.DrawImage($image,0,0,$width,$height)
        if ($isEmf) {
          $bitmap.Save((Join-Path $root $webPath),[System.Drawing.Imaging.ImageFormat]::Png)
        } else {
          $parameters = [System.Drawing.Imaging.EncoderParameters]::new(1)
          $quality = [System.Drawing.Imaging.EncoderParameter]::new([System.Drawing.Imaging.Encoder]::Quality,[long]90)
          try { $parameters.Param[0]=$quality; $bitmap.Save((Join-Path $root $webPath),$jpegEncoder,$parameters) } finally { $parameters.Dispose(); $quality.Dispose() }
        }
      } finally { $graphics.Dispose(); $bitmap.Dispose() }
      $picture | Add-Member -NotePropertyName originalWidth -NotePropertyValue $image.Width -Force
      $picture | Add-Member -NotePropertyName originalHeight -NotePropertyValue $image.Height -Force
      $picture.webFile = $webPath
      $picture.width = $width
      $picture.height = $height
      Write-Output ('p'+$page.page+' / '+$picture.index+' -> '+$width+'x'+$height+' '+$extension)
    } finally { $image.Dispose() }
  }
}
[System.IO.File]::WriteAllText($manifestPath,(ConvertTo-Json -InputObject $manifest -Depth 12),[System.Text.UTF8Encoding]::new($false))
