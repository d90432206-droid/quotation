-- 0. 使用者管理 (Standalone Users - 不使用 Supabase Auth)
CREATE TABLE IF NOT EXISTS linequo_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL, -- 建議使用加密存儲，此處供初步建立
    full_name TEXT NOT NULL,
    line_user_id TEXT UNIQUE, -- 用於 LINE Bot 識別
    role TEXT DEFAULT 'sales', -- admin (管理者), sales (業務), procurement (採購), manager (主管)
    department TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1. 案件資料表 (Projects)
CREATE TABLE IF NOT EXISTS linequo_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    status TEXT DEFAULT 'active', -- active, won, lost, archived
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 詢價單主表 (Inquiries)
CREATE TABLE IF NOT EXISTS linequo_inquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inquiry_no TEXT UNIQUE, -- 詢價編號 (YYMMDDNN)
    project_id UUID REFERENCES linequo_projects(id) ON DELETE SET NULL,
    sales_id UUID REFERENCES linequo_users(id), -- 詢價人 (業務)
    procurement_id UUID REFERENCES linequo_users(id), -- 負責採購
    status TEXT DEFAULT 'pending', -- pending, pricing, completed, cancelled
    urgent_level TEXT DEFAULT 'normal', -- normal, urgent
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 詢價明細項 (Inquiry Items) - 包含 儀器名稱/廠牌/規格/型號
CREATE TABLE IF NOT EXISTS linequo_inquiry_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inquiry_id UUID REFERENCES linequo_inquiries(id) ON DELETE CASCADE,
    name TEXT NOT NULL,  -- 儀器品名
    brand TEXT NOT NULL, -- 廠牌
    spec TEXT,          -- 規格
    model TEXT NOT NULL, -- 型號
    quantity NUMERIC(15, 2) DEFAULT 1,
    unit TEXT DEFAULT 'pcs',
    
    -- 採購回填欄位
    quoted_price NUMERIC(15, 2), -- 採購回填單價
    supplier_info TEXT,          -- 供應商資訊
    procurement_notes TEXT,      -- 採購備註
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE VIEW linequo_v_material_price_history AS
SELECT 
    i.inquiry_no,
    i.completed_at AS quoted_date,
    ii.name AS item_name,
    ii.brand,
    ii.spec,
    ii.model,
    ii.quantity,
    ii.quoted_price AS unit_price,
    (ii.quoted_price * ii.quantity) AS total_price,
    ii.supplier_info,
    p.name AS project_name,
    pr.full_name AS sales_name
FROM linequo_inquiry_items ii
JOIN linequo_inquiries i ON ii.inquiry_id = i.id
LEFT JOIN linequo_projects p ON i.project_id = p.id
LEFT JOIN linequo_users pr ON i.sales_id = pr.id
WHERE i.status = 'completed' AND ii.quoted_price IS NOT NULL;

-- 5. 客戶資料表 (Customers)
CREATE TABLE IF NOT EXISTS linequo_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    company_name TEXT,
    email TEXT,
    phone TEXT,
    line_user_id TEXT UNIQUE,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. 報價單主表 (Quotations)
CREATE TABLE IF NOT EXISTS linequo_quotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_number TEXT UNIQUE NOT NULL,
    inquiry_id UUID REFERENCES linequo_inquiries(id), -- 可追溯是從哪個詢價單轉過來的
    customer_id UUID REFERENCES linequo_customers(id),
    status TEXT DEFAULT 'draft',
    total_amount NUMERIC(15, 2) DEFAULT 0,
    created_by UUID REFERENCES linequo_users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 自動生成詢價編號 (YYMMDDNN)
CREATE OR REPLACE FUNCTION linequo_generate_inquiry_no()
RETURNS TRIGGER AS $$
DECLARE
    today_prefix TEXT;
    last_no TEXT;
    next_idx INT;
BEGIN
    today_prefix := to_char(CURRENT_DATE, 'YYMMDD');
    
    SELECT inquiry_no INTO last_no
    FROM linequo_inquiries
    WHERE inquiry_no LIKE today_prefix || '%'
    ORDER BY inquiry_no DESC
    LIMIT 1;
    
    IF last_no IS NULL THEN
        next_idx := 1;
    ELSE
        next_idx := (right(last_no, 2))::int + 1;
    END IF;
    
    NEW.inquiry_no := today_prefix || lpad(next_idx::text, 2, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 自動更新時間 Trigger Function
CREATE OR REPLACE FUNCTION linequo_update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 套用 Trigger (加上 DROP 以免重複執行報錯)
DROP TRIGGER IF EXISTS tr_linequo_users_update ON linequo_users;
CREATE TRIGGER tr_linequo_users_update BEFORE UPDATE ON linequo_users FOR EACH ROW EXECUTE PROCEDURE linequo_update_updated_at_column();

DROP TRIGGER IF EXISTS tr_linequo_projects_update ON linequo_projects;
CREATE TRIGGER tr_linequo_projects_update BEFORE UPDATE ON linequo_projects FOR EACH ROW EXECUTE PROCEDURE linequo_update_updated_at_column();

DROP TRIGGER IF EXISTS tr_linequo_inquiries_update ON linequo_inquiries;
CREATE TRIGGER tr_linequo_inquiries_update BEFORE UPDATE ON linequo_inquiries FOR EACH ROW EXECUTE PROCEDURE linequo_update_updated_at_column();

DROP TRIGGER IF EXISTS tr_linequo_inquiries_generate_no ON linequo_inquiries;
CREATE TRIGGER tr_linequo_inquiries_generate_no BEFORE INSERT ON linequo_inquiries FOR EACH ROW EXECUTE PROCEDURE linequo_generate_inquiry_no();

DROP TRIGGER IF EXISTS tr_linequo_inquiry_items_update ON linequo_inquiry_items;
CREATE TRIGGER tr_linequo_inquiry_items_update BEFORE UPDATE ON linequo_inquiry_items FOR EACH ROW EXECUTE PROCEDURE linequo_update_updated_at_column();

DROP TRIGGER IF EXISTS tr_linequo_customers_update ON linequo_customers;
CREATE TRIGGER tr_linequo_customers_update BEFORE UPDATE ON linequo_customers FOR EACH ROW EXECUTE PROCEDURE linequo_update_updated_at_column();

DROP TRIGGER IF EXISTS tr_linequo_quotations_update ON linequo_quotations;
CREATE TRIGGER tr_linequo_quotations_update BEFORE UPDATE ON linequo_quotations FOR EACH ROW EXECUTE PROCEDURE linequo_update_updated_at_column();

-- 啟用 RLS
ALTER TABLE linequo_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE linequo_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE linequo_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE linequo_inquiry_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE linequo_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE linequo_quotations ENABLE ROW LEVEL SECURITY;
