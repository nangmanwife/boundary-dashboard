/* =========================================================
   박지영의 3개월 바운더리 — 키즈러닝랩
   v2: 월별 캘린더 + 참고 영상 + 인사이트 트래킹 + 분석 차트
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
    screenshotData: '',             // 임시 base64 (콘텐츠 폼)
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

  // ===== 마이그레이션 / 저장 / 로드 =====
  const migrateContent = (c) => {
    // 기존 필드 + 새 필드 기본값
    return {
      id: c.id || uuid(),
      episode: c.episode,
      date: c.date,
      title: c.title || '',
      memo: c.memo || '',
      link: c.link || '',
      category: c.category || '',
      insights: c.insights || {},
      production: c.production || {}
    };
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
        state.contents = (Array.isArray(parsed.contents) ? parsed.contents : []).map(migrateContent);
        state.weekly_metrics = Array.isArray(parsed.weekly_metrics) ? parsed.weekly_metrics : [];
        state.refs = (Array.isArray(parsed.refs) ? parsed.refs : []).map(migrateRef);
        state.settings = parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : {};
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

      // 월간 KPI
      const monthContents = contentsForMonth(monthKey);
      const upCount = monthContents.length;
      const views = monthContents.map(c => Number(c.insights?.views) || 0).filter(v => v > 0);
      const avgViews = views.length ? Math.round(views.reduce((a, b) => a + b, 0) / views.length) : 0;
      const engRates = monthContents
        .map(c => {
          const v = Number(c.insights?.views) || 0;
          if (v === 0) return null;
          const eng = (Number(c.insights?.likes) || 0) +
            (Number(c.insights?.comments) || 0) +
            (Number(c.insights?.shares) || 0) +
            (Number(c.insights?.saves) || 0);
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
        // 기간 외 또는 이번 월 외 → 비활성
        if (!inPeriod || !inMonth) cell.classList.add('cal-cell--out');
        if (isToday && inPeriod && inMonth) cell.classList.add('cal-cell--today');
        if (upload && inMonth) cell.classList.add('cal-cell--done');

        if (inPeriod && inMonth) {
          const label = `${d.getMonth() + 1}/${d.getDate()}`;
          const ep = upload ? `#${upload.episode}` : '';
          cell.innerHTML = `
            <div class="cal-cell__day">${label}</div>
            <div class="cal-cell__ep">${ep}</div>
          `;
          cell.title = upload
            ? `#${upload.episode} ${upload.title}`
            : `${ds} — 클릭하면 콘텐츠 추가`;
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

  const resetInsightFields = () => {
    ['iv_views', 'iv_reach', 'iv_avg', 'iv_likes', 'iv_comments', 'iv_reposts',
     'iv_shares', 'iv_saves', 'iv_profile', 'iv_follows',
     'iv_age_13', 'iv_age_18', 'iv_age_25', 'iv_age_35', 'iv_age_45', 'iv_age_55', 'iv_age_65'
    ].forEach(id => $('#' + id).value = '');
    ui.screenshotData = '';
    $('#screenshotPreview').innerHTML = '';
    $('#iv_screenshot').value = '';
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
    resetInsightFields();
    resetProductionFields();
    $('#formTitle').textContent = '콘텐츠 추가';
    $('#btnSave').textContent = '저장';
    $('#title').focus();
    $('#contentForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const editContent = (id) => {
    const c = state.contents.find(x => x.id === id);
    if (!c) return;
    $('#contentId').value = c.id;
    $('#episode').value = c.episode;
    $('#date').value = c.date;
    $('#title').value = c.title;
    $('#memo').value = c.memo || '';
    $('#link').value = c.link || '';
    $('#category').value = c.category || '';

    // 인사이트 채우기
    const iv = c.insights || {};
    $('#iv_views').value = iv.views ?? '';
    $('#iv_reach').value = iv.reach ?? '';
    $('#iv_avg').value = iv.avg_watch_seconds ?? '';
    $('#iv_likes').value = iv.likes ?? '';
    $('#iv_comments').value = iv.comments ?? '';
    $('#iv_reposts').value = iv.reposts ?? '';
    $('#iv_shares').value = iv.shares ?? '';
    $('#iv_saves').value = iv.saves ?? '';
    $('#iv_profile').value = iv.profile_visits ?? '';
    $('#iv_follows').value = iv.follows ?? '';
    const age = iv.age_dist || {};
    $('#iv_age_13').value = age['13-17'] ?? '';
    $('#iv_age_18').value = age['18-24'] ?? '';
    $('#iv_age_25').value = age['25-34'] ?? '';
    $('#iv_age_35').value = age['35-44'] ?? '';
    $('#iv_age_45').value = age['45-54'] ?? '';
    $('#iv_age_55').value = age['55-64'] ?? '';
    $('#iv_age_65').value = age['65+'] ?? '';
    ui.screenshotData = iv.screenshot_url || '';
    $('#screenshotPreview').innerHTML = ui.screenshotData
      ? `<img src="${escapeAttr(ui.screenshotData)}" alt="인사이트 스크린샷">`
      : '';

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
  };

  const deleteContent = (id) => {
    const c = state.contents.find(x => x.id === id);
    if (!c) return;
    if (!confirm(`#${c.episode} "${c.title}" 정말 삭제할래?`)) return;
    state.contents = state.contents.filter(x => x.id !== id);
    save();
    renderAll();
  };

  // 폼 → 인사이트 객체
  const collectInsights = () => {
    const num = (id) => {
      const v = $('#' + id).value;
      return v === '' ? undefined : Number(v);
    };
    const age_dist = {};
    [['13-17', 'iv_age_13'], ['18-24', 'iv_age_18'], ['25-34', 'iv_age_25'],
     ['35-44', 'iv_age_35'], ['45-54', 'iv_age_45'], ['55-64', 'iv_age_55'],
     ['65+', 'iv_age_65']].forEach(([k, id]) => {
      const v = num(id);
      if (v !== undefined) age_dist[k] = v;
    });
    const obj = {
      views: num('iv_views'),
      reach: num('iv_reach'),
      avg_watch_seconds: num('iv_avg'),
      likes: num('iv_likes'),
      comments: num('iv_comments'),
      reposts: num('iv_reposts'),
      shares: num('iv_shares'),
      saves: num('iv_saves'),
      profile_visits: num('iv_profile'),
      follows: num('iv_follows')
    };
    if (Object.keys(age_dist).length) obj.age_dist = age_dist;
    if (ui.screenshotData) obj.screenshot_url = ui.screenshotData;
    // undefined 제거
    Object.keys(obj).forEach(k => obj[k] === undefined && delete obj[k]);
    return obj;
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
    const insights = collectInsights();
    const production = collectProduction();

    if (!ep || !date || !title) return;

    if (id) {
      const c = state.contents.find(x => x.id === id);
      if (c) Object.assign(c, { episode: ep, date, title, memo, link, category, insights, production });
    } else {
      const dup = state.contents.find(x => Number(x.episode) === ep);
      if (dup && !confirm(`#${ep}이 이미 있어. 새로 추가할래? (덮어쓰지 않음)`)) return;
      state.contents.push({
        id: uuid(), episode: ep, date, title, memo, link, category, insights, production
      });
    }
    save();
    renderAll();
    prefillForm();
  };

  // ===== 스크린샷 압축 & 저장 =====
  const handleScreenshotPick = async (file) => {
    if (!file) return;
    try {
      const compressed = await compressImage(file, 800, 0.82);
      ui.screenshotData = compressed;
      $('#screenshotPreview').innerHTML = `<img src="${escapeAttr(compressed)}" alt="인사이트 스크린샷">`;
    } catch (err) {
      console.warn('이미지 압축 실패, 원본 base64 사용:', err);
      const reader = new FileReader();
      reader.onload = (e) => {
        ui.screenshotData = e.target.result;
        $('#screenshotPreview').innerHTML = `<img src="${escapeAttr(ui.screenshotData)}" alt="인사이트 스크린샷">`;
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
      const v = c.insights?.views;
      const er = engRate(c.insights);
      return `
      <tr>
        <td class="col-num"><span class="ep-badge">${escapeHTML(String(c.episode))}</span></td>
        <td class="col-date">${escapeHTML(c.date)}</td>
        <td>${escapeHTML(c.title)}</td>
        <td class="col-cat">${c.category ? `<span class="cat-tag">${escapeHTML(c.category)}</span>` : '—'}</td>
        <td class="col-num">${v !== undefined && v !== null && v !== '' ? fmtViews(v) : '—'}</td>
        <td class="col-num">${er !== null ? er.toFixed(1) + '%' : '—'}</td>
        <td class="col-link">${c.link ? `<a href="${escapeAttr(c.link)}" target="_blank" rel="noopener">열기</a>` : '—'}</td>
        <td class="col-act"><button class="btn btn--mini btn--ghost" data-edit="${c.id}">편집</button></td>
        <td class="col-act"><button class="btn btn--mini btn--danger" data-del="${c.id}">삭제</button></td>
      </tr>
    `;
    }).join('');

    tbody.querySelectorAll('[data-edit]').forEach(b => {
      b.addEventListener('click', () => editContent(b.dataset.edit));
    });
    tbody.querySelectorAll('[data-del]').forEach(b => {
      b.addEventListener('click', () => deleteContent(b.dataset.del));
    });
  };

  // ===== 인사이트 분석 (Chart.js) =====
  const renderAnalytics = () => {
    if (typeof Chart === 'undefined') return;
    const sorted = [...state.contents]
      .filter(c => c.insights && c.insights.views !== undefined)
      .sort((a, b) => Number(a.episode) - Number(b.episode));

    renderLineChart(sorted);
    renderBestWorst(sorted);
    renderAgeChart();
    renderCategoryChart();
    renderHookList();
  };

  const renderLineChart = (sorted) => {
    const canvas = $('#chartLine');
    if (!canvas) return;
    if (charts.line) { charts.line.destroy(); charts.line = null; }

    let label = '조회수';
    let data = [];
    if (ui.chartTab === 'views') {
      data = sorted.map(c => Number(c.insights.views) || 0);
      label = '조회수';
    } else if (ui.chartTab === 'engagement') {
      data = sorted.map(c => {
        const er = engRate(c.insights);
        return er === null ? 0 : Number(er.toFixed(1));
      });
      label = '참여율 (%)';
    } else if (ui.chartTab === 'reach') {
      data = sorted.map(c => {
        const v = Number(c.insights.views) || 0;
        const r = Number(c.insights.reach) || 0;
        if (v === 0) return 0;
        return Number(((r / v) * 100).toFixed(1));
      });
      label = '도달률 (도달/조회 %)';
    } else if (ui.chartTab === 'watch') {
      data = sorted.map(c => Number(c.insights.avg_watch_seconds) || 0);
      label = '평균 조회 시간 (초)';
    }

    const labels = sorted.map(c => `#${c.episode}`);

    charts.line = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label,
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

  const renderBestWorst = (sorted) => {
    const byViews = [...sorted].sort((a, b) => (Number(b.insights.views) || 0) - (Number(a.insights.views) || 0));
    const best = byViews.slice(0, 3);
    const worst = byViews.slice(-3).reverse();
    const render = (arr) => {
      if (arr.length === 0) return '<div class="muted" style="font-size:11.5px;">데이터 없음</div>';
      return arr.map(c => `
        <div class="bw-row">
          <div class="bw-row__title">#${c.episode} ${escapeHTML(c.title)}</div>
          <div class="bw-row__num">${fmtViews(c.insights.views)}</div>
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
      const age = c.insights?.age_dist;
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
      const v = Number(c.insights?.views);
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
      const v = Number(c.insights?.views) || 0;
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
        save();
        renderAll();
        alert('가져오기 완료.');
      } catch (err) {
        alert('JSON 파싱 실패: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  // ===== 전체 렌더 =====
  const renderAll = () => {
    renderKPI();
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
    $('#iv_screenshot').addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (f) handleScreenshotPick(f);
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
        // backdrop이나 닫기 버튼만
        const modal = el.closest('.modal');
        if (modal) modal.hidden = true;
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
