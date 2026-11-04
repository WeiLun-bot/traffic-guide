# 四場簡報的內容與共用架構

四場簡報保留同一個 `index.html` 入口。入口提供外殼、控制項與啟動復原程式，內容由資料層載入。內容、導覽、共用 CSS 與個別版面設定分開存放；既有頁面、圖片、條文及初始視角 ID 沿用。

## 編輯內容與版面的分工

`layout/presentation-layout.json` 現為 `kind: "presentation-layout"`，只保存個別元素的尺寸／位移／字型、欄位比例、圖片視角、打亮框、比較圖對齊與封面構圖。`legacyState` 中只保留舊編輯器相容的視覺設定，沒有文字、圖片替換、清單或頁面順序。`elements` 與 `imageViews` 只寫入非預設值；共用樣式與響應式版型仍由 `assets/*.css`、`assets/general/*.css` 負責。

網頁編輯後的正式內容按歸屬存放：

| 內容範圍 | 檔案 |
|---|---|
| 共用頁與新增頁面 | `data/content/shared.json` |
| 一般道路案例 | `data/content/scenarios/G1-01.json` 等 |
| 功能模組 | `data/content/modules/M1-01.json` 等 |
| 第一場共通頁 | `data/content/results/common.json` |
| 第一場案例 | `data/content/results/scenarios/G1-01.json`、`C1-01.json` 等 |
| 第一場模組成果 | `data/content/results/modules/M1-01.json` 等，首次編輯時建立 |
| 內容清單與固定 ID 的歸屬 | `data/content/catalog.json` |
| 頁面／圖像／主題順序及移除的延伸頁 | `data/presentation-navigation.json` |
| 使用者替換圖片的原始位元組 | `materials/edited/<SHA-256>.<副檔名>` |

下表原有 `data/scenarios/`、`data/modules/`、`data/results/` 資料保留為原稿匯入的預設內容及來源依據。`data/content/` 是簡報編輯的正式版本，不是建置產物；更新匯入工具時不覆蓋它。修改已編輯的簡報，應修改所屬內容檔或使用網頁編輯器。結構化清單內的文字只保存一份；舊文字鍵的相容鏡像在記憶體中重建，不重複存檔。

`assets/presentation-document.js` 負責分組及重建，編輯器內部仍使用相容的合併狀態，以保留復原／重做與既有互動。內容的存放邊界和下載時機分開：輕量編輯內容於啟動時並行讀取，原稿的完整案例／模組仍維持按需讀取。

## 儲存、備份與協作

雙擊 `start-editor.cmd` 後，按「儲存」會透過僅供同源本機預覽使用的 API，把內容、導覽和版面寫回各自檔案，不必逐一選檔。未變更的檔案不重寫。每次修改前在 `exports/project-backups/` 保留原檔；寫檔失敗時回復已寫入的檔案。若其他程式改過任一編輯來源，舊畫面的儲存會被拒絕，保留未儲存編輯，應先匯出再重新載入合併。

靜態發布站沒有寫入 API。「匯出 JSON」下載 `presentation-project.json`，包含編輯內容、導覽和版面；圖片仍引用專案素材，並非整個網站的獨立封裝。可在本機編輯器匯入後按「儲存」套用。舊版整包設定仍可匯入；單獨的新版純版面檔不可當成完整專案匯入。

`tools/presentation-project-store.cjs` 可獨立執行遷移；啟動準備也會偵測舊格式，先備份再分檔。已遷移的專案不會在啟動時重寫編輯來源。替換圖片從 JSON 的 Base64 移到素材檔，並沿用原始位元組。

## 正式來源

| 範圍 | 編輯來源 |
|---|---|
| 四場名稱、章節與入口 | `data/presentations.json` |
| 一般／複雜情境目錄 | `data/scenarios/catalog.json` |
| 原有一般道路共用資料與來源紀錄 | `data/scenarios/presentation.json` |
| G1-01～G1-04 原有內容 | `data/scenarios/G1-01.json` 等四份案例檔 |
| 其餘一般道路內容 | 目錄 `details` 指定的各案例 JSON |
| 模組內容 | `data/modules/catalog.json`、各模組 JSON 與 `formation.json` |
| 第一場共通內容 | `data/results/outline.json` |
| 第一場各案例的現況／成果 | `data/results/current-conditions.json`、`general-strategies.json` |
| 第一場複雜情境的佈設成果 | `data/results/complex-strategies.json`，按原稿實際情境對應，保留來源及引用關係 |
| 第一場模組成果總覽與現況／圖例對照 | `data/results/module-comparisons.json`，每模組的重點、原稿來源與圖片對應 |
| 網頁編輯的文字、清單、照片引用及新增頁面 | `data/content/` 下所屬案例／模組檔 |
| 個別排版、視角、打亮及封面構圖 | `layout/presentation-layout.json` |

G1-01 原本寫在程式中的開場、策略及回顧文字，放在該案例 JSON 的 `view`。這些是預設呈現內容；網頁編輯後的正式版本寫入 `data/content/scenarios/G1-01.json`。

## 載入與共用功能

`assets/presentation-repository.js` 集中處理目錄、資料請求、快取、失敗重試及來源重建。首頁與目錄只使用 `data/presentation-registry.json` 的頁面、素材與導覽中繼資料；進入模組、一般案例或第一場的某個案例後，才讀取對應的詳細內容。同一個請求會合併，成功的內容可重用，失敗的請求可重試。

頁面與條文的識別資料先存在目錄中，因此舊網址、頁數、條文排序與設定驗證不必等待全部案例載入。切換時只有最後一次選擇可以更新畫面；失敗時保留原頁與未儲存編輯。按「重試」會重新讀取原先的目標。

一般與複雜道路使用同一套 `RoadScenarioComponents`（舊名稱 `generalRoadScenarios` 保留相容），共用現況開場、策略、比較、回顧、條文、照片、縮放與打亮功能。元件位於 `assets/general/scenario-structure.js`、`current-conditions.js` 與簡報主程式，共用現有情境樣式。個別案例可提供資料差異及預設呈現值，使用者已儲存的覆寫仍優先套用。

複雜情境詳細內容沿用一般情境的 schema，使用 `C1-01` 等固定編號、目錄所屬的 `complex-c1` 章節及 `materials/05-複雜道路情境/` 素材路徑。加入完整案例檔並在目錄 `details` 宣告，即可沿用相同頁面與操作；現有尚未提供的複雜情境維持原預留頁。

## 建置與發布

`tools/prepare-github-pages.cjs` 依序同步素材尺寸、產生目錄與第一場分案資料、複製發布檔案。下列是產生檔，應修改上表正式來源後重新建置：

- `data/presentation-registry.json`
- `data/results/presentation.json`
- `data/results/scenarios/*.json`
- `data/results/modules/*.json`
- `_site/` 全部內容

照常雙擊 `start-editor.cmd` 即可完成準備及啟動；`start-viewer.cmd` 使用相同資料提供純瀏覽模式。啟動器會辨識舊預覽服務，僅重啟該連接埠上的本專案服務以支援新的儲存流程。`stop-editor.cmd` 可關閉本專案服務，`stop-editor.cmd -Port 4173` 可指定連接埠。PowerShell 腳本維持 ASCII 並支援 32／64 位元 Windows PowerShell 5.1。

PDF 匯出將全部已儲存的內容、導覽及版面重建成固定快照，逐頁等待內容與圖片載入，再以既有版面列印。移交或發布時使用完整 `_site` 資料夾；它包含內容清單、各內容檔、導覽、純版面檔及替換圖片，不包含本機寫入 API 或備份。

`tools/presentation-source.cjs` 提供正式資料讀寫及舊格式重建，讓來源比對與原有工具可讀取分檔內容；瀏覽器不使用重建的內嵌版本。

## 驗證紀錄

`tests/presentation-loading-browser.cjs` 在不預載全部內容的模式下，檢查請求範圍、快取、深層連結、延遲競爭、未儲存編輯、失敗重試及共用圖片。其他瀏覽器回歸會先載入全部案例，檢查完整內容與編輯操作。兩種模式分別驗證載入流程及既有功能。

本次整理前的來源備份與 SHA-256 清單位於 `tests/artifacts/architecture-split/before/`；此目錄與測試輸出不納入發布。
