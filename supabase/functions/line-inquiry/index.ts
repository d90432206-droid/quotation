import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { messagingApi } from "https://esm.sh/@line/bot-sdk"

const { MessagingApiClient } = messagingApi;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') || '';
const client = new MessagingApiClient({
  channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
});

serve(async (req) => {
  // 1. 處理 CORS 預檢
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json();
    console.log(`[LOG] 收到請求, 內容包含: ${Object.keys(body).join(', ')}`);

    // --- A. 發送通知給業務 (Web -> LINE) ---
    if (body.userId && body.message) {
      if (!LINE_CHANNEL_ACCESS_TOKEN) throw new Error('伺服器未設定 LINE_CHANNEL_ACCESS_TOKEN');

      const res = await client.pushMessage({
        to: body.userId,
        messages: [{ type: 'text', text: body.message }]
      });
      
      return new Response(JSON.stringify(res), { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // --- B. 接收詢價訊息 (LINE -> Web) ---
    if (body.events) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )

      for (const event of body.events) {
        if (event.type !== 'message' || event.message.type !== 'text') continue;

        const currentLineUserId = event.source.userId
        const currentReplyToken = event.replyToken
        const text = event.message.text
        
        try {
          console.log(`[LOG] 處理來自 ${currentLineUserId} 的訊息: ${text}`);

          // 1. 解析格式
          const parts = text.split('/').map((s: string) => s.trim())
          let [brand, model, quantityRaw, notes] = parts

          if (!model) {
            await client.replyMessage({
              replyToken: currentReplyToken,
              messages: [{ type: 'text', text: "👋 詢價請依照格式：\n廠牌/型號/數量/備註" }]
            });
            continue;
          }

          let quantity = 1
          let finalNotes = notes || ''
          if (quantityRaw) {
            const parsedNum = parseInt(quantityRaw)
            if (!isNaN(parsedNum)) { quantity = parsedNum } else { finalNotes = quantityRaw; quantity = 1; }
          }

          // 2. 獲取業務資料
          const { data: user, error: userError } = await supabase.from('linequo_users')
            .select('id, full_name')
            .eq('line_user_id', currentLineUserId)
            .single()

          if (userError || !user) throw new Error("尚未連結工號，請聯絡管理員。");

          // 3. 建立詢價主單 (觸發 Trigger 生成 inquiry_no)
          const { data: inquiry, error: insError } = await supabase.from('linequo_inquiries')
            .insert({ sales_id: user.id, status: 'pending', notes: finalNotes })
            .select('id, inquiry_no')
            .single()

          if (insError) throw new Error(`主單建立失敗: ${insError.message}`);

          // 4. 建立項目明細
          const { error: itemError } = await supabase.from('linequo_inquiry_items').insert({
            inquiry_id: inquiry.id, brand: brand, model: model, name: model, quantity: quantity
          })

          if (itemError) throw new Error(`明細建立失敗: ${itemError.message}`);

          // 5. 通知採購人員 (撈取 role='procurement')
          const { data: proUsers } = await supabase.from('linequo_users')
            .select('line_user_id')
            .eq('role', 'procurement')
            .not('line_user_id', 'is', null)

          if (proUsers && proUsers.length > 0) {
            const pushMsg = `🔔 收到新詢價單！\n單號：${inquiry.inquiry_no}\n👤 業務：${user.full_name}\n\n🔹 項目：${brand} / ${model}\n🔢 數量：${quantity}\n📝 備註：${finalNotes || '無'}`;
            for (const p of proUsers) {
              client.pushMessage({ to: p.line_user_id, messages: [{ type: 'text', text: pushMsg }]})
                .catch(e => console.error('通知採購失敗:', e.message));
            }
          }

          // 6. 回傳成功給業務
          await client.replyMessage({
            replyToken: currentReplyToken,
            messages: [{ 
              type: 'text', 
              text: `👌 已接收詢價！\n單號：${inquiry.inquiry_no}\n\n🔹 廠牌：${brand}\n🔸 型號：${model}\n🔢 數量：${quantity}\n📝 備註：${finalNotes || '無'}\n\n詢價內容已同步給採購。` 
            }]
          });

        } catch (err) {
          console.error('[FATAL ERROR]', err.message);
          try {
            await client.replyMessage({
              replyToken: currentReplyToken,
              messages: [{ type: 'text', text: `❌ 系統處理失敗：\n${err.message}` }]
            });
          } catch (lineErr) { console.error('回報失敗:', lineErr.message); }
        }
      }

      return new Response('ok', { status: 200, headers: corsHeaders })
    }

    return new Response(JSON.stringify({ error: 'Unknown request type' }), { status: 400, headers: corsHeaders });

  } catch (err) {
    console.error('Error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
})

