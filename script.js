/* =========================================================
   박지영의 3개월 바운더리 — 키즈러닝랩
   ========================================================= */

(() => {
  'use strict';

  // ===== 상수 =====
  const STORAGE_KEY = 'boundary-dashboard:v1';
  const START_DATE = '2026-06-23'; // 월요일
  const END_DATE = '2026-09-23';
  const TARGET_REELS = 36;

  // ===== 상태 =====
  let state = {
    contents: [],         // {id, episode, date, title, memo, link}
    weekly_metrics: []    // {id, week_of, new_dm, where_can_i_run_count, note}
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

  // ===== 저장/로드 =====
  const load = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state.contents = Array.isArray(parsed.contents) ? parsed.contents : [];
        state.weekly_metrics = Array.isArray(parsed.weekly_metrics) ? parsed.weekly_metrics : [];
      }
    } catch (e) {
      console.warn('LocalStorage load failed:', e);
    }
  };
  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  };

  // ===== KPI 렌더 =====
  const renderKPI = () => {
    const startD = parseDate(START_DATE);
    const endD = parseDate(END_DATE);
    const totalDays = daysBetween(startD, endD) + 1; // 92
    const t = today();
    let elapsed = daysBetween(startD, t) + 1;
    if (elapsed < 0) elapsed = 0;
    if (elapsed > totalDays) elapsed = totalDays;

    // 업로드
    const upCount = state.contents.length;
    const upPct = Math.min(100, Math.round((upCount / TARGET_REELS) * 100));
    $('#kpiUploadCount').textContent = upCount;
    $('#kpiUploadPct').textContent = upPct;
    $('#kpiUploadRemaining').textContent = Math.max(0, TARGET_REELS - upCount);
    $('#kpiUploadBar').style.width = upPct + '%';

    // 일자
    const dayPct = Math.round((elapsed / totalDays) * 100);
    $('#kpiDayCount').textContent = elapsed;
    $('#kpiDayPct').textContent = dayPct;
    $('#kpiDayRemaining').textContent = Math.max(0, totalDays - elapsed);
    $('#kpiDayBar').style.width = dayPct + '%';

    // 측정
    const signal = state.weekly_metrics.reduce((s, m) => s + (Number(m.where_can_i_run_count) || 0), 0);
    const dm = state.weekly_metrics.reduce((s, m) => s + (Number(m.new_dm) || 0), 0);
    $('#kpiSignalCount').textContent = signal;
    $('#kpiDmCount').textContent = dm;
    // 시그널 바: 일단 누적 카운트를 36 기준으로 표시 (월 12개 가정), 무한 누적은 100% 캡
    const signalPct = Math.min(100, Math.round((signal / 36) * 100));
    $('#kpiSignalBar').style.width = signalPct + '%';

    // 축하 배너
    $('#celebration').hidden = upCount < TARGET_REELS;
  };

  // ===== 캘린더 렌더 =====
  const renderCalendar = () => {
    const grid = $('#calGrid');
    grid.innerHTML = '';

    const startD = parseDate(START_DATE);
    const endD = parseDate(END_DATE);
    const t = today();

    // 6/23은 화요일 → 직전 월요일까지 패딩
    // getDay(): 0=일, 1=월, ..., 6=토. 월요일 시작 그리드에서 인덱스: (getDay()+6)%7
    const startWeekIdx = (startD.getDay() + 6) % 7;
    const gridStart = new Date(startD);
    gridStart.setDate(startD.getDate() - startWeekIdx);

    const endWeekIdx = (endD.getDay() + 6) % 7;
    const gridEnd = new Date(endD);
    gridEnd.setDate(endD.getDate() + (6 - endWeekIdx));

    const totalCells = daysBetween(gridStart, gridEnd) + 1;

    // 날짜별 업로드 맵
    const byDate = new Map();
    state.contents.forEach(c => byDate.set(c.date, c));

    for (let i = 0; i < totalCells; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      const ds = fmtDate(d);
      const inRange = d >= startD && d <= endD;
      const isToday = d.getTime() === t.getTime();
      const upload = byDate.get(ds);

      const cell = document.createElement('div');
      cell.className = 'cal-cell';
      if (!inRange) cell.classList.add('cal-cell--out');
      if (isToday && inRange) cell.classList.add('cal-cell--today');
      if (upload) cell.classList.add('cal-cell--done');

      if (inRange) {
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
  };

  // ===== 콘텐츠 폼 =====
  const prefillForm = (dateStr) => {
    $('#contentId').value = '';
    $('#date').value = dateStr || '';
    $('#episode').value = nextEpisode();
    $('#title').value = '';
    $('#memo').value = '';
    $('#link').value = '';
    $('#formTitle').textContent = '콘텐츠 추가';
    $('#btnSave').textContent = '저장';
    $('#title').focus();
    document.getElementById('contentForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const nextEpisode = () => {
    if (state.contents.length === 0) return 1;
    const max = state.contents.reduce((m, c) => Math.max(m, Number(c.episode) || 0), 0);
    return Math.min(TARGET_REELS, max + 1);
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
    $('#formTitle').textContent = `#${c.episode} 편집`;
    $('#btnSave').textContent = '수정 저장';
    document.getElementById('contentForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const deleteContent = (id) => {
    const c = state.contents.find(x => x.id === id);
    if (!c) return;
    if (!confirm(`#${c.episode} "${c.title}" 정말 삭제할래?`)) return;
    state.contents = state.contents.filter(x => x.id !== id);
    save();
    renderAll();
  };

  const submitContent = (e) => {
    e.preventDefault();
    const id = $('#contentId').value;
    const ep = Number($('#episode').value);
    const date = $('#date').value;
    const title = $('#title').value.trim();
    const memo = $('#memo').value.trim();
    const link = $('#link').value.trim();

    if (!ep || !date || !title) return;

    if (id) {
      const c = state.contents.find(x => x.id === id);
      if (c) Object.assign(c, { episode: ep, date, title, memo, link });
    } else {
      // 같은 회차가 이미 있으면 확인
      const dup = state.contents.find(x => Number(x.episode) === ep);
      if (dup && !confirm(`#${ep}이 이미 있어. 새로 추가할래? (덮어쓰지 않음)`)) return;
      state.contents.push({ id: uuid(), episode: ep, date, title, memo, link });
    }
    save();
    renderAll();
    prefillForm(); // 폼 초기화
  };

  // ===== 콘텐츠 테이블 =====
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
      tbody.innerHTML = `<tr class="empty-row"><td colspan="7">${
        state.contents.length === 0
          ? '아직 올린 콘텐츠가 없어. 위 폼이나 달력에서 첫 회차를 시작해.'
          : '검색 결과 없음.'
      }</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(c => `
      <tr>
        <td class="col-num"><span class="ep-badge">${escapeHTML(String(c.episode))}</span></td>
        <td class="col-date">${escapeHTML(c.date)}</td>
        <td>${escapeHTML(c.title)}</td>
        <td class="col-memo">${escapeHTML((c.memo || '').slice(0, 80))}${(c.memo || '').length > 80 ? '…' : ''}</td>
        <td class="col-link">${c.link ? `<a href="${escapeAttr(c.link)}" target="_blank" rel="noopener">열기</a>` : '—'}</td>
        <td class="col-act"><button class="btn btn--mini btn--ghost" data-edit="${c.id}">편집</button></td>
        <td class="col-act"><button class="btn btn--mini btn--danger" data-del="${c.id}">삭제</button></td>
      </tr>
    `).join('');

    tbody.querySelectorAll('[data-edit]').forEach(b => {
      b.addEventListener('click', () => editContent(b.dataset.edit));
    });
    tbody.querySelectorAll('[data-del]').forEach(b => {
      b.addEventListener('click', () => deleteContent(b.dataset.del));
    });
  };

  // ===== 측정 폼 =====
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
    document.getElementById('metricForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
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
        if (!data.contents || !data.weekly_metrics) {
          alert('JSON 형식이 맞지 않아. contents / weekly_metrics 필드가 필요해.');
          return;
        }
        if (!confirm('현재 데이터를 덮어쓸 거야. 계속할까?')) return;
        state.contents = data.contents.map(c => ({ id: c.id || uuid(), ...c }));
        state.weekly_metrics = data.weekly_metrics.map(m => ({ id: m.id || uuid(), ...m }));
        save();
        renderAll();
        alert('가져오기 완료.');
      } catch (err) {
        alert('JSON 파싱 실패: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  // ===== HTML escape =====
  const escapeHTML = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
  const escapeAttr = (s) => escapeHTML(s);

  // ===== 전체 렌더 =====
  const renderAll = () => {
    renderKPI();
    renderCalendar();
    renderTable();
    renderMetricTable();
  };

  // ===== 초기화 / 이벤트 =====
  const init = () => {
    load();

    // 기본 폼 값
    prefillForm(fmtDate(today()));
    resetMetricForm();
    // 측정 폼 기본 주 시작일 = 이번 주 월요일
    const t = today();
    const monOffset = (t.getDay() + 6) % 7;
    const monday = new Date(t);
    monday.setDate(t.getDate() - monOffset);
    $('#metricWeek').value = fmtDate(monday);

    $('#contentForm').addEventListener('submit', submitContent);
    $('#btnReset').addEventListener('click', () => prefillForm(fmtDate(today())));

    $('#metricForm').addEventListener('submit', submitMetric);
    $('#btnMetricReset').addEventListener('click', resetMetricForm);

    $('#search').addEventListener('input', renderTable);

    $('#btnExport').addEventListener('click', exportJSON);
    $('#btnImport').addEventListener('click', () => $('#fileInput').click());
    $('#fileInput').addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (f) importJSON(f);
      e.target.value = '';
    });

    renderAll();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
