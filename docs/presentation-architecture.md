# 四場簡報的內容與共用架構

四場簡報保留同一個 `index.html` 入口。入口只提供外殼、控制項與啟動復原程式，內容由資料層載入。正式版面設定仍為同一份 `layout/presentation-layout.json`，既有頁面、圖片、條文及初始視角 ID 沿用。

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
| 文字、排版、照片替換、視角及打亮等使用者設定 | `layout/presentation-layout.json` |

G1-01 原本寫在程式中的開場、策略及回顧文字，放在該案例 JSON 的 `view`。這些是預設呈現內容；網頁編輯後的個別覆寫仍寫入正式設定檔。

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

照常雙擊 `start-editor.cmd` 即可完成準備及啟動。`tools/build-general-scenarios.cjs` 在目前架構中更新資料目錄，保留舊專案格式的相容分支。

PDF 匯出仍使用相同頁面與正式設定快照，逐頁等待內容與圖片載入，再以既有的 16:9 版面列印。移交或發布時使用完整 `_site` 資料夾。

`tools/presentation-source.cjs` 提供正式資料讀寫及舊格式重建，讓來源比對與原有工具可讀取分檔內容；瀏覽器不使用重建的內嵌版本。

## 驗證紀錄

`tests/presentation-loading-browser.cjs` 在不預載全部內容的模式下，檢查請求範圍、快取、深層連結、延遲競爭、未儲存編輯、失敗重試及共用圖片。其他瀏覽器回歸會先載入全部案例，檢查完整內容與編輯操作。兩種模式分別驗證載入流程及既有功能。

本次整理前的來源備份與 SHA-256 清單位於 `tests/artifacts/architecture-split/before/`；此目錄與測試輸出不納入發布。
