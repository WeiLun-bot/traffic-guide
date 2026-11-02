# 教材 PDF 匯出

## M1-01 與 G1-01 完整簡報

`exports/PDF-M1-01-G1-01/` 提供 M1-01「路口動線導引」與 G1-01「無號誌市區正交三岔路口」兩份 PDF，目前分別為 16、13 頁。M1-01 依兩個子模組的現況議題、各圖例主題及延伸應用編排；G1-01 包含現況、策略、九項條文解說及回顧。

採 16:9 橫式，沿用 1600 × 900 的簡報版面。操作按鈕隱藏後保留其原有空間，不重新拉高頁面或圖框；照片、圖例與條文文字仍保留。匯出時比對隱藏控制項前後的圖框尺寸，檢查圖片沒有被一起隱藏及說明沒有裁切。組合後檢查頁數、尺寸與可搜尋文字，並產生書籤及整份預覽圖。

先更新 `_site`，再執行：

```powershell
node tools/export-pdf-chapters.cjs
py -3 tools/assemble-pdf-chapters.py
```

執行環境與下方試作相同；沒有獨立 Node 時，用 VS Code 的 Node 模式執行 `tools/export-pdf-chapters.cjs`。匯出採同一份已儲存的設定快照，不改寫互動簡報與設定檔。

## 早期 A4 六頁試作

目前先輸出一般道路情境第一案 **G1-01 無號誌市區正交三岔路口**，共 6 頁 A4 橫式：

1. 路口現況與改善目標
2. 現況問題
3. 整體佈設策略
4. 路面邊線
5. 枕木紋行人穿越道線
6. 最高速限標誌

成品位於 `exports/G1-01-PDF-sample/G1-01_教材試作_6頁.pdf`；同資料夾的 `G1-01_六頁預覽.png` 可一次比較六頁。

輸出採用專案中**已儲存的** `layout/presentation-layout.json`，保留文字、圖片視角、打亮框與條文放大範圍。瀏覽器尚未儲存的修改不會包含在內。輸出開始時會讀取一份固定設定快照，六頁皆採相同版本；版本雜湊記錄於 `manifest.json`。

PDF 沿用簡報圖文配置，移除章節導覽、頁面切換、圖片縮放及編輯按鈕。整體佈設策略呈現改善後圖面，適合靜態閱讀；PDF 文字可選取搜尋，附有六頁書籤。

此階段是獨立的教材輸出流程，列印樣式只套用於輸出時的獨立瀏覽器，沒有改動互動簡報或覆寫版面設定。

## 重新產生試作

先更新 `_site`，接著依序執行：

```powershell
node tools/export-pdf-sample.cjs
py -3 tools/assemble-pdf-sample.py
```

需要本機 Chrome 或 Edge、可使用內建 WebSocket 的 Node，以及已安裝 PyMuPDF 的 Python。未安裝獨立 Node 時，可沿用專案預覽工具使用的 VS Code 執行環境：

```powershell
$previousNodeMode = $env:ELECTRON_RUN_AS_NODE
try {
    $env:ELECTRON_RUN_AS_NODE = '1'
    $runtime = Join-Path $env:LOCALAPPDATA 'Programs/Microsoft VS Code/Code.exe'
    & $runtime tools/prepare-github-pages.cjs --quiet 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) { throw '更新預覽失敗' }
    & $runtime tools/export-pdf-sample.cjs 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) { throw '輸出 PDF 失敗' }
} finally {
    $env:ELECTRON_RUN_AS_NODE = $previousNodeMode
}
py -3 tools/assemble-pdf-sample.py
```

每頁輸出前會檢查主要說明區域是否超出頁面，組合後再檢查頁數、紙張尺寸與可搜尋文字。個別 PDF、PNG 與 `validation.json` 保留於成品資料夾，供版面檢視。
