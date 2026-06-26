import { createClient } from '@supabase/supabase-js';

// Vercel 환경변수에서 읽어옵니다 (배포 가이드 참고)
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});

// ── 익명 로그인: 링크만 누르면 자동으로 고유 사용자 생성 ──
export async function ensureSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return session.user;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.user;
}

// ── 내 프로필(이름) ──
export async function getMyProfile(userId) {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  return data;
}
export async function upsertMyProfile(userId, name) {
  const { data, error } = await supabase.from('profiles')
    .upsert({ id: userId, name }, { onConflict: 'id' }).select().single();
  if (error) throw error;
  return data;
}

// ── 소모임 목록(+멤버 수 계산은 클라이언트에서) ──
export async function fetchGroups() {
  const { data, error } = await supabase
    .from('groups')
    .select('*, members:group_members(id, user_id, name, is_leader)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createGroup(payload, userId, leaderName) {
  const { data: g, error } = await supabase.from('groups').insert(payload).select().single();
  if (error) throw error;
  // 만든 사람을 리더 멤버로 추가
  await supabase.from('group_members').insert({
    group_id: g.id, user_id: userId, name: leaderName, is_leader: true,
  });
  return g;
}

export async function updateGroup(groupId, patch) {
  const { error } = await supabase.from('groups').update(patch).eq('id', groupId);
  if (error) throw error;
}

export async function deleteGroup(groupId) {
  const { error } = await supabase.from('groups').delete().eq('id', groupId);
  if (error) throw error;
}

// ── 가입 / 해지 ──
export async function joinGroup(groupId, userId, name) {
  const { error } = await supabase.from('group_members')
    .insert({ group_id: groupId, user_id: userId, name });
  if (error) throw error;
}
export async function leaveGroup(groupId, userId) {
  const { error } = await supabase.from('group_members')
    .delete().eq('group_id', groupId).eq('user_id', userId);
  if (error) throw error;
}
export async function removeMember(memberId) {
  const { error } = await supabase.from('group_members').delete().eq('id', memberId);
  if (error) throw error;
}
export async function setLeader(groupId, memberUserId) {
  // 모든 멤버 is_leader=false 후 한 명만 true
  await supabase.from('group_members').update({ is_leader: false }).eq('group_id', groupId);
  await supabase.from('group_members').update({ is_leader: true })
    .eq('group_id', groupId).eq('user_id', memberUserId);
}

// ── 출석 ──
export async function fetchAttendance(groupId, dateISO) {
  const { data, error } = await supabase.from('attendance')
    .select('*').eq('group_id', groupId).eq('date', dateISO);
  if (error) throw error;
  return data;
}
export async function setAttendance(groupId, memberUserId, dateISO, present) {
  if (present) {
    const { error } = await supabase.from('attendance')
      .upsert({ group_id: groupId, user_id: memberUserId, date: dateISO },
              { onConflict: 'group_id,user_id,date' });
    if (error) throw error;
  } else {
    const { error } = await supabase.from('attendance')
      .delete().eq('group_id', groupId).eq('user_id', memberUserId).eq('date', dateISO);
    if (error) throw error;
  }
}

// ── 소식 ──
export async function fetchNotices(groupId) {
  const { data, error } = await supabase.from('notices')
    .select('*').eq('group_id', groupId).order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}
export async function addNotice(groupId, userId, title, body) {
  const { error } = await supabase.from('notices')
    .insert({ group_id: groupId, author_id: userId, title, body });
  if (error) throw error;
}
export async function deleteNotice(noticeId) {
  const { error } = await supabase.from('notices').delete().eq('id', noticeId);
  if (error) throw error;
}

// ── 관리자 여부 (admins 테이블에 내 id가 있으면 관리자) ──
export async function fetchIsAdmin(userId) {
  const { data } = await supabase.from('admins').select('user_id').eq('user_id', userId).maybeSingle();
  return !!data;
}
