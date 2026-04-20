# LINE 詢價管理系統 (LINE Quotation System v2.0) 說明文件

這份文件詳細介紹了 **LINE 詢價管理系統** 的架構、功能與資料邏輯，旨在提供給 Claude 或其他 AI 工具作為生成說明書、訓練文件或進一步開發的參考。

---

## 1. 專案概述

*   **專案名稱**：LINE 詢價管理系統 (v2.0)
*   **核心目標**：解決業務與採購部門之間資訊不對稱的問題。業務端提交詢價需求，採購端回報價格與供應商資訊，並透過 LINE 機器人即時通知業務結果。
*   **技術棧**：
    *   **Frontend**: React (Vite) + TypeScript
    *   **Backend/DB**: Supabase (PostgreSQL + Edge Functions)
    *   **UI/UX**: Vanilla CSS + Glassmorphism (玻璃擬態) 設計風格
    *   **Icons**: Lucide React
    *   **通知機制**: Supabase Edge Functions 介接 LINE Messaging API

---

## 2. 系統架構與功能模組

### A. 身分驗證與角色權限
系統採用獨立的用戶資料表 (`linequo_users`) 進行登入管理，支援以下角色：
*   **管理員 (Admin)**：擁有全系統權限。
*   **業務 (Sales)**：提交詢價需求、查看個人詢價進度、查詢歷史價格。
*   **採購 (Procurement)**：查看待處理詢價、填寫報價金額與供應商資訊、發送 LINE 通知。

### B. 核心功能頁面
*   **登入介面**：美觀的玻璃擬態登入框，支援工號與密碼驗證。
*   **待辦事項 (Pending Tab)**：
    *   採購端可在此輸入 `報價金額 (NTD)` 與 `供應商詳情`，點擊「完成報價」後自動觸發 LINE 通知。
    *   業務端僅能看見進度（「採購部的小夥伴正在努力中...」）。
*   **歷史報價寶典 (History Tab)**：
    *   透過資料庫 View (`linequo_v_material_price_history`) 整合的強大搜尋介面。
    *   支援關鍵字過濾（品牌、型號、品名），讓業務能快速尋找過去類似產品的報價參考。

---

## 3. 資料庫設計 (Supabase/PostgreSQL)

### 主要資料表
1.  **`linequo_users`**：存儲使用者資料、角色、單位以及 LINE User ID。
2.  **`linequo_inquiries`**：詢價單主表，紀錄編號 (`YYMMDDNN`)、項目、進度。
3.  **`linequo_inquiry_items`**：詢價單明細，存儲品名、廠牌、型號、單價及供應商資訊。
4.  **`linequo_projects`**：關聯專案資訊。
5.  **`linequo_customers`**：客戶 CRM 資訊。
6.  **`linequo_v_material_price_history` (View)**：整合業務名稱、專案名稱、單價等資訊的報價歷史視圖。

### 自動化規則 (Triggers)
*   **編號生成**：自動產生 `YYMMDDNN` 格式的詢價單號（例如 24042001）。
*   **更新時間**：自動更新 `updated_at` 欄位。

---

## 4. LINE 通知流程

1.  採購在 Web 介面完成報價作業。
2.  前端呼叫 Supabase Edge Function `line-inquiry`。
3.  Edge Function 接收 `userId` (業務的 LINE ID) 與訊息內容。
4.  透過 LINE Messaging API 發送推播訊息給業務。
    *   *訊息範例*：`✨✨ 報價結果出爐！ ✨✨ 項目：[品牌/型號] 💰 報價：[金額] ...`

---

## 5. UI/UX 特色

*   **視覺設計**：採用深色/淺色和諧的調色盤，搭配現代字體 (Inter/Roboto)。
*   **互動反饋**：包含微動畫（轉圈加載）、狀態標籤 (Badges)、以及友好的提示文字（例如使用 Emoji ✨, 🚀）。
*   **響應式佈局**：表格支援橫向滾動，確保在大螢幕與平板上均有良好體驗。

---

## 6. 使用場景範例 (User Story)

1.  **提交需求**：業務在前端（或未來整合的 LINE Bot）輸入需要詢價的儀器型號。
2.  **採購處理**：採購人員登入系統，在「待辦事項」看到該筆單據，打電話詢價後回填 `$15,000` 並備註 `三天內送達`。
3.  **即時回報**：採購點擊完成，業務的手機立即彈出 LINE 通知，告知詢價已完成，業務可立即向客戶報價。
4.  **往後追蹤**：三個月後，另一位業務遇到同型號產品，可在「歷史報價寶典」快速搜到當初的成交行情。
