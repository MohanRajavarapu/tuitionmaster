// ════ TuitionMaster Modernized Multi-Role Core engine ════

const K = { settings: 'tm_v2_settings', teachers: 'tm_v2_teachers', members: 'tm_v2_members', logs: 'tm_v2_audit_logs' };
const PLAN_DAYS = { Monthly: 30, 'Bi-Monthly': 60, Quarterly: 90, 'Half-Yearly': 180, Yearly: 365 };

function load(k, def) {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; }
}

// Default passwords = phone numbers: Super-Admin=8888888888 -> last 4 = 8888, Accountant=9999999999 -> last 4 = 9999
let settings = load(K.settings, { tuitionName: '', masterName: '', adminPin: '8888', accountantPin: '9999', adminPhone: null, accountantPhone: null, adminFirstLogin: true, accountantFirstLogin: true });
let teachers  = load(K.teachers, []);
let members   = load(K.members, []);
let auditLogs = load(K.logs, []);

function saveSettings() { localStorage.setItem(K.settings, JSON.stringify(settings)); }
function saveTeachers() { localStorage.setItem(K.teachers, JSON.stringify(teachers)); }
function saveMembers()  { localStorage.setItem(K.members,  JSON.stringify(members));  }
function saveLogs()     { localStorage.setItem(K.logs,     JSON.stringify(auditLogs)); }

let session = null;
let selectedRole = null;
let selectedTeacherId = null;
let targetChangingPinRole = 'super-admin';
let currentPage = '';
let pieChart = null;
let editingMemberId = null;
let bulkUploadType = 'students';

// ─── FIRST LOGIN PHONE SETUP ───
let pendingFirstLoginRole = null;

function showFirstLoginPhoneSetup(role) {
  pendingFirstLoginRole = role;
  const modal = document.getElementById('first-login-modal');
  const title = document.getElementById('first-login-title');
  const label = role === 'super-admin' ? 'Super-Admin' : 'Accountant';
  title.textContent = `Welcome, ${label}! Set Your Mobile Number`;
  document.getElementById('fl-phone1').value = '';
  document.getElementById('fl-phone2').value = '';
  document.getElementById('fl-error').textContent = '';
  openModal('first-login-modal');
}

function saveFirstLoginPhone() {
  const p1 = document.getElementById('fl-phone1').value.trim();
  const p2 = document.getElementById('fl-phone2').value.trim();
  const errEl = document.getElementById('fl-error');

  if (p1.length !== 10 || !/^\d{10}$/.test(p1)) { errEl.textContent = 'Please enter a valid 10-digit mobile number.'; return; }
  if (p1 !== p2) { errEl.textContent = 'Mobile numbers do not match. Please re-enter.'; return; }

  if (pendingFirstLoginRole === 'super-admin') {
    settings.adminPhone = p1;
    settings.adminFirstLogin = false;
  } else {
    settings.accountantPhone = p1;
    settings.accountantFirstLogin = false;
  }
  saveSettings();
  closeModal('first-login-modal');

  // Now enter app
  if (pendingFirstLoginRole === 'super-admin') {
    session = { role: 'super-admin' };
    addLog("Super-Admin workspace session initialized (first login — phone set).");
    if (!settings.tuitionName) { enterApp(); setTimeout(openNameModal, 400); return; }
    enterApp();
  } else {
    session = { role: 'accountant' };
    addLog("Accountant session validated (first login — phone set).");
    enterApp();
  }
}

// ─── AUDIT LOGGING SYSTEM ───
function addLog(actionMessage) {
  const actor = session ? (session.role === 'teacher' ? session.teacherName : session.role) : 'System';
  const timestamp = new Date().toISOString();
  auditLogs.unshift({ actor, timestamp, message: actionMessage });
  saveLogs();
  if (currentPage === 'settings') renderAuditLogs();
}

function renderAuditLogs() {
  const container = document.getElementById('audit-logs-container');
  if (!auditLogs.length) {
    container.innerHTML = '<div class="empty-state" style="padding:15px;"><p>No logs found.</p></div>';
    return;
  }
  container.innerHTML = auditLogs.map(log => `
    <div class="audit-item">
      <div class="audit-meta">
        <span class="audit-actor">[${esc(log.actor.toUpperCase())}]</span>
        <span class="audit-time">${new Date(log.timestamp).toLocaleTimeString('en-IN')} - ${new Date(log.timestamp).toLocaleDateString('en-IN')}</span>
      </div>
      <div class="audit-msg">${esc(log.message)}</div>
    </div>
  `).join('');
}

function clearLogsClick() {
  auditLogs = []; saveLogs(); renderAuditLogs();
  showToast('Activity logs cleared.');
}

// ─── PIN CELL INDEX FOCUS CONTROLLERS ───
function pinKeyDown(e, idx) {
  const el = document.getElementById('p' + idx);
  if (e.key === 'Backspace') {
    if (!el.value && idx > 0) {
      const prevEl = document.getElementById('p' + (idx - 1));
      prevEl.value = '';
      prevEl.focus();
      e.preventDefault();
    } else {
      el.value = '';
    }
  }
}

function pinInput(idx) {
  const el = document.getElementById('p' + idx);
  el.value = el.value.replace(/\D/g, '');
  if (el.value && idx < 3) {
    document.getElementById('p' + (idx + 1)).focus();
  }
  if (idx === 3 && el.value) {
    doLogin();
  }
}

function getPin() { return [0, 1, 2, 3].map(i => document.getElementById('p' + i).value).join(''); }

// ─── AUTHENTICATION PORTAL ───
function selectRole(role) {
  selectedRole = role;
  document.getElementById('role-super-admin').classList.toggle('selected', role === 'super-admin');
  document.getElementById('role-accountant').classList.toggle('selected', role === 'accountant');
  document.getElementById('role-teacher').classList.toggle('selected', role === 'teacher');

  document.getElementById('teacher-select-wrap').style.display = role === 'teacher' ? 'block' : 'none';
  document.getElementById('pin-wrap').style.display = 'block';
  document.getElementById('login-btn').style.display = 'block';
  document.getElementById('pin-error').textContent = '';

  [0, 1, 2, 3].forEach(i => { document.getElementById('p' + i).value = ''; });

  if (role === 'teacher') {
    const sel = document.getElementById('teacher-select');
    sel.innerHTML = '<option value="">-- Choose teacher --</option>';
    teachers.forEach(t => {
      sel.innerHTML += `<option value="${t.id}">${esc(t.name)}${t.subject ? ' (' + esc(t.subject) + ')' : ''}</option>`;
    });
    if (!teachers.length) sel.innerHTML += '<option disabled>No teachers found.</option>';
    document.getElementById('pin-wrap').style.display = 'none';
    selectedTeacherId = null;
  } else {
    document.getElementById('pin-label').textContent = role === 'accountant' ? 'Enter Accountant PIN' : 'Enter Super-Admin PIN';
    setTimeout(() => document.getElementById('p0').focus(), 50);
  }
}

function onTeacherSelect() {
  const val = document.getElementById('teacher-select').value;
  selectedTeacherId = val || null;
  document.getElementById('pin-wrap').style.display = val ? 'block' : 'none';
  if (val) {
    document.getElementById('pin-label').textContent = 'Enter Teacher PIN';
    [0, 1, 2, 3].forEach(i => { document.getElementById('p' + i).value = ''; });
    setTimeout(() => document.getElementById('p0').focus(), 50);
  }
}

function doLogin() {
  const pin = getPin();
  if (!selectedRole) { showToast('Please choose an access mode.'); return; }

  if (selectedRole === 'super-admin') {
    if (pin !== settings.adminPin) { passwordFailureAlert(); return; }
    // First time login — ask phone number
    if (settings.adminFirstLogin !== false) {
      showFirstLoginPhoneSetup('super-admin');
      return;
    }
    session = { role: 'super-admin' };
    addLog("Super-Admin workspace session initialized.");
    if (!settings.tuitionName) { enterApp(); setTimeout(openNameModal, 400); return; }
    enterApp();
  } else if (selectedRole === 'accountant') {
    if (pin !== settings.accountantPin) { passwordFailureAlert(); return; }
    // First time login — ask phone number
    if (settings.accountantFirstLogin !== false) {
      showFirstLoginPhoneSetup('accountant');
      return;
    }
    session = { role: 'accountant' };
    addLog("Accountant session validated.");
    enterApp();
  } else {
    if (!selectedTeacherId) { showToast('Select an instructor context.'); return; }
    const teacher = teachers.find(t => t.id === selectedTeacherId);
    if (!teacher || pin !== teacher.pin) { passwordFailureAlert(); return; }
    session = { role: 'teacher', teacherId: teacher.id, teacherName: teacher.name };
    addLog(`Teacher logged in: [${teacher.name}]`);
    enterApp();
  }
}

function passwordFailureAlert() {
  document.getElementById('pin-error').textContent = 'Incorrect PIN. Please try again.';
  [0, 1, 2, 3].forEach(i => { document.getElementById('p' + i).value = ''; });
  document.getElementById('p0').focus();
}

function logout() {
  addLog(`Session logged out.`);
  session = null; selectedRole = null; selectedTeacherId = null;
  document.getElementById('app-header').style.display = 'none';
  document.getElementById('app-main').style.display = 'none';
  document.getElementById('mobile-nav').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('role-super-admin').classList.remove('selected');
  document.getElementById('role-accountant').classList.remove('selected');
  document.getElementById('role-teacher').classList.remove('selected');
  document.getElementById('teacher-select-wrap').style.display = 'none';
  document.getElementById('pin-wrap').style.display = 'none';
  document.getElementById('login-btn').style.display = 'none';
  if (pieChart) { pieChart.destroy(); pieChart = null; }
}

// ─── BULK UPLOAD (EXCEL) ───
function openBulkUploadModal(type) {
  bulkUploadType = type;
  document.getElementById('bulk-json-area').value = '';
  const hint = document.getElementById('bulk-schema-hint');

  if (type === 'teachers') {
    document.getElementById('bulk-upload-title').textContent = 'Upload Teachers List';
    hint.innerHTML = `Select an <b>.xlsx or .xls</b> Excel file with these columns:<br><br><code>name &nbsp; subject &nbsp; pin &nbsp; phone</code><br><br>Example row: <code>Prof. Smith | Physics | 7788 | 9876543210</code>`;
  } else {
    document.getElementById('bulk-upload-title').textContent = 'Upload Students List';
    hint.innerHTML = `Select an <b>.xlsx or .xls</b> Excel file with these columns:<br><br><code>name &nbsp; fatherName &nbsp; mobile &nbsp; plan &nbsp; fee &nbsp; joinDate</code><br><br>Plan values: <code>Monthly / Bi-Monthly / Quarterly / Half-Yearly / Yearly</code>`;
  }
  openModal('bulk-upload-modal');
}

function handleExcelUpload(evt) {
  const file = evt.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet);
      document.getElementById('bulk-json-area').value = JSON.stringify(rows, null, 2);
      showToast(`Loaded ${rows.length} rows from Excel file.`);
    } catch (err) {
      alert('Could not read Excel file. Please ensure it is a valid .xlsx or .xls file.');
    }
  };
  reader.readAsArrayBuffer(file);
}

function processBulkJSONSubmit() {
  const rawText = document.getElementById('bulk-json-area').value.trim();
  if (!rawText) { alert('Please upload an Excel file first.'); return; }

  try {
    const parsed = JSON.parse(rawText);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    let insertedCount = 0;

    if (bulkUploadType === 'teachers') {
      arr.forEach(item => {
        if (item.name && item.pin && String(item.pin).length === 4) {
          teachers.push({
            id: uid(),
            name: String(item.name).trim(),
            subject: String(item.subject || 'Faculty').trim(),
            pin: String(item.pin).trim(),
            phone: String(item.phone || '').replace(/\D/g,'').slice(-10),
            createdAt: new Date().toISOString()
          });
          insertedCount++;
        }
      });
      saveTeachers();
      renderTeachers();
      addLog(`Uploaded ${insertedCount} teacher records.`);
    } else {
      arr.forEach(item => {
        if (item.name && item.fatherName && String(item.mobile).length >= 10) {
          const planScheme = ['Monthly', 'Bi-Monthly', 'Quarterly', 'Half-Yearly', 'Yearly', 'Custom'].includes(item.plan) ? item.plan : 'Monthly';
          const joinDate = item.joinDate || today();
          members.push({
            id: uid(),
            name: String(item.name).trim(),
            fatherName: String(item.fatherName).trim(),
            mobile: String(item.mobile).replace(/\D/g,'').slice(-10),
            plan: planScheme,
            joinDate: joinDate,
            customDueDate: planScheme === 'Custom' ? (item.customDueDate || today()) : null,
            fee: Number(item.fee) || 0,
            paid: false,  // New students always start as unpaid/delinquent
            teacherId: null,
            createdAt: new Date().toISOString()
          });
          insertedCount++;
        }
      });
      saveMembers();
      renderDashboard();
      if (currentPage === 'all-students') renderAllStudents();
      addLog(`Uploaded ${insertedCount} student records.`);
    }

    closeModal('bulk-upload-modal');
    showToast(`Successfully added ${insertedCount} records.`);
  } catch (err) {
    alert('Could not read data. Please check the file format or JSON syntax.');
  }
}

// ─── ROUTING & VIEW ENGINE ───
function enterApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-header').style.display = 'block';
  document.getElementById('app-main').style.display = 'block';
  applyHeader(); buildNav(); showPage('dashboard');
}

function applyHeader() {
  document.getElementById('header-tuition-name').textContent = settings.tuitionName || 'TuitionMaster';
  document.getElementById('header-master-name').textContent = settings.masterName ? 'Master: ' + settings.masterName : '';
  document.getElementById('s-tuition-name').textContent = settings.tuitionName || '—';
  document.getElementById('s-master-name').textContent = settings.masterName || '—';

  const dot = document.getElementById('user-dot');
  const badge = document.getElementById('user-badge-label');
  dot.className = "user-badge-dot";

  if (session.role === 'super-admin') {
    dot.classList.add('admin'); badge.textContent = 'Super-Admin';
  } else if (session.role === 'accountant') {
    dot.classList.add('accountant'); badge.textContent = 'Accountant';
  } else {
    badge.textContent = session.teacherName;
  }
}

function buildNav() {
  const role = session.role;
  let desktopPages = [{ id: 'dashboard', label: 'Dashboard' }];

  if (role === 'super-admin') {
    desktopPages.push({ id: 'teachers', label: 'Teachers' }, { id: 'all-students', label: 'Students' }, { id: 'settings', label: 'Settings' });
    document.getElementById('header-add-btn').style.display = 'flex';
  } else if (role === 'accountant') {
    desktopPages.push({ id: 'all-students', label: 'Billing' }, { id: 'settings', label: 'Settings' });
    document.getElementById('header-add-btn').style.display = 'flex';
  } else {
    desktopPages.push({ id: 'members', label: 'My Students' });
    document.getElementById('header-add-btn').style.display = 'none';
  }

  document.getElementById('desktop-nav').innerHTML = desktopPages
    .map(p => `<button class="nav-tab" data-page="${p.id}" onclick="showPage('${p.id}')">${p.label}</button>`)
    .join('');

  let mobPages = [{ id: 'dashboard', icon: 'grid', label: 'Dashboard' }];
  if (role === 'super-admin') {
    mobPages.push({ id: 'teachers', icon: 'users', label: 'Teachers' }, { id: 'all-students', icon: 'list', label: 'Students' }, { id: 'settings', icon: 'settings', label: 'Settings' });
  } else if (role === 'accountant') {
    mobPages.push({ id: 'all-students', icon: 'list', label: 'Billing' }, { id: 'settings', icon: 'settings', label: 'Settings' });
  } else {
    mobPages.push({ id: 'members', icon: 'users', label: 'Students' });
  }

  const addBtn = (role === 'super-admin' || role === 'accountant')
    ? `<button class="mob-tab mob-add-tab" onclick="openAddMemberModal()"><svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" fill="none" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>`
    : '';

  const mobBtn = p => `<button class="mob-tab" data-page="${p.id}" onclick="showPage('${p.id}')"><svg viewBox="0 0 24 24">${SVG_ICONS[p.icon]}</svg>${p.label}</button>`;
  const inner = document.getElementById('mobile-nav-inner');

  if (role === 'teacher') {
    inner.innerHTML = mobPages.map(mobBtn).join('');
  } else {
    inner.innerHTML = mobPages.slice(0, 2).map(mobBtn).join('') + addBtn + mobPages.slice(2).map(mobBtn).join('');
  }
  document.getElementById('mobile-nav').style.display = 'block';
}

const SVG_ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="3" cy="18" r="1"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'
};

function showPage(page) {
  currentPage = page;
  ['dashboard', 'members', 'teachers', 'all-students', 'settings'].forEach(p => {
    const el = document.getElementById('page-' + p); if (el) el.style.display = 'none';
  });
  const target = document.getElementById('page-' + page);
  if (target) target.style.display = 'block';

  document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.page === page));
  document.querySelectorAll('.mob-tab[data-page]').forEach(t => t.classList.toggle('active', t.dataset.page === page));

  if (page === 'dashboard')    renderDashboard();
  if (page === 'members')      renderTable();
  if (page === 'teachers')     renderTeachers();
  if (page === 'all-students') { populateTeacherFilter(); renderAllStudents(); }
  if (page === 'settings') {
    document.getElementById('admin-power-tools-section').style.display = (session.role === 'super-admin') ? 'block' : 'none';
    renderAuditLogs(); applyHeader();
  }
}

function gotoMembers(status) {
  if (session.role === 'teacher') {
    showPage('members'); document.getElementById('filter-status').value = status; renderTable();
  } else {
    showPage('all-students'); document.getElementById('as-filter-status').value = status; renderAllStudents();
  }
}

// ─── GATEWAY / SMS SIMULATORS ───
function logGatewayActivity(title, logLines) {
  openModal('gateway-modal');
  document.getElementById('gateway-title').textContent = title;
  const target = document.getElementById('gateway-log-output');
  target.innerHTML = ''; let idx = 0;
  function printLine() {
    if (idx < logLines.length) {
      target.innerHTML += logLines[idx++] + '<br>';
      target.scrollTop = target.scrollHeight;
      setTimeout(printLine, 200);
    }
  }
  printLine();
}

function triggerWhatsAppReminder(studentId) {
  const m = members.find(x => x.id === studentId); if (!m) return;
  const lines = [
    `Sending WhatsApp reminder to parent of ${m.name}...`,
    `Mobile: +91 ${m.mobile}`,
    `Message: Fee of ₹${m.fee} is due. Please pay at the earliest.`,
    `Status: Message sent successfully.`
  ];
  logGatewayActivity(`WhatsApp Reminder Sent`, lines);
  addLog(`Sent WhatsApp reminder to parent of: ${m.name}`);
}

function openBulkSMSModal() {
  document.getElementById('sms-body').value = ''; openModal('sms-modal');
}

function sendBulkSMS() {
  const targetGroup = document.getElementById('sms-target').value;
  const msgBody = document.getElementById('sms-body').value.trim();
  if (!msgBody) { alert('Please type a message before sending.'); return; }

  let targets = (targetGroup === 'all') ? [...members] : members.filter(m => getStatus(m) === 'overdue');
  if (!targets.length) { showToast('No students found for selected group.'); return; }

  const lines = [
    `Sending SMS to ${targets.length} parents...`,
    `Message: "${msgBody}"`
  ];
  targets.forEach((t, i) => lines.push(`[${i+1}/${targets.length}] Sent to +91${t.mobile} (${t.name})`));
  lines.push(`All messages sent successfully.`);

  closeModal('sms-modal');
  logGatewayActivity(`Bulk SMS Sent`, lines);
  addLog(`Sent bulk SMS to ${targets.length} parents.`);
}

function dispatchReceiptNotification(m) {
  const lines = [
    `Sending payment receipt to: ${m.name}`,
    `Parent mobile: +91 ${m.mobile}`,
    `Amount paid: ₹${m.fee || 0}`,
    `Status: Receipt sent successfully.`
  ];
  logGatewayActivity('Payment Receipt Sent', lines);
}

// ─── UTILITIES ───
function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function initials(n) { return String(n || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function today() { return new Date().toISOString().split('T')[0]; }
function fmtDate(d) { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }

function getDueDate(m) {
  if (m.plan === 'Custom') return m.customDueDate ? new Date(m.customDueDate) : new Date(m.joinDate);
  const j = new Date(m.joinDate);
  return new Date(j.getTime() + (PLAN_DAYS[m.plan] || 30) * 86400000);
}

function getStatus(m) {
  if (m.paid) return 'paid';
  const diff = (getDueDate(m) - new Date()) / 86400000;
  if (diff < 0) return 'overdue';
  if (diff <= 3) return 'soon';
  return 'pending';
}

function statusLabel(s) { return { paid: '✓ Paid', overdue: '⚠ Overdue', soon: '🟠 Due Soon', pending: '⏳ Pending' }[s] || s; }
function myMembers() { return (session.role === 'teacher') ? members.filter(m => m.teacherId === session.teacherId) : members; }

// ─── DASHBOARD ───
function renderDashboard() {
  const ms = myMembers();
  const paid = ms.filter(m => getStatus(m) === 'paid').length;
  const soon = ms.filter(m => getStatus(m) === 'soon').length;
  const over = ms.filter(m => getStatus(m) === 'overdue').length;
  const pend = ms.filter(m => getStatus(m) === 'pending').length;
  const total = ms.length;

  document.getElementById('stats-row').innerHTML = `
    <div class="stat-card"><div class="stat-label">${session.role==='super-admin'?'Teachers':'Students'}</div><div class="stat-value b">${session.role==='super-admin'?teachers.length:total}</div></div>
    <div class="stat-card"><div class="stat-label">Paid</div><div class="stat-value g">${paid}</div></div>
    <div class="stat-card"><div class="stat-label">Due Soon</div><div class="stat-value o">${soon}</div></div>
    <div class="stat-card"><div class="stat-label">Overdue</div><div class="stat-value r">${over}</div></div>`;

  document.getElementById('leg-paid').textContent = paid;
  document.getElementById('leg-soon').textContent = soon;
  document.getElementById('leg-overdue').textContent = over;
  document.getElementById('leg-pending').textContent = pend;
  document.getElementById('pie-pct').textContent = total ? Math.round(paid / total * 100) + '%' : '—';

  renderPie(paid, soon, over, pend); renderUpcoming(ms);
}

function renderPie(paid, soon, over, pend) {
  const ctx = document.getElementById('pieChart').getContext('2d');
  if (pieChart) pieChart.destroy();
  if (!(paid + soon + over + pend)) return;
  const statusMap = ['paid', 'soon', 'overdue', 'pending'];
  pieChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Paid', 'Due Soon', 'Overdue', 'Pending'],
      datasets: [{ data: [paid, soon, over, pend], backgroundColor: ['#639922', '#EF9F27', '#E24B4A', '#B4B2A9'], borderWidth: 3 }]
    },
    options: {
      responsive: true, cutout: '65%',
      plugins: { legend: { display: false } },
      onClick: (evt, elements) => {
        if (elements && elements.length > 0) {
          gotoMembers(statusMap[elements[0].index]);
        }
      },
      onHover: (evt, elements) => {
        evt.native.target.style.cursor = elements.length ? 'pointer' : 'default';
      }
    }
  });
}

function renderUpcoming(ms) {
  const list = document.getElementById('upcoming-list');
  if (!ms.length) { list.innerHTML = '<div class="empty-state"><p>No students found.</p></div>'; return; }

  const sorted = [...ms].sort((a, b) => {
    const ord = { overdue: 0, soon: 1, pending: 2, paid: 3 };
    return (ord[getStatus(a)] || 0) - (ord[getStatus(b)] || 0) || getDueDate(a) - getDueDate(b);
  }).slice(0, 10);

  list.innerHTML = sorted.map(m => {
    const s = getStatus(m); const due = getDueDate(m);
    const cls = s === 'overdue' ? 'overdue' : s === 'soon' ? 'soon' : 'ok';
    const avCls = s === 'overdue' ? 'av-r' : s === 'soon' ? 'av-o' : 'av-g';
    const days = Math.ceil((due - new Date()) / 86400000);

    const badge = s === 'overdue' ? `<span class="upcoming-badge badge-overdue">Overdue</span>`
      : s === 'soon' ? `<span class="upcoming-badge badge-soon">${days}d left</span>`
      : s === 'paid' ? `<span class="upcoming-badge badge-ok">Paid</span>` : `<span class="upcoming-badge badge-gray">Upcoming</span>`;

    const commAction = (s === 'overdue' || s === 'soon') ? `
      <button class="comm-icon-btn" title="Send WhatsApp Reminder" onclick="event.stopPropagation(); triggerWhatsAppReminder('${m.id}')">
        <span style="color:#25D366; font-size:11px; font-weight:bold;">WA</span>
      </button>` : '';

    return `<div class="upcoming-item ${cls}">
      <div class="upcoming-avatar ${avCls}">${initials(m.name)}</div>
      <div style="flex:1;min-width:0">
        <div class="upcoming-name">${esc(m.name)}</div>
        <div class="upcoming-detail">${m.plan === 'Custom' ? 'Custom Date' : m.plan} · Due ${fmtDate(due)}</div>
      </div>
      <div class="upcoming-actions">${commAction}${badge}</div>
    </div>`;
  }).join('');
}

// ─── STUDENT FORM ───
function togglePlanDueOption() {
  const p = document.getElementById('f-plan').value;
  document.getElementById('custom-date-group').style.display = p === 'Custom' ? 'block' : 'none';
  document.getElementById('join-date-group').style.display = p === 'Custom' ? 'none' : 'block';
}

function renderTable() {
  const q = document.getElementById('search-input').value.toLowerCase();
  const fs = document.getElementById('filter-status').value;
  const fp = document.getElementById('filter-plan').value;

  let list = myMembers().filter(m => {
    const s = getStatus(m);
    if (q && !m.name.toLowerCase().includes(q) && !m.mobile.includes(q)) return false;
    if (fs !== 'all' && s !== fs) return false;
    if (fp !== 'all' && m.plan !== fp) return false;
    return true;
  });

  const tbody = document.getElementById('members-tbody');
  tbody.innerHTML = list.length ? list.map(m => memberRow(m)).join('') : `<tr><td colspan="6"><div class="empty-state"><p>No students found.</p></div></td></tr>`;
}

function populateTeacherFilter() {
  const sel = document.getElementById('as-filter-teacher');
  if (sel) sel.innerHTML = '<option value="all">All Teachers</option>' + teachers.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
}

function renderAllStudents() {
  const q = document.getElementById('as-search').value.toLowerCase();
  const ft = document.getElementById('as-filter-teacher').value;
  const fs = document.getElementById('as-filter-status').value;

  let list = members.filter(m => {
    const s = getStatus(m);
    if (q && !m.name.toLowerCase().includes(q) && !m.mobile.includes(q)) return false;
    if (ft !== 'all' && m.teacherId !== ft) return false;
    if (fs !== 'all' && s !== fs) return false;
    return true;
  });

  const tbody = document.getElementById('all-students-tbody');
  tbody.innerHTML = list.length ? list.map(m => adminStudentRow(m)).join('') : `<tr><td colspan="7"><div class="empty-state"><p>No students found.</p></div></td></tr>`;
}

function memberRow(m) {
  const s = getStatus(m); const due = getDueDate(m);
  const dueCls = s === 'overdue' ? 'due-overdue' : s === 'soon' ? 'due-soon' : 'due-ok';
  const pillCls = s === 'paid' ? 'pill-paid' : s === 'overdue' ? 'pill-overdue' : s === 'soon' ? 'pill-soon' : 'pill-pending';

  const actions = session.role === 'teacher' ? `<span style="color:var(--text3); font-size:11px;">View only</span>` : `
    <button class="action-btn btn-edit" onclick="openEditMemberModal('${m.id}')">Edit</button>
    <button class="action-btn btn-del" onclick="askDeleteMember('${m.id}')">Remove</button>`;

  return `<tr>
    <td><div class="m-name">${esc(m.name)}</div><div class="m-sub">Father: ${esc(m.fatherName)}</div></td>
    <td class="m-sub">${esc(m.mobile)}</td>
    <td><span class="plan-badge">${m.plan}</span></td>
    <td><span class="due-cell ${dueCls}">${fmtDate(due)}</span></td>
    <td><button class="status-pill ${pillCls}" onclick="togglePaid('${m.id}')">${statusLabel(s)}</button></td>
    <td style="display:flex;gap:6px">${actions}</td>
  </tr>`;
}

function adminStudentRow(m) {
  const s = getStatus(m); const due = getDueDate(m);
  const dueCls = s === 'overdue' ? 'due-overdue' : s === 'soon' ? 'due-soon' : 'due-ok';
  const pillCls = s === 'paid' ? 'pill-paid' : s === 'overdue' ? 'pill-overdue' : s === 'soon' ? 'pill-soon' : 'pill-pending';
  const tname = teachers.find(t => t.id === m.teacherId)?.name || 'Unassigned';
  const deleteBtn = (session.role === 'super-admin') ? `<button class="action-btn btn-del" onclick="askDeleteMember('${m.id}')">Remove</button>` : '';

  return `<tr>
    <td><div class="m-name">${esc(m.name)}</div><div class="m-sub">Parent: ${esc(m.fatherName)}</div></td>
    <td><span style="font-size:12px; font-weight:600; color:var(--blue)">${esc(tname)}</span></td>
    <td class="m-sub">${esc(m.mobile)}</td>
    <td><span class="plan-badge">${m.plan}</span></td>
    <td><span class="due-cell ${dueCls}">${fmtDate(due)}</span></td>
    <td><button class="status-pill ${pillCls}" onclick="togglePaid('${m.id}')">${statusLabel(s)}</button></td>
    <td style="display:flex;gap:6px">
      <button class="action-btn btn-edit" onclick="openEditMemberModal('${m.id}')">Edit</button>
      ${deleteBtn}
    </td>
  </tr>`;
}

function togglePaid(id) {
  const m = members.find(x => x.id === id); if (!m) return;
  m.paid = !m.paid;

  // When marking as paid, calculate next due date based on payment frequency
  if (m.paid && m.plan !== 'Custom') {
    const nextDue = new Date();
    nextDue.setDate(nextDue.getDate() + (PLAN_DAYS[m.plan] || 30));
    m.joinDate = new Date().toISOString().split('T')[0]; // reset cycle from today
    addLog(`Payment received for ${m.name}. Next due date: ${fmtDate(nextDue)}.`);
    dispatchReceiptNotification(m);
  } else if (m.paid) {
    addLog(`Payment marked for ${m.name}.`);
    dispatchReceiptNotification(m);
  } else {
    addLog(`Payment status reversed for: ${m.name}`);
  }

  saveMembers();
  renderDashboard();
  if (currentPage === 'members') renderTable();
  if (currentPage === 'all-students') renderAllStudents();
  showToast(m.paid ? 'Marked as paid. Receipt sent.' : 'Marked as unpaid.');
}

function openAddMemberModal() {
  if (session.role === 'teacher') return;
  editingMemberId = null;
  document.getElementById('member-modal-title').textContent = 'Add New Student';
  document.getElementById('f-name').value = ''; document.getElementById('f-father').value = '';
  document.getElementById('f-mobile').value = ''; document.getElementById('f-plan').value = '';
  document.getElementById('f-joindate').value = today(); document.getElementById('f-customdue').value = today();
  document.getElementById('f-fee').value = '';
  // New students always start as overdue (amount to be paid first)
  document.getElementById('f-status').value = 'pending';
  togglePlanDueOption(); buildTeacherDropdownInModal(null); openModal('member-modal');
}

function openEditMemberModal(id) {
  const m = members.find(x => x.id === id); if (!m) return;
  editingMemberId = id;
  document.getElementById('member-modal-title').textContent = 'Edit Student Details';
  document.getElementById('f-name').value = m.name; document.getElementById('f-father').value = m.fatherName;
  document.getElementById('f-mobile').value = m.mobile; document.getElementById('f-plan').value = m.plan;
  document.getElementById('f-joindate').value = m.joinDate || today();
  document.getElementById('f-customdue').value = m.customDueDate || today();
  document.getElementById('f-fee').value = m.fee || '';
  document.getElementById('f-status').value = m.paid ? 'paid' : 'pending';

  togglePlanDueOption(); buildTeacherDropdownInModal(m.teacherId); openModal('member-modal');
}

function buildTeacherDropdownInModal(currentTeacherId) {
  const wrap = document.getElementById('f-teacher-wrap'); wrap.style.display = 'flex';
  const sel = document.getElementById('f-teacher');
  sel.innerHTML = '<option value="">— Unassigned —</option>' + teachers.map(t => `<option value="${t.id}" ${t.id === currentTeacherId ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
}

function saveMember() {
  const name = document.getElementById('f-name').value.trim();
  const father = document.getElementById('f-father').value.trim();
  const mobile = document.getElementById('f-mobile').value.trim();
  const plan = document.getElementById('f-plan').value;
  const joinDate = document.getElementById('f-joindate').value;
  const customDue = document.getElementById('f-customdue').value;
  const fee = document.getElementById('f-fee').value;
  const statusVal = document.getElementById('f-status').value;
  const teacherId = document.getElementById('f-teacher').value || null;

  if (!name || !father || mobile.length < 10 || !plan) { alert('Please fill in all required fields.'); return; }

  if (editingMemberId) {
    const m = members.find(x => x.id === editingMemberId);
    const paid = statusVal === 'paid';
    Object.assign(m, { name, fatherName: father, mobile, plan, joinDate, customDueDate: plan === 'Custom' ? customDue : null, fee, paid, teacherId });
    addLog(`Updated student record: ${name}`);
  } else {
    // New students are always added as unpaid (delinquent — amount to be paid first)
    members.push({ id: uid(), name, fatherName: father, mobile, plan, joinDate, customDueDate: plan === 'Custom' ? customDue : null, fee, paid: false, teacherId, createdAt: new Date().toISOString() });
    addLog(`Added new student: ${name} (fee due from ${joinDate})`);
  }

  saveMembers(); closeModal('member-modal'); renderDashboard();
  if (currentPage === 'members') renderTable();
  if (currentPage === 'all-students') renderAllStudents();
}

function askDeleteMember(id) {
  if (session.role !== 'super-admin') { showToast('Only Super-Admin can delete records.'); return; }
  const m = members.find(x => x.id === id); if (!m) return;
  showConfirm(`Remove student "${m.name}" permanently?`, () => {
    members = members.filter(x => x.id !== id); saveMembers();
    addLog(`Deleted student: [${m.name}]`);
    renderDashboard(); if (currentPage === 'all-students') renderAllStudents();
    showToast('Student removed.');
  });
}

function triggerRollover() {
  if (session.role !== 'super-admin') return;
  showConfirm("Start new Academic Year? This will reset all payment statuses and advance dates by one year.", () => {
    members.forEach(m => {
      m.paid = false;
      const currentYear = new Date(m.joinDate || today()).getFullYear();
      m.joinDate = `${currentYear + 1}-06-01`;
      if (m.customDueDate) {
        const cYear = new Date(m.customDueDate).getFullYear();
        m.customDueDate = `${cYear + 1}-06-01`;
      }
    });
    saveMembers(); addLog("Academic Year Rollover completed.");
    renderDashboard(); showToast("New academic year started.");
  });
}

// ─── CSV EXPORTS ───
function exportCSV() {
  const rows = [['Name', 'Parent/Guardian', 'Mobile', 'Plan', 'Join Date', 'Fee (₹)', 'Status']];
  myMembers().forEach(m => rows.push([m.name, m.fatherName, m.mobile, m.plan, m.joinDate, m.fee||'', statusLabel(getStatus(m))]));
  dlCSV(rows, 'My_Students');
}
function exportAllCSV() {
  const rows = [['Name', 'Parent', 'Mobile', 'Plan', 'Due Date', 'Fee (₹)', 'Status']];
  members.forEach(m => rows.push([m.name, m.fatherName, m.mobile, m.plan, fmtDate(getDueDate(m)), m.fee||'', statusLabel(getStatus(m))]));
  dlCSV(rows, 'All_Students');
}
function dlCSV(rows, name) {
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = name + '.csv'; a.click();
}

// ─── TEACHERS ───
function renderTeachers() {
  const grid = document.getElementById('teachers-grid');
  if (!teachers.length) { grid.innerHTML = '<div class="empty-state"><p>No teachers added yet.</p></div>'; return; }
  grid.innerHTML = teachers.map(t => {
    const tm = members.filter(m => m.teacherId === t.id);
    return `<div class="teacher-card">
      <div class="teacher-card-top">
        <div class="teacher-avatar-lg">${initials(t.name)}</div>
        <div>
          <div class="teacher-card-name">${esc(t.name)}</div>
          <div class="teacher-card-sub">${esc(t.subject || 'Teacher')}</div>
          ${t.phone ? `<div class="teacher-card-sub">📞 ${esc(t.phone)}</div>` : ''}
        </div>
      </div>
      <div class="teacher-stats"><span class="tstat tstat-total">${tm.length} students</span></div>
      <div class="teacher-card-actions">
        <button class="tc-btn tc-btn-view" onclick="viewTeacherStudents('${t.id}')">View Students</button>
        <button class="tc-btn tc-btn-edit" onclick="openEditTeacherModal('${t.id}')">Edit</button>
        <button class="tc-btn tc-btn-del" onclick="askDeleteTeacher('${t.id}')">Remove</button>
      </div>
    </div>`;
  }).join('');
}

function viewTeacherStudents(tid) {
  showPage('all-students'); populateTeacherFilter(); document.getElementById('as-filter-teacher').value = tid; renderAllStudents();
}

let editingTeacherId = null;

function openAddTeacherModal() {
  if (session.role !== 'super-admin') return;
  editingTeacherId = null;
  document.getElementById('teacher-modal-title').textContent = 'Add New Teacher';
  document.getElementById('t-name').value = '';
  document.getElementById('t-subject').value = '';
  document.getElementById('t-pin').value = '';
  document.getElementById('t-phone').value = '';
  document.getElementById('t-pin-group').style.display = 'block';
  openModal('teacher-modal');
}

function openEditTeacherModal(id) {
  if (session.role !== 'super-admin') return;
  const t = teachers.find(x => x.id === id); if (!t) return;
  editingTeacherId = id;
  document.getElementById('teacher-modal-title').textContent = 'Edit Teacher Details';
  document.getElementById('t-name').value = t.name;
  document.getElementById('t-subject').value = t.subject || '';
  document.getElementById('t-pin').value = '';
  document.getElementById('t-phone').value = t.phone || '';
  document.getElementById('t-pin-group').style.display = 'block';
  openModal('teacher-modal');
}

function saveTeacher() {
  const name = document.getElementById('t-name').value.trim();
  const subject = document.getElementById('t-subject').value.trim();
  const pin = document.getElementById('t-pin').value.trim();
  const phone = document.getElementById('t-phone').value.trim();

  if (!name) { alert('Please enter the teacher name.'); return; }
  if (phone.length !== 10 || !/^\d{10}$/.test(phone)) { alert('Please enter a valid 10-digit phone number.'); return; }

  if (editingTeacherId) {
    const t = teachers.find(x => x.id === editingTeacherId);
    t.name = name; t.subject = subject; t.phone = phone;
    if (pin) {
      if (pin.length !== 4 || !/^\d{4}$/.test(pin)) { alert('PIN must be exactly 4 digits.'); return; }
      t.pin = pin;
    }
    saveTeachers(); addLog(`Updated teacher: ${name}`);
  } else {
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) { alert('PIN must be exactly 4 digits.'); return; }
    teachers.push({ id: uid(), name, subject, pin, phone, createdAt: new Date().toISOString() });
    saveTeachers(); addLog(`Added new teacher: ${name}`);
  }
  closeModal('teacher-modal'); renderTeachers();
}

function askDeleteTeacher(id) {
  if (session.role !== 'super-admin') return; const t = teachers.find(x => x.id === id);
  showConfirm(`Remove teacher "${t?.name}"? Their students will become unassigned.`, () => {
    teachers = teachers.filter(x => x.id !== id); saveTeachers();
    addLog(`Removed teacher: [${t?.name}]`);
    renderTeachers();
  });
}

// ─── SETTINGS ───
function openNameModal() {
  if (session.role !== 'super-admin') return;
  document.getElementById('n-tuition').value = settings.tuitionName || '';
  document.getElementById('n-master').value = settings.masterName || ''; openModal('name-modal');
}

function saveTuitionName() {
  const t = document.getElementById('n-tuition').value.trim();
  const m = document.getElementById('n-master').value.trim(); if (!t || !m) return;
  settings.tuitionName = t; settings.masterName = m; saveSettings();
  addLog(`Updated centre name: [${t}] managed by [${m}]`);
  applyHeader(); closeModal('name-modal');
}

function openChangePinModal(targetRole) {
  targetChangingPinRole = targetRole;
  document.getElementById('pin-modal-title').textContent = `Change ${targetRole === 'super-admin' ? 'Super-Admin' : 'Accountant'} PIN`;
  document.getElementById('cp-current').value = ''; document.getElementById('cp-new').value = ''; document.getElementById('cp-confirm').value = '';
  openModal('pin-modal');
}

function savePin() {
  const cur = document.getElementById('cp-current').value;
  const nw = document.getElementById('cp-new').value;
  const cf = document.getElementById('cp-confirm').value;

  const validCurrent = targetChangingPinRole === 'super-admin' ? settings.adminPin : settings.accountantPin;
  if (cur !== validCurrent) { alert('Current PIN is incorrect.'); return; }
  if (nw.length !== 4 || isNaN(nw) || nw !== cf) { alert('New PIN must be 4 digits and both entries must match.'); return; }

  if (targetChangingPinRole === 'super-admin') { settings.adminPin = nw; } else { settings.accountantPin = nw; }
  saveSettings(); addLog(`PIN changed for: [${targetChangingPinRole}]`);
  closeModal('pin-modal'); showToast('PIN updated successfully.');
}

function showToast(msg) {
  const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function showConfirm(msg, cb) {
  document.getElementById('confirm-msg').textContent = msg;
  document.getElementById('confirm-ok-btn').onclick = () => { cb(); closeModal('confirm-modal'); };
  openModal('confirm-modal');
}
