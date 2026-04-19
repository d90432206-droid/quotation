import { createClient } from '@supabase/supabase-js'

// 請將這裡的 URL 與 Key 換成您在 Supabase 後台看到的資訊
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://zklnztgkygzamgmswmmn.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprbG56dGdreWd6YW1nbXN3bW1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMjA5OTcsImV4cCI6MjA5MTg5Njk5N30.K0HUOh650JroU84CySRxlDFjiO1jZrP1BSylxtO72Cg'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    headers: {
      'x-app-secret': 'CHUYI-SECURE-KEY-2024' // 自訂安全金鑰
    }
  }
})
