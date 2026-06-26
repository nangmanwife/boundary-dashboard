/* =========================================================
   박지영의 3개월 바운더리 — 키즈러닝랩
   v3: 인사이트 스냅샷 (시점별 누적) + D+3/D+30 알림 + 캘린더 마커 확장
   ========================================================= */

(() => {
  'use strict';

  // ===== 상수 =====
  const STORAGE_KEY = 'boundary-dashboard:v1';
  const START_DATE = '2026-06-23';
  const END_DATE   = '2026-09-23';
  const TARGET_REELS = 36;
  const CATEGORIES = ['엄마', '러닝', '키즈', '가치', '기타'];

  // 차트 색상 팔레트 (ACCENT 위주 + 보조색)
  const CHART_COLORS = {
    accent: '#B83A2E',
    accentSoft: 'rgba(184, 58, 46, 0.15)',
    accentStrong: '#8E2B22',
    green: '#2D6A4F',
    gray: '#8A8A8A',
    black: '#1A1A1A',
    palette: ['#B83A2E', '#2D6A4F', '#1A1A1A', '#D88A40', '#5C7BA4', '#8A8A8A', '#C7A57B']
  };

  // ===== 상태 =====
  let state = {
    contents: [],
    weekly_metrics: [],
    refs: [],
    settings: {}
  };

  // UI 상태 (저장 안 됨)
  const ui = {
    monthOpen: new Set(),           // 펼친 월 키 (예: "2026-07")
    refFilter: 'all',
    refSort: 'views_desc',
    refSearch: '',
    chartTab: 'views',
    chartMode: 'latest',            // 'latest' | 'snapshot' | 'timeline'
    chartModeLabel: 'D+3',          // snapshot 모드용
    chartModeEpisode: null,         // timeline 모드용 (content id)
    screenshotData: '',             // 임시 base64 (콘텐츠 폼 — 더 이상 사용 X, 호환용)
    snapshotScreenshotData: '',     // 스냅샷 모달용
    refCheckedCats: new Set()
  };

  // Chart 인스턴스 (재렌더 시 destroy 위해 보관)
  const charts = {
    line: null,
    age: null,
    cat: null
  };

  // ===== 유틸 =====
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const uuid = () => (crypto.randomUUID && crypto.randomUUID()) ||
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });

  const parseDate = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const fmtDate = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const daysBetween = (a, b) => Math.round((b - a) / 86400000);
  const today = () => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  };
  const escapeHTML = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
  const escapeAttr = (s) => escapeHTML(s);

  // 인스타 릴스/게시물 URL → 임베드 URL (토큰 없이 iframe 재생)
  // 지원: /reel/{code} · /p/{code} · /tv/{code}  (쿼리스트링·끝슬래시 허용)
  const instaEmbedUrl = (link) => {
    if (!link) return null;
    const m = String(link).match(/instagram\.com\/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/);
    return m ? `https://www.instagram.com/reel/${m[1]}/embed` : null;
  };

  // 조회수 포맷: 12400 → "1.2만", 1240000 → "124만", 1.2M 형식 옵션
  const fmtViews = (n) => {
    n = Number(n) || 0;
    if (n >= 1_000_000) {
      const v = n / 10_000;
      if (v >= 10_000) return (v / 10_000).toFixed(1).replace(/\.0$/, '') + 'M';
      return v.toFixed(v >= 100 ? 0 : 1).replace(/\.0$/, '') + '만';
    }
    if (n >= 10_000) {
      return (n / 10_000).toFixed(1).replace(/\.0$/, '') + '만';
    }
    if (n >= 1000) return n.toLocaleString();
    return String(n);
  };

  // ===== 시점/스냅샷 유틸 =====
  const ageInDays = (postedDateStr, refDate) => {
    // 게시일로부터 며칠 지났는지 (오늘 = 0). 음수 가능 (미래 게시).
    if (!postedDateStr) return 0;
    const posted = parseDate(postedDateStr);
    const ref = refDate || today();
    return daysBetween(posted, ref);
  };
  const labelFromDays = (n) => `D+${n}`;
  const dateFromOffset = (postedDateStr, days) => {
    if (!postedDateStr) return '';
    const d = parseDate(postedDateStr);
    d.setDate(d.getDate() + Number(days || 0));
    return fmtDate(d);
  };
  const labelDaysMap = { 'D+1': 1, 'D+3': 3, 'D+7': 7, 'D+14': 14, 'D+30': 30 };

  // 회차의 최신 스냅샷 (= D+N 가장 큼)
  const latestSnapshot = (c) => {
    const arr = c?.insights_snapshots || [];
    if (!arr.length) return null;
    return [...arr].sort((a, b) =>
      (Number(b.days_since_post) || 0) - (Number(a.days_since_post) || 0)
    )[0];
  };
  // 특정 라벨의 스냅샷
  const snapshotByLabel = (c, label) => {
    return (c?.insights_snapshots || []).find(s => s.label === label) || null;
  };
  // 차트·테이블이 쓰는 "대표 인사이트" — 최신 스냅샷의 지표
  const effectiveInsights = (c) => {
    const snap = latestSnapshot(c);
    return snap || c?.insights || null;
  };

  // ===== 마이그레이션 / 저장 / 로드 =====
  const migrateContent = (c) => {
    // 기존 필드 + 새 필드 기본값
    const out = {
      id: c.id || uuid(),
      episode: c.episode,
      date: c.date,
      title: c.title || '',
      memo: c.memo || '',
      link: c.link || '',
      category: c.category || '',
      insights: c.insights || {},
      insights_snapshots: Array.isArray(c.insights_snapshots) ? c.insights_snapshots : [],
      production: c.production || {},
      dismissed_alerts: Array.isArray(c.dismissed_alerts) ? c.dismissed_alerts : []
    };

    // 기존 insights 단일 객체 → snapshots[0]로 마이그레이션 (스냅샷이 비어있고 데이터가 있을 때만)
    const iv = out.insights || {};
    const hasOldData = iv && Object.keys(iv).some(k => {
      const v = iv[k];
      return v !== undefined && v !== null && v !== '' &&
        !(typeof v === 'object' && !Object.keys(v).length);
    });
    if (out.insights_snapshots.length === 0 && hasOldData) {
      const migrated = {
        id: uuid(),
        snapshot_date: out.date || fmtDate(today()),
        days_since_post: 0,
        label: '마이그레이션',
        views: iv.views,
        reach: iv.reach,
        avg_watch_seconds: iv.avg_watch_seconds,
        likes: iv.likes,
        comments: iv.comments,
        reposts: iv.reposts,
        shares: iv.shares,
        saves: iv.saves,
        profile_visits: iv.profile_visits,
        follows: iv.follows,
        age_dist: iv.age_dist || {},
        screenshot_url: iv.screenshot_url || '',
        note: '기존 단일 인사이트에서 자동 이관됨'
      };
      out.insights_snapshots.push(migrated);
      console.log(`[migrate] #${out.episode || '?'} "${out.title}" — 단일 인사이트 → 스냅샷 1개로 이관`);
    }

    // 스냅샷 정렬 (D+N 오름차순)
    out.insights_snapshots.sort((a, b) =>
      (Number(a.days_since_post) || 0) - (Number(b.days_since_post) || 0)
    );
    return out;
  };
  const migrateRef = (r) => ({
    id: r.id || uuid(),
    title: r.title || '',
    source_url: r.source_url || '',
    account_url: r.account_url || '',
    views: Number(r.views) || 0,
    categories: Array.isArray(r.categories) ? r.categories : [],
    script: r.script || '',
    note: r.note || '',
    video_url: r.video_url || '',
    created_at: r.created_at || Date.now()
  });

  const load = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const rawContents = Array.isArray(parsed.contents) ? parsed.contents : [];
        console.log(`[load] LocalStorage에서 ${rawContents.length}개 회차 로드 중…`);
        state.contents = rawContents.map(migrateContent);
        const totalSnaps = state.contents.reduce((s, c) => s + (c.insights_snapshots?.length || 0), 0);
        console.log(`[load] 총 ${totalSnaps}개 인사이트 스냅샷 (마이그레이션 포함)`);
        state.weekly_metrics = Array.isArray(parsed.weekly_metrics) ? parsed.weekly_metrics : [];
        state.refs = (Array.isArray(parsed.refs) ? parsed.refs : []).map(migrateRef);
        state.settings = parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : {};
      } else {
        console.log('[load] 저장된 데이터 없음 — 새로 시작');
      }
    } catch (e) {
      console.warn('LocalStorage load failed:', e);
    }
  };
  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('LocalStorage save failed:', e);
      alert('저장 실패. 용량이 부족할 수 있어 (스크린샷 base64 너무 큼?). 콘솔 확인.');
    }
  };

  // ===== KPI 렌더 =====
  const renderKPI = () => {
    const startD = parseDate(START_DATE);
    const endD = parseDate(END_DATE);
    const totalDays = daysBetween(startD, endD) + 1;
    const t = today();
    let elapsed = daysBetween(startD, t) + 1;
    if (elapsed < 0) elapsed = 0;
    if (elapsed > totalDays) elapsed = totalDays;

    const upCount = state.contents.length;
    const upPct = Math.min(100, Math.round((upCount / TARGET_REELS) * 100));
    $('#kpiUploadCount').textContent = upCount;
    $('#kpiUploadPct').textContent = upPct;
    $('#kpiUploadRemaining').textContent = Math.max(0, TARGET_REELS - upCount);
    $('#kpiUploadBar').style.width = upPct + '%';

    const dayPct = Math.round((elapsed / totalDays) * 100);
    $('#kpiDayCount').textContent = elapsed;
    $('#kpiDayPct').textContent = dayPct;
    $('#kpiDayRemaining').textContent = Math.max(0, totalDays - elapsed);
    $('#kpiDayBar').style.width = dayPct + '%';

    const signal = state.weekly_metrics.reduce((s, m) => s + (Number(m.where_can_i_run_count) || 0), 0);
    const dm = state.weekly_metrics.reduce((s, m) => s + (Number(m.new_dm) || 0), 0);
    $('#kpiSignalCount').textContent = signal;
    $('#kpiDmCount').textContent = dm;
    const signalPct = Math.min(100, Math.round((signal / 36) * 100));
    $('#kpiSignalBar').style.width = signalPct + '%';

    $('#celebration').hidden = upCount < TARGET_REELS;
  };

  // ===== 캘린더: 월별 그룹화 =====
  // 기간 내 월 목록: 2026-06, 2026-07, 2026-08, 2026-09
  const getMonthKeys = () => {
    const startD = parseDate(START_DATE);
    const endD = parseDate(END_DATE);
    const keys = [];
    let y = startD.getFullYear();
    let m = startD.getMonth();
    while (y < endD.getFullYear() || (y === endD.getFullYear() && m <= endD.getMonth())) {
      keys.push(`${y}-${String(m + 1).padStart(2, '0')}`);
      m++;
      if (m > 11) { m = 0; y++; }
    }
    return keys;
  };

  const monthLabel = (key) => {
    const [y, m] = key.split('-');
    return `${Number(m)}월 (${y})`;
  };

  // 해당 월의 기간 내 콘텐츠
  const contentsForMonth = (monthKey) => {
    return state.contents.filter(c => (c.date || '').startsWith(monthKey));
  };

  const renderCalendar = () => {
    const root = $('#monthList');
    root.innerHTML = '';
    const startD = parseDate(START_DATE);
    const endD = parseDate(END_DATE);
    const t = today();
    const todayMonthKey = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;

    // 기본 펼침: 오늘이 속한 월. 단 ui.monthOpen이 비면 자동 세팅.
    if (ui.monthOpen.size === 0) {
      // 오늘이 기간 안이면 그 월, 아니면 첫 월
      const monthKeys = getMonthKeys();
      if (monthKeys.includes(todayMonthKey)) ui.monthOpen.add(todayMonthKey);
      else ui.monthOpen.add(monthKeys[0]);
    }

    getMonthKeys().forEach(monthKey => {
      const [yStr, mStr] = monthKey.split('-');
      const year = Number(yStr);
      const monthIdx = Number(mStr) - 1;

      // 월간 KPI — 각 회차의 최신 스냅샷 기준
      const monthContents = contentsForMonth(monthKey);
      const upCount = monthContents.length;
      const monthIV = monthContents.map(c => effectiveInsights(c));
      const views = monthIV.map(iv => Number(iv?.views) || 0).filter(v => v > 0);
      const avgViews = views.length ? Math.round(views.reduce((a, b) => a + b, 0) / views.length) : 0;
      const engRates = monthIV
        .map(iv => {
          const v = Number(iv?.views) || 0;
          if (v === 0) return null;
          const eng = (Number(iv?.likes) || 0) +
            (Number(iv?.comments) || 0) +
            (Number(iv?.shares) || 0) +
            (Number(iv?.saves) || 0);
          return (eng / v) * 100;
        })
        .filter(x => x !== null);
      const avgEng = engRates.length ? (engRates.reduce((a, b) => a + b, 0) / engRates.length).toFixed(1) : '0';

      // 월 카드
      const isOpen = ui.monthOpen.has(monthKey);
      const block = document.createElement('div');
      block.className = 'month-block' + (isOpen ? ' is-open' : '');

      block.innerHTML = `
        <div class="month-block__head" data-month="${monthKey}">
          <div class="month-block__title">
            <span class="month-block__chevron">▶</span>
            <span>${escapeHTML(monthLabel(monthKey))}</span>
          </div>
          <div class="month-block__kpi">
            ${upCount}편 업로드 · 평균 조회 ${fmtViews(avgViews)} · 평균 참여율 ${avgEng}%
          </div>
        </div>
        <div class="month-block__body">
          <div class="cal-weekdays">
            <div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div>토</div><div>일</div>
          </div>
          <div class="cal-grid" data-grid="${monthKey}"></div>
        </div>
      `;
      root.appendChild(block);

      // 월 그리드 채우기 (해당 월 1일 ~ 말일, 단 기간 외 셀은 'out')
      const firstOfMonth = new Date(year, monthIdx, 1);
      const lastOfMonth = new Date(year, monthIdx + 1, 0);
      const startWeekIdx = (firstOfMonth.getDay() + 6) % 7;
      const gridStart = new Date(firstOfMonth);
      gridStart.setDate(firstOfMonth.getDate() - startWeekIdx);
      const endWeekIdx = (lastOfMonth.getDay() + 6) % 7;
      const gridEnd = new Date(lastOfMonth);
      gridEnd.setDate(lastOfMonth.getDate() + (6 - endWeekIdx));

      const grid = block.querySelector(`[data-grid="${monthKey}"]`);
      const totalCells = daysBetween(gridStart, gridEnd) + 1;
      const byDate = new Map();
      state.contents.forEach(c => byDate.set(c.date, c));

      // 시점 마커 인덱스: 날짜 → [{content, label}]
      // D+3 / D+30 시점 (게시일 + 3 / + 30)
      const markersByDate = new Map();
      state.contents.forEach(c => {
        if (!c.date) return;
        [['D+3', 3], ['D+30', 30]].forEach(([label, n]) => {
          const ds = dateFromOffset(c.date, n);
          if (!ds) return;
          const arr = markersByDate.get(ds) || [];
          arr.push({ content: c, label, days: n });
          markersByDate.set(ds, arr);
        });
      });

      for (let i = 0; i < totalCells; i++) {
        const d = new Date(gridStart);
        d.setDate(gridStart.getDate() + i);
        const ds = fmtDate(d);
        const inPeriod = d >= startD && d <= endD;
        const inMonth = d.getMonth() === monthIdx && d.getFullYear() === year;
        const isToday = d.getTime() === t.getTime();
        const upload = byDate.get(ds);

        const cell = document.createElement('div');
        cell.className = 'cal-cell';
        if (!inPeriod || !inMonth) cell.classList.add('cal-cell--out');
        if (isToday && inPeriod && inMonth) cell.classList.add('cal-cell--today');
        if (upload && inMonth) cell.classList.add('cal-cell--done');

        if (inPeriod && inMonth) {
          const label = `${d.getMonth() + 1}/${d.getDate()}`;
          const ep = upload ? `#${upload.episode}` : '';

          // 시점 마커 도트 (D+3 / D+30 / 완료)
          const markers = markersByDate.get(ds) || [];
          const dotsHTML = markers.map(mk => {
            const captured = !!snapshotByLabel(mk.content, mk.label);
            const cls = captured ? 'cal-dot--done' : (mk.label === 'D+3' ? 'cal-dot--d3' : 'cal-dot--d30');
            const title = `#${mk.content.episode} ${mk.label}${captured ? ' (완료)' : ' (미캡처)'}`;
            return `<span class="cal-dot ${cls}" data-cdot data-cid="${mk.content.id}" data-clabel="${mk.label}" title="${escapeAttr(title)}"></span>`;
          }).join('');

          cell.innerHTML = `
            <div class="cal-cell__day">${label}</div>
            <div class="cal-cell__ep">${ep}</div>
            ${dotsHTML ? `<div class="cal-cell__dots">${dotsHTML}</div>` : ''}
          `;
          cell.title = upload
            ? `#${upload.episode} ${upload.title}`
            : `${ds} — 클릭하면 콘텐츠 추가`;

          // 도트 클릭 → 해당 회차 편집 + 스냅샷 모달
          cell.querySelectorAll('[data-cdot]').forEach(dot => {
            dot.addEventListener('click', (e) => {
              e.stopPropagation();
              editContent(dot.dataset.cid, { openSnapshot: true, preselectLabel: dot.dataset.clabel });
            });
          });

          // 셀 클릭 (도트 외)
          cell.addEventListener('click', () => {
            if (upload) editContent(upload.id);
            else prefillForm(ds);
          });
        }
        grid.appendChild(cell);
      }

      // 헤더 클릭 → 토글
      block.querySelector('.month-block__head').addEventListener('click', () => {
        if (ui.monthOpen.has(monthKey)) ui.monthOpen.delete(monthKey);
        else ui.monthOpen.add(monthKey);
        renderCalendar();
      });
    });
  };

  // ===== 콘텐츠 폼 =====
  const nextEpisode = () => {
    if (state.contents.length === 0) return 1;
    const max = state.contents.reduce((m, c) => Math.max(m, Number(c.episode) || 0), 0);
    return Math.min(TARGET_REELS, max + 1);
  };

  const resetProductionFields = () => {
    $('#pr_hook').value = '';
    $('#pr_duration').value = '';
    $('#pr_subtitles').value = 'false';
    $$('.pr_footage').forEach(cb => cb.checked = false);
    $('#pr_music').value = '';
    $('#pr_hashtags').value = '';
  };

  const prefillForm = (dateStr) => {
    $('#contentId').value = '';
    $('#date').value = dateStr || '';
    $('#episode').value = nextEpisode();
    $('#title').value = '';
    $('#memo').value = '';
    $('#link').value = '';
    $('#category').value = '';
    resetProductionFields();
    renderSnapshotsList(null);  // 신규 회차 → 빈 리스트
    $('#formTitle').textContent = '콘텐츠 추가';
    $('#btnSave').textContent = '저장';
    $('#title').focus();
    $('#contentForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const editContent = (id, opts = {}) => {
    const c = state.contents.find(x => x.id === id);
    if (!c) return;
    $('#contentId').value = c.id;
    $('#episode').value = c.episode;
    $('#date').value = c.date;
    $('#title').value = c.title;
    $('#memo').value = c.memo || '';
    $('#link').value = c.link || '';
    $('#category').value = c.category || '';

    // 스냅샷 리스트 렌더
    renderSnapshotsList(c);

    // 제작 메타 채우기
    const pr = c.production || {};
    $('#pr_hook').value = pr.hook || '';
    $('#pr_duration').value = pr.duration_sec ?? '';
    $('#pr_subtitles').value = pr.subtitles ? 'true' : 'false';
    $$('.pr_footage').forEach(cb => {
      cb.checked = Array.isArray(pr.footage_from) && pr.footage_from.includes(cb.value);
    });
    $('#pr_music').value = pr.music || '';
    $('#pr_hashtags').value = Array.isArray(pr.hashtags) ? pr.hashtags.join(', ') : (pr.hashtags || '');

    $('#formTitle').textContent = `#${c.episode} 편집`;
    $('#btnSave').textContent = '수정 저장';
    $('#contentForm').scrollIntoView({ behavior: 'smooth', block: 'center' });

    // 자동으로 스냅샷 모달 열기 (알림/캘린더 도트 클릭 시)
    if (opts.openSnapshot) {
      $('#snapshotsFold').open = true;
      setTimeout(() => openSnapshotModal(c.id, null, opts.preselectLabel || ''), 80);
    }
  };

  const deleteContent = (id) => {
    const c = state.contents.find(x => x.id === id);
    if (!c) return;
    if (!confirm(`#${c.episode} "${c.title}" 정말 삭제할래?`)) return;
    state.contents = state.contents.filter(x => x.id !== id);
    save();
    renderAll();
  };

  const collectProduction = () => {
    const footage = $$('.pr_footage').filter(cb => cb.checked).map(cb => cb.value);
    const tags = $('#pr_hashtags').value
      .split(/[,\n]/).map(s => s.trim()).filter(Boolean);
    const obj = {
      hook: $('#pr_hook').value.trim(),
      duration_sec: $('#pr_duration').value ? Number($('#pr_duration').value) : undefined,
      subtitles: $('#pr_subtitles').value === 'true',
      footage_from: footage,
      music: $('#pr_music').value.trim(),
      hashtags: tags
    };
    Object.keys(obj).forEach(k => {
      if (obj[k] === undefined || obj[k] === '' ||
          (Array.isArray(obj[k]) && obj[k].length === 0)) delete obj[k];
    });
    return obj;
  };

  const submitContent = (e) => {
    e.preventDefault();
    const id = $('#contentId').value;
    const ep = Number($('#episode').value);
    const date = $('#date').value;
    const title = $('#title').value.trim();
    const memo = $('#memo').value.trim();
    const link = $('#link').value.trim();
    const category = $('#category').value;
    const production = collectProduction();

    if (!ep || !date || !title) return;

    if (id) {
      const c = state.contents.find(x => x.id === id);
      if (c) {
        // 게시일 변경 시 모든 스냅샷의 days_since_post 재계산
        const dateChanged = c.date !== date;
        Object.assign(c, { episode: ep, date, title, memo, link, category, production });
        if (dateChanged) {
          (c.insights_snapshots || []).forEach(s => {
            if (s.snapshot_date) s.days_since_post = daysBetween(parseDate(date), parseDate(s.snapshot_date));
          });
        }
      }
    } else {
      const dup = state.contents.find(x => Number(x.episode) === ep);
      if (dup && !confirm(`#${ep}이 이미 있어. 새로 추가할래? (덮어쓰지 않음)`)) return;
      state.contents.push({
        id: uuid(), episode: ep, date, title, memo, link, category,
        insights: {}, insights_snapshots: [], production, dismissed_alerts: []
      });
    }
    save();
    renderAll();
    prefillForm();
  };

  // ===== 스크린샷 압축 & 저장 (스냅샷 모달용) =====
  const handleSnapshotScreenshotPick = async (file) => {
    if (!file) return;
    try {
      const compressed = await compressImage(file, 800, 0.82);
      ui.snapshotScreenshotData = compressed;
      $('#snapScreenshotPreview').innerHTML = `<img src="${escapeAttr(compressed)}" alt="스냅샷 스크린샷">`;
    } catch (err) {
      console.warn('이미지 압축 실패, 원본 base64 사용:', err);
      const reader = new FileReader();
      reader.onload = (e) => {
        ui.snapshotScreenshotData = e.target.result;
        $('#snapScreenshotPreview').innerHTML = `<img src="${escapeAttr(ui.snapshotScreenshotData)}" alt="스냅샷 스크린샷">`;
      };
      reader.readAsDataURL(file);
    }
  };
  // 클라이언트 압축: max width 800px, jpeg quality 0.82
  const compressImage = (file, maxWidth = 800, quality = 0.82) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const ratio = Math.min(1, maxWidth / img.width);
          const w = Math.round(img.width * ratio);
          const h = Math.round(img.height * ratio);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // ===== 인사이트 스냅샷 — 리스트 / 모달 / CRUD =====
  const snapshotLabelClass = (label) => {
    const m = String(label || '').match(/^D\+(\d+)$/);
    if (!m) return '';
    const n = m[1];
    return `snapshot-row__label--D${n}`;
  };

  const renderSnapshotsList = (c) => {
    const root = $('#snapshotsList');
    const countEl = $('#snapshotsCount');
    if (!c) {
      root.innerHTML = '';
      countEl.textContent = '';
      $('#btnAddSnapshot').disabled = true;
      $('#btnAddSnapshot').title = '회차를 먼저 저장하면 스냅샷을 추가할 수 있어';
      return;
    }
    $('#btnAddSnapshot').disabled = false;
    $('#btnAddSnapshot').title = '';
    const arr = [...(c.insights_snapshots || [])].sort((a, b) =>
      (Number(a.days_since_post) || 0) - (Number(b.days_since_post) || 0)
    );
    countEl.textContent = arr.length ? `(${arr.length}개)` : '';
    if (!arr.length) { root.innerHTML = ''; return; }
    root.innerHTML = arr.map(s => {
      const cls = snapshotLabelClass(s.label);
      const views = s.views !== undefined && s.views !== null && s.views !== ''
        ? fmtViews(s.views) : '—';
      return `
        <div class="snapshot-row">
          <span class="snapshot-row__label ${cls}">${escapeHTML(s.label || `D+${s.days_since_post || 0}`)}</span>
          <span class="snapshot-row__date">${escapeHTML(s.snapshot_date || '')}</span>
          <span class="snapshot-row__views">${views}<span class="muted-num">조회</span></span>
          <span class="snapshot-row__actions">
            <button type="button" class="btn btn--mini btn--ghost" data-snap-edit="${s.id}">편집</button>
            <button type="button" class="btn btn--mini btn--danger" data-snap-del="${s.id}">삭제</button>
          </span>
        </div>
      `;
    }).join('');
    root.querySelectorAll('[data-snap-edit]').forEach(b => {
      b.addEventListener('click', () => openSnapshotModal(c.id, b.dataset.snapEdit));
    });
    root.querySelectorAll('[data-snap-del]').forEach(b => {
      b.addEventListener('click', () => deleteSnapshot(c.id, b.dataset.snapDel));
    });
  };

  const fillSnapshotFields = (snap) => {
    const v = (id, val) => $('#' + id).value = (val === undefined || val === null) ? '' : val;
    v('snv_views', snap?.views);
    v('snv_reach', snap?.reach);
    v('snv_avg', snap?.avg_watch_seconds);
    v('snv_likes', snap?.likes);
    v('snv_comments', snap?.comments);
    v('snv_reposts', snap?.reposts);
    v('snv_shares', snap?.shares);
    v('snv_saves', snap?.saves);
    v('snv_profile', snap?.profile_visits);
    v('snv_follows', snap?.follows);
    const age = snap?.age_dist || {};
    v('snv_age_13', age['13-17']);
    v('snv_age_18', age['18-24']);
    v('snv_age_25', age['25-34']);
    v('snv_age_35', age['35-44']);
    v('snv_age_45', age['45-54']);
    v('snv_age_55', age['55-64']);
    v('snv_age_65', age['65+']);
    v('snv_note', snap?.note || '');
    ui.snapshotScreenshotData = snap?.screenshot_url || '';
    $('#snapScreenshotPreview').innerHTML = ui.snapshotScreenshotData
      ? `<img src="${escapeAttr(ui.snapshotScreenshotData)}" alt="스냅샷 스크린샷">`
      : '';
    $('#snv_screenshot').value = '';
  };

  const openSnapshotModal = (contentId, snapId, preselectLabel) => {
    const c = state.contents.find(x => x.id === contentId);
    if (!c) return;
    $('#snapshotModal').hidden = false;
    document.body.style.overflow = 'hidden';
    $('#snapContentId').value = contentId;
    $('#snapId').value = snapId || '';

    // 컨텍스트 안내
    const age = ageInDays(c.date);
    $('#snapContext').innerHTML = `
      <strong>#${escapeHTML(String(c.episode))} ${escapeHTML(c.title)}</strong>
      <div class="muted">게시일 ${escapeHTML(c.date)} · 오늘 기준 D+${age}</div>
    `;

    if (snapId) {
      const snap = (c.insights_snapshots || []).find(s => s.id === snapId);
      $('#snapshotModalTitle').textContent = `스냅샷 편집 — ${snap?.label || ''}`;
      // 라벨 / 날짜 세팅
      const presetLabels = ['D+1', 'D+3', 'D+7', 'D+14', 'D+30'];
      if (snap && presetLabels.includes(snap.label)) {
        $('#snapLabelSelect').value = snap.label;
        $('#snapLabelCustomField').hidden = true;
      } else {
        $('#snapLabelSelect').value = 'custom';
        $('#snapLabelCustomField').hidden = false;
        $('#snapLabelCustom').value = snap?.label || '';
      }
      $('#snapDate').value = snap?.snapshot_date || dateFromOffset(c.date, snap?.days_since_post || 0);
      $('#snapDaysSince').value = snap?.days_since_post ?? '';
      fillSnapshotFields(snap);
    } else {
      $('#snapshotModalTitle').textContent = '스냅샷 추가';
      // preselect: 'D+3' / 'D+30' 등
      const label = preselectLabel && labelDaysMap[preselectLabel] !== undefined ? preselectLabel : 'D+3';
      $('#snapLabelSelect').value = label;
      $('#snapLabelCustomField').hidden = true;
      const days = labelDaysMap[label];
      $('#snapDate').value = dateFromOffset(c.date, days);
      $('#snapDaysSince').value = days;
      fillSnapshotFields(null);
    }
    syncSnapshotLabelDate();
  };

  const closeSnapshotModal = () => {
    $('#snapshotModal').hidden = true;
    document.body.style.overflow = '';
    ui.snapshotScreenshotData = '';
  };

  // 라벨/날짜 양방향 동기화
  const syncSnapshotLabelDate = () => {
    const sel = $('#snapLabelSelect').value;
    const customField = $('#snapLabelCustomField');
    if (sel === 'custom') {
      customField.hidden = false;
    } else {
      customField.hidden = true;
    }
    // 라벨 → D+N 자동 계산
    if (sel !== 'custom' && labelDaysMap[sel] !== undefined) {
      const contentId = $('#snapContentId').value;
      const c = state.contents.find(x => x.id === contentId);
      if (c) {
        const days = labelDaysMap[sel];
        $('#snapDate').value = dateFromOffset(c.date, days);
        $('#snapDaysSince').value = days;
      }
    }
  };

  // 날짜 직접 변경 → D+N 재계산
  const onSnapDateChange = () => {
    const contentId = $('#snapContentId').value;
    const c = state.contents.find(x => x.id === contentId);
    const dateStr = $('#snapDate').value;
    if (!c || !dateStr) return;
    const days = daysBetween(parseDate(c.date), parseDate(dateStr));
    $('#snapDaysSince').value = days;
    // 라벨 자동 매칭
    const matched = Object.entries(labelDaysMap).find(([, d]) => d === days);
    if (matched) {
      $('#snapLabelSelect').value = matched[0];
      $('#snapLabelCustomField').hidden = true;
    } else {
      // 현재 라벨 그대로 두되, custom이면 그대로
      const cur = $('#snapLabelSelect').value;
      if (cur !== 'custom') {
        $('#snapLabelSelect').value = 'custom';
        $('#snapLabelCustomField').hidden = false;
        $('#snapLabelCustom').value = labelFromDays(days);
      }
    }
  };

  const submitSnapshot = (e) => {
    e.preventDefault();
    const contentId = $('#snapContentId').value;
    const snapId = $('#snapId').value;
    const c = state.contents.find(x => x.id === contentId);
    if (!c) { closeSnapshotModal(); return; }

    const labelSel = $('#snapLabelSelect').value;
    const label = labelSel === 'custom' ? ($('#snapLabelCustom').value.trim() || `D+${$('#snapDaysSince').value || 0}`) : labelSel;
    const snapshot_date = $('#snapDate').value;
    if (!snapshot_date) { alert('캡처 날짜를 입력해.'); return; }
    const days_since_post = daysBetween(parseDate(c.date), parseDate(snapshot_date));

    const num = (id) => {
      const v = $('#' + id).value;
      return v === '' ? undefined : Number(v);
    };
    const age_dist = {};
    [['13-17', 'snv_age_13'], ['18-24', 'snv_age_18'], ['25-34', 'snv_age_25'],
     ['35-44', 'snv_age_35'], ['45-54', 'snv_age_45'], ['55-64', 'snv_age_55'],
     ['65+', 'snv_age_65']].forEach(([k, id]) => {
      const v = num(id);
      if (v !== undefined) age_dist[k] = v;
    });

    const payload = {
      label,
      snapshot_date,
      days_since_post,
      views: num('snv_views'),
      reach: num('snv_reach'),
      avg_watch_seconds: num('snv_avg'),
      likes: num('snv_likes'),
      comments: num('snv_comments'),
      reposts: num('snv_reposts'),
      shares: num('snv_shares'),
      saves: num('snv_saves'),
      profile_visits: num('snv_profile'),
      follows: num('snv_follows'),
      age_dist,
      screenshot_url: ui.snapshotScreenshotData || '',
      note: $('#snv_note').value.trim()
    };
    Object.keys(payload).forEach(k => {
      if (payload[k] === undefined) delete payload[k];
    });

    c.insights_snapshots = c.insights_snapshots || [];
    if (snapId) {
      const s = c.insights_snapshots.find(x => x.id === snapId);
      if (s) Object.assign(s, payload, { id: s.id });
    } else {
      c.insights_snapshots.push({ id: uuid(), ...payload });
    }
    // 정렬
    c.insights_snapshots.sort((a, b) =>
      (Number(a.days_since_post) || 0) - (Number(b.days_since_post) || 0)
    );

    save();
    closeSnapshotModal();
    renderSnapshotsList(c);
    renderAll();
  };

  const deleteSnapshot = (contentId, snapId) => {
    const c = state.contents.find(x => x.id === contentId);
    if (!c) return;
    const s = (c.insights_snapshots || []).find(x => x.id === snapId);
    if (!s) return;
    if (!confirm(`${s.label || `D+${s.days_since_post}`} 스냅샷 삭제할래?`)) return;
    c.insights_snapshots = c.insights_snapshots.filter(x => x.id !== snapId);
    save();
    renderSnapshotsList(c);
    renderAll();
  };

  // ===== 인사이트 캡처 알림 =====
  // 각 회차마다: 어떤 알림 타입이 활성인지 계산
  // 타입: 'd3', 'd28', 'd30', 'lost'
  const computeAlerts = () => {
    const out = [];
    state.contents.forEach(c => {
      const age = ageInDays(c.date);
      if (age < 1) return;  // 게시 안 했거나 D+0 (아직 데이터 없음)
      const dismissed = new Set(c.dismissed_alerts || []);
      const hasD3 = !!snapshotByLabel(c, 'D+3');
      const hasD30 = !!snapshotByLabel(c, 'D+30');

      // D+3 시점: 1~6일 (게시 후 1~6, D+3 스냅샷 없을 때) — D+3 임박~지났을 때
      if (age >= 1 && age <= 6 && !hasD3 && !dismissed.has('d3')) {
        out.push({
          type: 'd3', contentId: c.id, episode: c.episode, title: c.title,
          age, label: 'D+3', sort: 1
        });
      }
      // D+30 임박: 27~29일
      if (age >= 27 && age <= 29 && !hasD30 && !dismissed.has('d30')) {
        out.push({
          type: 'd28', contentId: c.id, episode: c.episode, title: c.title,
          age, label: 'D+30', sort: 2
        });
      }
      // D+30 당일
      if (age === 30 && !hasD30 && !dismissed.has('d30')) {
        out.push({
          type: 'd30', contentId: c.id, episode: c.episode, title: c.title,
          age, label: 'D+30', sort: 0  // 가장 위
        });
      }
      // 손실 (31일+ 인데 D+30 없음)
      if (age > 30 && !hasD30 && !dismissed.has('d30_lost')) {
        out.push({
          type: 'lost', contentId: c.id, episode: c.episode, title: c.title,
          age, label: 'D+30', sort: 3
        });
      }
    });
    // 정렬: type 우선순위 → age 큰 순 (급한 거 위로)
    out.sort((a, b) => a.sort - b.sort || b.age - a.age);
    return out;
  };

  const renderAlerts = () => {
    const alerts = computeAlerts();
    const section = $('#alertsSection');
    const list = $('#alertsList');
    if (!alerts.length) {
      section.hidden = true;
      list.innerHTML = '';
      return;
    }
    section.hidden = false;
    list.innerHTML = alerts.map(a => {
      let icon = '', headLabel = '', title = '', sub = '';
      if (a.type === 'd3') {
        icon = '🔵'; headLabel = 'D+3 캡처 시점';
        title = `#${a.episode} — D+3 캡처 시점이에요`;
        sub = `오늘 D+${a.age} · 게시 후 1~3일 데이터가 가장 가치 있어요`;
      } else if (a.type === 'd28') {
        icon = '🟡'; headLabel = `D+${a.age}`;
        title = `⚠️ #${a.episode} — D+30까지 ${30 - a.age}일 남음`;
        sub = `30일 지나면 인스타에서 데이터가 영구히 사라져요`;
      } else if (a.type === 'd30') {
        icon = '🚨'; headLabel = 'D+30 당일';
        title = `🚨 #${a.episode} — 오늘 마지막! 캡처 필수`;
        sub = `내일이면 데이터 사라짐`;
      } else if (a.type === 'lost') {
        icon = '⚫'; headLabel = `D+${a.age}`;
        title = `#${a.episode} — D+30 못 잡음 (데이터 손실 가능)`;
        sub = `최신 가능한 스냅샷이라도 잡아두기`;
      }
      return `
        <div class="alert-card alert-card--${a.type}" data-content="${a.contentId}" data-label="${a.label}">
          <button class="alert-card__dismiss" data-dismiss-alert="${a.contentId}" data-dismiss-type="${a.type}" title="이 알림 무시">✕</button>
          <div class="alert-card__head">${icon} ${escapeHTML(headLabel)}</div>
          <div class="alert-card__title">${escapeHTML(title)}</div>
          <div class="alert-card__sub">${escapeHTML(sub)}</div>
        </div>
      `;
    }).join('');

    // 카드 클릭 → 편집 + 스냅샷 모달
    list.querySelectorAll('.alert-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-dismiss-alert]')) return;
        const cid = card.dataset.content;
        const label = card.dataset.label;
        editContent(cid, { openSnapshot: true, preselectLabel: label });
      });
    });
    list.querySelectorAll('[data-dismiss-alert]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cid = btn.dataset.dismissAlert;
        const type = btn.dataset.dismissType;
        const c = state.contents.find(x => x.id === cid);
        if (!c) return;
        c.dismissed_alerts = c.dismissed_alerts || [];
        // type → dismiss key
        let key = '';
        if (type === 'd3') key = 'd3';
        else if (type === 'd28' || type === 'd30') key = 'd30';
        else if (type === 'lost') key = 'd30_lost';
        if (key && !c.dismissed_alerts.includes(key)) c.dismissed_alerts.push(key);
        save();
        renderAlerts();
      });
    });
  };

  // ===== 콘텐츠 테이블 =====
  const engRate = (iv) => {
    const v = Number(iv?.views) || 0;
    if (v === 0) return null;
    const eng = (Number(iv?.likes) || 0) + (Number(iv?.comments) || 0) +
                (Number(iv?.shares) || 0) + (Number(iv?.saves) || 0);
    return (eng / v) * 100;
  };

  const renderTable = () => {
    const tbody = $('#contentTbody');
    const q = $('#search').value.trim().toLowerCase();
    let rows = [...state.contents].sort((a, b) => a.date.localeCompare(b.date));
    if (q) {
      rows = rows.filter(c =>
        (c.title || '').toLowerCase().includes(q) ||
        (c.memo || '').toLowerCase().includes(q)
      );
    }
    $('#contentCount').textContent = `${state.contents.length}개 (검색 결과 ${rows.length}개)`;

    if (rows.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="9">${
        state.contents.length === 0
          ? '아직 올린 콘텐츠가 없어. 위 폼이나 달력에서 첫 회차를 시작해.'
          : '검색 결과 없음.'
      }</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(c => {
      const iv = effectiveInsights(c);
      const v = iv?.views;
      const er = engRate(iv);
      const embed = instaEmbedUrl(c.link);
      const linkCell = c.link
        ? `<a href="${escapeAttr(c.link)}" target="_blank" rel="noopener">열기</a>${
            embed ? ` <button class="btn btn--mini btn--ghost" data-video="${c.id}">▶ 영상</button>` : ''
          }`
        : '—';
      return `
      <tr>
        <td class="col-num"><span class="ep-badge">${escapeHTML(String(c.episode))}</span></td>
        <td class="col-date">${escapeHTML(c.date)}</td>
        <td>${escapeHTML(c.title)}</td>
        <td class="col-cat">${c.category ? `<span class="cat-tag">${escapeHTML(c.category)}</span>` : '—'}</td>
        <td class="col-num">${v !== undefined && v !== null && v !== '' ? fmtViews(v) : '—'}</td>
        <td class="col-num">${er !== null ? er.toFixed(1) + '%' : '—'}</td>
        <td class="col-link">${linkCell}</td>
        <td class="col-act"><button class="btn btn--mini btn--ghost" data-edit="${c.id}">편집</button></td>
        <td class="col-act"><button class="btn btn--mini btn--danger" data-del="${c.id}">삭제</button></td>
      </tr>
      ${embed ? `<tr class="embed-row" data-embed-for="${c.id}" hidden>
        <td colspan="9"><div class="insta-embed"><iframe src="${escapeAttr(embed)}" loading="lazy" allowfullscreen scrolling="no" frameborder="0"></iframe></div></td>
      </tr>` : ''}
    `;
    }).join('');

    tbody.querySelectorAll('[data-edit]').forEach(b => {
      b.addEventListener('click', () => editContent(b.dataset.edit));
    });
    tbody.querySelectorAll('[data-del]').forEach(b => {
      b.addEventListener('click', () => deleteContent(b.dataset.del));
    });
    tbody.querySelectorAll('[data-video]').forEach(b => {
      b.addEventListener('click', () => {
        const row = tbody.querySelector(`.embed-row[data-embed-for="${b.dataset.video}"]`);
        if (!row) return;
        const open = !row.hidden;
        row.hidden = open;
        b.textContent = open ? '▶ 영상' : '▼ 닫기';
      });
    });
  };

  // ===== 인사이트 분석 (Chart.js) =====
  // 회차에서 사용할 "지표 객체" — 모드별로 다름
  const getMetricFor = (c, mode) => {
    if (mode === 'latest') return latestSnapshot(c) || (c.insights && c.insights.views !== undefined ? c.insights : null);
    if (mode === 'snapshot') return snapshotByLabel(c, ui.chartModeLabel);
    return null;
  };

  const valueFromInsight = (iv, tab) => {
    if (!iv) return null;
    if (tab === 'views') return Number(iv.views) || 0;
    if (tab === 'engagement') {
      const er = engRate(iv);
      return er === null ? 0 : Number(er.toFixed(1));
    }
    if (tab === 'reach') {
      const v = Number(iv.views) || 0;
      const r = Number(iv.reach) || 0;
      if (v === 0) return 0;
      return Number(((r / v) * 100).toFixed(1));
    }
    if (tab === 'watch') return Number(iv.avg_watch_seconds) || 0;
    return 0;
  };

  const tabAxisLabel = (tab) => ({
    views: '조회수',
    engagement: '참여율 (%)',
    reach: '도달률 (도달/조회 %)',
    watch: '평균 조회 시간 (초)'
  }[tab] || '');

  const renderAnalytics = () => {
    if (typeof Chart === 'undefined') return;
    renderModeControls();
    renderLineChart();
    renderBestWorst();
    renderAgeChart();
    renderCategoryChart();
    renderHookList();
  };

  // 모드별 추가 컨트롤 (스냅샷 라벨 선택 / 회차 선택)
  const renderModeControls = () => {
    const root = $('#modeControls');
    if (ui.chartMode === 'snapshot') {
      // 사용 가능한 라벨 자동 수집 (D+1, D+3, D+7, D+14, D+30 중 데이터 있는 것)
      const available = new Set();
      state.contents.forEach(c => {
        (c.insights_snapshots || []).forEach(s => {
          if (s.label) available.add(s.label);
        });
      });
      const baseLabels = ['D+1', 'D+3', 'D+7', 'D+14', 'D+30'];
      const labels = baseLabels.filter(l => available.has(l));
      [...available].forEach(l => { if (!baseLabels.includes(l)) labels.push(l); });
      if (!labels.length) labels.push('D+3');
      if (!labels.includes(ui.chartModeLabel)) ui.chartModeLabel = labels[0];
      root.innerHTML = `
        <label>시점:</label>
        <select id="modeSnapshotLabel">
          ${labels.map(l => `<option value="${escapeAttr(l)}" ${l === ui.chartModeLabel ? 'selected' : ''}>${escapeHTML(l)}</option>`).join('')}
        </select>
      `;
      $('#modeSnapshotLabel').addEventListener('change', (e) => {
        ui.chartModeLabel = e.target.value;
        renderLineChart();
        renderBestWorst();
      });
    } else if (ui.chartMode === 'timeline') {
      const eligible = state.contents.filter(c => (c.insights_snapshots || []).length > 0);
      if (!eligible.length) {
        root.innerHTML = `<span class="muted" style="font-size:12px;">스냅샷이 있는 회차가 아직 없어. 먼저 회차에 스냅샷을 추가해.</span>`;
        return;
      }
      if (!ui.chartModeEpisode || !eligible.find(c => c.id === ui.chartModeEpisode)) {
        ui.chartModeEpisode = eligible[0].id;
      }
      root.innerHTML = `
        <label>회차:</label>
        <select id="modeEpisode">
          ${eligible.sort((a, b) => Number(a.episode) - Number(b.episode)).map(c =>
            `<option value="${escapeAttr(c.id)}" ${c.id === ui.chartModeEpisode ? 'selected' : ''}>#${c.episode} ${escapeHTML(c.title)}</option>`
          ).join('')}
        </select>
      `;
      $('#modeEpisode').addEventListener('change', (e) => {
        ui.chartModeEpisode = e.target.value;
        renderLineChart();
      });
    } else {
      root.innerHTML = '';
    }
  };

  const renderLineChart = () => {
    const canvas = $('#chartLine');
    if (!canvas) return;
    if (charts.line) { charts.line.destroy(); charts.line = null; }

    let labels = [];
    let data = [];
    let datasetLabel = tabAxisLabel(ui.chartTab);

    if (ui.chartMode === 'timeline') {
      const c = state.contents.find(x => x.id === ui.chartModeEpisode);
      if (!c) return;
      const snaps = [...(c.insights_snapshots || [])].sort((a, b) =>
        (Number(a.days_since_post) || 0) - (Number(b.days_since_post) || 0)
      );
      labels = snaps.map(s => s.label || `D+${s.days_since_post || 0}`);
      data = snaps.map(s => valueFromInsight(s, ui.chartTab));
      datasetLabel = `#${c.episode} — ${datasetLabel}`;
    } else {
      const eligible = [...state.contents]
        .filter(c => {
          const iv = getMetricFor(c, ui.chartMode);
          return iv && iv.views !== undefined && iv.views !== null && iv.views !== '';
        })
        .sort((a, b) => Number(a.episode) - Number(b.episode));
      labels = eligible.map(c => `#${c.episode}`);
      data = eligible.map(c => valueFromInsight(getMetricFor(c, ui.chartMode), ui.chartTab));
    }

    charts.line = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: datasetLabel,
          data,
          borderColor: CHART_COLORS.accent,
          backgroundColor: CHART_COLORS.accentSoft,
          tension: 0.25,
          fill: true,
          pointBackgroundColor: CHART_COLORS.accent,
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1A1A1A',
            titleFont: { family: 'Pretendard' },
            bodyFont: { family: 'Pretendard' }
          }
        },
        scales: {
          y: { beginAtZero: true, grid: { color: '#eee' }, ticks: { font: { family: 'Pretendard', size: 11 } } },
          x: { grid: { display: false }, ticks: { font: { family: 'Pretendard', size: 11 } } }
        }
      }
    });
  };

  const renderBestWorst = () => {
    // 모드별: latest / snapshot 기준 최신 또는 해당 시점
    let eligible = [];
    if (ui.chartMode === 'timeline') {
      const c = state.contents.find(x => x.id === ui.chartModeEpisode);
      if (c) {
        eligible = (c.insights_snapshots || []).map(s => ({
          episode: `${c.episode} (${s.label || 'D+' + (s.days_since_post || 0)})`,
          title: c.title,
          views: Number(s.views) || 0
        }));
      }
    } else {
      eligible = state.contents
        .map(c => {
          const iv = getMetricFor(c, ui.chartMode);
          if (!iv) return null;
          return { episode: c.episode, title: c.title, views: Number(iv.views) || 0 };
        })
        .filter(x => x && x.views > 0);
    }
    const byViews = [...eligible].sort((a, b) => b.views - a.views);
    const best = byViews.slice(0, 3);
    const worst = byViews.slice(-3).reverse();
    const render = (arr) => {
      if (arr.length === 0) return '<div class="muted" style="font-size:11.5px;">데이터 없음</div>';
      return arr.map(c => `
        <div class="bw-row">
          <div class="bw-row__title">#${escapeHTML(String(c.episode))} ${escapeHTML(c.title)}</div>
          <div class="bw-row__num">${fmtViews(c.views)}</div>
        </div>
      `).join('');
    };
    $('#bestList').innerHTML = render(best);
    $('#worstList').innerHTML = render(worst);
  };

  const renderAgeChart = () => {
    const canvas = $('#chartAge');
    if (!canvas) return;
    if (charts.age) { charts.age.destroy(); charts.age = null; }
    const buckets = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
    const sums = Object.fromEntries(buckets.map(k => [k, 0]));
    const counts = Object.fromEntries(buckets.map(k => [k, 0]));
    state.contents.forEach(c => {
      const iv = effectiveInsights(c);
      const age = iv?.age_dist;
      if (!age) return;
      buckets.forEach(k => {
        if (age[k] !== undefined && age[k] !== null && age[k] !== '') {
          sums[k] += Number(age[k]) || 0;
          counts[k] += 1;
        }
      });
    });
    const avgs = buckets.map(k => counts[k] > 0 ? sums[k] / counts[k] : 0);
    const total = avgs.reduce((a, b) => a + b, 0);
    if (total === 0) {
      canvas.parentElement.innerHTML = '<div class="dual-chart__title">시청자 연령 분포 (평균)</div><div class="muted" style="font-size:11.5px;text-align:center;padding:20px 0;">아직 데이터 없음</div>';
      return;
    }
    charts.age = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: buckets,
        datasets: [{
          data: avgs,
          backgroundColor: CHART_COLORS.palette,
          borderWidth: 1,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { font: { family: 'Pretendard', size: 11 }, boxWidth: 10 }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.label}: ${ctx.parsed.toFixed(1)}%`
            }
          }
        }
      }
    });
  };

  const renderCategoryChart = () => {
    const canvas = $('#chartCat');
    if (!canvas) return;
    if (charts.cat) { charts.cat.destroy(); charts.cat = null; }
    const sums = Object.fromEntries(CATEGORIES.map(k => [k, 0]));
    const counts = Object.fromEntries(CATEGORIES.map(k => [k, 0]));
    state.contents.forEach(c => {
      if (!c.category) return;
      const iv = effectiveInsights(c);
      const v = Number(iv?.views);
      if (!v || v <= 0) return;
      if (sums[c.category] === undefined) return;
      sums[c.category] += v;
      counts[c.category] += 1;
    });
    const avgs = CATEGORIES.map(k => counts[k] > 0 ? Math.round(sums[k] / counts[k]) : 0);
    if (avgs.every(v => v === 0)) {
      canvas.parentElement.innerHTML = '<div class="dual-chart__title">카테고리별 평균 조회수</div><div class="muted" style="font-size:11.5px;text-align:center;padding:20px 0;">아직 데이터 없음</div>';
      return;
    }
    charts.cat = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: CATEGORIES,
        datasets: [{
          label: '평균 조회수',
          data: avgs,
          backgroundColor: CHART_COLORS.accent,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { font: { family: 'Pretendard', size: 11 } } },
          x: { ticks: { font: { family: 'Pretendard', size: 11 } } }
        }
      }
    });
  };

  // 후킹 유형별: 후킹 문구 첫 단어/구문(20자) 기준 그룹
  const renderHookList = () => {
    const root = $('#hookList');
    const groups = {};
    state.contents.forEach(c => {
      const hook = (c.production?.hook || '').trim();
      const iv = effectiveInsights(c);
      const v = Number(iv?.views) || 0;
      if (!hook || v <= 0) return;
      const key = hook.length > 24 ? hook.slice(0, 24) + '…' : hook;
      if (!groups[key]) groups[key] = { sum: 0, count: 0 };
      groups[key].sum += v;
      groups[key].count += 1;
    });
    const items = Object.entries(groups)
      .map(([k, v]) => ({ hook: k, avg: Math.round(v.sum / v.count), count: v.count }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 10);
    if (items.length === 0) {
      root.innerHTML = '<div class="muted" style="font-size:11.5px;">후킹 문구와 조회수 둘 다 입력된 회차가 없음.</div>';
      return;
    }
    root.innerHTML = items.map(it => `
      <div class="bw-row">
        <div class="bw-row__title">"${escapeHTML(it.hook)}" <span class="muted" style="font-size:11px;">(${it.count}편)</span></div>
        <div class="bw-row__num">${fmtViews(it.avg)}</div>
      </div>
    `).join('');
  };

  // ===== 참고 영상 라이브러리 =====
  const openRefModal = (id) => {
    $('#refModal').hidden = false;
    document.body.style.overflow = 'hidden';
    if (id) {
      const r = state.refs.find(x => x.id === id);
      if (!r) return;
      $('#refModalTitle').textContent = '참고 영상 편집';
      $('#refId').value = r.id;
      $('#refTitle').value = r.title;
      $('#refSourceUrl').value = r.source_url || r.video_url || '';
      $('#refAccountUrl').value = r.account_url || '';
      $('#refViews').value = r.views || '';
      $('#refScript').value = r.script || '';
      $('#refNote').value = r.note || '';
      $$('.ref_cat').forEach(cb => cb.checked = (r.categories || []).includes(cb.value));
    } else {
      $('#refModalTitle').textContent = '참고 영상 추가';
      $('#refId').value = '';
      $('#refForm').reset();
    }
    $('#uploadStatus').textContent = '';
    $('#uploadStatus').className = 'upload-status';
    $('#refUploadFile').value = '';
  };
  const closeRefModal = () => {
    $('#refModal').hidden = true;
    document.body.style.overflow = '';
  };

  const submitRef = (e) => {
    e.preventDefault();
    const id = $('#refId').value;
    const title = $('#refTitle').value.trim();
    if (!title) return;
    const cats = $$('.ref_cat').filter(cb => cb.checked).map(cb => cb.value);
    const source_url = $('#refSourceUrl').value.trim();
    const payload = {
      title,
      source_url,
      account_url: $('#refAccountUrl').value.trim(),
      views: Number($('#refViews').value) || 0,
      categories: cats,
      script: $('#refScript').value.trim(),
      note: $('#refNote').value.trim(),
      video_url: source_url   // 업로드된 mp4 URL이면 source_url에 들어가 있음
    };
    if (id) {
      const r = state.refs.find(x => x.id === id);
      if (r) Object.assign(r, payload);
    } else {
      state.refs.push({ id: uuid(), created_at: Date.now(), ...payload });
    }
    save();
    closeRefModal();
    renderRefs();
  };

  const deleteRef = (id) => {
    const r = state.refs.find(x => x.id === id);
    if (!r) return;
    if (!confirm(`"${r.title}" 삭제할래?`)) return;
    state.refs = state.refs.filter(x => x.id !== id);
    save();
    renderRefs();
  };

  // 영상 URL → 임베드 HTML
  const embedFor = (url) => {
    if (!url) return null;
    // YouTube
    const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
    if (yt) return `<iframe src="https://www.youtube.com/embed/${yt[1]}" allowfullscreen loading="lazy"></iframe>`;
    // Instagram (embed endpoint)
    const ig = url.match(/instagram\.com\/(reel|p)\/([\w-]+)/);
    if (ig) return `<iframe src="https://www.instagram.com/${ig[1]}/${ig[2]}/embed" allowfullscreen loading="lazy" scrolling="no"></iframe>`;
    // Vimeo
    const vm = url.match(/vimeo\.com\/(\d+)/);
    if (vm) return `<iframe src="https://player.vimeo.com/video/${vm[1]}" allowfullscreen loading="lazy"></iframe>`;
    // 직접 mp4 (raw.githubusercontent.com 등)
    if (/\.mp4($|\?)/i.test(url)) return `<video src="${escapeAttr(url)}" controls preload="metadata"></video>`;
    return null;
  };

  const renderRefs = () => {
    const root = $('#refGrid');
    let rows = [...state.refs];
    // 검색
    const q = ui.refSearch.trim().toLowerCase();
    if (q) {
      rows = rows.filter(r =>
        (r.title || '').toLowerCase().includes(q) ||
        (r.script || '').toLowerCase().includes(q) ||
        (r.note || '').toLowerCase().includes(q)
      );
    }
    // 필터
    if (ui.refFilter !== 'all') {
      rows = rows.filter(r => (r.categories || []).includes(ui.refFilter));
    }
    // 정렬
    if (ui.refSort === 'views_desc') rows.sort((a, b) => (b.views || 0) - (a.views || 0));
    else if (ui.refSort === 'created_desc') rows.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    else if (ui.refSort === 'created_asc') rows.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));

    $('#refCount').textContent = `${state.refs.length}개 (표시 ${rows.length}개)`;

    if (rows.length === 0) {
      root.innerHTML = `<div class="empty-state">${state.refs.length === 0 ? '아직 참고 영상이 없어. "＋ 영상 추가"로 첫 벤치마크를 등록해봐.' : '조건에 맞는 영상이 없어.'}</div>`;
      return;
    }

    root.innerHTML = rows.map(r => {
      const embed = embedFor(r.source_url || r.video_url);
      const media = embed
        ? embed
        : `<div class="ref-card__media-fallback">
             <div>🎬 미리보기 안됨</div>
             ${r.source_url ? `<a href="${escapeAttr(r.source_url)}" target="_blank" rel="noopener">원본 열기 ↗</a>` : ''}
           </div>`;
      const cats = (r.categories || []).map(c => `<span class="cat-tag cat-tag--accent">${escapeHTML(c)}</span>`).join('');
      const accountLine = r.account_url
        ? `<a href="${escapeAttr(r.account_url)}" target="_blank" rel="noopener">출처 →</a>`
        : '—';
      return `
        <article class="ref-card">
          <div class="ref-card__media">${media}</div>
          <div class="ref-card__body">
            <div class="ref-card__title">${escapeHTML(r.title)}</div>
            <div class="ref-card__meta">
              <span class="ref-card__views">${fmtViews(r.views)}</span>
              ${accountLine}
            </div>
            ${cats ? `<div class="ref-card__cats">${cats}</div>` : ''}
            ${r.script ? `<details><summary>📄 대본</summary><p>${escapeHTML(r.script)}</p></details>` : ''}
            ${r.note ? `<div class="ref-card__note">${escapeHTML(r.note)}</div>` : ''}
          </div>
          <div class="ref-card__actions">
            <button class="btn btn--ghost btn--mini" data-edit-ref="${r.id}">편집</button>
            <button class="btn btn--danger btn--mini" data-del-ref="${r.id}">삭제</button>
          </div>
        </article>
      `;
    }).join('');

    root.querySelectorAll('[data-edit-ref]').forEach(b => {
      b.addEventListener('click', () => openRefModal(b.dataset.editRef));
    });
    root.querySelectorAll('[data-del-ref]').forEach(b => {
      b.addEventListener('click', () => deleteRef(b.dataset.delRef));
    });
  };

  // ===== GitHub PAT / mp4 업로드 =====
  const maskToken = (t) => {
    if (!t) return '';
    if (t.length < 10) return '****';
    return t.slice(0, 4) + '****' + t.slice(-4);
  };

  const openPatModal = () => {
    $('#patModal').hidden = false;
    document.body.style.overflow = 'hidden';
    const s = state.settings || {};
    $('#patCurrent').value = s.github_pat ? maskToken(s.github_pat) : '';
    $('#patInput').value = '';
    $('#patOwner').value = s.github_owner || 'nangmanwife';
    $('#patRepo').value = s.github_repo || 'boundary-dashboard';
    $('#patBranch').value = s.github_branch || 'main';
    $('#patTestResult').textContent = '';
    $('#patTestResult').className = 'pat-test-result';
  };
  const closePatModal = () => {
    $('#patModal').hidden = true;
    document.body.style.overflow = '';
  };

  const savePat = () => {
    const newToken = $('#patInput').value.trim();
    state.settings = state.settings || {};
    if (newToken) state.settings.github_pat = newToken;
    state.settings.github_owner = $('#patOwner').value.trim() || 'nangmanwife';
    state.settings.github_repo = $('#patRepo').value.trim() || 'boundary-dashboard';
    state.settings.github_branch = $('#patBranch').value.trim() || 'main';
    save();
    $('#patCurrent').value = state.settings.github_pat ? maskToken(state.settings.github_pat) : '';
    $('#patInput').value = '';
    alert('저장 완료. 이제 영상 추가 폼에서 mp4 업로드 사용 가능.');
  };

  const deletePat = () => {
    if (!confirm('저장된 PAT를 삭제할까?')) return;
    delete state.settings.github_pat;
    save();
    $('#patCurrent').value = '';
    alert('삭제 완료.');
  };

  const testPat = async () => {
    const token = $('#patInput').value.trim() || state.settings?.github_pat;
    const owner = $('#patOwner').value.trim();
    const repo = $('#patRepo').value.trim();
    const result = $('#patTestResult');
    if (!token) {
      result.textContent = '토큰이 없음.';
      result.className = 'pat-test-result is-error';
      return;
    }
    result.textContent = '테스트 중…';
    result.className = 'pat-test-result';
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
      });
      if (res.ok) {
        const data = await res.json();
        result.textContent = `✔ 성공: ${data.full_name} (default branch: ${data.default_branch})`;
        result.className = 'pat-test-result is-success';
      } else {
        const err = await res.json().catch(() => ({}));
        result.textContent = `✘ 실패 (${res.status}): ${err.message || ''}`;
        result.className = 'pat-test-result is-error';
      }
    } catch (e) {
      result.textContent = `✘ 네트워크 오류: ${e.message}`;
      result.className = 'pat-test-result is-error';
    }
  };

  // mp4 → GitHub Contents API
  const uploadVideo = async () => {
    const fileInput = $('#refUploadFile');
    const file = fileInput.files[0];
    const status = $('#uploadStatus');
    if (!file) {
      status.textContent = 'mp4 파일을 먼저 선택해.';
      status.className = 'upload-status is-error';
      return;
    }
    const token = state.settings?.github_pat;
    if (!token) {
      status.textContent = '먼저 GitHub PAT를 설정해 (우상단 "GitHub 설정").';
      status.className = 'upload-status is-error';
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      if (!confirm('100MB가 넘어. GitHub Contents API는 100MB 미만 권장. 계속 시도할까?')) return;
    }
    const owner = state.settings.github_owner || 'nangmanwife';
    const repo = state.settings.github_repo || 'boundary-dashboard';
    const branch = state.settings.github_branch || 'main';

    status.textContent = '파일 인코딩 중…';
    status.className = 'upload-status';

    try {
      const base64 = await fileToBase64(file);
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^\w.-]/g, '_');
      const path = `assets/refs/${timestamp}_${safeName}`;
      status.textContent = '업로드 중… (시간 걸릴 수 있음)';
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: `chore: upload reference video ${safeName}`,
            content: base64,
            branch
          })
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`${res.status} ${err.message || ''}`);
      }
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
      $('#refSourceUrl').value = rawUrl;
      status.textContent = `✔ 업로드 완료. URL 자동 채워짐.`;
      status.className = 'upload-status is-success';
    } catch (e) {
      status.textContent = `✘ 업로드 실패: ${e.message}`;
      status.className = 'upload-status is-error';
    }
  };

  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      // "data:...;base64,XXX" → "XXX"
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  // ===== 측정 폼 (기존) =====
  const submitMetric = (e) => {
    e.preventDefault();
    const id = $('#metricId').value;
    const week = $('#metricWeek').value;
    const dm = Number($('#metricDm').value) || 0;
    const signal = Number($('#metricSignal').value) || 0;
    const note = $('#metricNote').value.trim();

    if (!week) return;

    if (id) {
      const m = state.weekly_metrics.find(x => x.id === id);
      if (m) Object.assign(m, { week_of: week, new_dm: dm, where_can_i_run_count: signal, note });
    } else {
      state.weekly_metrics.push({
        id: uuid(),
        week_of: week,
        new_dm: dm,
        where_can_i_run_count: signal,
        note
      });
    }
    save();
    renderAll();
    resetMetricForm();
  };

  const editMetric = (id) => {
    const m = state.weekly_metrics.find(x => x.id === id);
    if (!m) return;
    $('#metricId').value = m.id;
    $('#metricWeek').value = m.week_of;
    $('#metricDm').value = m.new_dm;
    $('#metricSignal').value = m.where_can_i_run_count;
    $('#metricNote').value = m.note || '';
    $('#metricForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const deleteMetric = (id) => {
    if (!confirm('이 주차 측정 데이터 삭제할래?')) return;
    state.weekly_metrics = state.weekly_metrics.filter(x => x.id !== id);
    save();
    renderAll();
  };

  const resetMetricForm = () => {
    $('#metricId').value = '';
    $('#metricWeek').value = '';
    $('#metricDm').value = 0;
    $('#metricSignal').value = 0;
    $('#metricNote').value = '';
  };

  const renderMetricTable = () => {
    const tbody = $('#metricTbody');
    const rows = [...state.weekly_metrics].sort((a, b) => a.week_of.localeCompare(b.week_of));
    if (rows.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="6">아직 측정 데이터가 없어. 첫 주 일요일에 시작.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(m => `
      <tr>
        <td class="col-date">${escapeHTML(m.week_of)}</td>
        <td class="col-num">${m.new_dm}</td>
        <td class="col-num">${m.where_can_i_run_count}</td>
        <td>${escapeHTML((m.note || '').slice(0, 100))}${(m.note || '').length > 100 ? '…' : ''}</td>
        <td class="col-act"><button class="btn btn--mini btn--ghost" data-medit="${m.id}">편집</button></td>
        <td class="col-act"><button class="btn btn--mini btn--danger" data-mdel="${m.id}">삭제</button></td>
      </tr>
    `).join('');
    tbody.querySelectorAll('[data-medit]').forEach(b => {
      b.addEventListener('click', () => editMetric(b.dataset.medit));
    });
    tbody.querySelectorAll('[data-mdel]').forEach(b => {
      b.addEventListener('click', () => deleteMetric(b.dataset.mdel));
    });
  };

  // ===== Export / Import =====
  const exportJSON = () => {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    a.href = url;
    a.download = `boundary_data_${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importJSON = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!Array.isArray(data.contents) || !Array.isArray(data.weekly_metrics)) {
          alert('JSON 형식이 맞지 않아. contents / weekly_metrics 필드가 필요해.');
          return;
        }
        if (!confirm('현재 데이터를 덮어쓸 거야. 계속할까?')) return;
        state.contents = data.contents.map(migrateContent);
        state.weekly_metrics = data.weekly_metrics.map(m => ({ id: m.id || uuid(), ...m }));
        state.refs = Array.isArray(data.refs) ? data.refs.map(migrateRef) : [];
        state.settings = data.settings && typeof data.settings === 'object' ? data.settings : (state.settings || {});
        const totalSnaps = state.contents.reduce((s, c) => s + (c.insights_snapshots?.length || 0), 0);
        console.log(`[import] ${state.contents.length}개 회차, ${totalSnaps}개 스냅샷 (자동 마이그레이션 포함)`);
        save();
        renderAll();
        alert(`가져오기 완료. 회차 ${state.contents.length}개, 스냅샷 ${totalSnaps}개.`);
      } catch (err) {
        alert('JSON 파싱 실패: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  // ===== 전체 렌더 =====
  const renderAll = () => {
    renderKPI();
    renderAlerts();
    renderCalendar();
    renderTable();
    renderMetricTable();
    renderRefs();
    renderAnalytics();
  };

  // ===== 초기화 / 이벤트 =====
  const init = () => {
    load();

    // 콘텐츠 폼 초기화
    prefillForm(fmtDate(today()));
    resetMetricForm();
    // 측정 폼 기본 주 시작일 = 이번 주 월요일
    const t = today();
    const monOffset = (t.getDay() + 6) % 7;
    const monday = new Date(t);
    monday.setDate(t.getDate() - monOffset);
    $('#metricWeek').value = fmtDate(monday);

    // 콘텐츠 폼
    $('#contentForm').addEventListener('submit', submitContent);
    $('#btnReset').addEventListener('click', () => prefillForm(fmtDate(today())));

    // 스냅샷 추가 버튼 (현재 편집 중인 회차 기준)
    $('#btnAddSnapshot').addEventListener('click', () => {
      const cid = $('#contentId').value;
      if (!cid) {
        alert('회차를 먼저 저장한 다음 스냅샷을 추가할 수 있어.');
        return;
      }
      openSnapshotModal(cid, null);
    });

    // 스냅샷 모달
    $('#snapshotForm').addEventListener('submit', submitSnapshot);
    $('#snapLabelSelect').addEventListener('change', syncSnapshotLabelDate);
    $('#snapDate').addEventListener('change', onSnapDateChange);
    $('#snv_screenshot').addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (f) handleSnapshotScreenshotPick(f);
    });

    // 측정 폼
    $('#metricForm').addEventListener('submit', submitMetric);
    $('#btnMetricReset').addEventListener('click', resetMetricForm);

    // 검색
    $('#search').addEventListener('input', renderTable);

    // Export/Import
    $('#btnExport').addEventListener('click', exportJSON);
    $('#btnImport').addEventListener('click', () => $('#fileInput').click());
    $('#fileInput').addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (f) importJSON(f);
      e.target.value = '';
    });

    // 분석 탭
    $$('.analytics-tabs .tab-btn').forEach(b => {
      b.addEventListener('click', () => {
        $$('.analytics-tabs .tab-btn').forEach(x => x.classList.remove('is-active'));
        b.classList.add('is-active');
        ui.chartTab = b.dataset.tab;
        renderAnalytics();
      });
    });

    // 분석 모드
    $$('.analytics-modes .mode-btn').forEach(b => {
      b.addEventListener('click', () => {
        $$('.analytics-modes .mode-btn').forEach(x => x.classList.remove('is-active'));
        b.classList.add('is-active');
        ui.chartMode = b.dataset.mode;
        renderAnalytics();
      });
    });

    // 참고 영상
    $('#btnAddRef').addEventListener('click', () => openRefModal(null));
    $('#refForm').addEventListener('submit', submitRef);
    $('#refSearch').addEventListener('input', (e) => {
      ui.refSearch = e.target.value;
      renderRefs();
    });
    $('#refSort').addEventListener('change', (e) => {
      ui.refSort = e.target.value;
      renderRefs();
    });
    $$('.ref-filters .filter-btn').forEach(b => {
      b.addEventListener('click', () => {
        $$('.ref-filters .filter-btn').forEach(x => x.classList.remove('is-active'));
        b.classList.add('is-active');
        ui.refFilter = b.dataset.cat;
        renderRefs();
      });
    });
    $('#btnUploadVideo').addEventListener('click', uploadVideo);

    // 모달 닫기
    $$('[data-close]').forEach(el => {
      el.addEventListener('click', (e) => {
        const modal = el.closest('.modal');
        if (modal) {
          modal.hidden = true;
          // 스냅샷 모달이면 임시 상태 비움
          if (modal.id === 'snapshotModal') ui.snapshotScreenshotData = '';
        }
        document.body.style.overflow = '';
      });
    });

    // PAT
    $('#btnGithubSettings').addEventListener('click', openPatModal);
    $('#btnPatSave').addEventListener('click', savePat);
    $('#btnPatDelete').addEventListener('click', deletePat);
    $('#btnPatTest').addEventListener('click', testPat);

    renderAll();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
