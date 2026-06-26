import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, ensureSession, getMyProfile, upsertMyProfile, fetchGroups,
  createGroup, updateGroup, deleteGroup as dbDeleteGroup, joinGroup as dbJoin,
  leaveGroup as dbLeave, removeMember as dbRemoveMember, setLeader,
  fetchAttendance, setAttendance, fetchNotices, addNotice as dbAddNotice,
  deleteNotice as dbDeleteNotice, fetchIsAdmin } from './db.js';

const PALETTE = {
  bg: '#FFFFFF', soft: '#F7F8FA', ink: '#1A1A1E', sub: '#9094A0', line: '#EBEDF1',
  mint: '#27C39A', mintSoft: '#E4F8F2', accent: '#5E5CE6', accentSoft: '#EFEEFD',
  good: '#10B981', goodSoft: '#E7FAF1', warn: '#FF6B6B', warnSoft: '#FFEDED',
};
const AVATAR_COLORS = [
  { bg: '#EDE9FE', fg: '#6D28D9' }, { bg: '#DBEAFE', fg: '#1D4ED8' }, { bg: '#FCE7F3', fg: '#BE185D' },
  { bg: '#D1FAE5', fg: '#047857' }, { bg: '#FEF3C7', fg: '#B45309' }, { bg: '#FFE4E6', fg: '#BE123C' },
];
const CATEGORIES = [
  { key: 'all', label: '최근 소모임', icon: 'grid' },
  { key: 'oneday', label: '원데이', icon: 'bolt' },
  { key: 'club', label: '클럽', icon: 'chat' },
  { key: 'challenge', label: '챌린지', icon: 'star' },
];
const TAG_THEMES = {
  '운동·액티비티': { bg: '#EAF6FF', fg: '#1E80C9' }, '성장·자기계발': { bg: '#FFF3E2', fg: '#C97A1E' },
  '대화·친목·육아': { bg: '#F0EDFF', fg: '#6D5BD0' }, '신앙·말씀': { bg: '#E9F8EF', fg: '#1F9D57' },
  '문화·예술': { bg: '#FFEDF4', fg: '#C9417E' },
};
const TAG_ORDER = Object.keys(TAG_THEMES);
const TYPE_LABEL = { oneday: '원데이', club: '클럽', challenge: '챌린지' };
const TYPE_COLOR = { oneday: '#27C39A', club: '#3B82F6', challenge: '#F59E0B' };

function pad(n) { return n < 10 ? '0' + n : '' + n; }
function toISO(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function fromISO(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
function initial(name) { return name ? name[name.length - 1] : '?'; }
function avatarColor(i) { return AVATAR_COLORS[i % AVATAR_COLORS.length]; }
function fmtMeetDate(iso) { if (!iso) return null; const d = fromISO(iso); return `${pad(d.getMonth() + 1)}.${pad(d.getDate())}(${WEEKDAY[d.getDay()]})`; }

function resizeImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const W = 480, H = 320;
        const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        const scale = Math.max(W / img.width, H / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = reject; img.src = reader.result;
    };
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}

function CatIcon({ name, color }) {
  const s = { width: 22, height: 22, stroke: color, fill: 'none', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (name === 'grid') return (<svg viewBox="0 0 24 24" style={s}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" fill={color} stroke="none" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>);
  if (name === 'bolt') return (<svg viewBox="0 0 24 24" style={{ ...s, fill: color, stroke: 'none' }}><path d="M13 2L4 14h6l-1 8 9-12h-6z" /></svg>);
  if (name === 'chat') return (<svg viewBox="0 0 24 24" style={s}><path d="M4 5h13a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 3v-3H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" fill={color} stroke="none" opacity="0.85"/></svg>);
  if (name === 'star') return (<svg viewBox="0 0 24 24" style={{ ...s, fill: color, stroke: 'none' }}><path d="M12 3l2.5 5 5.5.8-4 3.9 1 5.5L12 16.5 7.5 21l1-5.5-4-3.9L10 8z" /></svg>);
  return null;
}

function ImagePicker({ preview, onPick }) {
  const fileRef = useRef(null);
  const [urlInput, setUrlInput] = useState('');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button type="button" onClick={() => fileRef.current?.click()}
        style={{ width: '100%', aspectRatio: '3 / 2', borderRadius: 12, border: '1.5px dashed var(--line)', cursor: 'pointer', overflow: 'hidden', position: 'relative', background: preview ? 'transparent' : 'var(--soft)', padding: 0 }}>
        {preview ? <img src={preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 12.5, color: 'var(--sub)', fontWeight: 600 }}>대표 이미지 추가</span>}
      </button>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { onPick(await resizeImageFile(f)); } catch (err) {} }} />
      <div style={{ display: 'flex', gap: 6 }}>
        <input placeholder="또는 이미지 URL 붙여넣기" value={urlInput} onChange={e => setUrlInput(e.target.value)}
          style={{ flex: 1, fontFamily: 'Pretendard, sans-serif', border: '1px solid var(--line)', borderRadius: 9, padding: '7px 9px', fontSize: 12, background: 'var(--bg)', color: 'var(--ink)' }} />
        <button type="button" onClick={() => { if (urlInput.trim()) onPick(urlInput.trim()); }}
          style={{ background: 'var(--accentSoft)', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '0 12px', borderRadius: 9 }}>적용</button>
      </div>
    </div>
  );
}

function CardImage({ group, idx }) {
  const c = avatarColor(idx);
  return (
    <div className="card-img-wrap">
      {group.image ? <img className="card-img" src={group.image} alt="" /> : <div className="card-img card-img-fallback" style={{ background: c.bg, color: c.fg }}>{initial(group.name)}</div>}
      {group.type && TYPE_LABEL[group.type] && <span className="type-badge" style={{ background: TYPE_COLOR[group.type] }}>{TYPE_LABEL[group.type]}</span>}
    </div>
  );
}

// App 바깥에 정의 — 화면이 다시 그려져도 입력칸이 새로 만들어지지 않아
// 한글 입력 중 글자가 사라지는 문제를 막아줍니다.
function FormFields({ form, setForm }) {
  return (
    <>
      <div><label>대표 이미지</label><ImagePicker preview={form.image} onPick={(img) => setForm(f => ({ ...f, image: img }))} /></div>
      <div><label>소모임 유형</label>
        <div className="seg-pick">{['oneday','club','challenge'].map(t => (
          <button key={t} className={form.type === t ? 'on' : ''} onClick={() => setForm(f => ({ ...f, type: t }))}>{TYPE_LABEL[t]}</button>))}</div>
      </div>
      <div><label>소모임 이름</label><input placeholder="예: 농구합시다 – 만나농구모임" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
      <div><label>분류</label>
        <select value={form.tag} onChange={e => setForm(f => ({ ...f, tag: e.target.value }))}>{TAG_ORDER.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
      <div className="field-row">
        <div><label>장소</label><input placeholder="예: 2층 만나홀" value={form.place} onChange={e => setForm(f => ({ ...f, place: e.target.value }))} /></div>
        <div><label>정원</label><input type="number" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} /></div>
      </div>
      <div className="field-row">
        <div><label>모임 날짜</label><input type="date" value={form.meetDate} onChange={e => setForm(f => ({ ...f, meetDate: e.target.value }))} /></div>
        <div><label>시간</label><input placeholder="예: 오후 7:00" value={form.meetTime} onChange={e => setForm(f => ({ ...f, meetTime: e.target.value }))} /></div>
      </div>
    </>
  );
}

export default function App() {
  const [user, setUser] = useState(undefined);   // supabase user
  const [profile, setProfile] = useState(undefined); // {name} or null
  const [isAdmin, setIsAdmin] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [bootError, setBootError] = useState('');

  const [groups, setGroups] = useState(null);
  const [activeCat, setActiveCat] = useState('all');
  const [showManual, setShowManual] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [screen, setScreen] = useState('list');
  const [view, setView] = useState('attendance');
  const [selectedDate, setSelectedDate] = useState(toISO(new Date()));
  const [attRows, setAttRows] = useState([]);       // 선택 날짜 출석 행
  const [notices, setNotices] = useState([]);
  const [justChecked, setJustChecked] = useState(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeBody, setNoticeBody] = useState('');
  const [toast, setToast] = useState('');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [createForm, setCreateForm] = useState(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 2400); };

  // ── 부팅: 익명 로그인 + 프로필 + 관리자 + 소모임 ──
  useEffect(() => {
    (async () => {
      try {
        const u = await ensureSession();
        setUser(u);
        const [p, admin] = await Promise.all([getMyProfile(u.id), fetchIsAdmin(u.id)]);
        setProfile(p ?? null);
        setIsAdmin(admin);
        await reloadGroups();
      } catch (e) {
        setBootError(e?.message || '연결에 실패했어요. Supabase 설정을 확인해주세요.');
        setUser(null); setProfile(null);
      }
    })();
  }, []);

  const reloadGroups = useCallback(async () => {
    const data = await fetchGroups();
    setGroups(data.map(g => ({ ...g, members: g.members || [] })));
  }, []);

  // ── 목록 실시간 동기화 ──
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel('rt-lists')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, reloadGroups)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members' }, reloadGroups)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, reloadGroups]);

  const currentGroup = groups?.find(g => g.id === selectedGroupId) ?? null;
  const isMember = !!(user && currentGroup?.members.some(m => m.user_id === user.id));
  const isLeader = !!(user && currentGroup?.members.some(m => m.user_id === user.id && m.is_leader));
  const canEdit = isLeader || isAdmin;

  // ── 상세 진입 시 출석/소식 로드 + 실시간 ──
  const reloadDetail = useCallback(async (gid, dateISO) => {
    if (!gid) return;
    const [a, n] = await Promise.all([fetchAttendance(gid, dateISO), fetchNotices(gid)]);
    setAttRows(a); setNotices(n);
  }, []);

  useEffect(() => {
    if (screen !== 'detail' || !selectedGroupId || !user) return;
    reloadDetail(selectedGroupId, selectedDate);
    const ch = supabase.channel('rt-detail-' + selectedGroupId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance', filter: `group_id=eq.${selectedGroupId}` },
        () => fetchAttendance(selectedGroupId, selectedDate).then(setAttRows))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notices', filter: `group_id=eq.${selectedGroupId}` },
        () => fetchNotices(selectedGroupId).then(setNotices))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [screen, selectedGroupId, selectedDate, user, reloadDetail]);

  // ── 액션들 ──
  const saveProfile = async (name) => {
    try { const p = await upsertMyProfile(user.id, name); setProfile(p); }
    catch (e) { showToast('이름 저장 실패'); }
  };
  const openGroup = (id) => { setSelectedGroupId(id); setScreen('detail'); setEditing(false); setView('attendance'); };
  const backToList = () => { setScreen('list'); setEditing(false); };

  const presentSet = new Set(attRows.map(r => r.user_id));
  const toggleAttendance = async (memberUserId) => {
    const present = !presentSet.has(memberUserId);
    try {
      await setAttendance(selectedGroupId, memberUserId, selectedDate, present);
      if (present) { setJustChecked(memberUserId); setTimeout(() => setJustChecked(null), 320); }
      fetchAttendance(selectedGroupId, selectedDate).then(setAttRows);
    } catch (e) { showToast('출석 저장 실패 (권한 확인)'); }
  };

  const submitNotice = async () => {
    if (!noticeTitle.trim()) return;
    try {
      await dbAddNotice(selectedGroupId, user.id, noticeTitle.trim(), noticeBody.trim());
      setNoticeTitle(''); setNoticeBody(''); setComposerOpen(false);
      fetchNotices(selectedGroupId).then(setNotices);
    } catch (e) { showToast('소식 등록 실패'); }
  };
  const removeNotice = async (id) => {
    try { await dbDeleteNotice(id); fetchNotices(selectedGroupId).then(setNotices); }
    catch (e) { showToast('삭제 권한이 없어요'); }
  };

  const shiftDate = (delta) => { const d = fromISO(selectedDate); d.setDate(d.getDate() + delta); setSelectedDate(toISO(d)); };

  const joinGroup = async () => {
    try { await dbJoin(currentGroup.id, user.id, profile.name); showToast(`${currentGroup.name}에 신청했어요`); reloadGroups(); }
    catch (e) { showToast('신청 실패'); }
  };
  const leaveGroup = async () => {
    setConfirmLeave(false);
    try {
      if (isLeader) {
        // 리더가 나가면 소모임방 자체를 삭제 (멤버가 남아있어도)
        await dbDeleteGroup(currentGroup.id);
        backToList();
        showToast('소모임방이 삭제됐어요');
      } else {
        await dbLeave(currentGroup.id, user.id);
        showToast('가입이 해지됐어요');
      }
      setEditing(false);
      reloadGroups();
    } catch (e) { showToast('해지 실패'); }
  };

  const openCreate = () => { setCreateForm({ name: '', image: null, type: 'oneday', tag: TAG_ORDER[0], place: '', meetDate: '', meetTime: '', capacity: 30 }); setScreen('create'); };
  const submitCreate = async () => {
    if (!createForm.name.trim()) return;
    try {
      const payload = {
        name: createForm.name.trim(), type: createForm.type, tag: createForm.tag,
        place: createForm.place.trim(), meet_date: createForm.meetDate || null,
        meet_time: createForm.meetTime.trim(), capacity: Number(createForm.capacity) || 30,
        image: createForm.image, created_by: user.id,
      };
      const g = await createGroup(payload, user.id, profile.name);
      await reloadGroups(); openGroup(g.id); showToast('새 소모임을 만들었어요');
    } catch (e) { showToast('생성 실패: ' + (e?.message || '')); }
  };

  const openEdit = () => {
    setEditForm({ name: currentGroup.name, image: currentGroup.image, type: currentGroup.type || 'oneday',
      tag: currentGroup.tag || TAG_ORDER[0], place: currentGroup.place || '', meetDate: currentGroup.meet_date || '',
      meetTime: currentGroup.meet_time || '', capacity: currentGroup.capacity || 30, leaderUserId: '' });
    setEditing(true);
  };
  const saveEdit = async () => {
    if (!editForm.name.trim()) return;
    try {
      await updateGroup(currentGroup.id, {
        name: editForm.name.trim(), image: editForm.image, type: editForm.type, tag: editForm.tag,
        place: editForm.place.trim(), meet_date: editForm.meetDate || null,
        meet_time: editForm.meetTime.trim(), capacity: Number(editForm.capacity) || 30,
      });
      if (editForm.leaderUserId) await setLeader(currentGroup.id, editForm.leaderUserId);
      setEditing(false); showToast('소모임 정보를 수정했어요'); reloadGroups();
    } catch (e) { showToast('수정 권한이 없어요'); }
  };
  const kickMember = async (memberId) => {
    try { await dbRemoveMember(memberId); reloadGroups(); }
    catch (e) { showToast('권한이 없어요'); }
  };
  const removeGroup = async () => {
    try { await dbDeleteGroup(currentGroup.id); setEditing(false); backToList(); showToast('소모임을 삭제했어요'); reloadGroups(); }
    catch (e) { showToast('삭제 권한이 없어요'); }
  };

  const presentCount = currentGroup ? currentGroup.members.filter(m => presentSet.has(m.user_id)).length : 0;
  const totalCount = currentGroup ? currentGroup.members.length : 0;
  const pct = totalCount ? Math.round((presentCount / totalCount) * 100) : 0;
  const dateObj = fromISO(selectedDate);
  const isToday = selectedDate === toISO(new Date());
  const visibleGroups = (groups || []).filter(g => activeCat === 'all' || g.type === activeCat);
  const cssVars = Object.entries(PALETTE).reduce((acc, [k, v]) => { acc[`--${k}`] = v; return acc; }, {});

  const styleBlock = STYLE;

  // ── 렌더 ──
  if (bootError) return <div className="app-root" style={cssVars}><style>{styleBlock}</style><div className="wrap"><div className="gate"><h2>연결 오류</h2><p>{bootError}</p></div></div></div>;
  if (user === undefined || profile === undefined) return <div className="app-root" style={cssVars}><style>{styleBlock}</style><div className="empty">불러오는 중...</div></div>;

  if (!profile) {
    return (
      <div style={{ ...cssVars, minHeight: 360 }} className="app-root"><style>{styleBlock}</style>
        <div className="wrap"><div className="gate">
          <h2>동수원교회 소모임</h2>
          <p>이름을 알려주시면 소모임 신청, 출석, 소식 나눔을 시작할 수 있어요</p>
          <input placeholder="이름" value={nameDraft} onChange={e => setNameDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && nameDraft.trim()) saveProfile(nameDraft.trim()); }} />
          <button className="gate-btn" disabled={!nameDraft.trim()} onClick={() => saveProfile(nameDraft.trim())}>시작하기</button>
        </div></div>
      </div>
    );
  }

  return (
    <div style={{ ...cssVars, minHeight: 480 }} className="app-root"><style>{styleBlock}</style>
      <div className="wrap">
        <div className="topbar">
          <div className="brand">
            <div className="brand-logo"><svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 4v6c0 4-3 7-7 8-4-1-7-4-7-8V7z" fill="#fff"/></svg></div>
            <div className="brand-name">동수원교회<small>SOMOIM</small></div>
          </div>
          <div className="me-tag" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isAdmin && <span className="admin-badge">관리자</span>}
            {!renaming ? (
              <span>{profile.name}님<button onClick={() => { setNameDraft(profile.name); setRenaming(true); }}>변경</button></span>
            ) : (
              <span style={{ display: 'flex', gap: 4 }}>
                <input value={nameDraft} onChange={e => setNameDraft(e.target.value)} style={{ width: 74, fontSize: 12, padding: '4px 7px', borderRadius: 8, border: '1px solid var(--line)' }} />
                <button onClick={() => { if (nameDraft.trim()) saveProfile(nameDraft.trim()); setRenaming(false); }}>저장</button>
              </span>
            )}
          </div>
        </div>

        {!groups ? (
          <div className="empty">불러오는 중...</div>

        ) : screen === 'list' ? (
          <>
            <div className="cat-row">
              {CATEGORIES.map(c => (
                <button key={c.key} className={`cat-btn ${activeCat === c.key ? 'active' : ''}`} onClick={() => setActiveCat(c.key)}>
                  <CatIcon name={c.icon} color={activeCat === c.key ? '#108a6c' : '#B6BAC4'} />{c.label}
                </button>
              ))}
              <button className={`cat-btn manual-btn ${showManual ? 'active' : ''}`} onClick={() => setShowManual(v => !v)}>
                <span style={{ fontWeight: 800, fontSize: 16 }}>?</span>사용법
              </button>
            </div>
            {showManual && (
              <div className="manual-box">
                <div className="manual-head">
                  <b>소모임 앱 사용법</b>
                  <button onClick={() => setShowManual(false)} aria-label="닫기">×</button>
                </div>
                <ol className="manual-list">
                  <li><b>소모임 찾기</b> — 위 분류(원데이·클럽·챌린지)로 골라보고, 마음에 드는 소모임 카드를 눌러요.</li>
                  <li><b>신청하기</b> — 소모임 안에서 <b>신청하기</b>를 누르면 가입돼요. 가입하면 출석·소식을 함께 쓸 수 있어요.</li>
                  <li><b>출석 체크</b> — 모임 날, 내 이름 옆 동그란 버튼을 눌러 출석을 표시해요. 날짜는 화살표로 넘겨요.</li>
                  <li><b>소식 나눔</b> — <b>소식</b> 탭에서 일정·공지·기도제목을 자유롭게 올려요.</li>
                  <li><b>소모임 만들기</b> — 아래 <b>+ 새 소모임 만들기</b>로 직접 만들 수 있고, 만든 사람이 리더가 돼요.</li>
                  <li><b>앱처럼 쓰기</b> — 브라우저 메뉴에서 "홈 화면에 추가"를 하면 아이콘이 생겨 앱처럼 열려요.</li>
                </ol>
              </div>
            )}
            <button className="cat-btn" style={{ width: '100%', marginTop: 2, color: 'var(--accent)', borderColor: 'var(--accentSoft)', background: 'var(--accentSoft)' }} onClick={openCreate}>+ 새 소모임 만들기</button>
            <div className="cat-divider" />
            {isAdmin && <div className="admin-hint">관리자 모드 · 모든 소모임을 수정·삭제할 수 있어요</div>}
            {visibleGroups.length === 0 ? (
              <div className="empty">아직 이 분류에 소모임이 없어요. 새로 만들어보세요.</div>
            ) : (
              <div className="grid">
                {visibleGroups.map((g) => {
                  const gi = groups.indexOf(g);
                  const mine = !!(user && g.members.some(m => m.user_id === user.id));
                  const theme = TAG_THEMES[g.tag] || { bg: 'var(--soft)', fg: 'var(--sub)' };
                  return (
                    <button key={g.id} className="gcard" onClick={() => openGroup(g.id)}>
                      <CardImage group={g} idx={gi} />
                      <div className="card-tags">{g.tag && <span className="tag-chip" style={{ background: theme.bg, color: theme.fg }}>{g.tag}</span>}</div>
                      <div className="card-title">{g.name}{mine && <span className="card-mine">가입중</span>}</div>
                      <div className="card-meta">{g.place || '장소 미정'}{g.meet_date && <><span className="dot">|</span>{fmtMeetDate(g.meet_date)} {g.meet_time}</>}</div>
                      <div className="card-people">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>
                        인원 <span className="num">{g.members.length}/{g.capacity || '-'}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="share-note">데이터는 Supabase에 저장되어 모든 사람과 실시간으로 공유돼요</div>
          </>

        ) : screen === 'create' ? (
          <div className="detail-wrap">
            <button className="back-btn" onClick={() => setScreen('list')}>‹ 목록으로</button>
            <div className="panel-section-title">새 소모임 만들기</div>
            <div className="panel">
              <FormFields form={createForm} setForm={setCreateForm} />
              <div style={{ fontSize: 12, color: 'var(--sub)' }}>만든 사람({profile.name})이 자동으로 리더가 돼요</div>
              <div className="actions">
                <button className="btn-ghost" onClick={() => setScreen('list')}>취소</button>
                <button className="btn-primary" disabled={!createForm.name.trim()} onClick={submitCreate}>만들기</button>
              </div>
            </div>
          </div>

        ) : currentGroup ? (
          <div className="detail-wrap">
            <button className="back-btn" onClick={backToList}>‹ 목록으로</button>
            <div className="hero">
              {currentGroup.image ? <img src={currentGroup.image} alt="" /> : <div className="hero-fallback" style={{ background: avatarColor(groups.indexOf(currentGroup)).bg, color: avatarColor(groups.indexOf(currentGroup)).fg }}>{initial(currentGroup.name)}</div>}
              {currentGroup.type && TYPE_LABEL[currentGroup.type] && <span className="type-badge" style={{ background: TYPE_COLOR[currentGroup.type] }}>{TYPE_LABEL[currentGroup.type]}</span>}
            </div>
            <div className="detail-head">
              <div>
                <div className="detail-title">{currentGroup.name}</div>
                <div className="detail-sub">
                  리더 {currentGroup.members.find(m => m.is_leader)?.name || '없음'}<span className="dot">|</span>{currentGroup.place || '장소 미정'}
                  {currentGroup.meet_date && <><span className="dot">|</span>{fmtMeetDate(currentGroup.meet_date)} {currentGroup.meet_time}</>}
                </div>
              </div>
              {canEdit && <button className="edit-pencil" onClick={openEdit}>✎ 수정{isAdmin && !isLeader ? ' (관리자)' : ''}</button>}
            </div>

            {editing ? (
              <div className="panel">
                <FormFields form={editForm} setForm={setEditForm} />
                <div><label>리더 지정</label>
                  <select value={editForm.leaderUserId} onChange={e => setEditForm(f => ({ ...f, leaderUserId: e.target.value }))}>
                    <option value="">(변경 안 함)</option>
                    {currentGroup.members.map(m => <option key={m.id} value={m.user_id}>{m.name}</option>)}
                  </select>
                </div>
                <div><label>멤버 관리</label>
                  {currentGroup.members.map(m => (
                    <div key={m.id} className="manage-row">
                      <span className="manage-name">{m.name}{m.is_leader && <span className="leader-tag">리더</span>}</span>
                      <button className="manage-del" onClick={() => kickMember(m.id)}>제외</button>
                    </div>
                  ))}
                </div>
                <div className="actions" style={{ justifyContent: 'space-between' }}>
                  <button className="btn-danger" onClick={removeGroup}>소모임 삭제</button>
                  <span style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-ghost" onClick={() => setEditing(false)}>취소</button>
                    <button className="btn-primary" onClick={saveEdit}>저장</button>
                  </span>
                </div>
              </div>
            ) : !isMember ? (
              <div className="joincard">
                <p>이 소모임에 신청하면 출석 체크와 소식 작성을 함께 할 수 있어요<br/>현재 인원 {currentGroup.members.length}/{currentGroup.capacity}</p>
                <button className="join-btn" onClick={joinGroup}>신청하기</button>
              </div>
            ) : (
              <>
                <div className="stat-bar">
                  <div className="ring" style={{ '--pct': pct }}><div className="ring-inner">{pct}%</div></div>
                  <div className="stat-text"><b>오늘 출석 {presentCount}/{totalCount}</b><span>멤버 {currentGroup.members.length}명 · 정원 {currentGroup.capacity}명</span></div>
                </div>
                <div className="seg">
                  <button className={view === 'attendance' ? 'active' : ''} onClick={() => setView('attendance')}>출석</button>
                  <button className={view === 'notices' ? 'active' : ''} onClick={() => setView('notices')}>소식</button>
                </div>
                {view === 'attendance' ? (
                  <>
                    <div className="date-nav">
                      <button className="navbtn" onClick={() => shiftDate(-1)}>‹</button>
                      <div className="date-label">{dateObj.getMonth() + 1}월 {dateObj.getDate()}일 ({WEEKDAY[dateObj.getDay()]}){isToday && <span className="today-dot" />}</div>
                      <button className="navbtn" onClick={() => shiftDate(1)}>›</button>
                    </div>
                    <div className="member-list">
                      {currentGroup.members.map((m, i) => {
                        const on = presentSet.has(m.user_id); const c = avatarColor(i);
                        const editable = m.user_id === user.id || canEdit;
                        return (
                          <div key={m.id} className={`member-row ${on ? 'on' : ''}`}>
                            <div className="member-left">
                              <div className="m-ava" style={{ background: c.bg, color: c.fg }}>{initial(m.name)}</div>
                              <div className="member-name">{m.name}{m.is_leader && <span className="leader-tag">리더</span>}</div>
                            </div>
                            <button className={`check-btn ${on ? 'on' : ''} ${justChecked === m.user_id ? 'bump' : ''}`} disabled={!editable} style={{ opacity: editable ? 1 : .4 }} onClick={() => editable && toggleAttendance(m.user_id)}>
                              {on && <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <button className="leave-link" onClick={() => setConfirmLeave(true)}>이 소모임 가입 해지하기</button>
                  </>
                ) : (
                  <>
                    {!composerOpen ? <button className="composer-toggle" onClick={() => setComposerOpen(true)}>+ 소식 쓰기</button> : (
                      <div className="composer">
                        <input placeholder="제목" value={noticeTitle} onChange={e => setNoticeTitle(e.target.value)} />
                        <textarea placeholder="내용 (일정, 공지, 기도제목 등)" value={noticeBody} onChange={e => setNoticeBody(e.target.value)} />
                        <div className="actions">
                          <button className="btn-ghost" onClick={() => { setComposerOpen(false); setNoticeTitle(''); setNoticeBody(''); }}>취소</button>
                          <button className="btn-primary" onClick={submitNotice}>등록</button>
                        </div>
                      </div>
                    )}
                    <div className="notices-list">
                      {notices.length === 0 ? <div className="empty">아직 등록된 소식이 없어요</div> : notices.map(n => (
                        <div key={n.id} className="notice-card">
                          <div className="notice-top">
                            <div><div className="notice-tag">소식</div><div className="notice-title">{n.title}</div></div>
                            {(n.author_id === user.id || canEdit) && <button className="notice-del" onClick={() => removeNotice(n.id)}>×</button>}
                          </div>
                          {n.body && <div className="notice-body">{n.body}</div>}
                          <div className="notice-date">{(n.created_at || '').slice(0, 10)}</div>
                        </div>
                      ))}
                    </div>
                    <button className="leave-link" onClick={() => setConfirmLeave(true)}>이 소모임 가입 해지하기</button>
                  </>
                )}
              </>
            )}
          </div>
        ) : <div className="empty">소모임을 찾을 수 없어요.</div>}
      </div>
      {confirmLeave && currentGroup && (
        <div className="modal-overlay" onClick={() => setConfirmLeave(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{isLeader ? '소모임방을 삭제할까요?' : '가입을 해지할까요?'}</div>
            <p className="modal-desc">
              {isLeader
                ? `리더가 나가면 「${currentGroup.name}」 소모임방이 삭제돼요. 출석·소식·멤버 정보가 모두 사라지며 되돌릴 수 없어요.`
                : `「${currentGroup.name}」에서 내 가입이 해지돼요. 언제든 다시 신청할 수 있어요.`}
            </p>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setConfirmLeave(false)}>취소</button>
              <button className="btn-danger" onClick={leaveGroup}>{isLeader ? '삭제하기' : '해지하기'}</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

const STYLE = `
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css');
.app-root { font-family:'Pretendard', system-ui, sans-serif; color: var(--ink); background: var(--bg); padding: 18px 14px 36px; box-sizing:border-box; -webkit-font-smoothing:antialiased; }
.app-root * { box-sizing: border-box; }
.wrap { max-width: 880px; margin: 0 auto; }
.topbar { display:flex; align-items:center; justify-content:space-between; padding: 0 2px 16px; gap:8px; border-bottom:1px solid var(--line); margin-bottom:18px; }
.brand { display:flex; align-items:center; gap:9px; }
.brand-logo { width:30px; height:30px; border-radius:9px; background: linear-gradient(135deg,#27C39A,#3B82F6); display:flex; align-items:center; justify-content:center; }
.brand-name { font-size:16px; font-weight:800; letter-spacing:-.01em; }
.brand-name small { display:block; font-size:9px; letter-spacing:.12em; color: var(--sub); font-weight:600; margin-top:1px; }
.me-tag { font-size:12px; color: var(--sub); font-weight:600; }
.me-tag button { background:none; border:none; color: var(--accent); font-weight:700; cursor:pointer; font-size:12px; padding:0 0 0 5px; }
.admin-badge { font-size:10px; font-weight:800; color:#fff; background: linear-gradient(135deg,#5E5CE6,#3B82F6); padding:3px 8px; border-radius:6px; }
.cat-row { display:grid; grid-template-columns: repeat(5, 1fr); gap:10px; margin-bottom:8px; }
.manual-btn { color: var(--accent); border-color: var(--accentSoft); }
.manual-btn.active { background: var(--accentSoft); border-color: var(--accent); color: var(--accent); }
.manual-box { background: var(--accentSoft); border-radius:14px; padding:16px 18px; margin:8px 0 4px; }
.manual-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
.manual-head b { font-size:14px; color: var(--accent); }
.manual-head button { background:none; border:none; font-size:20px; color: var(--accent); cursor:pointer; line-height:1; padding:0 2px; }
.manual-list { margin:0; padding-left:20px; display:flex; flex-direction:column; gap:7px; }
.manual-list li { font-size:12.5px; color:#4B4B55; line-height:1.55; }
.manual-list li b { color: var(--ink); }
.cat-btn { display:flex; align-items:center; justify-content:center; gap:9px; padding:16px 10px; border-radius:14px; border:1.5px solid var(--line); background: var(--bg); cursor:pointer; font-weight:700; font-size:14px; color: var(--ink); transition: all .15s ease; }
.cat-btn:hover { border-color: var(--mint); }
.cat-btn.active { background: var(--mintSoft); border-color: var(--mint); color:#108a6c; }
.cat-divider { height:1px; background: var(--line); margin: 18px 0 22px; }
.admin-hint { background: var(--accentSoft); color: var(--accent); font-size:12px; font-weight:600; padding:10px 14px; border-radius:11px; margin-bottom:18px; }
.grid { display:grid; grid-template-columns: repeat(3, 1fr); gap:22px 20px; }
.gcard { background: var(--bg); border:none; padding:0; cursor:pointer; text-align:left; display:flex; flex-direction:column; }
.card-img-wrap { position:relative; width:100%; aspect-ratio: 3 / 2; border-radius:10px; overflow:hidden; background: var(--soft); }
.card-img { width:100%; height:100%; object-fit:cover; display:block; }
.card-img-fallback { display:flex; align-items:center; justify-content:center; font-size:46px; font-weight:800; }
.type-badge { position:absolute; top:10px; left:10px; color:#fff; font-size:11px; font-weight:700; padding:3px 9px; border-radius:6px; }
.card-tags { display:flex; gap:6px; flex-wrap:wrap; margin:14px 0 8px; }
.tag-chip { font-size:11px; font-weight:600; padding:3px 9px; border-radius:999px; }
.card-title { font-size:16px; font-weight:800; letter-spacing:-.01em; line-height:1.35; }
.card-meta { font-size:12.5px; color: var(--sub); margin-top:9px; font-weight:500; }
.card-meta .dot { margin:0 6px; opacity:.5; }
.card-people { display:flex; align-items:center; gap:5px; font-size:12.5px; color: var(--sub); margin-top:8px; font-weight:600; }
.card-people .num { color: var(--ink); }
.card-mine { display:inline-block; font-size:10px; background: var(--goodSoft); color: var(--good); font-weight:700; padding:2px 7px; border-radius:6px; margin-left:6px; }
.empty { text-align:center; padding: 40px 10px; color: var(--sub); font-size:13px; }
.gate { background: var(--soft); border-radius:20px; padding:30px 24px; text-align:center; max-width:380px; margin:30px auto; }
.gate h2 { font-size:17px; font-weight:800; margin:0 0 6px; }
.gate p { font-size:13px; color: var(--sub); margin:0 0 18px; line-height:1.5; }
.gate input { width:100%; font-family:'Pretendard',sans-serif; border:1px solid var(--line); border-radius:12px; padding:12px 14px; font-size:14px; text-align:center; margin-bottom:10px; }
.gate-btn { width:100%; background: var(--mint); color:#fff; border:none; padding:12px; border-radius:12px; font-weight:700; font-size:14px; cursor:pointer; }
.back-btn { display:flex; align-items:center; gap:4px; background:none; border:none; color: var(--sub); font-weight:700; font-size:13px; cursor:pointer; padding:4px 2px 16px; }
.back-btn:hover { color: var(--mint); }
.detail-wrap { max-width: 560px; margin:0 auto; }
.hero { position:relative; width:100%; aspect-ratio: 16/7; border-radius:18px; overflow:hidden; background: var(--soft); margin-bottom:16px; }
.hero img { width:100%; height:100%; object-fit:cover; }
.hero-fallback { width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:60px; font-weight:800; }
.hero .type-badge { top:12px; left:12px; font-size:12px; padding:4px 11px; }
.detail-head { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin-bottom:4px; }
.detail-title { font-size:20px; font-weight:800; letter-spacing:-.01em; }
.detail-sub { font-size:13px; color: var(--sub); margin-top:6px; font-weight:500; }
.detail-sub .dot { margin:0 6px; opacity:.5; }
.edit-pencil { background: var(--soft); border:none; cursor:pointer; color: var(--sub); font-size:13px; flex:0 0 auto; padding:7px 11px; border-radius:9px; font-weight:700; }
.edit-pencil:hover { color: var(--accent); }
.panel { background: var(--soft); border-radius:16px; padding:16px; display:flex; flex-direction:column; gap:12px; margin:16px 0; }
.panel label { font-size:11.5px; font-weight:700; color: var(--sub); margin-bottom:5px; display:block; }
.panel input, .panel textarea, .panel select { font-family:'Pretendard', sans-serif; border:1px solid var(--line); border-radius:10px; padding:9px 11px; font-size:13px; background: var(--bg); color: var(--ink); width:100%; }
.field-row { display:flex; gap:10px; } .field-row > div { flex:1; }
.seg-pick { display:flex; gap:6px; }
.seg-pick button { flex:1; padding:8px 0; border-radius:9px; border:1.5px solid var(--line); background: var(--bg); font-weight:700; font-size:12.5px; color: var(--sub); cursor:pointer; }
.seg-pick button.on { border-color: var(--mint); background: var(--mintSoft); color:#108a6c; }
.panel-section-title { font-size:15px; font-weight:800; margin-bottom:4px; }
.manage-row { display:flex; align-items:center; justify-content:space-between; padding:7px 2px; }
.manage-name { font-size:13px; font-weight:600; display:flex; align-items:center; gap:6px; }
.manage-del { background:none; border:none; color: var(--sub); cursor:pointer; font-size:12.5px; font-weight:700; }
.manage-del:hover { color: var(--warn); }
.stat-bar { display:flex; align-items:center; gap:12px; background: var(--soft); border-radius:14px; padding:14px 16px; margin-bottom:16px; }
.ring { width:42px; height:42px; border-radius:50%; flex:0 0 auto; background: conic-gradient(var(--good) calc(var(--pct)*1%), var(--line) 0); display:flex; align-items:center; justify-content:center; }
.ring-inner { width:32px; height:32px; border-radius:50%; background: var(--soft); display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:800; }
.stat-text b { font-size:14px; } .stat-text span { font-size:12px; color: var(--sub); display:block; margin-top:1px; }
.seg { display:flex; background: var(--soft); border-radius: 13px; padding:3px; margin-bottom:16px; }
.seg > button { flex:1; text-align:center; padding:9px 0; border-radius: 10px; border:none; cursor:pointer; font-weight:700; font-size:13px; background:transparent; color: var(--sub); transition: all .15s ease; }
.seg > button.active { background: var(--bg); color: var(--ink); box-shadow: 0 1px 4px rgba(0,0,0,.08); }
.date-nav { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
.navbtn { width:28px; height:28px; border-radius:50%; border:none; background: var(--soft); color: var(--sub); cursor:pointer; font-size:15px; display:flex; align-items:center; justify-content:center; }
.navbtn:hover { background: var(--mintSoft); color: var(--mint); }
.date-label { font-weight:700; font-size:14px; display:flex; align-items:center; gap:6px; }
.today-dot { width:5px; height:5px; border-radius:50%; background: var(--good); display:inline-block; }
.member-list { display:flex; flex-direction:column; gap:5px; }
.member-row { display:flex; align-items:center; justify-content:space-between; padding:9px 8px; border-radius:13px; transition: background .15s ease; }
.member-row.on { background: var(--goodSoft); }
.member-left { display:flex; align-items:center; gap:11px; min-width:0; }
.m-ava { width:36px; height:36px; border-radius:11px; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:14px; flex:0 0 auto; }
.member-name { font-weight:600; font-size:14px; }
.leader-tag { font-size:9.5px; background: var(--accentSoft); color: var(--accent); padding:2px 6px; border-radius:6px; font-weight:700; margin-left:6px; }
.check-btn { width:28px; height:28px; border-radius:9px; flex:0 0 auto; border:1.6px solid var(--line); background: var(--bg); cursor:pointer; display:flex; align-items:center; justify-content:center; transition: all .15s ease; }
.check-btn.on { background: var(--good); border-color: var(--good); }
.check-btn.bump { animation: bump .32s ease-out; }
@keyframes bump { 0% { transform: scale(.7); } 60% { transform: scale(1.18); } 100% { transform: scale(1); } }
.notices-list { display:flex; flex-direction:column; gap:9px; }
.notice-card { background: var(--soft); border-radius: 14px; padding: 13px 15px; }
.notice-top { display:flex; justify-content:space-between; gap:8px; align-items:flex-start; }
.notice-tag { display:inline-block; font-size:10px; font-weight:700; color: var(--mint); background: var(--mintSoft); padding:2px 8px; border-radius:6px; margin-bottom:6px; }
.notice-title { font-weight:700; font-size:14px; }
.notice-date { font-size:11px; color: var(--sub); margin-top:3px; font-weight:500; }
.notice-body { font-size:13px; color:#4B4B55; margin-top:6px; line-height:1.55; white-space:pre-wrap; }
.notice-del { background:none; border:none; color: var(--sub); cursor:pointer; font-size:16px; padding:2px 4px; flex:0 0 auto; }
.notice-del:hover { color: var(--warn); }
.composer-toggle { width:100%; padding:12px; border:none; background: var(--mintSoft); color:#108a6c; border-radius:13px; font-weight:700; font-size:13px; cursor:pointer; margin-bottom:14px; }
.composer { display:flex; flex-direction:column; gap:8px; margin-bottom:14px; background: var(--soft); border-radius:14px; padding:13px; }
.composer input, .composer textarea { font-family:'Pretendard', sans-serif; border:1px solid var(--line); border-radius:10px; padding:9px 11px; font-size:13px; background: var(--bg); color: var(--ink); resize:vertical; width:100%; }
.composer textarea { min-height:60px; }
.actions { display:flex; gap:8px; justify-content:flex-end; }
.btn-primary { background: var(--mint); color:#fff; border:none; padding:9px 18px; border-radius:11px; font-weight:700; font-size:13px; cursor:pointer; }
.btn-ghost { background:none; border:none; color: var(--sub); padding:9px 11px; font-size:13px; cursor:pointer; font-weight:600; }
.btn-danger { background: var(--warnSoft); color: var(--warn); border:none; padding:9px 15px; border-radius:11px; font-weight:700; font-size:12.5px; cursor:pointer; }
.joincard { text-align:center; padding:14px 4px; }
.joincard p { font-size:13px; color: var(--sub); margin:0 0 16px; line-height:1.6; }
.join-btn { background: var(--mint); color:#fff; border:none; padding:12px 32px; border-radius:13px; font-weight:700; font-size:14px; cursor:pointer; }
.leave-link { background:none; border:none; color: var(--sub); font-size:12px; font-weight:600; cursor:pointer; text-decoration:underline; margin-top:14px; display:block; }
.modal-overlay { position:fixed; inset:0; background:rgba(20,20,40,.45); display:flex; align-items:center; justify-content:center; z-index:60; padding:20px; }
.modal-box { background:var(--bg); border-radius:18px; padding:22px; max-width:340px; width:100%; box-shadow:0 16px 40px rgba(0,0,0,.25); }
.modal-title { font-size:16px; font-weight:800; margin-bottom:8px; }
.modal-desc { font-size:13px; color:#4B4B55; line-height:1.6; margin:0 0 18px; }
.modal-actions { display:flex; gap:8px; justify-content:flex-end; }
.toast { position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background: var(--ink); color:#fff; padding:9px 18px; border-radius:11px; font-size:13px; box-shadow:0 6px 18px rgba(0,0,0,.2); z-index:50; }
.share-note { text-align:center; font-size:11px; color: var(--sub); margin-top:24px; font-weight:500; }
@media (max-width: 720px) { .grid { grid-template-columns: repeat(2, 1fr); gap:20px 14px; } .cat-row { grid-template-columns: repeat(3, 1fr); gap:8px; } .cat-btn { flex-direction:column; gap:6px; padding:13px 6px; font-size:12.5px; } }
@media (max-width: 460px) { .grid { grid-template-columns: 1fr; } }
`;
