/* ===== 全局状态 ===== */
let state = {
  members: [],
  currentMemberId: null,
  currentDate: '',
  pageStack: [],
  isSubPage: false,   // 是否在子页面（打卡页、任务管理、添加成员）
  editingMemberId: null,
};
const STORAGE_KEY = 'dc_app_data';
let _renderingStats = false; // renderStats 重入守卫

/* ===== 数据层 ===== */
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      state.members = data.members || [];
    }
  } catch (e) { console.warn('Load data error', e); }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      members: state.members,
    }));
  } catch (e) { console.warn('Save data error', e); }
}

/* ===== 成员数据 key ===== */
function memberTasksKey(memberId) { return `dc_tasks_${memberId}`; }
function memberRecordsKey(memberId) { return `dc_records_${memberId}`; }

function loadMemberTasks(memberId) {
  try {
    const raw = localStorage.getItem(memberTasksKey(memberId));
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

function saveMemberTasks(memberId, tasks) {
  localStorage.setItem(memberTasksKey(memberId), JSON.stringify(tasks));
}

function loadMemberRecords(memberId) {
  try {
    const raw = localStorage.getItem(memberRecordsKey(memberId));
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}

function saveMemberRecords(memberId, records) {
  localStorage.setItem(memberRecordsKey(memberId), JSON.stringify(records));
}

/* ===== 工具函数 ===== */
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

/* 获取当前周的所有日期（周一到周日） */
function getWeekDates(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0=周日
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // 周一
  const monday = new Date(d);
  monday.setDate(diff);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    dates.push(dd.getFullYear() + '-' +
      String(dd.getMonth() + 1).padStart(2, '0') + '-' +
      String(dd.getDate()).padStart(2, '0'));
  }
  return dates;
}

/* 判断周任务在指定日期所在的周是否已完成 */
function isWeeklyTaskDone(taskId, records, dateStr) {
  const weekDates = getWeekDates(dateStr);
  return weekDates.some(d => records[d] && records[d][taskId]);
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const md = (d.getMonth() + 1) + '月' + d.getDate() + '日';
  const wd = weekdays[d.getDay()];
  return md + ' 周' + wd;
}

function isToday(ds) { return ds === todayStr(); }

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._hide);
  el._hide = setTimeout(() => el.classList.remove('show'), 1800);
}

/* ===== Tab 切换 ===== */
function switchTab(pageId) {
  // 切换标签时退出抖动模式
  if (_jiggleMode) exitJiggleMode();

  const oldPage = document.querySelector('.page.active');
  const newPage = document.getElementById(pageId);
  if (oldPage === newPage) return;

  // 更新 Tab 样式
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
  document.querySelector(`.tab-item[data-page="${pageId}"]`).classList.add('active');

  // 标题
  if (pageId === 'pageMembers') {
    document.getElementById('navTitle').textContent = '每日打卡';
  } else if (pageId === 'pageStats') {
    document.getElementById('navTitle').textContent = '📊 统计分析';
    renderStats();
  }

  // 非子页面态
  state.isSubPage = false;
  state.pageStack = [];
  document.getElementById('navBack').style.display = 'none';
  document.getElementById('tabBar').classList.remove('hidden');

  // 仅 Tab 主页面之间做滑入动画
  const tabPages = ['pageMembers', 'pageStats'];
  const oldIdx = tabPages.indexOf(oldPage?.id);
  const newIdx = tabPages.indexOf(pageId);
  if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
    const isForward = newIdx > oldIdx; // 左滑：成员→统计
    const inClass = isForward ? 'slide-in' : 'slide-in-reverse';
    const outClass = isForward ? 'slide-out' : 'slide-out-reverse';

    // 让两个页面同时可见
    oldPage.style.display = 'block';
    newPage.style.display = 'block';

    // 触发动画
    oldPage.classList.add(outClass);
    newPage.classList.add(inClass);
    // 移除旧页 active，让新页面 z-index 正确
    oldPage.classList.remove('active');
    newPage.classList.add('active');

    // 动画结束后清理
    setTimeout(() => {
      oldPage.classList.remove('slide-out', 'slide-out-reverse', outClass);
      newPage.classList.remove('slide-in', 'slide-in-reverse', inClass);
      // 重置 display，CSS 控制显隐
      oldPage.style.display = '';
      newPage.style.display = '';
    }, 300);
  } else {
    // 非 Tab 切换，直接切换
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    newPage.classList.add('active');
  }
}

/* ===== 页面导航 ===== */
function showPage(pageId, pushStack) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');

  const backBtn = document.getElementById('navBack');
  const title = document.getElementById('navTitle');
  const tabNav = document.getElementById('tabBar');

  // 子页面：隐藏 Tab，显示返回按钮
  const subPages = ['pageDashboard', 'pageTasks', 'pageAddMember'];
  state.isSubPage = subPages.includes(pageId);

  if (state.isSubPage) {
    tabNav.classList.add('hidden');
    backBtn.style.display = 'flex';
    if (pushStack !== false) {
      state.pageStack.push(pageId);
    }
  } else {
    // 回到主页 Tab
    tabNav.classList.remove('hidden');
    backBtn.style.display = 'none';
    state.pageStack = [];
    // 恢复 Tab 激活态
    document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
    document.querySelector(`.tab-item[data-page="${pageId}"]`).classList.add('active');
  }
}

function goBack() {
  if (state.pageStack.length > 0) {
    const prev = state.pageStack.pop();
    // 找到上一个非当前页
    let target = null;
    for (let i = state.pageStack.length - 1; i >= 0; i--) {
      const p = state.pageStack[i];
      if (p && document.getElementById(p)) {
        target = p;
        break;
      }
    }
    if (!target) {
      // 回到主页 Tab
      if (state.currentMemberId) {
        // 从打卡页返回：回到家庭成员Tab
        switchTab('pageMembers');
        renderMembers();
        state.currentMemberId = null;
      } else {
        switchTab('pageMembers');
        renderMembers();
      }
      return;
    }
    showPage(target, false);
    state.pageStack = state.pageStack.filter(p => p !== target);
    if (target === 'pageDashboard') renderDashboard();
    else if (target === 'pageTasks') renderTaskManager();
    else if (target === 'pageAddMember') { /* 表单保留 */ }
  } else {
    switchTab('pageMembers');
    renderMembers();
  }
}

/* ===== 成员管理 ===== */
function renderMembers() {
  const grid = document.getElementById('memberGrid');
  const empty = document.getElementById('emptyMembers');

  const badge = document.getElementById('memberBadge');
  badge.textContent = state.members.length;

  if (state.members.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  grid.innerHTML = state.members.map(m => {
    const stats = getMemberTodayStats(m.id);
    const badge = stats.total > 0 ? `${stats.completed}/${stats.total}` : '';
    return `
      <div class="member-card" data-member-id="${m.id}">
        <span class="avatar">${m.avatar || '😊'}</span>
        <div class="name">${escHtml(m.name)}</div>
        ${badge ? `<div class="progress-badge">✅ ${badge}</div>` : ''}
      </div>
    `;
  }).join('');
}

function getMemberTodayStats(memberId) {
  const tasks = loadMemberTasks(memberId);
  if (tasks.length === 0) return { total: 0, completed: 0 };
  const records = loadMemberRecords(memberId);
  const today = todayStr();
  const dayRec = records[today] || {};
  let completed = 0;
  tasks.forEach(t => { if (dayRec[t.id]) completed++; });
  return { total: tasks.length, completed };
}

function toggleAvatarExpand() {
  const sel = document.getElementById('avatarSelector');
  const btn = document.getElementById('avatarExpandBtn');
  const filter = document.getElementById('avatarFilter');
  const expanded = sel.classList.toggle('expanded');
  btn.classList.toggle('expanded', expanded);
  btn.innerHTML = expanded
    ? '收起 <span class="arrow-down">▼</span>'
    : '查看更多 <span class="arrow-down">▼</span>';
  // 展开时显示筛选栏，收起时隐藏并重置到"全部"
  filter.style.display = expanded ? '' : 'none';
  if (expanded) {
    // 默认选中"全部"
    document.querySelectorAll('.avatar-filter-tag').forEach(t => t.classList.toggle('active', t.dataset.category === 'all'));
    applyAvatarFilter('all');
  } else {
    // 收起时重置筛选，显示所有 avatar
    applyAvatarFilter('all');
  }
}

function applyAvatarFilter(category) {
  const avatars = document.querySelectorAll('.avatar-option');
  avatars.forEach(el => {
    if (category === 'all') {
      el.style.display = '';
    } else {
      el.style.display = el.dataset.category === category ? '' : 'none';
    }
  });
}

function showAddMember() {
  document.getElementById('navTitle').textContent = '👤 添加成员';
  document.getElementById('memberNameInput').value = '';
  // 收起头像选择器并重置筛选
  const sel = document.getElementById('avatarSelector');
  const filter = document.getElementById('avatarFilter');
  const btn = document.getElementById('avatarExpandBtn');
  sel.classList.remove('expanded');
  btn.classList.remove('expanded');
  btn.innerHTML = '查看更多 <span class="arrow-down">▼</span>';
  filter.style.display = 'none';
  applyAvatarFilter('all');
  document.querySelectorAll('.avatar-option').forEach(el => el.classList.remove('selected'));
  document.querySelector('.avatar-option').classList.add('selected');
  showPage('pageAddMember');
  state.pageStack.push('pageAddMember');
}

function saveMember() {
  const name = document.getElementById('memberNameInput').value.trim();
  if (!name) { showToast('请输入成员名称'); return; }
  const avatar = document.querySelector('.avatar-option.selected');
  const avatarEmoji = avatar ? avatar.dataset.avatar : '😊';

  if (state.editingMemberId) {
    // 编辑已有成员
    const member = state.members.find(m => m.id === state.editingMemberId);
    if (member) {
      member.name = name;
      member.avatar = avatarEmoji;
      saveData();
      renderMembers();
      renderDashboard();
      showToast('✅ 已更新');
    }
    state.editingMemberId = null;
    goBack();
    return;
  }

  state.members.push({
    id: genId(),
    name,
    avatar: avatarEmoji,
    createdAt: todayStr(),
  });
  saveData();
  renderMembers();
  showToast('✅ 添加成功！');
  goBack();
}

function confirmDeleteMember(memberId) {
  const member = state.members.find(m => m.id === memberId);
  if (!member) return;
  showConfirm('确定要删除 ' + (member.avatar || '') + ' ' + member.name + ' 吗？<br>该成员的所有打卡数据将一并清除。', () => {
    // 清除数据
    localStorage.removeItem(memberTasksKey(memberId));
    localStorage.removeItem(memberRecordsKey(memberId));
    state.members = state.members.filter(m => m.id !== memberId);
    saveData();
    renderMembers();
    showToast('已删除');
  });
}

/* 从管理任务页删除成员（删除后返回成员列表） */
function deleteMemberFromManager(memberId) {
  const member = state.members.find(m => m.id === memberId);
  if (!member) return;
  showConfirm('确定要删除 ' + (member.avatar || '') + ' ' + member.name + ' 吗？<br>该成员的所有打卡数据将一并清除。', () => {
    localStorage.removeItem(memberTasksKey(memberId));
    localStorage.removeItem(memberRecordsKey(memberId));
    state.members = state.members.filter(m => m.id !== memberId);
    saveData();
    renderMembers();
    showToast('已删除');
    // 导航回成员列表页
    switchTab('pageMembers');
  });
}

function showEditMember(memberId) {
  const member = state.members.find(m => m.id === memberId);
  if (!member) return;
  state.editingMemberId = memberId;
  document.getElementById('navTitle').textContent = '✏️ 编辑成员';
  document.getElementById('memberNameInput').value = member.name;
  // Reset avatar selector + filter
  const sel = document.getElementById('avatarSelector');
  const filter = document.getElementById('avatarFilter');
  const btn = document.getElementById('avatarExpandBtn');
  sel.classList.remove('expanded');
  btn.classList.remove('expanded');
  btn.innerHTML = '查看更多 <span class="arrow-down">▼</span>';
  filter.style.display = 'none';
  applyAvatarFilter('all');
  // Select current avatar
  document.querySelectorAll('.avatar-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.avatar === member.avatar);
  });
  if (!document.querySelector('.avatar-option.selected')) {
    document.querySelector('.avatar-option').classList.add('selected');
  }
  showPage('pageAddMember');
  state.pageStack.push('pageAddMember');
}

/* ===== 头像选择 ===== */
document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('avatarSelector').addEventListener('click', function(e) {
    const opt = e.target.closest('.avatar-option');
    if (opt) {
      document.querySelectorAll('.avatar-option').forEach(el => el.classList.remove('selected'));
      opt.classList.add('selected');
    }
  });
  // 头像筛选标签点击
  document.getElementById('avatarFilter').addEventListener('click', function(e) {
    const tag = e.target.closest('.avatar-filter-tag');
    if (!tag) return;
    const category = tag.dataset.category;
    document.querySelectorAll('.avatar-filter-tag').forEach(t => t.classList.remove('active'));
    tag.classList.add('active');
    applyAvatarFilter(category);
  });
});

/* ===== 打卡主页 ===== */
function enterMember(memberId) {
  state.currentMemberId = memberId;
  state.currentDate = todayStr();
  document.getElementById('navTitle').textContent = '📋 今日打卡';
  showPage('pageDashboard');
  state.pageStack.push('pageDashboard');
  renderDashboard();
}

function renderDashboard() {
  const member = state.members.find(m => m.id === state.currentMemberId);
  if (!member) { goBack(); return; }

  // 头部
  const tasks = loadMemberTasks(state.currentMemberId);
  const hasWeekly = tasks.some(t => t.type === 'weekly');
  document.getElementById('dashboardHeader').innerHTML = `
    <span class="avatar">${member.avatar}</span>
    <div class="info">
      <div class="name">${escHtml(member.name)}</div>
      <div class="sub">${hasWeekly ? '每日打卡 · 周打卡' : '每天进步一点点 ✨'}</div>
    </div>
  `;

  // 日期 / 周信息
  const weekDates = getWeekDates(state.currentDate);
  document.getElementById('currentDate').textContent = hasWeekly
    ? formatDateLabel(state.currentDate) + ` (第${Math.ceil(new Date(state.currentDate + 'T00:00:00').getDate() / 7)}周)`
    : formatDateLabel(state.currentDate);
  document.getElementById('btnToday').style.display = isToday(state.currentDate) ? 'none' : 'inline-block';

  // 任务列表
  renderTaskList();

  // 成员操作按钮（编辑 / 删除）
  const actionsContainer = document.getElementById('memberActions');
  if (actionsContainer) {
    actionsContainer.innerHTML = renderMemberActions(member);
  }
}

function renderTaskList() {
  const tasks = loadMemberTasks(state.currentMemberId);
  const records = loadMemberRecords(state.currentMemberId);
  const dayRec = records[state.currentDate] || {};

  const container = document.getElementById('taskList');
  if (tasks.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding:40px 0;">
        <div class="empty-icon">📝</div>
        <p style="font-size:14px;">还没有打卡任务<br>点击下方添加吧</p>
      </div>
    `;
    document.getElementById('progressSummary').innerHTML = '';
    return;
  }

  // 分类任务：每日在前，周在后
  const dailyTasks = tasks.filter(t => t.type !== 'weekly');
  const weeklyTasks = tasks.filter(t => t.type === 'weekly');

  // 进度统计
  let dailyDone = 0, dailyTotal = dailyTasks.length;
  dailyTasks.forEach(t => { if (dayRec[t.id]) dailyDone++; });
  let weeklyDone = 0, weeklyTotal = weeklyTasks.length;
  weeklyTasks.forEach(t => { if (isWeeklyTaskDone(t.id, records, state.currentDate)) weeklyDone++; });

  const totalDone = dailyDone + weeklyDone;
  const totalAll = dailyTotal + weeklyTotal;
  const pct = totalAll > 0 ? Math.round((totalDone / totalAll) * 100) : 0;

  document.getElementById('progressSummary').innerHTML = `
    <span class="progress-label">今日进度</span>
    <div class="progress-bar-wrap">
      <div class="progress-bar-fill" style="width:${pct}%"></div>
    </div>
    <span class="progress-num">${totalDone}/${totalAll}</span>
    ${weeklyTotal > 0 ? `<span class="progress-weekly-hint">周 ${weeklyDone}/${weeklyTotal}</span>` : ''}
  `;

  // 渲染
  let html = '';
  if (dailyTasks.length > 0) {
    html += `<div class="task-section-label">每日</div>`;
    html += dailyTasks.map(t => renderTaskItem(t, dayRec, records)).join('');
  }
  if (weeklyTasks.length > 0) {
    html += `<div class="task-section-label">每周</div>`;
    html += weeklyTasks.map(t => renderTaskItem(t, dayRec, records)).join('');
  }
  container.innerHTML = html;
}

/* 渲染单个任务项 */
function renderTaskItem(t, dayRec, records) {
  const isWeekly = t.type === 'weekly';
  const done = isWeekly
    ? isWeeklyTaskDone(t.id, records, state.currentDate)
    : !!dayRec[t.id];
  const emoji = t.icon || '📝';
  const hasTimer = t.duration && t.duration > 0;
  const timerLabel = hasTimer ? `⏱ ${t.duration}分钟` : '';
  const typeBadge = isWeekly
    ? '<span class="task-type-badge weekly">周</span>'
    : '<span class="task-type-badge daily">日</span>';
  return `
    <div class="task-item ${done ? 'completed' : ''}" ondblclick="showEditTask('${t.id}')">
      <span class="task-icon">${emoji}</span>
      <span class="task-name">${escHtml(t.name)}</span>
      ${hasTimer && !done ? `<span class="task-timer-badge clickable" onclick="startTimer('${t.id}', state.currentMemberId, '${escHtml(t.name)}', ${t.duration})">⏱ ${t.duration}分钟</span>` : ''}
      ${typeBadge}
      <div class="task-actions">
        <button class="check-btn" onclick="toggleTask('${t.id}')">${done ? '✓' : '○'}</button>
      </div>
    </div>
  `;
}

function toggleTask(taskId) {
  const tasks = loadMemberTasks(state.currentMemberId);
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  const records = loadMemberRecords(state.currentMemberId);

  if (task.type === 'weekly') {
    // 周任务：整个周内只完成一次
    const alreadyDone = isWeeklyTaskDone(taskId, records, state.currentDate);
    if (alreadyDone) {
      // 取消：清除本周所有该任务的记录
      const weekDates = getWeekDates(state.currentDate);
      weekDates.forEach(d => {
        if (records[d] && records[d][taskId]) {
          delete records[d][taskId];
          if (Object.keys(records[d]).length === 0) delete records[d];
        }
      });
    } else {
      // 完成：标记在今天
      if (!records[state.currentDate]) records[state.currentDate] = {};
      records[state.currentDate][taskId] = true;
    }
  } else {
    // 每日任务：直接切换今天的状态
    if (!records[state.currentDate]) records[state.currentDate] = {};
    const dayRec = records[state.currentDate];
    dayRec[taskId] = !dayRec[taskId];
  }

  saveMemberRecords(state.currentMemberId, records);
  renderTaskList();

  // 检测是否全部完成，触发礼花
  const isDone = task.type === 'weekly'
    ? isWeeklyTaskDone(taskId, records, state.currentDate)
    : records[state.currentDate] && records[state.currentDate][taskId];

  if (isDone) {
    let allDone = true;
    tasks.forEach(t => {
      const tDone = t.type === 'weekly'
        ? isWeeklyTaskDone(t.id, records, state.currentDate)
        : !!(records[state.currentDate] && records[state.currentDate][t.id]);
      if (!tDone) allDone = false;
    });
    if (allDone && tasks.length > 0) {
      launchConfetti();
    }
  }
}

function changeDate(delta) {
  const d = new Date(state.currentDate + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  state.currentDate = d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
  renderDashboard();
}

function goToday() {
  state.currentDate = todayStr();
  renderDashboard();
}

/* ===== 任务管理 ===== */
const TASK_ICONS = ['🌅', '💪', '📖', '🥗', '🏃', '🧘', '🚰', '🛌', '🎯', '✍️', '🧹', '🌱', '🎨', '🎵', '📝', '💻', '🧠', '❤️', '☕', '🎮', '🎬', '🧘', '📷', '🎶', '🎨'];

let _editTaskId = null; // 正在编辑的任务 ID

function showTaskManager() {
  document.getElementById('navTitle').textContent = '📋 管理任务';
  showPage('pageTasks');
  state.pageStack.push('pageTasks');
  renderTaskManager();
}

function renderTaskManager() {
  const tasks = loadMemberTasks(state.currentMemberId);
  const records = loadMemberRecords(state.currentMemberId);
  const member = state.members.find(m => m.id === state.currentMemberId);

  const container = document.getElementById('taskManagerList');
  if (tasks.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:30px 0;"><p style="font-size:14px;">还没有任务，添加一个吧 📝</p></div>';
    return;
  }

  container.innerHTML = tasks.map((t, i) => {
    // 统计打卡天数
    let count = 0;
    Object.keys(records).forEach(date => {
      if (t.type === 'weekly') {
        // 周任务算周数
        if (isWeeklyTaskDone(t.id, records, date)) count++;
      } else {
        if (records[date][t.id]) count++;
      }
    });
    const emoji = t.icon || '📝';
    const durLabel = t.duration && t.duration > 0 ? `⏱ ${t.duration}分钟` : '';
    const typeLabel = t.type === 'weekly' ? '周' : '日';
    const countLabel = t.type === 'weekly' ? `✅ ${count}周` : `✅ ${count}天`;
    return `
      <div class="task-mgr-item" draggable="true"
           data-id="${t.id}"
           onclick="showEditTask('${t.id}')">
        <span class="drag-handle" onclick="event.stopPropagation()">⋮⋮</span>
        <span class="task-icon">${emoji}</span>
        <span class="task-mgr-name">${escHtml(t.name)}</span>
        <span class="task-type-badge ${t.type === 'weekly' ? 'weekly' : 'daily'}">${typeLabel}</span>
        ${durLabel ? `<span class="task-timer-badge">${durLabel}</span>` : ''}
        <span class="task-count">${countLabel}</span>
        <button class="del-btn" onclick="event.stopPropagation();deleteTask('${t.id}')">✕</button>
      </div>
    `;
  }).join('');

  // 拖拽排序
  setupDragReorder(container);
}

/* 渲染成员操作按钮（打卡主界面底部） */
function renderMemberActions(member) {
  if (!member) return '';
  return `
    <div class="member-actions-section">
      <div class="member-actions-buttons">
        <button class="btn btn-outline member-action-btn" onclick="showEditMember('${member.id}')">✏️ 编辑成员</button>
        <button class="btn btn-danger member-action-btn" onclick="deleteMemberFromManager('${member.id}')">🗑 删除成员</button>
      </div>
    </div>
  `;
}

function addTask() {
  const input = document.getElementById('taskInput');
  const name = input.value.trim();
  if (!name) { showToast('请输入任务名称'); return; }

  const durInput = document.getElementById('taskDuration');
  const duration = parseInt(durInput.value) || 0;

  // 获取选中的图标
  const selectedIcon = document.querySelector('.task-icon-option.selected');
  const icon = selectedIcon ? selectedIcon.dataset.icon : '📝';

  // 获取任务类型
  const typeToggle = document.querySelector('.task-type-btn.active');
  const type = typeToggle ? typeToggle.dataset.type : 'daily';

  const tasks = loadMemberTasks(state.currentMemberId);
  tasks.push({ id: genId(), name, duration, icon, type, createdAt: todayStr() });
  saveMemberTasks(state.currentMemberId, tasks);
  input.value = '';
  durInput.value = 0;
  renderTaskManager();
  showToast('✅ 任务已添加');
}

function deleteTask(taskId) {
  const tasks = loadMemberTasks(state.currentMemberId);
  tasks.splice(tasks.findIndex(t => t.id === taskId), 1);
  saveMemberTasks(state.currentMemberId, tasks);
  renderTaskManager();
  showToast('已删除');
}

/* 显示编辑任务弹窗 */
function showEditTask(taskId) {
  const tasks = loadMemberTasks(state.currentMemberId);
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  _editTaskId = taskId;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'editTaskOverlay';
  overlay.innerHTML = `
    <div class="modal-box edit-task-modal">
      <div class="modal-icon">✏️</div>
      <div class="modal-text" style="font-size:16px;font-weight:600;">编辑任务</div>

      <div class="edit-task-field">
        <label>任务图标</label>
        <div class="task-icon-selector edit-icon-selector">
          ${TASK_ICONS.map(ic =>
            `<span class="task-icon-option ${ic === task.icon ? 'selected' : ''}" data-icon="${ic}">${ic}</span>`
          ).join('')}
        </div>
      </div>

      <div class="edit-task-field">
        <label>任务名称</label>
        <input type="text" id="editTaskName" value="${escHtml(task.name)}" maxlength="20" class="edit-task-input">
      </div>

      <div class="edit-task-field">
        <label>计时（分钟，0=无计时）</label>
        <input type="number" id="editTaskDuration" min="0" max="999" value="${task.duration || 0}" class="edit-task-input" style="width:80px;">
      </div>

      <div class="edit-task-field">
        <label>任务类型</label>
        <div class="task-type-toggle">
          <button class="task-type-btn ${task.type !== 'weekly' ? 'active' : ''}" data-type="daily">每日</button>
          <button class="task-type-btn ${task.type === 'weekly' ? 'active' : ''}" data-type="weekly">每周</button>
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn btn-primary" id="editSaveBtn">保存</button>
        <button class="btn btn-outline" id="editCancelBtn">取消</button>
        <button class="btn btn-danger" id="editDeleteBtn">删除</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // 图标选择
  overlay.querySelector('.edit-icon-selector').addEventListener('click', function(e) {
    const opt = e.target.closest('.task-icon-option');
    if (opt) {
      this.querySelectorAll('.task-icon-option').forEach(el => el.classList.remove('selected'));
      opt.classList.add('selected');
    }
  });

  // 类型切换
  overlay.querySelectorAll('.task-type-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      this.parentElement.querySelectorAll('.task-type-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
    });
  });

  overlay.querySelector('#editSaveBtn').onclick = () => saveEditTask(overlay);
  overlay.querySelector('#editCancelBtn').onclick = () => overlay.remove();
  overlay.querySelector('#editDeleteBtn').onclick = () => {
    overlay.remove();
    deleteTask(taskId);
  };
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

function saveEditTask(overlay) {
  const taskId = _editTaskId;
  const tasks = loadMemberTasks(state.currentMemberId);
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  const name = document.getElementById('editTaskName').value.trim();
  if (!name) { showToast('请输入任务名称'); return; }

  const duration = parseInt(document.getElementById('editTaskDuration').value) || 0;
  const selectedIcon = overlay.querySelector('.edit-icon-selector .task-icon-option.selected');
  const icon = selectedIcon ? selectedIcon.dataset.icon : '📝';
  const typeBtn = overlay.querySelector('.task-type-btn.active');
  const type = typeBtn ? typeBtn.dataset.type : 'daily';

  task.name = name;
  task.duration = duration;
  task.icon = icon;
  task.type = type;

  saveMemberTasks(state.currentMemberId, tasks);
  overlay.remove();
  renderTaskManager();
  showToast('✅ 任务已更新');
}

/* 拖拽排序 */
function setupDragReorder(container) {
  let dragEl = null;
  let dragIndex = -1;

  const onDragStart = (e) => {
    dragEl = e.target.closest('.task-mgr-item');
    if (!dragEl) return;
    dragIndex = Array.from(container.children).indexOf(dragEl);
    dragEl.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragEl.dataset.id);
    // 防止进一步冒泡
    if (e.target.closest('.del-btn')) {
      e.preventDefault();
      return;
    }
  };

  const onDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const target = e.target.closest('.task-mgr-item');
    if (!target || target === dragEl) return;
    const rect = target.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    if (e.clientY < mid) {
      container.insertBefore(dragEl, target);
    } else {
      container.insertBefore(dragEl, target.nextSibling);
    }
  };

  const onDragEnd = (e) => {
    if (dragEl) dragEl.classList.remove('dragging');
    // 保存新顺序
    const items = container.querySelectorAll('.task-mgr-item');
    const tasks = loadMemberTasks(state.currentMemberId);
    const newOrder = [];
    items.forEach(el => {
      const id = el.dataset.id;
      const t = tasks.find(t => t.id === id);
      if (t) newOrder.push(t);
    });
    if (newOrder.length === tasks.length) {
      saveMemberTasks(state.currentMemberId, newOrder);
    }
    dragEl = null;
    dragIndex = -1;
  };

  container.addEventListener('dragstart', onDragStart);
  container.addEventListener('dragover', onDragOver);
  container.addEventListener('dragend', onDragEnd);
}

/* ===== 成员网格 - 抖动模式（长按抖动 + 拖拽排序） ===== */
let _jiggleMode = false;
let _jiggleEnteredByTouch = false; // 由触摸长按进入，抑制后续 click

function setupMemberGridJiggle(container) {
  let longPressTimer = null;
  let touchStartPos = null;
  let dragEl = null;
  let isDragging = false;

  // ===== 触摸事件 =====
  container.addEventListener('touchstart', (e) => {
    const card = e.target.closest('.member-card');
    if (!card) return;

    if (_jiggleMode) {
      // 抖动模式中：直接开始拖拽
      e.preventDefault();
      startDrag(card);
      return;
    }

    // 正常模式：记录起始位置，准备长按定时器
    touchStartPos = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };

    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      enterJiggleMode();
      _jiggleEnteredByTouch = true;
      if (navigator.vibrate) navigator.vibrate(15);
      // 进入抖动后立即开始拖拽这张卡片
      startDrag(card);
    }, 500);
  }, { passive: false });

  container.addEventListener('touchmove', (e) => {
    if (isDragging && dragEl) {
      e.preventDefault();
      const cy = e.touches[0].clientY;
      const target = document.elementFromPoint(e.touches[0].clientX, cy);
      const targetCard = target ? target.closest('.member-card') : null;
      if (targetCard && targetCard !== dragEl) {
        const rect = targetCard.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        if (cy < mid) {
          container.insertBefore(dragEl, targetCard);
        } else {
          container.insertBefore(dragEl, targetCard.nextSibling);
        }
      }
      return;
    }

    // 手指移动超过 12px 取消长按（允许滚动）
    if (longPressTimer && touchStartPos) {
      const dx = Math.abs(e.touches[0].clientX - touchStartPos.x);
      const dy = Math.abs(e.touches[0].clientY - touchStartPos.y);
      if (dx > 12 || dy > 12) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
        touchStartPos = null;
      }
    }
  }, { passive: false });

  container.addEventListener('touchend', (e) => {
    clearTimeout(longPressTimer);
    longPressTimer = null;
    touchStartPos = null;

    if (isDragging && dragEl) {
      endDrag();
      exitJiggleMode();
      return;
    }

    // 抖动模式：点击退出
    if (_jiggleMode) {
      exitJiggleMode();
      return;
    }
  });

  container.addEventListener('touchcancel', () => {
    clearTimeout(longPressTimer);
    longPressTimer = null;
    touchStartPos = null;
    if (isDragging && dragEl) endDrag();
  });

  // ===== 桌面端拖拽（仅抖动模式下可用） =====
  container.addEventListener('dragstart', (e) => {
    if (!_jiggleMode) { e.preventDefault(); return; }
    dragEl = e.target.closest('.member-card');
    if (!dragEl) return;
    dragEl.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragEl.dataset.memberId);
  });

  container.addEventListener('dragover', (e) => {
    if (!_jiggleMode || !dragEl) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const target = e.target.closest('.member-card');
    if (!target || target === dragEl) return;
    const rect = target.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    if (e.clientY < mid) {
      container.insertBefore(dragEl, target);
    } else {
      container.insertBefore(dragEl, target.nextSibling);
    }
  });

  container.addEventListener('dragend', () => {
    if (dragEl) {
      dragEl.classList.remove('dragging');
      saveMemberOrderFromDOM();
      dragEl = null;
    }
  });

  // 阻止原生上下文菜单
  container.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.member-card')) {
      e.preventDefault();
    }
  });

  // ===== 内部辅助 =====
  function startDrag(card) {
    dragEl = card;
    isDragging = true;
    card.classList.add('dragging');
  }

  function endDrag() {
    if (dragEl) {
      dragEl.classList.remove('dragging');
      saveMemberOrderFromDOM();
    }
    dragEl = null;
    isDragging = false;
  }

  function saveMemberOrderFromDOM() {
    const items = container.querySelectorAll('.member-card');
    const newOrder = [];
    items.forEach(el => {
      const id = el.dataset.memberId;
      const m = state.members.find(m => m.id === id);
      if (m) newOrder.push(m);
    });
    if (newOrder.length === state.members.length) {
      state.members = newOrder;
      saveData();
    }
  }
}

/** 进入抖动模式（iOS 长按图标效果） */
function enterJiggleMode() {
  if (_jiggleMode) return;
  _jiggleMode = true;

  // 卡片抖动
  document.querySelectorAll('.member-card').forEach(c => c.classList.add('jiggling'));
}

/** 退出抖动模式 */
function exitJiggleMode() {
  if (!_jiggleMode) return;
  _jiggleMode = false;

  // 停止抖动
  document.querySelectorAll('.member-card').forEach(c => c.classList.remove('jiggling'));
}

/* ===== 统计分析 ===== */
function renderStats() {
  if (_renderingStats) return; _renderingStats = true;
  document.getElementById('navTitle').textContent = '📊 统计分析';

  // 填充成员选项
  const select = document.getElementById('statsMemberSelect');
  const currentVal = select.value;
  select.innerHTML = '<option value="all">👨‍👩‍👧‍👦 全部成员</option>' +
    state.members.map(m => `<option value="${m.id}">${m.avatar || '👤'} ${escHtml(m.name)}</option>`).join('');
  select.value = currentVal && (currentVal === 'all' || state.members.some(m => m.id === currentVal)) ? currentVal : 'all';

  const memberId = select.value;
  const period = parseInt(document.getElementById('statsPeriod').value);
  const content = document.getElementById('statsContent');

  if (state.members.length === 0) {
    content.innerHTML = '<div class="empty-state" style="padding:60px 0;"><div class="empty-icon">📊</div><p>暂无数据，先添加家庭成员吧</p></div>';
    _renderingStats = false;
    return;
  }

  let html = '';

  // ---- 总览卡片 ----
  if (memberId === 'all') {
    html += buildFamilyOverview(period);
  } else {
    html += buildMemberDetailStats(memberId, period);
  }

  // ---- 各成员对比 ----
  if (memberId === 'all') {
    html += buildMemberComparison(period);
  }

  // ---- 任务完成率 ----
  html += buildTaskRates(memberId === 'all' ? null : memberId, period);

  // ---- 打卡日历 ----
  html += buildCalendar(memberId === 'all' ? null : memberId, period);

  content.innerHTML = html;
  _renderingStats = false;
}

/* 家庭总览 */
function buildFamilyOverview(period) {
  let totalTasks = 0, totalDone = 0;
  const days = getDateRange(period);
  const memberStats = [];

  state.members.forEach(m => {
    const tasks = loadMemberTasks(m.id);
    if (tasks.length === 0) return;
    const records = loadMemberRecords(m.id);
    let done = 0, total = 0;
    days.forEach(d => {
      const dayRec = records[d] || {};
      tasks.forEach(t => {
        total++;
        if (dayRec[t.id]) done++;
      });
    });
    totalTasks += total;
    totalDone += done;
    memberStats.push({ id: m.id, name: m.name, avatar: m.avatar, done, total, rate: total > 0 ? (done / total) : 0 });
  });

  const overallRate = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0;
  // 连续打卡天数（取所有成员中最长的）
  const streak = getFamilyStreak();

  return `
    <div class="stats-card">
      <div class="stats-card-title">📈 总览</div>
      <div class="stats-overview">
        <div class="stats-overview-item">
          <div class="num">${overallRate}%</div>
          <div class="label">总完成率</div>
        </div>
        <div class="stats-overview-item">
          <div class="num">${totalDone}/${totalTasks}</div>
          <div class="label">完成/总计</div>
        </div>
        <div class="stats-overview-item">
          <div class="num">🔥${streak}</div>
          <div class="label">连续打卡(天)</div>
        </div>
      </div>
    </div>
  `;
}

function getFamilyStreak() {
  // 所有成员中最长的连续打卡天数
  let maxStreak = 0;
  state.members.forEach(m => {
    const s = getMemberStreak(m.id);
    if (s > maxStreak) maxStreak = s;
  });
  return maxStreak;
}

function getMemberStreak(memberId) {
  const tasks = loadMemberTasks(memberId);
  const dailyTasks = tasks.filter(t => t.type !== 'weekly'); // 只有每日任务影响连续打卡
  if (dailyTasks.length === 0) return 0;
  const records = loadMemberRecords(memberId);

  let streak = 0;
  const d = new Date();
  // 最多查60天
  for (let i = 0; i < 60; i++) {
    const ds = d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
    const dayRec = records[ds] || {};
    let allDone = 0;
    dailyTasks.forEach(t => { if (dayRec[t.id]) allDone++; });
    if (allDone === dailyTasks.length && dailyTasks.length > 0) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

/* 成员详情统计 */
function buildMemberDetailStats(memberId, period) {
  const member = state.members.find(m => m.id === memberId);
  if (!member) return '';
  const tasks = loadMemberTasks(memberId);
  const records = loadMemberRecords(memberId);
  const days = getDateRange(period);

  let done = 0, total = 0;
  days.forEach(d => {
    const dayRec = records[d] || {};
    tasks.forEach(t => {
      total++;
      if (dayRec[t.id]) done++;
    });
  });
  const rate = total > 0 ? Math.round((done / total) * 100) : 0;
  const streak = getMemberStreak(memberId);

  return `
    <div class="stats-card">
      <div class="stats-card-title">${member.avatar || '👤'} ${escHtml(member.name)} 的统计</div>
      <div class="stats-overview">
        <div class="stats-overview-item">
          <div class="num">${rate}%</div>
          <div class="label">完成率</div>
        </div>
        <div class="stats-overview-item">
          <div class="num">${done}/${total}</div>
          <div class="label">完成/总计</div>
        </div>
        <div class="stats-overview-item">
          <div class="num">🔥${streak}</div>
          <div class="label">连续打卡</div>
        </div>
      </div>
    </div>
  `;
}

/* 成员对比 */
function buildMemberComparison(period) {
  const days = getDateRange(period);
  const rows = state.members.map(m => {
    const tasks = loadMemberTasks(m.id);
    if (tasks.length === 0) return null;
    const records = loadMemberRecords(m.id);
    let done = 0, total = 0;
    days.forEach(d => {
      const dayRec = records[d] || {};
      tasks.forEach(t => { total++; if (dayRec[t.id]) done++; });
    });
    const rate = total > 0 ? Math.round((done / total) * 100) : 0;
    return { id: m.id, name: m.name, avatar: m.avatar, rate };
  }).filter(Boolean);

  if (rows.length === 0) return '';

  return `
    <div class="stats-card">
      <div class="stats-card-title">👨‍👩‍👧‍👦 成员完成率对比</div>
      ${rows.map(r => `
        <div class="stats-member-row">
          <span class="avatar">${r.avatar || '👤'}</span>
          <span class="name">${escHtml(r.name)}</span>
          <div class="rate-bar-wrap">
            <div class="rate-bar-fill" style="width:${r.rate}%"></div>
          </div>
          <span class="rate-num">${r.rate}%</span>
        </div>
      `).join('')}
    </div>
  `;
}

/* 任务完成率 */
function buildTaskRates(memberId, period) {
  const days = getDateRange(period);
  let taskStats = {};

  const targetMembers = memberId ? state.members.filter(m => m.id === memberId) : state.members;

  targetMembers.forEach(m => {
    const tasks = loadMemberTasks(m.id);
    const records = loadMemberRecords(m.id);
    tasks.forEach(t => {
      if (!taskStats[t.id]) taskStats[t.id] = { name: t.name, done: 0, total: 0 };
      days.forEach(d => {
        const dayRec = records[d] || {};
        taskStats[t.id].total++;
        if (dayRec[t.id]) taskStats[t.id].done++;
      });
    });
  });

  const entries = Object.values(taskStats);
  if (entries.length === 0) return '';

  // 按完成率排序
  entries.sort((a, b) => (b.done / b.total) - (a.done / a.total));

  const colors = ['#FF8C5A', '#4FC3F7', '#81C784', '#CE93D8', '#FFB74D', '#4DB6AC', '#F06292', '#A1887F'];
  return `
    <div class="stats-card">
      <div class="stats-card-title">📊 各任务完成率</div>
      ${entries.map((e, i) => {
        const rate = Math.round((e.done / e.total) * 100);
        return `
          <div class="stats-task-bar">
            <span class="task-label" title="${escHtml(e.name)}">${escHtml(e.name)}</span>
            <div class="task-bar-wrap">
              <div class="task-bar-fill" style="width:${rate}%;background:${colors[i % colors.length]}"></div>
            </div>
            <span class="task-rate" style="color:${colors[i % colors.length]}">${rate}%</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/* 打卡日历（热力图） */
function buildCalendar(memberId, period) {
  const days = getDateRange(period);

  // 计算每天完成率
  const dayRates = {};
  days.forEach(d => { dayRates[d] = { done: 0, total: 0 }; });

  const targetMembers = memberId ? state.members.filter(m => m.id === memberId) : state.members;

  targetMembers.forEach(m => {
    const tasks = loadMemberTasks(m.id);
    if (tasks.length === 0) return;
    const records = loadMemberRecords(m.id);
    days.forEach(d => {
      const dayRec = records[d] || {};
      tasks.forEach(t => {
        dayRates[d].total++;
        if (dayRec[t.id]) dayRates[d].done++;
      });
    });
  });

  // 去掉 total=0 的日期（未来）
  const today = todayStr();
  const filteredDays = days.filter(d => d <= today);

  // 按周日排列
  // 找到第一天的星期几
  const firstD = new Date(filteredDays[0] + 'T00:00:00');
  const startPad = firstD.getDay(); // 0=周日

  const totalCells = startPad + filteredDays.length;
  const rows = Math.ceil(totalCells / 7);

  let cells = '';
  // 前填充
  for (let i = 0; i < startPad; i++) {
    cells += '<div class="heat-item heat-future"></div>';
  }

  filteredDays.forEach(d => {
    const info = dayRates[d];
    const rate = info.total > 0 ? info.done / info.total : 0;
    let cls = 'heat-empty';
    if (rate > 0 && rate <= 0.33) cls = 'heat-low';
    else if (rate <= 0.66) cls = 'heat-medium';
    else if (rate < 1) cls = 'heat-high';
    else if (rate === 1) cls = 'heat-full';
    // 当天高亮
    const isT = isToday(d);
    const dayNum = new Date(d + 'T00:00:00').getDate();
    cells += `<div class="heat-item ${cls}" style="${isT ? 'border:2px solid #FF8C5A;' : ''}" title="${d} 完成率${Math.round(rate*100)}%">${dayNum}</div>`;
  });

  // 后填充
  const used = startPad + filteredDays.length;
  const remainder = 7 - (used % 7);
  if (remainder < 7) {
    for (let i = 0; i < remainder; i++) {
      cells += '<div class="heat-item heat-future"></div>';
    }
  }

  return `
    <div class="stats-card">
      <div class="stats-card-title">📅 打卡日历</div>
      <div class="stats-heatmap">
        ${cells}
      </div>
      <div class="stats-heatmap-labels">
        <span>少</span>
        <span><span class="heat-item" style="display:inline-block;width:14px;height:14px;border-radius:3px;vertical-align:middle;background:#f5f0eb;"></span> 未打卡</span>
        <span><span class="heat-item" style="display:inline-block;width:14px;height:14px;border-radius:3px;vertical-align:middle;background:#FFE0B2;"></span> 部分</span>
        <span><span class="heat-item" style="display:inline-block;width:14px;height:14px;border-radius:3px;vertical-align:middle;background:#FF8C5A;"></span> 大部分</span>
        <span><span class="heat-item" style="display:inline-block;width:14px;height:14px;border-radius:3px;vertical-align:middle;background:#FF6B6B;"></span> 全部</span>
        <span>多</span>
      </div>
    </div>
  `;
}

/* 工具：获取日期范围 */
function getDateRange(days) {
  const result = [];
  const d = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const dd = new Date(d);
    dd.setDate(dd.getDate() - i);
    result.push(dd.getFullYear() + '-' +
      String(dd.getMonth() + 1).padStart(2, '0') + '-' +
      String(dd.getDate()).padStart(2, '0'));
  }
  return result;
}

/* ===== 确认弹窗 ===== */
function showConfirm(text, callback) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-icon">⚠️</div>
      <div class="modal-text">${text}</div>
      <div class="modal-actions">
        <button class="btn btn-outline" id="confirmCancel">取消</button>
        <button class="btn btn-danger" id="confirmOk">确定删除</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#confirmCancel').onclick = () => overlay.remove();
  overlay.querySelector('#confirmOk').onclick = () => {
    overlay.remove();
    callback();
  };
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

/* ===== HTML转义 ===== */
function escHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

/* ===== ⏱ 倒计时逻辑 ===== */
let timerState = {
  taskId: null,
  memberId: null,
  totalSecs: 0,
  remainingSecs: 0,
  running: false,
  intervalId: null,
  paused: false,
};

const TIMER_CIRCUMFERENCE = 2 * Math.PI * 100; // 628.32

function startTimer(taskId, memberId, taskName, durationMinutes) {
  const totalSecs = Math.max(1, durationMinutes * 60);
  timerState.taskId = taskId;
  timerState.memberId = memberId;
  timerState.totalSecs = totalSecs;
  timerState.remainingSecs = totalSecs;
  timerState.running = false;
  timerState.paused = false;

  document.getElementById('timerTaskName').textContent = taskName;
  document.getElementById('timerOverlay').style.display = 'flex';
  document.getElementById('timerMainBtn').textContent = '▶ 开始';
  document.getElementById('timerProgressCircle').classList.remove('completed');

  updateTimerDisplay(true);
  if (timerState.intervalId) {
    clearInterval(timerState.intervalId);
    timerState.intervalId = null;
  }
}

function timerMainAction() {
  if (!timerState.running) {
    // 开始/继续
    timerState.running = true;
    timerState.paused = false;
    document.getElementById('timerMainBtn').textContent = '⏸ 暂停';
    if (timerState.intervalId) clearInterval(timerState.intervalId);
    timerState.intervalId = setInterval(() => {
      timerState.remainingSecs--;
      updateTimerDisplay();
      if (timerState.remainingSecs <= 0) {
        clearInterval(timerState.intervalId);
        timerState.intervalId = null;
        timerState.running = false;
        onTimerComplete();
      }
    }, 1000);
  } else {
    // 暂停
    timerState.running = false;
    timerState.paused = true;
    document.getElementById('timerMainBtn').textContent = '▶ 继续';
    if (timerState.intervalId) {
      clearInterval(timerState.intervalId);
      timerState.intervalId = null;
    }
  }
}

function updateTimerDisplay(forceReset) {
  const secs = forceReset ? timerState.totalSecs : timerState.remainingSecs;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  document.getElementById('timerDisplay').textContent =
    String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');

  // 圆环进度
  const offset = TIMER_CIRCUMFERENCE * (1 - secs / timerState.totalSecs);
  document.getElementById('timerProgressCircle').style.strokeDashoffset = offset;
}

function onTimerComplete() {
  document.getElementById('timerDisplay').textContent = '🎉';
  document.getElementById('timerMainBtn').textContent = '✓ 完成';
  document.getElementById('timerProgressCircle').classList.add('completed');

  // 标记打卡
  const records = loadMemberRecords(timerState.memberId);
  if (!records[todayStr()]) records[todayStr()] = {};
  records[todayStr()][timerState.taskId] = true;
  saveMemberRecords(timerState.memberId, records);

  // 声音提醒（3次哔哔）
  playBeep(3);

  // 关闭倒计时 2.5 秒后
  const savedMemberId = timerState.memberId;
  setTimeout(() => {
    stopTimer();
    if (state.currentMemberId === savedMemberId) {
      renderDashboard();
    }
    // 检查全部完成→礼花
    checkAllDoneAfterTimer(savedMemberId);
  }, 2500);
}

function checkAllDoneAfterTimer(memberId) {
  const records = loadMemberRecords(memberId || timerState.memberId);
  const tasks = loadMemberTasks(memberId || timerState.memberId);
  let allDone = true;
  tasks.forEach(t => {
    if (t.type === 'weekly') {
      if (!isWeeklyTaskDone(t.id, records, todayStr())) allDone = false;
    } else {
      const dayRec = records[todayStr()] || {};
      if (!dayRec[t.id]) allDone = false;
    }
  });
  if (allDone && tasks.length > 0) {
    launchConfetti();
  }
}

function stopTimer() {
  if (timerState.intervalId) {
    clearInterval(timerState.intervalId);
    timerState.intervalId = null;
  }
  timerState.running = false;
  timerState.paused = false;
  timerState.taskId = null;
  timerState.memberId = null;
  document.getElementById('timerOverlay').style.display = 'none';
  document.getElementById('timerProgressCircle').classList.remove('completed');
}

/* ===== 🔊 声音提醒（Web Audio API） ===== */
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function playBeep(times) {
  const ctx = getAudioCtx();
  // 唤醒 AudioContext（iOS/Safari 需要用户交互后才有声音）
  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  const now = ctx.currentTime;
  for (let i = 0; i < times; i++) {
    const startTime = now + i * 0.5;
    // 低音
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.value = 880; // A5
    gain1.gain.setValueAtTime(0.3, startTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, startTime + 0.4);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(startTime);
    osc1.stop(startTime + 0.4);

    // 高音叠加
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'square';
    osc2.frequency.value = 1320; // E6
    gain2.gain.setValueAtTime(0.15, startTime);
    gain2.gain.exponentialRampToValueAtTime(0.01, startTime + 0.3);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(startTime);
    osc2.stop(startTime + 0.3);
  }
}

/* ===== 🎊 礼花特效 ===== */
let confettiPieces = [];
let confettiAnimId = null;

function launchConfetti() {
  const canvas = document.getElementById('confettiCanvas');
  const ctx = canvas.getContext('2d');
  const W = window.innerWidth;
  const H = window.innerHeight;
  canvas.width = W;
  canvas.height = H;
  canvas.classList.add('active');

  // 生成多个烟花粒子
  const colors = ['#FF6B6B', '#FF8C5A', '#FFB74D', '#FFD54F', '#81C784', '#4FC3F7', '#CE93D8', '#F06292', '#4DB6AC', '#FF8A65'];
  const count = 120;
  confettiPieces = [];

  // 从屏幕底部多个位置发射
  const bursts = 4;
  for (let b = 0; b < bursts; b++) {
    const cx = W * (0.15 + 0.7 * (b / (bursts - 1)));
    const cy = H * (0.2 + 0.1 * Math.random());
    for (let i = 0; i < count / bursts; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 7;
      confettiPieces.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        w: 4 + Math.random() * 6,
        h: 4 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1,
        decay: 0.005 + Math.random() * 0.008,
        rotation: Math.random() * 360,
        rv: (Math.random() - 0.5) * 8,
        gravity: 0.08 + Math.random() * 0.04,
      });
    }
  }

  if (confettiAnimId) cancelAnimationFrame(confettiAnimId);
  animateConfetti(ctx, W, H);
}

function animateConfetti(ctx, W, H) {
  ctx.clearRect(0, 0, W, H);

  let alive = false;
  confettiPieces.forEach(p => {
    if (p.life <= 0) return;
    alive = true;
    p.x += p.vx;
    p.vy += p.gravity;
    p.y += p.vy;
    p.vx *= 0.99;
    p.rotation += p.rv;
    p.life -= p.decay;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((p.rotation * Math.PI) / 180);
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  });

  if (alive) {
    confettiAnimId = requestAnimationFrame(() => animateConfetti(ctx, W, H));
  } else {
    const canvas = document.getElementById('confettiCanvas');
    canvas.classList.remove('active');
    ctx.clearRect(0, 0, W, H);
    confettiAnimId = null;
  }
}

/* ===== 滑动手势：左右切换 Tab 页面 ===== */
let swipeState = { startX: 0, startY: 0, active: false };
const SWIPE_THRESHOLD = 50;

document.addEventListener('touchstart', function(e) {
  if (state.isSubPage) return;
  const touch = e.touches[0];
  swipeState.startX = touch.clientX;
  swipeState.startY = touch.clientY;
  swipeState.active = false;
}, { passive: true });

document.addEventListener('touchmove', function(e) {
  if (state.isSubPage || swipeState.startX === 0) return;
  const dx = e.touches[0].clientX - swipeState.startX;
  const dy = e.touches[0].clientY - swipeState.startY;
  if (Math.abs(dx) > 20 && Math.abs(dx) > Math.abs(dy) * 1.8) {
    swipeState.active = true;
  }
}, { passive: true });

document.addEventListener('touchend', function(e) {
  if (state.isSubPage || swipeState.startX === 0 || !swipeState.active) {
    swipeState.startX = 0;
    swipeState.startY = 0;
    swipeState.active = false;
    return;
  }
  const dx = (e.changedTouches?.[0]?.clientX || 0) - swipeState.startX;
  const currentTab = document.querySelector('.tab-item.active')?.dataset?.page;
  if (dx > SWIPE_THRESHOLD && currentTab === 'pageStats') {
    switchTab('pageMembers');
  } else if (dx < -SWIPE_THRESHOLD && currentTab === 'pageMembers') {
    switchTab('pageStats');
  }
  swipeState.startX = 0;
  swipeState.startY = 0;
  swipeState.active = false;
}, { passive: true });

/* ===== 初始化 ===== */
document.addEventListener('DOMContentLoaded', function() {
  loadData();
  renderMembers();

  // 回车提交任务
  document.getElementById('taskInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') addTask();
  });
  document.getElementById('memberNameInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') saveMember();
  });

  // 图标选择器点击
  document.getElementById('taskIconSelector').addEventListener('click', function(e) {
    const opt = e.target.closest('.task-icon-option');
    if (opt) {
      this.querySelectorAll('.task-icon-option').forEach(el => el.classList.remove('selected'));
      opt.classList.add('selected');
    }
  });

  // 任务类型切换
  document.querySelectorAll('.task-type-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      this.parentElement.querySelectorAll('.task-type-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
    });
  });

  // 统计页选择变更
  document.getElementById('statsMemberSelect').addEventListener('change', renderStats);
  document.getElementById('statsPeriod').addEventListener('change', renderStats);

  // 成员卡片：单击进入打卡
  document.getElementById('memberGrid').addEventListener('click', function(e) {
    // 刚从长按进入抖动模式，抑制本次 click
    if (_jiggleEnteredByTouch) {
      _jiggleEnteredByTouch = false;
      return;
    }
    // 抖动模式下不进入详情
    if (_jiggleMode) return;
    const card = e.target.closest('.member-card');
    if (!card) return;
    const id = card.dataset.memberId;
    if (!id) return;
    enterMember(id);
  });

  // 初始化成员抖动弹窗拖拽排序
  setupMemberGridJiggle(document.getElementById('memberGrid'));
});
