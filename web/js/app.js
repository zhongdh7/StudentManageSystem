/*!
 * 高校学生成绩管理系统 · 前端界面逻辑
 * ------------------------------------------------------------------
 * 依赖 core.js 暴露的全局对象 StudentCore。
 * 无第三方依赖，直接以 classic script 加载，支持 file:// 打开。
 */
(function () {
  'use strict';

  var C = window.StudentCore;
  if (!C) {
    throw new Error('StudentCore 未加载，请检查 js/core.js 路径是否正确');
  }

  var SUBJECTS = C.SUBJECTS;
  var PAGE_SIZE = 9;

  var VIEW_META = {
    dashboard: { title: '数据看板', subtitle: '学生成绩概览与关键指标' },
    students: { title: '学生管理', subtitle: '添加、编辑、删除与查找学生记录' },
    analytics: { title: '成绩分析', subtitle: '各科表现、分数段与总分排名' },
    data: { title: '数据管理', subtitle: '与 C 语言后端 student.txt 数据互通' }
  };

  var SORT_LABELS = {
    number: '学号',
    name: '姓名',
    chinese: '语文',
    math: '数学',
    english: '英语',
    total: '总分',
    average: '平均分'
  };

  var state = {
    view: 'dashboard',
    query: '',
    filter: 'all',
    sortKey: 'number',
    sortDir: 1,
    page: 1
  };

  var store = null;
  var storageAvailable = true;
  var storageWarningShown = false;
  var modalStack = [];
  var modalSequence = 0;

  /* ------------------------------------------------------------------ *
   * 通用工具
   * ------------------------------------------------------------------ */

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $$(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[character];
    });
  }

  function icon(name, extraClass) {
    return '<svg class="icon ' + (extraClass || '') + '" aria-hidden="true"><use href="#' + name + '"></use></svg>';
  }

  function pad2(value) {
    return value < 10 ? '0' + value : String(value);
  }

  function firstChar(name) {
    var characters = Array.from(String(name || ''));
    return characters.length ? characters[0] : '?';
  }

  function avatarTone(number) {
    var text = String(number);
    var sum = 0;
    for (var i = 0; i < text.length; i += 1) {
      sum += text.charCodeAt(i);
    }
    return sum % 6;
  }

  function relativeTime(timestamp) {
    var time = Number(timestamp);
    if (!Number.isFinite(time)) return '';
    var diff = Date.now() - time;
    if (diff < 45 * 1000) return '刚刚';
    if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / 3600000) + ' 小时前';
    if (diff < 7 * 24 * 60 * 60 * 1000) return Math.floor(diff / 86400000) + ' 天前';
    return formatDateTime(time).slice(0, 10);
  }

  function formatDateTime(timestamp) {
    if (!timestamp) return '—';
    var date = new Date(Number(timestamp));
    if (isNaN(date.getTime())) return '—';
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate()) +
      ' ' + pad2(date.getHours()) + ':' + pad2(date.getMinutes());
  }

  function timestampForFileName() {
    var date = new Date();
    return date.getFullYear() + pad2(date.getMonth() + 1) + pad2(date.getDate()) +
      '-' + pad2(date.getHours()) + pad2(date.getMinutes());
  }

  function activityIcon(type) {
    return {
      add: 'i-plus',
      update: 'i-edit',
      remove: 'i-trash',
      restore: 'i-rotate',
      import: 'i-upload',
      export: 'i-download',
      clear: 'i-alert-triangle',
      demo: 'i-sparkles'
    }[type] || 'i-history';
  }

  /**
   * 成绩等级按显示值（保留一位小数）判定，避免 89.9667 显示 90.0 却判为“良好”。
   */
  function gradeForDisplay(score) {
    return C.gradeInfo(Number(C.formatScore(score)));
  }

  function findStudent(number) {
    for (var i = 0; i < store.students.length; i += 1) {
      if (store.students[i].number === number) return store.students[i];
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * 本地存储与启动
   * ------------------------------------------------------------------ */

  function getStorage() {
    try {
      var storage = window.localStorage;
      var probe = '__sms_probe__';
      storage.setItem(probe, '1');
      storage.removeItem(probe);
      return storage;
    } catch (error) {
      storageAvailable = false;
      return C.createMemoryStorage();
    }
  }

  function boot() {
    initTheme();
    store = new C.StudentStore(getStorage());
    var hadSaved = store.load();
    var corruptBackupSaved = false;

    if (!hadSaved && store.corrupt) {
      try {
        var corruptRaw = window.localStorage.getItem(C.STORAGE_KEYS.students);
        if (corruptRaw) {
          window.localStorage.setItem(C.STORAGE_KEYS.students + '.corrupt-backup', corruptRaw);
          corruptBackupSaved = true;
        }
      } catch (error) {
        corruptBackupSaved = false;
      }
    }

    if (!hadSaved) {
      store.replaceAll(C.demoStudents(), {
        demo: true,
        activityType: 'demo',
        message: '载入示例数据（12 名学生）'
      });
    }

    bindEvents();
    applyView(parseHashView(), true);

    if (store.corrupt) {
      window.setTimeout(function () {
        toast(corruptBackupSaved
          ? '本地数据损坏，原始内容已备份到浏览器，当前已载入示例数据。'
          : '本地数据损坏，无法读取，当前已载入示例数据。', 'error', { duration: 9000 });
      }, 800);
    } else if (hadSaved && store.skippedRecords > 0) {
      window.setTimeout(function () {
        toast('本地有 ' + store.skippedRecords + ' 条记录已损坏并被忽略。', 'error', { duration: 7000 });
      }, 800);
    }

    if (!storageAvailable) {
      window.setTimeout(function () {
        toast('当前浏览器禁用了本地存储，数据只保存在内存中，关闭页面后会丢失。', 'error', { duration: 7000 });
      }, 600);
    }
  }

  function parseHashView() {
    var match = (window.location.hash || '').match(/^#\/?([a-z]+)/i);
    var view = match && match[1] ? match[1].toLowerCase() : '';
    return VIEW_META[view] ? view : 'dashboard';
  }

  function navigate(view) {
    if (!VIEW_META[view] || state.view === view) return;
    window.location.hash = '#/' + view;
  }

  function applyView(view, initial) {
    state.view = view;
    $$('.view').forEach(function (section) {
      section.classList.toggle('is-active', section.getAttribute('data-view') === view);
    });
    $$('.nav-item').forEach(function (item) {
      var isActive = item.getAttribute('data-view') === view;
      item.classList.toggle('is-active', isActive);
      if (isActive) {
        item.setAttribute('aria-current', 'page');
      } else {
        item.removeAttribute('aria-current');
      }
    });
    var meta = VIEW_META[view];
    $('#page-title').textContent = meta.title;
    $('#page-subtitle').textContent = meta.subtitle;
    document.title = meta.title + ' · 学籍云';
    setSidebar(false);
    if (!initial) window.scrollTo(0, 0);
    renderAll();
  }

  function setSidebar(open) {
    var sidebar = $('#sidebar');
    var scrim = $('#sidebar-scrim');
    if (!sidebar || !scrim) return;
    var isOpen = !!open;
    var isMobile = window.matchMedia && window.matchMedia('(max-width: 980px)').matches;
    var menuToggle = $('#menu-toggle');
    sidebar.classList.toggle('is-open', isOpen);
    scrim.classList.toggle('is-active', isOpen);

    if (isMobile) {
      sidebar.toggleAttribute('inert', !isOpen);
      sidebar.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
      if (menuToggle) {
        menuToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        menuToggle.setAttribute('aria-label', isOpen ? '关闭导航' : '打开导航');
      }
    } else {
      sidebar.removeAttribute('inert');
      sidebar.setAttribute('aria-hidden', 'false');
      if (menuToggle) menuToggle.setAttribute('aria-expanded', 'false');
    }
  }

  /* ------------------------------------------------------------------ *
   * 主题
   * ------------------------------------------------------------------ */

  function initTheme() {
    var saved = null;
    try {
      saved = window.localStorage.getItem(C.STORAGE_KEYS.theme);
    } catch (error) {
      saved = null;
    }
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = saved === 'dark' || saved === 'light' ? saved : (prefersDark ? 'dark' : 'light');
    applyTheme(theme, false);
  }

  function applyTheme(theme, persist) {
    document.documentElement.setAttribute('data-theme', theme);
    if (persist) {
      try {
        window.localStorage.setItem(C.STORAGE_KEYS.theme, theme);
      } catch (error) {
        /* 忽略：主题偏好无法保存不影响使用 */
      }
    }
    var button = $('#theme-toggle');
    if (button) {
      button.setAttribute('aria-label', theme === 'dark' ? '切换到浅色主题' : '切换到深色主题');
    }
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark', true);
  }

  /* ------------------------------------------------------------------ *
   * 渲染：侧边栏与提示条
   * ------------------------------------------------------------------ */

  function renderAll() {
    if (!store) return;
    renderSidebar();
    renderDemoBanner();
    var stats = C.computeStats(store.students);
    renderDashboard(stats);
    renderStudents();
    renderAnalytics(stats);
    renderData();
    checkStorageWarning();
  }

  function renderSidebar() {
    var count = $('#nav-count');
    if (count) count.textContent = String(store.students.length);

    var dot = $('#storage-dot');
    var label = $('#storage-label');
    if (!dot || !label) return;
    if (!storageAvailable || store.storageFailed) {
      dot.className = 'dot dot--red';
      label.textContent = '仅内存模式';
    } else if (store.demo) {
      dot.className = 'dot dot--amber';
      label.textContent = '示例数据';
    } else {
      dot.className = 'dot dot--green';
      label.textContent = '本地已保存';
    }
  }

  function renderDemoBanner() {
    var banner = $('#demo-banner');
    if (!banner) return;
    banner.classList.toggle('hidden', !store.demo);
  }

  function checkStorageWarning() {
    if (storageWarningShown) return;
    if (!storageAvailable || store.storageFailed) {
      storageWarningShown = true;
      toast('本地存储不可用，数据仅保存在内存中，请及时导出备份。', 'error', { duration: 7000 });
    }
  }

  /* ------------------------------------------------------------------ *
   * 渲染：数据看板
   * ------------------------------------------------------------------ */

  function renderDashboard(stats) {
    renderDashStats(stats);
    renderDistribution(stats);
    renderPass(stats);
    renderTopStudents();
    renderActivity();
  }

  function renderDashStats(stats) {
    var container = $('#dash-stats');
    if (!container) return;
    var topAverage = stats.top ? C.studentAverage(stats.top) : 0;
    var cards = [
      {
        tone: 'indigo',
        icon: 'i-users',
        label: '学生总数',
        value: String(stats.count),
        suffix: '人',
        sub: stats.count ? stats.passCount + ' 人三科全部及格' : '等待录入学生信息'
      },
      {
        tone: 'amber',
        icon: 'i-chart',
        label: '平均总分',
        value: stats.count ? C.formatScore(stats.avgTotal) : '—',
        suffix: stats.count ? '/ 300' : '',
        sub: stats.count ? '三科平均 ' + C.formatScore(stats.avgSubject) + ' 分' : '暂无成绩数据'
      },
      {
        tone: 'green',
        icon: 'i-check-circle',
        label: '及格率',
        value: stats.count ? C.formatPercent(stats.passRate) : '—',
        suffix: '',
        sub: stats.count ? stats.failCount + ' 人存在不及格科目' : '暂无成绩数据'
      },
      {
        tone: 'violet',
        icon: 'i-trophy',
        label: '最高总分',
        value: stats.top ? C.formatScore(stats.maxTotal) : '—',
        suffix: stats.top ? '/ 300' : '',
        sub: stats.top ? stats.top.name + ' · 平均 ' + C.formatScore(topAverage) : '暂无排名'
      }
    ];

    container.innerHTML = cards.map(function (card) {
      return '<article class="stat-card tone-' + card.tone + '">' +
        '<span class="stat-icon">' + icon(card.icon) + '</span>' +
        '<div class="stat-info">' +
          '<span class="stat-label">' + escapeHtml(card.label) + '</span>' +
          '<div class="stat-value">' + card.value +
            (card.suffix ? '<span class="stat-suffix">' + escapeHtml(card.suffix) + '</span>' : '') +
          '</div>' +
          '<span class="stat-sub">' + escapeHtml(card.sub) + '</span>' +
        '</div>' +
      '</article>';
    }).join('');
  }

  function renderDistribution(stats) {
    var container = $('#dash-distribution');
    if (!container) return;
    var labels = ['0–59', '60–69', '70–79', '80–89', '90–100'];
    var max = 1;
    stats.distribution.forEach(function (count) {
      if (count > max) max = count;
    });
    var total = $('#dash-dist-total');
    if (total) total.textContent = '共 ' + stats.count + ' 人';

    container.innerHTML = labels.map(function (label, index) {
      var count = stats.distribution[index];
      var height = count === 0 ? 2 : Math.max(8, Math.round((count / max) * 100));
      return '<div class="bar-col">' +
        '<span class="bar-count">' + count + '</span>' +
        '<div class="bar-track"><div class="bar-fill bar-fill--' + index + '" style="--h:' + height + '%"></div></div>' +
        '<span class="bar-label">' + label + '</span>' +
      '</div>';
    }).join('');
  }

  function renderPass(stats) {
    var container = $('#dash-pass');
    if (!container) return;
    var radius = 56;
    var circumference = 2 * Math.PI * radius;
    var dash = (circumference * stats.passRate) / 100;
    var markup = '<div class="pass-top">' +
      '<div class="donut-wrap">' +
        '<svg viewBox="0 0 140 140" class="donut" role="img" aria-label="三科全部及格率 ' + C.formatPercent(stats.passRate) + '">' +
          '<circle class="donut-track" cx="70" cy="70" r="' + radius + '"></circle>' +
          '<circle class="donut-value" cx="70" cy="70" r="' + radius + '" stroke-dasharray="' +
            dash.toFixed(2) + ' ' + circumference.toFixed(2) + '"></circle>' +
        '</svg>' +
        '<div class="donut-center"><strong>' + C.formatPercent(stats.passRate) + '</strong><span>三科全及格</span></div>' +
      '</div>' +
      '<div class="pass-legend">' +
        '<div><span class="legend-dot legend-dot--green"></span>全部及格 <strong>' + stats.passCount + '</strong> 人</div>' +
        '<div><span class="legend-dot legend-dot--red"></span>存在不及格 <strong>' + stats.failCount + '</strong> 人</div>' +
      '</div>' +
    '</div>' +
    '<div class="subject-meters">';

    SUBJECTS.forEach(function (subject) {
      var subjectStats = stats.subjects[subject.key];
      markup += '<div class="subject-meter">' +
        '<div class="subject-meter-head"><span>' + escapeHtml(subject.label) + '及格率</span>' +
          '<strong>' + C.formatPercent(subjectStats.passRate) + '</strong></div>' +
        '<div class="meter"><div class="meter-fill" style="--w:' + subjectStats.passRate.toFixed(1) + '%"></div></div>' +
      '</div>';
    });

    markup += '</div>';
    container.innerHTML = markup;
  }

  function renderTopStudents() {
    var container = $('#dash-top');
    if (!container) return;
    var ranked = C.rankStudents(store.students).slice(0, 5);
    if (!ranked.length) {
      container.innerHTML = '<li class="empty-inline">暂无学生数据，添加学生后这里会展示总分排名</li>';
      return;
    }
    container.innerHTML = ranked.map(function (student, index) {
      var rankClass = index < 3 ? ' rank-no--' + (index + 1) : '';
      return '<li class="rank-item">' +
        '<span class="rank-no' + rankClass + '">' + (index + 1) + '</span>' +
        '<span class="avatar avatar--' + avatarTone(student.number) + '">' + escapeHtml(firstChar(student.name)) + '</span>' +
        '<div class="rank-info"><strong>' + escapeHtml(student.name) + '</strong><span>' + escapeHtml(student.number) + '</span></div>' +
        '<div class="rank-score"><strong>' + C.formatScore(C.studentTotal(student)) + '</strong><span>总分</span></div>' +
      '</li>';
    }).join('');
  }

  function renderActivity() {
    var container = $('#dash-activity');
    if (!container) return;
    var items = store.activity.slice(0, 8);
    if (!items.length) {
      container.innerHTML = '<li class="empty-inline">暂无操作记录</li>';
      return;
    }
    container.innerHTML = items.map(function (entry) {
      return '<li class="activity-item">' +
        '<span class="activity-icon activity-icon--' + escapeHtml(entry.type) + '">' + icon(activityIcon(entry.type)) + '</span>' +
        '<div class="activity-body">' +
          '<p>' + escapeHtml(entry.message) + '</p>' +
          '<span class="js-time" data-time="' + escapeHtml(String(entry.time)) + '">' + relativeTime(entry.time) + '</span>' +
        '</div>' +
      '</li>';
    }).join('');
  }

  /* ------------------------------------------------------------------ *
   * 渲染：学生表格
   * ------------------------------------------------------------------ */

  function renderStudents() {
    var filtered = C.filterStudents(store.students, {
      query: state.query,
      filter: state.filter,
      sortKey: state.sortKey,
      sortDir: state.sortDir
    });
    var totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (state.page > totalPages) state.page = totalPages;
    if (state.page < 1) state.page = 1;
    var start = (state.page - 1) * PAGE_SIZE;
    var rows = filtered.slice(start, start + PAGE_SIZE);

    var summary = $('#student-summary');
    if (summary) {
      if (!store.students.length) {
        summary.textContent = '暂无学生数据';
      } else if (filtered.length !== store.students.length) {
        summary.textContent = '共 ' + store.students.length + ' 名学生 · 筛选出 ' + filtered.length + ' 名';
      } else {
        summary.textContent = '共 ' + store.students.length + ' 名学生';
      }
    }

    var sortLabel = $('#student-sort-label');
    if (sortLabel) {
      sortLabel.textContent = '按' + SORT_LABELS[state.sortKey] + (state.sortDir === 1 ? '升序' : '降序');
    }

    var sortControl = $('#student-sort');
    if (sortControl) {
      var controlValue = state.sortKey + ':' + (state.sortDir === 1 ? 'asc' : 'desc');
      if (sortControl.value !== controlValue) sortControl.value = controlValue;
    }

    $$('#student-table thead th.sortable').forEach(function (th) {
      var active = th.getAttribute('data-sort') === state.sortKey;
      th.classList.toggle('is-sorted', active);
      th.classList.toggle('is-desc', active && state.sortDir === -1);
      th.setAttribute('aria-sort', active ? (state.sortDir === 1 ? 'ascending' : 'descending') : 'none');
    });

    var tbody = $('#student-table-body');
    if (tbody) {
      if (rows.length) {
        tbody.innerHTML = rows.map(studentRowHtml).join('');
      } else if (store.students.length === 0) {
        tbody.innerHTML = emptyStudentsHtml();
      } else {
        tbody.innerHTML = noMatchHtml();
      }
    }

    var footer = $('#student-pagination');
    if (footer) {
      if (!filtered.length) {
        footer.innerHTML = '';
      } else {
        var from = start + 1;
        var to = Math.min(start + PAGE_SIZE, filtered.length);
        footer.innerHTML = '<span class="page-info">显示 ' + from + '–' + to + ' 条，共 ' + filtered.length + ' 条</span>' +
          '<div class="page-controls">' +
            '<button type="button" class="page-btn page-btn--nav" data-page="' + (state.page - 1) + '"' +
              (state.page <= 1 ? ' disabled' : '') + ' aria-label="上一页">' + icon('i-chevron-left') + '</button>' +
            pageButtonsHtml(state.page, totalPages) +
            '<button type="button" class="page-btn page-btn--nav" data-page="' + (state.page + 1) + '"' +
              (state.page >= totalPages ? ' disabled' : '') + ' aria-label="下一页">' + icon('i-chevron-right') + '</button>' +
          '</div>';
      }
    }
  }

  function studentRowHtml(student) {
    var total = C.studentTotal(student);
    var average = C.studentAverage(student);
    var subjectCells = SUBJECTS.map(function (subject) {
      var score = student[subject.key];
      return '<td class="num" data-label="' + escapeHtml(subject.label) + '"><span class="score ' + C.gradeInfo(score).className + '">' +
        C.formatScore(score) + '</span></td>';
    }).join('');

    return '<tr>' +
      '<td data-label="学号"><span class="mono">' + escapeHtml(student.number) + '</span></td>' +
      '<td data-label="姓名"><div class="student-cell">' +
        '<span class="avatar avatar--' + avatarTone(student.number) + '">' + escapeHtml(firstChar(student.name)) + '</span>' +
        '<span class="student-name">' + escapeHtml(student.name) + '</span>' +
      '</div></td>' +
      subjectCells +
      '<td class="num strong" data-label="总分">' + C.formatScore(total) + '</td>' +
      '<td class="num" data-label="平均分"><span class="avg-pill ' + gradeForDisplay(average).className + '">' + C.formatScore(average) + '</span></td>' +
      '<td class="actions" data-label="操作"><div class="row-actions">' +
        '<button type="button" class="icon-btn js-edit" data-number="' + escapeHtml(student.number) + '" title="编辑 ' + escapeHtml(student.name) + '" aria-label="编辑 ' + escapeHtml(student.name) + '">' + icon('i-edit') + '</button>' +
        '<button type="button" class="icon-btn icon-btn--danger js-delete" data-number="' + escapeHtml(student.number) + '" title="删除 ' + escapeHtml(student.name) + '" aria-label="删除 ' + escapeHtml(student.name) + '">' + icon('i-trash') + '</button>' +
      '</div></td>' +
    '</tr>';
  }

  function emptyStudentsHtml() {
    return '<tr><td colspan="8"><div class="empty-state">' +
      '<span class="empty-icon">' + icon('i-users') + '</span>' +
      '<h3>还没有学生记录</h3>' +
      '<p>可以导入 C 后端生成的 <code>student.txt</code>，或直接添加第一位学生。</p>' +
      '<div class="empty-actions">' +
        '<button type="button" class="btn btn-primary js-empty-add">' + icon('i-plus') + '<span>添加学生</span></button>' +
        '<button type="button" class="btn btn-ghost js-empty-import">' + icon('i-upload') + '<span>导入数据</span></button>' +
        '<button type="button" class="btn btn-ghost js-empty-demo">' + icon('i-sparkles') + '<span>载入示例</span></button>' +
      '</div>' +
    '</div></td></tr>';
  }

  function noMatchHtml() {
    return '<tr><td colspan="8"><div class="empty-state empty-state--sm">' +
      '<span class="empty-icon">' + icon('i-search') + '</span>' +
      '<h3>没有匹配的学生</h3>' +
      '<p>试试更换关键词，或者清除当前筛选条件。</p>' +
      '<div class="empty-actions">' +
        '<button type="button" class="btn btn-ghost js-reset-filters">清除筛选</button>' +
      '</div>' +
    '</div></td></tr>';
  }

  function pageButtonsHtml(current, total) {
    var pages = [];
    if (total <= 5) {
      for (var page = 1; page <= total; page += 1) pages.push(page);
    } else {
      pages.push(1);
      var start = Math.max(2, current - 1);
      var end = Math.min(total - 1, current + 1);
      if (start > 2) pages.push('…');
      for (var index = start; index <= end; index += 1) pages.push(index);
      if (end < total - 1) pages.push('…');
      pages.push(total);
    }
    return pages.map(function (page) {
      if (page === '…') return '<span class="page-ellipsis">…</span>';
      return '<button type="button" class="page-btn' + (page === current ? ' is-active' : '') +
        '" data-page="' + page + '">' + page + '</button>';
    }).join('');
  }

  /* ------------------------------------------------------------------ *
   * 渲染：成绩分析
   * ------------------------------------------------------------------ */

  function renderAnalytics(stats) {
    renderSubjectCards(stats);
    renderSubjectCompare(stats);
    renderSubjectBuckets();
    renderRanking();
  }

  function renderSubjectCards(stats) {
    var container = $('#analytics-subject-cards');
    if (!container) return;
    var meta = [
      { tone: 'indigo', icon: 'i-book' },
      { tone: 'amber', icon: 'i-calculator' },
      { tone: 'green', icon: 'i-globe' }
    ];
    container.innerHTML = SUBJECTS.map(function (subject, index) {
      var subjectStats = stats.subjects[subject.key];
      var hasData = stats.count > 0;
      return '<article class="stat-card tone-' + meta[index].tone + '">' +
        '<span class="stat-icon">' + icon(meta[index].icon) + '</span>' +
        '<div class="stat-info">' +
          '<span class="stat-label">' + escapeHtml(subject.label) + '</span>' +
          '<div class="stat-value">' + (hasData ? C.formatScore(subjectStats.avg) : '—') +
            '<span class="stat-suffix">平均分</span></div>' +
          '<span class="stat-sub">' +
            (hasData
              ? '最高 ' + C.formatScore(subjectStats.max) + ' · 最低 ' + C.formatScore(subjectStats.min) +
                ' · 及格率 ' + C.formatPercent(subjectStats.passRate)
              : '暂无成绩数据') +
          '</span>' +
        '</div>' +
      '</article>';
    }).join('');
  }

  function renderSubjectCompare(stats) {
    var container = $('#analytics-compare');
    if (!container) return;
    if (!stats.count) {
      container.innerHTML = '<div class="empty-inline">暂无学生数据</div>';
      return;
    }
    container.innerHTML = SUBJECTS.map(function (subject, index) {
      var subjectStats = stats.subjects[subject.key];
      return '<div class="compare-row">' +
        '<div class="compare-label"><span class="subject-dot subject-dot--' + index + '"></span>' + escapeHtml(subject.label) + '</div>' +
        '<div class="compare-bars">' +
          '<div class="compare-bar"><span>平均分</span>' +
            '<div class="meter"><div class="meter-fill meter-fill--' + index + '" style="--w:' + subjectStats.avg.toFixed(1) + '%"></div></div>' +
            '<strong>' + C.formatScore(subjectStats.avg) + '</strong></div>' +
          '<div class="compare-bar"><span>及格率</span>' +
            '<div class="meter"><div class="meter-fill meter-fill--' + index + '" style="--w:' + subjectStats.passRate.toFixed(1) + '%"></div></div>' +
            '<strong>' + C.formatPercent(subjectStats.passRate) + '</strong></div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function renderSubjectBuckets() {
    var container = $('#analytics-buckets');
    if (!container) return;
    if (!store.students.length) {
      container.innerHTML = '<div class="empty-inline">暂无学生数据</div>';
      return;
    }
    var distribution = C.subjectDistribution(store.students);
    var labels = ['0–59', '60–69', '70–79', '80–89', '90–100'];
    var max = 1;
    distribution.forEach(function (subject) {
      subject.buckets.forEach(function (count) {
        if (count > max) max = count;
      });
    });

    var header = '<div class="bucket-row bucket-row--head"><span>分数段</span>' +
      SUBJECTS.map(function (subject) { return '<span>' + escapeHtml(subject.label) + '</span>'; }).join('') +
      '</div>';
    var rows = labels.map(function (label, bucketIndex) {
      return '<div class="bucket-row"><span class="bucket-label">' + label + '</span>' +
        distribution.map(function (subject) {
          var count = subject.buckets[bucketIndex];
          return '<span class="bucket-cell">' +
            '<span class="mini-bar"><span class="mini-bar-fill" style="--w:' +
              ((count / max) * 100).toFixed(1) + '%"></span></span>' +
            '<b>' + count + '</b>' +
          '</span>';
        }).join('') +
      '</div>';
    }).join('');

    container.innerHTML = '<div class="bucket-table">' + header + rows + '</div>';
  }

  function renderRanking() {
    var container = $('#analytics-ranking');
    if (!container) return;
    var ranked = C.rankStudents(store.students).slice(0, 10);
    if (!ranked.length) {
      container.innerHTML = '<tr><td colspan="8"><div class="empty-inline">暂无学生数据</div></td></tr>';
      return;
    }
    container.innerHTML = ranked.map(function (student, index) {
      var medalClass = index < 3 ? ' rank-medal--' + (index + 1) : '';
      return '<tr>' +
        '<td><span class="rank-medal' + medalClass + '">' + (index + 1) + '</span></td>' +
        '<td><div class="student-cell">' +
          '<span class="avatar avatar--' + avatarTone(student.number) + '">' + escapeHtml(firstChar(student.name)) + '</span>' +
          '<span class="student-name">' + escapeHtml(student.name) + '</span>' +
        '</div></td>' +
        '<td><span class="mono">' + escapeHtml(student.number) + '</span></td>' +
        SUBJECTS.map(function (subject) {
          var score = student[subject.key];
          return '<td class="num"><span class="score ' + C.gradeInfo(score).className + '">' +
            C.formatScore(score) + '</span></td>';
        }).join('') +
        '<td class="num strong">' + C.formatScore(C.studentTotal(student)) + '</td>' +
        '<td class="num">' + C.formatScore(C.studentAverage(student)) + '</td>' +
      '</tr>';
    }).join('');
  }

  /* ------------------------------------------------------------------ *
   * 渲染：数据管理
   * ------------------------------------------------------------------ */

  function renderData() {
    var count = store.students.length;
    var recordCount = $('#data-record-count');
    if (recordCount) recordCount.textContent = String(count);
    var fileSize = $('#data-file-size');
    if (fileSize) fileSize.textContent = C.formatBytes(count * C.RECORD_SIZE);
    var modeText = store.demo ? '示例数据' : '本地数据';
    var mode = $('#data-mode');
    if (mode) mode.textContent = modeText;
    var demoState = $('#data-demo-state');
    if (demoState) demoState.textContent = modeText;
    var lastSaved = $('#data-last-saved');
    if (lastSaved) lastSaved.textContent = store.lastSavedAt ? formatDateTime(store.lastSavedAt) : '—';
    var storageSize = $('#data-storage-size');
    if (storageSize) storageSize.textContent = C.formatBytes(store.storageSize());
    var hint = $('#data-storage-hint');
    if (hint) {
      if (!storageAvailable) {
        hint.textContent = '浏览器禁用了本地存储，数据仅保存在内存中，关闭页面后会丢失，请及时导出备份。';
      } else if (store.storageFailed) {
        hint.textContent = '本地存储写入失败（可能空间不足），数据目前只在内存中，请立即导出备份。';
      } else {
        hint.textContent = '数据会自动保存在当前浏览器中，清除浏览器数据会同时清除学生记录。';
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * 所有事件绑定
   * ------------------------------------------------------------------ */

  function bindEvents() {
    var nav = $('#nav');
    if (nav) {
      nav.addEventListener('click', function (event) {
        var button = event.target.closest('.nav-item');
        if (!button) return;
        var view = button.getAttribute('data-view');
        if (!VIEW_META[view]) return;
        setSidebar(false);
        if (state.view === view) {
          renderAll();
          return;
        }
        navigate(view);
      });
    }

    var menuToggle = $('#menu-toggle');
    if (menuToggle) {
      menuToggle.addEventListener('click', function () {
        var sidebar = $('#sidebar');
        setSidebar(!sidebar.classList.contains('is-open'));
      });
    }

    var scrim = $('#sidebar-scrim');
    if (scrim) scrim.addEventListener('click', function () { setSidebar(false); });

    var themeToggle = $('#theme-toggle');
    if (themeToggle) themeToggle.addEventListener('click', toggleTheme);

    document.addEventListener('click', function (event) {
      var goto = event.target.closest('[data-goto]');
      if (goto) {
        event.preventDefault();
        var target = goto.getAttribute('data-goto');
        if (VIEW_META[target]) navigate(target);
        return;
      }
      if (event.target.closest('.js-add-student')) {
        event.preventDefault();
        openStudentForm(null);
        return;
      }
      if (event.target.closest('.js-empty-add')) {
        event.preventDefault();
        openStudentForm(null);
        return;
      }
      if (event.target.closest('.js-empty-import')) {
        event.preventDefault();
        navigate('data');
        return;
      }
      if (event.target.closest('.js-empty-demo')) {
        event.preventDefault();
        loadDemoData();
      }
    });

    var search = $('#student-search');
    if (search) {
      search.addEventListener('input', function (event) {
        state.query = event.target.value;
        state.page = 1;
        renderStudents();
      });
    }

    var filter = $('#student-filter');
    if (filter) {
      filter.addEventListener('change', function (event) {
        state.filter = event.target.value;
        state.page = 1;
        renderStudents();
      });
    }

    var sortControl = $('#student-sort');
    if (sortControl) {
      sortControl.addEventListener('change', function (event) {
        var parts = String(event.target.value).split(':');
        if (parts.length !== 2 || !SORT_LABELS[parts[0]]) return;
        state.sortKey = parts[0];
        state.sortDir = parts[1] === 'asc' ? 1 : -1;
        state.page = 1;
        renderStudents();
      });
    }

    var tableHead = $('#student-table thead');
    if (tableHead) {
      tableHead.addEventListener('click', function (event) {
        var th = event.target.closest('th[data-sort]');
        if (!th) return;
        handleSort(th.getAttribute('data-sort'));
      });
    }

    var tbody = $('#student-table-body');
    if (tbody) {
      tbody.addEventListener('click', function (event) {
        var editButton = event.target.closest('.js-edit');
        if (editButton) {
          var editTarget = findStudent(editButton.getAttribute('data-number'));
          if (editTarget) openStudentForm(editTarget);
          return;
        }
        var deleteButton = event.target.closest('.js-delete');
        if (deleteButton) {
          deleteStudent(deleteButton.getAttribute('data-number'));
          return;
        }
        if (event.target.closest('.js-reset-filters')) {
          resetFilters();
        }
      });
    }

    var pagination = $('#student-pagination');
    if (pagination) {
      pagination.addEventListener('click', function (event) {
        var button = event.target.closest('[data-page]');
        if (!button || button.disabled) return;
        var page = Number(button.getAttribute('data-page'));
        if (!Number.isFinite(page)) return;
        state.page = page;
        renderStudents();
      });
    }

    var clearActivity = $('#btn-clear-activity');
    if (clearActivity) {
      clearActivity.addEventListener('click', function () {
        store.clearActivity();
        renderAll();
        toast('已清除操作记录', 'success');
      });
    }

    var importBinary = $('#btn-import-binary');
    if (importBinary) importBinary.addEventListener('click', function () { $('#file-binary').click(); });
    var importJson = $('#btn-import-json');
    if (importJson) importJson.addEventListener('click', function () { $('#file-json').click(); });

    var fileBinary = $('#file-binary');
    if (fileBinary) {
      fileBinary.addEventListener('change', function (event) {
        var file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (file) importFile(file, 'binary');
      });
    }
    var fileJson = $('#file-json');
    if (fileJson) {
      fileJson.addEventListener('change', function (event) {
        var file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (file) importFile(file, 'json');
      });
    }

    var exportBinary = $('#btn-export-binary');
    if (exportBinary) exportBinary.addEventListener('click', exportBinaryFile);
    var exportJson = $('#btn-export-json');
    if (exportJson) exportJson.addEventListener('click', exportJsonFile);
    var exportCsv = $('#btn-export-csv');
    if (exportCsv) exportCsv.addEventListener('click', exportCsvFile);

    var loadDemo = $('#btn-load-demo');
    if (loadDemo) loadDemo.addEventListener('click', loadDemoData);
    var clearData = $('#btn-clear-data');
    if (clearData) clearData.addEventListener('click', clearAllData);

    var dropzone = $('#binary-dropzone');
    if (dropzone) {
      ['dragenter', 'dragover'].forEach(function (eventName) {
        dropzone.addEventListener(eventName, function (event) {
          event.preventDefault();
          event.stopPropagation();
          dropzone.classList.add('is-dragover');
        });
      });
      ['dragleave', 'dragend', 'drop'].forEach(function (eventName) {
        dropzone.addEventListener(eventName, function (event) {
          event.preventDefault();
          event.stopPropagation();
          dropzone.classList.remove('is-dragover');
        });
      });
      dropzone.addEventListener('drop', function (event) {
        var files = event.dataTransfer && event.dataTransfer.files;
        if (files && files[0]) importFile(files[0], null);
      });
    }

    document.addEventListener('dragover', function (event) { event.preventDefault(); });
    document.addEventListener('drop', function (event) { event.preventDefault(); });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Tab' && modalStack.length) {
        var topModal = modalStack[modalStack.length - 1];
        var focusables = $$(
          '.modal a[href], .modal button, .modal input, .modal select, .modal textarea, .modal [tabindex]:not([tabindex="-1"])',
          topModal.el
        ).filter(function (element) {
          return !element.disabled && element.getClientRects().length > 0;
        });
        if (!focusables.length) return;
        var firstFocusable = focusables[0];
        var lastFocusable = focusables[focusables.length - 1];
        if (!topModal.el.contains(document.activeElement)) {
          event.preventDefault();
          firstFocusable.focus();
        } else if (event.shiftKey && document.activeElement === firstFocusable) {
          event.preventDefault();
          lastFocusable.focus();
        } else if (!event.shiftKey && document.activeElement === lastFocusable) {
          event.preventDefault();
          firstFocusable.focus();
        }
        return;
      }
      if (event.key === 'Escape') {
        if (modalStack.length) {
          modalStack[modalStack.length - 1].close();
        } else {
          setSidebar(false);
        }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === 'k' || event.key === 'K') && !modalStack.length) {
        event.preventDefault();
        if (state.view !== 'students') navigate('students');
        window.setTimeout(function () {
          var input = $('#student-search');
          if (input) {
            input.focus();
            input.select();
          }
        }, 80);
      }
    });

    window.addEventListener('hashchange', function () {
      applyView(parseHashView(), false);
    });

    window.addEventListener('resize', function () {
      var isMobile = window.matchMedia && window.matchMedia('(max-width: 980px)').matches;
      if (!isMobile) {
        setSidebar(false);
        return;
      }
      var sidebar = $('#sidebar');
      if (sidebar) setSidebar(sidebar.classList.contains('is-open'));
    });

    window.setInterval(function () {
      $$('.js-time').forEach(function (element) {
        element.textContent = relativeTime(element.getAttribute('data-time'));
      });
    }, 30000);
  }

  /* ------------------------------------------------------------------ *
   * 排序 / 筛选
   * ------------------------------------------------------------------ */

  function handleSort(key) {
    if (!SORT_LABELS[key]) return;
    if (state.sortKey === key) {
      state.sortDir = state.sortDir === 1 ? -1 : 1;
    } else {
      state.sortKey = key;
      state.sortDir = key === 'number' || key === 'name' ? 1 : -1;
    }
    state.page = 1;
    renderStudents();
  }

  function resetFilterInputs() {
    state.query = '';
    state.filter = 'all';
    state.page = 1;
    var search = $('#student-search');
    if (search) search.value = '';
    var filter = $('#student-filter');
    if (filter) filter.value = 'all';
  }

  function resetFilters() {
    resetFilterInputs();
    renderStudents();
  }

  /* ------------------------------------------------------------------ *
   * 学生表单
   * ------------------------------------------------------------------ */

  function openStudentForm(student) {
    var isEdit = !!student;
    var initial = student || { number: '', name: '', chinese: '', math: '', english: '' };

    var scoreFields = SUBJECTS.map(function (subject) {
      var value = isEdit ? C.formatScore(student[subject.key]) : '';
      return '<div class="field" data-field="' + subject.key + '">' +
        '<label for="f-' + subject.key + '">' + escapeHtml(subject.label) + '成绩</label>' +
        '<div class="score-input">' +
          '<input class="input js-score" id="f-' + subject.key + '" name="' + subject.key + '" type="number" inputmode="decimal" step="0.1" min="0" max="100" placeholder="0.0" value="' + escapeHtml(value) + '" aria-required="true" aria-describedby="f-' + subject.key + '-error">' +
          '<span class="score-unit">分</span>' +
        '</div>' +
        '<span class="field-error" id="f-' + subject.key + '-error" data-error></span>' +
      '</div>';
    }).join('');

    var body = '<form id="student-form" class="form" novalidate>' +
      '<div class="form-grid">' +
        '<div class="field" data-field="number">' +
          '<label for="f-number">学号 <span class="req">*</span></label>' +
          '<input class="input" id="f-number" name="number" inputmode="numeric" autocomplete="off" placeholder="如 20240101" value="' + escapeHtml(initial.number) + '" data-autofocus aria-required="true" aria-describedby="f-number-error">' +
          '<span class="field-error" id="f-number-error" data-error></span>' +
        '</div>' +
        '<div class="field" data-field="name">' +
          '<label for="f-name">姓名 <span class="req">*</span><span class="name-counter" id="name-counter">0/31 字节</span></label>' +
          '<input class="input" id="f-name" name="name" autocomplete="off" placeholder="如 张伟" value="' + escapeHtml(initial.name) + '" aria-required="true" aria-describedby="f-name-error">' +
          '<span class="field-error" id="f-name-error" data-error></span>' +
        '</div>' +
      '</div>' +
      '<div class="form-grid--scores">' + scoreFields + '</div>' +
      '<div class="preview-panel">' +
        '<div><span>总分</span><strong id="preview-total">—</strong></div>' +
        '<div><span>平均分</span><strong id="preview-average">—</strong></div>' +
        '<p>成绩范围 0–100，最多保留一位小数；姓名按 UTF-8 最多 31 字节（与 C 结构体兼容）。</p>' +
      '</div>' +
    '</form>';

    var footer = '<button type="button" class="btn btn-ghost" data-role="cancel">取消</button>' +
      '<button type="submit" class="btn btn-primary" form="student-form">' + (isEdit ? '保存修改' : '添加学生') + '</button>';

    openModal({
      title: isEdit ? '编辑学生信息' : '添加学生',
      subtitle: isEdit ? '修改学号、姓名或三科成绩' : '录入一名学生的基本信息与三科成绩',
      icon: icon(isEdit ? 'i-edit' : 'i-plus'),
      body: body,
      footer: footer,
      onMount: function (element, close) {
        bindStudentForm(element, close, student, isEdit);
      }
    });
  }

  function bindStudentForm(element, close, student, isEdit) {
    var form = element.querySelector('#student-form');
    var numberInput = element.querySelector('#f-number');
    var nameInput = element.querySelector('#f-name');
    var counter = element.querySelector('#name-counter');
    var scoreInputs = $$('.js-score', element);

    function updateNameCounter() {
      var bytes = C.utf8ByteLength(nameInput.value.trim());
      counter.textContent = bytes + '/31 字节';
      counter.classList.toggle('is-over', bytes > 31);
    }

    function updatePreview() {
      var values = scoreInputs.map(function (input) {
        if (input.value.trim() === '') return NaN;
        var value = Number(input.value);
        return Number.isFinite(value) ? Math.round(value * 10) / 10 : NaN;
      });
      var valid = values.every(function (value) {
        return Number.isFinite(value) && value >= 0 && value <= 100;
      });
      var totalElement = element.querySelector('#preview-total');
      var averageElement = element.querySelector('#preview-average');
      if (!valid) {
        totalElement.textContent = '—';
        averageElement.textContent = '—';
        return;
      }
      var total = values.reduce(function (sum, value) { return sum + value; }, 0);
      totalElement.textContent = C.formatScore(total);
      averageElement.textContent = C.formatScore(total / 3);
    }

    nameInput.addEventListener('input', updateNameCounter);
    scoreInputs.forEach(function (input) {
      input.addEventListener('input', updatePreview);
    });
    updateNameCounter();
    updatePreview();

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var existingNumbers = new Set();
      store.students.forEach(function (item) {
        if (!isEdit || item.number !== student.number) existingNumbers.add(item.number);
      });

      var validation = C.validateStudent({
        number: numberInput.value,
        name: nameInput.value,
        chinese: element.querySelector('#f-chinese').value,
        math: element.querySelector('#f-math').value,
        english: element.querySelector('#f-english').value
      }, {
        existingNumbers: existingNumbers,
        originalNumber: isEdit ? student.number : null
      });

      clearFieldErrors(form);
      if (!validation.valid) {
        showFieldErrors(form, validation.errors);
        return;
      }

      try {
        if (isEdit) {
          store.update(student.number, validation.value);
        } else {
          store.add(validation.value);
          resetFilterInputs();
        }
      } catch (error) {
        toast(error && error.message ? error.message : '保存失败', 'error');
        return;
      }

      close();
      renderAll();
      toast(isEdit ? '已保存 ' + validation.value.name + ' 的修改' : '已添加学生 ' + validation.value.name, 'success');
    });

    var cancel = element.querySelector('[data-role="cancel"]');
    if (cancel) cancel.addEventListener('click', close);
  }

  function clearFieldErrors(form) {
    $$('.field', form).forEach(function (field) {
      field.classList.remove('has-error');
      var error = field.querySelector('[data-error]');
      if (error) error.textContent = '';
      var input = field.querySelector('input');
      if (input) input.removeAttribute('aria-invalid');
    });
  }

  function showFieldErrors(form, errors) {
    var order = ['number', 'name', 'chinese', 'math', 'english'];
    var firstInvalid = null;
    order.forEach(function (key) {
      if (!errors[key]) return;
      var field = form.querySelector('[data-field="' + key + '"]');
      if (!field) return;
      field.classList.add('has-error');
      var errorElement = field.querySelector('[data-error]');
      if (errorElement) errorElement.textContent = errors[key];
      var input = field.querySelector('input');
      if (input) {
        input.setAttribute('aria-invalid', 'true');
        if (!firstInvalid) firstInvalid = input;
      }
    });
    if (firstInvalid) firstInvalid.focus();
  }

  /* ------------------------------------------------------------------ *
   * 删除与撤销
   * ------------------------------------------------------------------ */

  function deleteStudent(number) {
    var student = findStudent(number);
    if (!student) return;
    confirmDialog({
      title: '删除学生',
      message: '确定要删除 <strong>' + escapeHtml(student.name) + '</strong>（' + escapeHtml(student.number) + '）吗？',
      details: '删除后可以通过提示条撤销；如果刷新页面，将无法恢复。',
      confirmText: '删除',
      variant: 'danger',
      icon: icon('i-trash')
    }).then(function (accepted) {
      if (!accepted) return;
      var result;
      try {
        result = store.remove(number);
      } catch (error) {
        toast(error && error.message ? error.message : '删除失败', 'error');
        return;
      }
      renderAll();
      toast('已删除 ' + student.name, 'success', {
        duration: 8000,
        action: {
          label: '撤销',
          onClick: function () {
            try {
              store.restore(result.student, result.index);
            } catch (error) {
              toast(error && error.message ? error.message : '撤销失败', 'error');
              return;
            }
            renderAll();
            toast('已恢复 ' + student.name, 'info');
          }
        }
      });
    });
  }

  /* ------------------------------------------------------------------ *
   * 导入
   * ------------------------------------------------------------------ */

  function readFileAsArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error || new Error('文件读取失败')); };
      reader.readAsArrayBuffer(file);
    });
  }

  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error || new Error('文件读取失败')); };
      reader.readAsText(file, 'utf-8');
    });
  }

  function importFile(file, forcedKind) {
    var kind = forcedKind || (/\.json$/i.test(file.name) ? 'json' : 'binary');
    var promise = kind === 'json'
      ? readFileAsText(file).then(function (text) { return C.parseJSONImport(text); })
      : readFileAsArrayBuffer(file).then(function (buffer) { return C.decodeBinary(new Uint8Array(buffer)); });

    promise.then(function (result) {
      if (!result.students.length) {
        var reason = result.errors.length ? result.errors[0].reason : '文件中没有有效记录';
        toast('导入失败：' + reason, 'error', { duration: 6500 });
        return;
      }
      openImportDialog({
        kind: kind,
        fileName: file.name,
        students: result.students,
        invalid: result.errors
      });
    }).catch(function (error) {
      toast('读取文件失败：' + (error && error.message ? error.message : String(error)), 'error', { duration: 6500 });
    });
  }

  function openImportDialog(options) {
    var students = options.students;
    var invalid = options.invalid || [];
    var existingNumbers = new Set(store.students.map(function (student) { return student.number; }));
    var duplicateCount = students.filter(function (student) {
      return existingNumbers.has(student.number);
    }).length;
    var newCount = students.length - duplicateCount;

    var errorsHtml = invalid.length
      ? '<details class="import-errors"><summary>有 ' + invalid.length + ' 条记录被跳过（点击查看）</summary><ul>' +
        invalid.slice(0, 8).map(function (item) {
          var prefix = item.index >= 0 ? '第 ' + (item.index + 1) + ' 条：' : '';
          return '<li>' + prefix + escapeHtml(item.reason) + '</li>';
        }).join('') +
        (invalid.length > 8 ? '<li>……还有 ' + (invalid.length - 8) + ' 条</li>' : '') +
        '</ul></details>'
      : '';

    var warningHtml = invalid.length
      ? '<div class="import-warning">' + icon('i-alert-triangle') +
        '<p>有 ' + invalid.length + ' 条记录因数据不合规被跳过，它们不会写入网页；如果选择「覆盖当前数据」并再次导出，这些记录将不再存在。建议先备份原始文件。</p></div>'
      : '';

    var body = '<div class="import-summary">' +
      '<div class="import-file">' +
        '<span class="import-file-icon">' + icon('i-file') + '</span>' +
        '<div><strong>' + escapeHtml(options.fileName) + '</strong>' +
          '<span>解析到 ' + students.length + ' 条有效记录' +
            (invalid.length ? '，' + invalid.length + ' 条被跳过' : '') + '</span></div>' +
      '</div>' +
      errorsHtml +
      warningHtml +
      '<div class="radio-group">' +
        '<label class="radio-card">' +
          '<input type="radio" name="import-mode" value="replace" checked>' +
          '<div><strong>覆盖当前数据</strong><span>用导入的 ' + students.length + ' 条记录替换现有 ' + store.students.length + ' 条记录</span></div>' +
        '</label>' +
        '<label class="radio-card">' +
          '<input type="radio" name="import-mode" value="merge">' +
          '<div><strong>合并导入</strong><span>保留现有记录，新增 ' + newCount + ' 条，跳过 ' + duplicateCount + ' 条重复学号</span></div>' +
        '</label>' +
      '</div>' +
      '<p class="hint">' + (options.kind === 'binary'
        ? '数据来自 C 后端的 student.txt；导入后网页中的数据即为最新记录。'
        : '数据来自 JSON 备份文件，可选择覆盖或合并。') + '</p>' +
    '</div>';

    openModal({
      title: '导入学生数据',
      subtitle: options.kind === 'binary' ? '二进制 student.txt' : 'JSON 备份文件',
      icon: icon('i-upload'),
      body: body,
      footer: '<button type="button" class="btn btn-ghost" data-role="cancel">取消</button>' +
        '<button type="button" class="btn btn-primary" data-role="confirm">确认导入</button>',
      onMount: function (element, close) {
        element.querySelector('[data-role="cancel"]').addEventListener('click', close);
        element.querySelector('[data-role="confirm"]').addEventListener('click', function () {
          var mode = element.querySelector('input[name="import-mode"]:checked').value;
          var next;
          var activityMessage;
          var toastMessage;

          if (mode === 'replace') {
            next = students.slice();
            activityMessage = '导入 ' + (options.kind === 'binary' ? 'student.txt' : 'JSON') +
              '（覆盖）：' + students.length + ' 条记录';
            toastMessage = '已导入 ' + students.length + ' 条记录';
          } else {
            var map = new Map();
            store.students.forEach(function (student) { map.set(student.number, student); });
            var added = 0;
            var skipped = 0;
            students.forEach(function (student) {
              if (map.has(student.number)) {
                skipped += 1;
              } else {
                map.set(student.number, student);
                added += 1;
              }
            });
            next = Array.from(map.values());
            activityMessage = '合并导入：新增 ' + added + ' 条，跳过 ' + skipped + ' 条重复记录';
            toastMessage = '已合并导入 ' + added + ' 条记录' + (skipped ? '，跳过 ' + skipped + ' 条重复学号' : '');
          }

          store.replaceAll(next, {
            demo: false,
            activityType: 'import',
            message: activityMessage
          });
          resetFilterInputs();
          close();
          renderAll();
          toast(toastMessage, 'success');
        });
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * 导出
   * ------------------------------------------------------------------ */

  function downloadBlob(data, fileName, mimeType) {
    var blob = data instanceof Blob ? data : new Blob([data], { type: mimeType || 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function logExport(message) {
    store.log('export', message);
    store.persist();
    renderAll();
  }

  function exportBinaryFile() {
    if (!store.students.length) {
      toast('当前没有可导出的学生记录', 'error');
      return;
    }
    var bytes = C.encodeBinary(store.students);
    downloadBlob(bytes, 'student.txt', 'application/octet-stream');
    logExport('导出 student.txt（' + store.students.length + ' 条记录）');
    toast('已导出 student.txt，可放入 C 程序的 data/ 目录使用', 'success', { duration: 5500 });
  }

  function exportJsonFile() {
    if (!store.students.length) {
      toast('当前没有可导出的学生记录', 'error');
      return;
    }
    downloadBlob(C.toJSONExport(store.students), 'students-' + timestampForFileName() + '.json', 'application/json');
    logExport('导出 JSON 备份（' + store.students.length + ' 条记录）');
    toast('已导出 JSON 备份文件', 'success');
  }

  function exportCsvFile() {
    if (!store.students.length) {
      toast('当前没有可导出的学生记录', 'error');
      return;
    }
    downloadBlob(C.toCSV(store.students), 'students-' + timestampForFileName() + '.csv', 'text/csv;charset=utf-8');
    logExport('导出 CSV 表格（' + store.students.length + ' 条记录）');
    toast('已导出 CSV 文件，可直接用 Excel 打开', 'success');
  }

  /* ------------------------------------------------------------------ *
   * 示例数据 / 清空
   * ------------------------------------------------------------------ */

  function loadDemoData() {
    var proceed = store.students.length === 0
      ? Promise.resolve(true)
      : confirmDialog({
          title: '载入示例数据',
          message: '将用 12 条示例数据替换当前的全部 <strong>' + store.students.length + '</strong> 条记录。',
          details: '当前数据会被覆盖，建议先在「数据管理」中导出备份。',
          confirmText: '载入示例',
          variant: 'primary',
          icon: icon('i-sparkles')
        });

    proceed.then(function (accepted) {
      if (!accepted) return;
      store.replaceAll(C.demoStudents(), {
        demo: true,
        activityType: 'demo',
        message: '载入示例数据（12 名学生）'
      });
      resetFilterInputs();
      renderAll();
      toast('已载入 12 条示例数据', 'success');
    });
  }

  function clearAllData() {
    if (!store.students.length) {
      toast('当前没有学生数据', 'info');
      return;
    }
    confirmDialog({
      title: '清空全部数据',
      message: '确定要删除全部 <strong>' + store.students.length + '</strong> 条学生记录吗？',
      details: '此操作不可撤销！建议先在「数据管理」中导出 student.txt 或 JSON 备份。',
      confirmText: '确认清空',
      variant: 'danger',
      icon: icon('i-alert-triangle')
    }).then(function (accepted) {
      if (!accepted) return;
      store.clear();
      resetFilterInputs();
      renderAll();
      toast('已清空全部学生数据', 'success');
    });
  }

  /* ------------------------------------------------------------------ *
   * 弹窗基础
   * ------------------------------------------------------------------ */

  function openModal(options) {
    var opts = options || {};
    var modalId = ++modalSequence;
    var previousFocus = document.activeElement;
    var appRoot = document.querySelector('.app');
    var backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML =
      '<div class="modal modal--' + (opts.size || 'md') + '" role="dialog" aria-modal="true" aria-labelledby="modal-title-' + modalId + '">' +
        '<div class="modal-head">' +
          '<div class="modal-heading">' +
            (opts.icon ? '<span class="modal-icon">' + opts.icon + '</span>' : '') +
            '<div>' +
              '<h2 id="modal-title-' + modalId + '">' + escapeHtml(opts.title || '') + '</h2>' +
              (opts.subtitle ? '<p>' + escapeHtml(opts.subtitle) + '</p>' : '') +
            '</div>' +
          '</div>' +
          '<button type="button" class="icon-btn modal-close" aria-label="关闭">' + icon('i-close') + '</button>' +
        '</div>' +
        '<div class="modal-body">' + (opts.body || '') + '</div>' +
        (opts.footer ? '<div class="modal-foot">' + opts.footer + '</div>' : '') +
      '</div>';

    document.getElementById('modal-root').appendChild(backdrop);
    document.body.classList.add('modal-open');
    if (appRoot) appRoot.setAttribute('inert', '');

    var closed = false;
    var entry = { close: null, el: backdrop };

    function close() {
      if (closed) return;
      closed = true;
      backdrop.remove();
      var index = modalStack.indexOf(entry);
      if (index !== -1) modalStack.splice(index, 1);
      if (!modalStack.length) {
        document.body.classList.remove('modal-open');
        if (appRoot) appRoot.removeAttribute('inert');
      }
      if (typeof opts.onClose === 'function') opts.onClose();
      if (previousFocus && document.contains(previousFocus) && typeof previousFocus.focus === 'function') {
        previousFocus.focus();
      }
    }

    entry.close = close;
    modalStack.push(entry);

    backdrop.querySelector('.modal-close').addEventListener('click', close);
    backdrop.addEventListener('mousedown', function (event) {
      if (event.target === backdrop) close();
    });

    if (typeof opts.onMount === 'function') opts.onMount(backdrop, close);

    window.requestAnimationFrame(function () {
      var focusTarget = backdrop.querySelector('[data-autofocus]');
      if (!focusTarget) {
        var form = backdrop.querySelector('form');
        if (form) focusTarget = form.querySelector('input:not([type="hidden"]), select, textarea');
      }
      if (!focusTarget) {
        focusTarget = backdrop.querySelector('.modal-foot [data-role="cancel"]');
      }
      if (!focusTarget) {
        focusTarget = backdrop.querySelector('.modal-foot button') || backdrop.querySelector('.modal-close');
      }
      if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus();
    });

    return entry;
  }

  function confirmDialog(options) {
    var opts = options || {};
    return new Promise(function (resolve) {
      var accepted = false;
      openModal({
        title: opts.title || '确认操作',
        icon: opts.icon || icon('i-alert-triangle'),
        size: 'sm',
        body: '<p class="confirm-text">' + (opts.message || '') + '</p>' +
          (opts.details ? '<div class="confirm-details">' + opts.details + '</div>' : ''),
        footer: '<button type="button" class="btn btn-ghost" data-role="cancel">' +
            escapeHtml(opts.cancelText || '取消') + '</button>' +
          '<button type="button" class="btn ' + (opts.variant === 'primary' ? 'btn-primary' : 'btn-danger') +
            '" data-role="confirm">' + escapeHtml(opts.confirmText || '确定') + '</button>',
        onClose: function () { resolve(accepted); },
        onMount: function (element, close) {
          element.querySelector('[data-role="cancel"]').addEventListener('click', close);
          element.querySelector('[data-role="confirm"]').addEventListener('click', function () {
            accepted = true;
            close();
          });
        }
      });
    });
  }

  /* ------------------------------------------------------------------ *
   * Toast
   * ------------------------------------------------------------------ */

  function toast(message, type, options) {
    var opts = options || {};
    var root = document.getElementById('toast-root');
    if (!root) return;

    var typeName = type || 'info';
    var iconName = typeName === 'success' ? 'i-check-circle'
      : typeName === 'error' ? 'i-alert-circle' : 'i-info';

    var element = document.createElement('div');
    element.className = 'toast toast--' + typeName;
    element.innerHTML =
      '<span class="toast-icon">' + icon(iconName) + '</span>' +
      '<p>' + escapeHtml(message) + '</p>' +
      (opts.action ? '<button type="button" class="toast-action">' + escapeHtml(opts.action.label) + '</button>' : '') +
      '<button type="button" class="toast-close" aria-label="关闭">' + icon('i-close') + '</button>';

    root.appendChild(element);
    // 淘汰旧提示时跳过带“撤销”等操作的提示，避免用户失去恢复机会
    while (root.children.length > 4) {
      var removable = null;
      for (var index = 0; index < root.children.length; index += 1) {
        if (!root.children[index].querySelector('.toast-action')) {
          removable = root.children[index];
          break;
        }
      }
      if (!removable) break;
      root.removeChild(removable);
    }

    var timer = window.setTimeout(remove, opts.duration || 3800);
    var removed = false;

    function remove() {
      if (removed) return;
      removed = true;
      window.clearTimeout(timer);
      element.classList.add('is-leaving');
      window.setTimeout(function () {
        if (element.parentNode) element.parentNode.removeChild(element);
      }, 200);
    }

    element.querySelector('.toast-close').addEventListener('click', remove);
    if (opts.action) {
      element.querySelector('.toast-action').addEventListener('click', function () {
        try {
          opts.action.onClick();
        } finally {
          remove();
        }
      });
    }

    window.requestAnimationFrame(function () {
      element.classList.add('is-visible');
    });
  }

  /* ------------------------------------------------------------------ *
   * 启动
   * ------------------------------------------------------------------ */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
