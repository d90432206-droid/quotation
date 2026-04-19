import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { messagingApi } from "https://esm.sh/@line/bot-sdk"

const { MessagingApiClient } = messagingApi;

const LINE_ACCESS_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') ?? ''
const client = new MessagingApiClient({
  channelAccessToken: LINE_ACCESS_TOKEN,
});

serve(async (req) => {
  try {
    const payload = await req.json()
    const events = payload.events

    if (events) {
      for (const event of events) {
        if (event.type === 'message' && event.message.type === 'text') {
          const lineUserId = event.source.userId
          const text = event.message.text

          // 1. 解析格式: 廠牌/型號/備註
          const parts = text.split('/')
          if (parts.length < 2) continue

          const brand = parts[0].trim()
          const model = parts[1].trim()
          const notes = parts[2]?.trim() || ''

          // 2. 初始化 Supabase
          const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
          )

          // 3. 尋找業務 Profile ID
          const { data: user } = await supabase
            .from('linequo_users')
            .select('id, full_name')
            .eq('line_user_id', lineUserId)
            .single()

          if (!user) {
            await client.replyMessage({
              replyToken: event.replyToken,
              messages: [{ type: 'text', text: "⚠️ 您的 LINE ID 尚未在系統中註冊，請聯絡管理員。" }]
            })
            continue
          }

          // 4. 寫入詢價單
          const { data: inquiry } = await supabase
            .from('linequo_inquiries')
            .insert({
              sales_id: user.id,
              notes: `來自 LINE: ${notes}`,
              status: 'pending'
            })
            .select()
            .single()

          if (inquiry) {
            await supabase.from('linequo_inquiry_items').insert({
              inquiry_id: inquiry.id,
              name: brand,
              brand: brand,
              model: model,
              spec: '待確認'
            })

            await client.replyMessage({
              replyToken: event.replyToken,
              messages: [{ type: 'text', text: `✅ 已收到您的詢價請求！\n廠牌: ${brand}\n型號: ${model}\n採購人員將盡快處理回覆。` }]
            })
          }
        }
      }
    }

    return new Response('ok', { status: 200 })
  } catch (err) {
    return new Response(err.message, { status: 500 })
  }
})

