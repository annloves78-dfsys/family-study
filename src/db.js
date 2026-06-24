import { supabase } from './supabaseClient'

// ===== 프로필 =====
export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
  if (error) throw error
  if (!data || data.length === 0) throw new Error('사용자 없음: ' + userId)
  return data[0]
}

export async function checkPassword(userId, pw) {
  const { data, error } = await supabase
    .from('profiles')
    .select('password')
    .eq('id', userId)
  if (error) throw error
  if (!data || data.length === 0) throw new Error('사용자 없음: ' + userId)
  return data[0].password === pw
}

export async function setPassword(userId, newPw) {
  const { error } = await supabase
    .from('profiles')
    .update({ password: newPw, is_password_set: true })
    .eq('id', userId)
  if (error) throw error
}

// ===== 도장 =====
export async function getStamps(userId, dateStr) {
  const { data, error } = await supabase
    .from('study_stamps')
    .select('stamp_index')
    .eq('user_id', userId)
    .eq('date_str', dateStr)
  if (error) throw error
  return data.map(s => s.stamp_index)
}

export async function addStamp(userId, dateStr, stampIndex) {
  const { error } = await supabase
    .from('study_stamps')
    .insert([{ user_id: userId, date_str: dateStr, stamp_index: stampIndex }])
  if (error) throw error
}

export async function removeStamp(userId, dateStr, stampIndex) {
  const { error } = await supabase
    .from('study_stamps')
    .delete()
    .eq('user_id', userId)
    .eq('date_str', dateStr)
    .eq('stamp_index', stampIndex)
  if (error) throw error
}

// ===== 목표 시간 =====
export async function getTarget(userId, dateStr) {
  const { data, error } = await supabase
    .from('daily_targets')
    .select('target_count')
    .eq('user_id', userId)
    .eq('date_str', dateStr)
    .single()
  if (error) return 0
  return data.target_count
}

export async function setTarget(userId, dateStr, count) {
  const { error } = await supabase
    .from('daily_targets')
    .upsert(
      [{ user_id: userId, date_str: dateStr, target_count: count }],
      { onConflict: 'user_id,date_str' }
    )
  if (error) throw error
}

// ===== 통계 (전체 용돈) =====
export async function getTotalStamps(userId) {
  const { data, error } = await supabase
    .from('study_stamps')
    .select('id')
    .eq('user_id', userId)
  if (error) throw error
  return data.length
}

// ===== 용돈 이벤트 =====
export async function addPayoutEvent(userId, amount) {
  // 음수 금액을 custom_events에 기록 (정산됨 표시)
  const { error } = await supabase
    .from('custom_events')
    .insert([{ user_id: userId, event_type: 'payout', amount: amount }])
  if (error) throw error
}

export async function getTotalPaidOut(userId) {
  const { data, error } = await supabase
    .from('custom_events')
    .select('amount')
    .eq('user_id', userId)
    .eq('event_type', 'payout')
  if (error) return 0
  return data.reduce((sum, e) => sum + e.amount, 0)
}
