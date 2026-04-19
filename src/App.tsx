import React, { useState, useEffect } from 'react'
import { Search, RefreshCw, User, Lock, Heart, Terminal, Send } from 'lucide-react'
import { supabase } from './supabaseClient'

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [loginInput, setLoginInput] = useState({ username: '', password: '' })
  
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending')
  const [inquiries, setInquiries] = useState<any[]>([])
  const [historicalData, setHistoricalData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [formState, setFormState] = useState<Record<string, { price: string, supplier: string }>>({})

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { data, error } = await supabase
      .from('linequo_users')
      .select('*')
      .eq('username', loginInput.username)
      .eq('password', loginInput.password)
      .single()

    if (error || !data) {
      alert('⚠️ 帳密不太對喔，再試一次吧！')
    } else {
      setCurrentUser(data)
      setIsLoggedIn(true)
    }
    setLoading(false)
  }

  const fetchInquiries = async () => {
    if (!isLoggedIn) return
    setLoading(true)
    const { data, error } = await supabase
      .from('linequo_inquiries')
      .select(`
        *,
        user:sales_id ( full_name ),
        items:linequo_inquiry_items ( * )
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (error) console.error('Error:', error)
    else setInquiries(data || [])
    setLoading(false)
  }

  const fetchHistory = async () => {
    if (!isLoggedIn) return
    const { data, error } = await supabase
      .from('linequo_v_material_price_history')
      .select('*')

    if (error) console.error('Error:', error)
    else setHistoricalData(data || [])
  }

  useEffect(() => {
    if (isLoggedIn) {
      fetchInquiries()
      fetchHistory()
    }
  }, [isLoggedIn])

  const handleInputChange = (id: string, field: 'price' | 'supplier', value: string) => {
    setFormState(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value }
    }))
  }

  const handleComplete = async (inquiryId: string, item: any) => {
    const state = formState[item.id]
    if (!state?.price) return alert('✍️ 嘿！記得填寫金額喔～')

    setLoading(true)
    await supabase.from('linequo_inquiry_items')
      .update({ quoted_price: parseFloat(state.price), supplier_info: state.supplier })
      .eq('id', item.id)

    const { data: inquiryData } = await supabase.from('linequo_inquiries')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', inquiryId)
      .select('*, user:sales_id(line_user_id)')
      .single()

    // 3. 發送 LINE 通知 (強教錯誤捕捉)
    if (inquiryData?.user?.line_user_id) {
      try {
        const formattedPrice = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(parseFloat(state.price))
        const { error: funcError } = await supabase.functions.invoke('line-inquiry', {
          body: {
            userId: inquiryData.user.line_user_id,
            message: `✨✨ 報價結果出爐！ ✨✨\n單號：${inquiryData.inquiry_no}\n\n🔹 項目：${item.brand} / ${item.model}\n💰 報價：${formattedPrice}\n🚚 備註：${state.supplier || '採購沒寫特別備註喔'}\n\n辛苦啦！祝順利成交 🚀`
          }
        })

        if (funcError) {
          console.error('通知失敗詳情:', funcError)
          alert(`🔔 報價已存檔，但 LINE 通知發送失敗\n原因：${funcError.message || '連線錯誤'}`)
        } else {
          alert('🌈 報價已成功傳給業務囉！')
        }
      } catch (notifyErr) {
        console.error('Fetch Error:', notifyErr)
        alert('⚠️ 通知發送過程發生錯誤，但資料已成功更新。')
      }
    } else {
      alert('⚠️ 找不到該業務的 LINE ID，無法傳送通知（但報價已存入系統）')
    }
    
    setFormState(prev => { const n = {...prev}; delete n[item.id]; return n; })
    fetchInquiries()
    fetchHistory()
    setLoading(false)
  }

  if (!isLoggedIn) {
    return (
      <div className="login-screen" style={{ height: '90vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <form className="glass-card" style={{ width: 420, padding: '3.5rem', borderRadius: '2.5rem', textAlign: 'center' }} onSubmit={handleLogin}>
          <div style={{ marginBottom: '2.5rem' }}>
            <div style={{ display: 'inline-flex', padding: '1.2rem', background: 'var(--primary)', borderRadius: '1.5rem', color: 'white', marginBottom: '1.5rem', boxShadow: '0 10px 25px rgba(99, 102, 241, 0.3)' }}>
              <Terminal size={40} />
            </div>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 900 }}>詢價管理平台 v2.0</h2>
            <p style={{ color: 'var(--text-muted)', marginTop: '0.4rem' }}>Good to see you again!</p>
          </div>
          <div className="input-group" style={{ textAlign: 'left', marginBottom: '1.5rem' }}>
            <label><User size={16} /> 工號 / ID</label>
            <input type="text" placeholder="輸入您的工號..." value={loginInput.username} onChange={e => setLoginInput(prev => ({...prev, username: e.target.value}))} required />
          </div>
          <div className="input-group" style={{ textAlign: 'left', marginBottom: '2rem' }}>
            <label><Lock size={16} /> 通行密碼</label>
            <input type="password" placeholder="輸入密碼..." value={loginInput.password} onChange={e => setLoginInput(prev => ({...prev, password: e.target.value}))} required />
          </div>
          <button type="submit" disabled={loading} style={{ width: '100%', height: '3.8rem', justifyContent: 'center', borderRadius: '1.2rem', fontSize: '1.1rem' }}>
            {loading ? '正在啟動中...' : '立即進入系統'} <Send size={20} style={{ marginLeft: 8 }} />
          </button>
        </form>
      </div>
    )
  }

  const filteredHistory = historicalData.filter(item => 
    (item.item_name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (item.brand?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (item.model?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  )

  return (
    <div className="app-container">
      <header>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
          <div style={{ width: 55, height: 55, background: 'var(--primary)', borderRadius: '1.2rem', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'white' }}>
            <Heart size={28} />
          </div>
          <div>
            <h1>{activeTab === 'pending' ? '🚀 正在處理的詢價' : '📚 歷史報價寶典'}</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>嘿 {currentUser?.full_name}，今天的工作也要加油喔！</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button onClick={() => { fetchInquiries(); fetchHistory(); }} style={{ background: '#f1f5f9', color: '#64748b', transition: 'transform 0.5s' }} className={loading ? 'animate-spin' : ''}>
            <RefreshCw size={20} />
          </button>
          <div style={{ textAlign: 'right', paddingRight: '1rem' }}>
            <div style={{ fontWeight: 800 }}>{currentUser?.full_name}</div>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--primary)' }}>{currentUser?.department}</div>
          </div>
          <button onClick={() => setIsLoggedIn(false)} style={{ background: '#fee2e2', color: '#ef4444' }}>登出</button>
        </div>
      </header>

      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '2rem' }}>
        <div 
          onClick={() => setActiveTab('pending')}
          className="glass-card"
          style={{ flex: 1, cursor: 'pointer', textAlign: 'center', border: activeTab === 'pending' ? '2px solid var(--primary)' : '1px solid var(--border)', background: activeTab === 'pending' ? 'white' : 'var(--card-bg)' }}
        >
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: activeTab === 'pending' ? 'var(--primary)' : 'var(--text-muted)' }}>待辦事項</div>
          <div style={{ fontSize: '2.5rem', fontWeight: 900, marginTop: '0.5rem' }}>{inquiries.length}</div>
        </div>
        <div 
          onClick={() => setActiveTab('history')}
          className="glass-card"
          style={{ flex: 1, cursor: 'pointer', textAlign: 'center', border: activeTab === 'history' ? '2px solid var(--primary)' : '1px solid var(--border)', background: activeTab === 'history' ? 'white' : 'var(--card-bg)' }}
        >
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: activeTab === 'history' ? 'var(--primary)' : 'var(--text-muted)' }}>已完成筆數</div>
          <div style={{ fontSize: '2.5rem', fontWeight: 900, marginTop: '0.5rem' }}>{historicalData.length}</div>
        </div>
      </div>

      {activeTab === 'pending' ? (
        <div className="inquiry-grid">
          {inquiries.map(inquiry => inquiry.items?.map((item: any) => {
            const isProcurement = currentUser?.department?.includes('採購') || currentUser?.role === 'admin';
            return (
              <div key={item.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="status-badge status-pending">{inquiry.inquiry_no || '處理中'}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(inquiry.created_at).toLocaleDateString('zh-TW')}</span>
                </div>
                <div>
                  <span className="brand-tag">{item.brand}</span>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, marginTop: '0.5rem' }}>{item.model}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginTop: '0.3rem' }}>{item.item_name}</div>
                </div>
                <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '1rem', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.9rem' }}>🙋 <strong>業務員：</strong>{inquiry.user?.full_name}</div>
                  <div style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>🔢 <strong>數量：</strong><strong style={{color: 'var(--primary)', fontSize: '1.1rem'}}>{item.quantity}</strong></div>
                  <div style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>📝 <strong>備註：</strong>{inquiry.notes}</div>
                </div>
                {isProcurement ? (
                  <div style={{ marginTop: 'auto' }}>
                    <div className="input-group">
                      <label>報價金額 (NTD)</label>
                      <input type="number" placeholder="輸入單價..." value={formState[item.id]?.price || ''} onChange={e => handleInputChange(item.id, 'price', e.target.value)} />
                    </div>
                    <div className="input-group" style={{ marginTop: '1rem' }}>
                      <label>供應商詳情</label>
                      <textarea rows={2} placeholder="請輸入供應商與到貨細節..." value={formState[item.id]?.supplier || ''} onChange={e => handleInputChange(item.id, 'supplier', e.target.value)}></textarea>
                    </div>
                    <button onClick={() => handleComplete(inquiry.id, item)} style={{ width: '100%', marginTop: '1.5rem', height: '3.5rem', justifyContent: 'center' }}>
                      完成報價 <Send size={18} />
                    </button>
                  </div>
                ) : (
                  <div style={{ marginTop: 'auto', textAlign: 'center', padding: '1.5rem', background: '#e0f2fe', borderRadius: '1.2rem', color: '#0369a1', fontWeight: 800 }}>
                    💎 採購部的小夥伴正在努力中...
                  </div>
                )}
              </div>
            )
          }))}
        </div>
      ) : (
        <div className="glass-card" style={{ padding: 0 }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)' }}>
            <div style={{ position: 'relative', maxWidth: '650px' }}>
              <Search size={20} style={{ position: 'absolute', left: '1.2rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input type="text" placeholder="輸入關鍵字（品牌、型號、品名）來尋寶..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ paddingLeft: '3.5rem', margin: 0, height: '3.2rem' }} />
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1150px' }}>
              <thead>
                <tr>
                  <th style={{ width: '120px' }}>報價單號</th>
                  <th style={{ width: '140px' }}>採購回覆日</th>
                  <th style={{ minWidth: '180px' }}>儀器名稱</th>
                  <th style={{ width: '120px' }}>廠牌</th>
                  <th style={{ minWidth: '150px' }}>型號</th>
                  <th style={{ textAlign: 'center', width: '80px' }}>數量</th>
                  <th style={{ textAlign: 'right', width: '130px' }}>報價單價</th>
                  <th style={{ textAlign: 'right', width: '130px' }}>總報價金額</th>
                  <th style={{ width: '150px', whiteSpace: 'nowrap' }}>業務人員</th>
                  <th style={{ minWidth: '220px' }}>供應商詳情</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((item, idx) => (
                  <tr key={idx} style={{ verticalAlign: 'top' }}>
                    <td style={{ fontWeight: 800, color: 'var(--primary)' }}>{item.inquiry_no}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{item.quoted_date ? new Date(item.quoted_date).toLocaleDateString('zh-TW') : 'N/A'}</td>
                    <td style={{ fontWeight: 700 }}>{item.item_name}</td>
                    <td><span className="brand-tag">{item.brand}</span></td>
                    <td style={{ color: 'var(--primary)', fontWeight: 800 }}>{item.model}</td>
                    <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                    <td style={{ textAlign: 'right', fontWeight: 800 }}>${item.unit_price?.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', color: 'var(--success)', fontWeight: 900 }}>${item.total_price?.toLocaleString()}</td>
                    <td style={{ whiteSpace: 'nowrap', minWidth: '120px' }}>{item.sales_name}</td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>{item.supplier_info}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
export default App
