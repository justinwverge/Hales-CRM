/* =====================================================================
 * HALE'S CRM — web page logic
 * Screens by role:
 *   Tech:   Today, My Jobs (job checklist: service note, photos, quote, complete)
 *   Office: Today, Jobs, FieldEdge queue, Reviews queue, Tasks, Customers, Leads, Pricing
 *   Admin:  everything + Reports + Admin
 * All buttons use data-act="..." (see ACTS near the bottom). No inline scripts.
 * ===================================================================== */
(function () {
  const CFG = window.CRM_CONFIG;
  const N = window.HalesNotes;
  let TOKEN = sessionStorage.getItem('crm_token') || '';
  let ME = null, L = null, VIEW = 'today', CTX = {};
  let lastActive = Date.now();

  // ---------------- helpers ----------------
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = v => (v === '' || v === null || v === undefined || isNaN(v)) ? '—' : '$' + Math.round(Number(v)).toLocaleString();
  const today = () => new Date().toLocaleDateString('en-CA');
  const nameOf = e => { if (!e) return 'Unassigned'; const u = (L?.users || []).find(x => x.email === e); return u ? u.name : e.split('@')[0]; };
  const opts = (arr, sel) => arr.map(v => `<option ${v === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
  const userOpts = (sel, role, allLabel) => (allLabel ? `<option value="All">${allLabel}</option>` : '<option value="">Unassigned</option>') +
    (L?.users || []).filter(u => !role || u.role === role || (role === 'Office' && u.role === 'Admin'))
      .map(u => `<option value="${esc(u.email)}" ${u.email === sel ? 'selected' : ''}>${esc(u.name)}</option>`).join('');
  const isOffice = () => ME && ME.role !== 'Tech';
  const isAdmin = () => ME && ME.role === 'Admin';
  const cls = s => String(s || '').replace(/\s+/g, '');

  function toast(msg, err) { const t = $('toast'); t.textContent = msg; t.className = err ? 'err' : ''; t.style.display = 'block'; clearTimeout(t._h); t._h = setTimeout(() => t.style.display = 'none', 4000); }
  function modal(html) { $('modalBox').innerHTML = html; $('modal').classList.add('on'); }
  function closeModal() { $('modal').classList.remove('on'); }
  async function copy(text, label) { try { await navigator.clipboard.writeText(text); toast((label || 'Copied') + ' — paste it into FieldEdge'); } catch (e) { toast('Copy failed. Select and copy by hand.', true); } }

  // ---------------- API ----------------
  async function api(fn, ...args) {
    if (!TOKEN) { showLogin(); throw new Error('Please sign in.'); }
    lastActive = Date.now();
    const res = await fetch(CFG.API_URL, { method: 'POST', body: JSON.stringify({ token: TOKEN, fn, args }) });
    const data = await res.json();
    if (!data.ok) {
      if (data.auth) { TOKEN = ''; sessionStorage.removeItem('crm_token'); showLogin(data.error); }
      throw new Error(data.error);
    }
    return data.result;
  }
  async function run(btn, fn) {
    if (btn) btn.disabled = true;
    try { return await fn(); } catch (e) { toast(e.message, true); } finally { if (btn) btn.disabled = false; }
  }

  // ---------------- login ----------------
  function showLogin(msg) { $('app').classList.add('hide'); $('login').classList.remove('hide'); $('loginMsg').textContent = msg || ''; renderGoogleButton(); }
  function renderGoogleButton() {
    if (!window.google?.accounts?.id) return setTimeout(renderGoogleButton, 200);
    google.accounts.id.initialize({ client_id: CFG.GOOGLE_CLIENT_ID, callback: r => { TOKEN = r.credential; sessionStorage.setItem('crm_token', TOKEN); start(); }, auto_select: true, ux_mode: 'popup' });
    google.accounts.id.renderButton($('gbtn'), { theme: 'filled_blue', size: 'large', text: 'signin_with', shape: 'pill' });
    google.accounts.id.prompt();
  }
  function signOut(msg) { TOKEN = ''; sessionStorage.removeItem('crm_token'); window.google?.accounts?.id?.disableAutoSelect(); showLogin(msg || 'Signed out.'); }
  ['click', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, () => lastActive = Date.now(), { passive: true }));
  setInterval(() => { if (TOKEN && Date.now() - lastActive > (CFG.IDLE_MINUTES || 60) * 60000) signOut('Signed out after inactivity.'); }, 30000);

  async function start() {
    try {
      const b = await api('boot');
      ME = b.user; L = b.lists;
      $('login').classList.add('hide'); $('app').classList.remove('hide');
      $('whoName').textContent = ME.name + ' · ' + ME.role;
      buildNav(); go('today');
    } catch (e) { if (!/sign in/i.test(e.message)) showLogin(e.message); }
  }

  // ---------------- navigation ----------------
  const NAV = [
    ['today', 'Today', ['Admin', 'Office', 'Tech']], ['jobs', null, ['Admin', 'Office', 'Tech']], ['fe', 'FieldEdge entry', ['Admin', 'Office']],
    ['reviews', 'Reviews', ['Admin', 'Office']], ['tasks', 'Tasks', ['Admin', 'Office', 'Tech']], ['customers', 'Customers', ['Admin', 'Office']],
    ['leads', 'Leads', ['Admin', 'Office']], ['pricing', 'Pricing', ['Admin', 'Office']], ['reports', 'Reports', ['Admin']], ['admin', 'Admin', ['Admin']]
  ];
  function buildNav() {
    $('nav').innerHTML = NAV.filter(n => n[2].includes(ME.role))
      .map(n => `<button data-act="nav" data-v="${n[0]}" id="nav_${n[0]}">${n[1] || (ME.role === 'Tech' ? 'My jobs' : 'Jobs')}<span class="badge hide" id="badge_${n[0]}"></span></button>`).join('');
  }
  function setBadge(v, n) { const b = $('badge_' + v); if (b) { b.textContent = n; b.classList.toggle('hide', !n); } }
  function go(v, ctx) {
    VIEW = v; CTX = ctx || {};
    document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === (v === 'job' ? 'jobs' : v)));
    $('main').innerHTML = '<div class="loading">Loading…</div>';
    window.scrollTo(0, 0);
    (VIEWS[v] || VIEWS.today)();
  }
  const refresh = () => go(VIEW, CTX);

  // ================= VIEWS =================
  const VIEWS = {};

  // ---------- TODAY ----------
  VIEWS.today = () => run(null, async () => {
    const d = await api('getToday'); const c = d.counts;
    if (isOffice()) { setBadge('fe', c.feWaiting); setBadge('reviews', c.reviewsPending); }
    const tiles = ME.role === 'Tech'
      ? [['My open jobs', c.myJobs], ['My tasks', c.myOpen], ['Overdue', c.overdue, 1], ['Done today', c.doneToday]]
      : [['My open', c.myOpen], ['Overdue', c.overdue, 1], ['Team open', c.teamOpen], ['FieldEdge to enter', c.feWaiting, 1], ['Reviews to approve', c.reviewsPending, 1], ['New leads', c.newLeads, 1], ['Done today', c.doneToday], ['Not done today', c.notDoneToday, 1]];
    $('main').innerHTML = `<div class="row"><h2>Today</h2><button class="btn navy sm" data-act="newTask">+ Task</button></div>
      <div class="tiles">${tiles.map(([l, n, a]) => `<div class="tile ${a && n ? 'alert' : ''}"><div class="n">${n || 0}</div><div class="l">${l}</div></div>`).join('')}</div>
      ${d.myJobs.length ? `<h3>My jobs</h3>${d.myJobs.map(jobCard).join('')}` : ''}
      ${isOffice() ? `<div class="bar"><select id="todayScope"><option value="mine">My tasks + unassigned</option><option value="all">Whole team</option></select></div>` : '<h3>My tasks</h3>'}
      <div id="todayOpen"></div><h3>Finished today</h3><div id="todayDone"></div>`;
    const render = () => {
      const scope = $('todayScope')?.value || 'mine';
      const list = d.open.filter(t => scope === 'all' || !t['Assigned To'] || t['Assigned To'] === ME.email);
      $('todayOpen').innerHTML = list.length ? list.map(t => taskCard(t)).join('') : '<div class="card">All caught up.</div>';
    };
    render(); if ($('todayScope')) $('todayScope').onchange = render;
    $('todayDone').innerHTML = d.doneToday.length ? d.doneToday.map(t => taskCard(t, false)).join('') : '<div class="meta">Nothing yet.</div>';
  });

  function taskCard(t, actions = true) {
    const overdue = t.Status === 'Open' && t['Due Date'] < today();
    return `<div class="card"><div class="row"><div class="title">${esc(t.Title)}</div>
      <div>${overdue ? '<span class="pill overdue">OVERDUE</span> ' : ''}<span class="pill ${esc(t.Priority)}">${esc(t.Priority)}</span> <span class="pill ${cls(t.Status)}">${esc(t.Status)}</span></div></div>
      <div class="meta">Due ${esc(t['Due Date'])} · ${esc(t.Type)} · ${esc(nameOf(t['Assigned To']))}${t['Customer Name'] ? ' · <b>' + esc(t['Customer Name']) + '</b>' : ''}${t['Job ID'] ? ` · <a data-act="openJob" data-id="${esc(t['Job ID'])}">open job</a>` : ''}</div>
      ${t.Status !== 'Open' ? `<div class="meta">${esc(t.Status)} by ${esc(nameOf(t['Completed By']))} at ${esc(t['Completed At'])}${t['Result Note'] ? ': ' + esc(t['Result Note']) : ''}</div>` : ''}
      ${actions && t.Status === 'Open' ? `<div class="bar" style="margin-bottom:0"><input id="note_${esc(t.ID)}" placeholder="Note (required if not done)">
        <button class="btn green sm" data-act="taskDone" data-id="${esc(t.ID)}">Done</button>
        <button class="btn sm" data-act="taskNotDone" data-id="${esc(t.ID)}">Not done</button>
        ${isOffice() ? `<button class="btn ghost sm" data-act="taskReassign" data-id="${esc(t.ID)}" data-who="${esc(t['Assigned To'])}" data-due="${esc(t['Due Date'])}">Reassign</button>` : ''}</div>` : ''}
      ${actions && t.Status !== 'Open' ? `<div class="bar" style="margin-bottom:0"><button class="btn ghost sm" data-act="taskReopen" data-id="${esc(t.ID)}">Reopen</button></div>` : ''}</div>`;
  }

  // ---------- TASKS ----------
  VIEWS.tasks = () => {
    $('main').innerHTML = `<div class="row"><h2>Tasks</h2><button class="btn navy sm" data-act="newTask">+ Task</button></div>
      <div class="bar"><select id="tStatus"><option>All</option><option selected>Open</option><option>Done</option><option>Not Done</option></select>
      ${isOffice() ? `<select id="tWho">${userOpts('All', null, 'Everyone')}<option value="Unassigned">Unassigned</option></select>` : ''}
      <input type="date" id="tFrom"><input type="date" id="tTo"><button class="btn ghost sm" data-act="loadTasks">Filter</button></div><div id="taskList"></div>`;
    ACTS.loadTasks();
  };

  // ---------- JOBS ----------
  function jobCard(j) {
    return `<div class="card clickable" data-act="openJob" data-id="${esc(j.ID)}"><div class="row"><div class="title">${esc(j.customer)} <span class="meta">FE ${esc(j.fe)}</span></div>
      <div><span class="pill ${cls(j.status)}">${esc(j.status)}</span>${j.feStatus ? ` <span class="pill ${cls(j.feStatus)}">FE: ${esc(j.feStatus)}</span>` : ''}</div></div>
      <div class="meta">${esc(j.date)} · ${esc(j.type)} · ${esc(nameOf(j.tech))} · ${esc(j.address || '')} · ${j.photoCount} photos${j.review ? ' · Review: ' + esc(j.review) : ''}</div></div>`;
  }
  VIEWS.jobs = () => {
    $('main').innerHTML = `<div class="row"><h2>${ME.role === 'Tech' ? 'My jobs' : 'Jobs'}</h2><button class="btn navy sm" data-act="newJob">+ Job</button></div>
      <div class="bar"><select id="jStatus"><option value="Open" selected>Open</option><option>Complete</option><option>All</option></select>
      ${isOffice() ? `<select id="jTech">${userOpts('All', 'Tech', 'All techs')}</select>` : ''}<button class="btn ghost sm" data-act="loadJobs">Filter</button></div><div id="jobList"></div>`;
    ACTS.loadJobs();
  };

  // ---------- JOB DETAIL (the tech's checklist) ----------
  let JOB = null, NOTE = null, TOUCHED = {};
  VIEWS.job = () => run(null, async () => {
    JOB = await api('getJob', CTX.id);
    NOTE = Object.assign(N.noteDefaults(), JOB.formData || {});
    TOUCHED = JOB.formData ? { in_coil: true, out_ref_mode: true } : {};
    const done = JOB.Status === 'Complete';
    const e = JOB.reviewEligibility;
    $('main').innerHTML = `
      <div class="row"><h2>${esc(JOB['Customer Name'])}</h2><button class="btn ghost sm" data-act="nav" data-v="jobs">← Jobs</button></div>
      <div class="card"><div class="row"><div><div class="title">FieldEdge job ${esc(JOB['FieldEdge Job #'])}</div>
        <div class="meta">${esc(JOB.Date)} · ${esc(JOB['Job Type'])} · Tech: ${esc(nameOf(JOB['Assigned Tech']))}</div>
        <div class="meta">${JOB.Address ? `<a target="_blank" rel="noopener" href="https://maps.google.com/?q=${encodeURIComponent(JOB.Address)}">${esc(JOB.Address)}</a> · ` : ''}${JOB.Phone ? `<a href="tel:${esc(JOB.Phone)}">${esc(JOB.Phone)}</a>` : ''}</div></div>
        <div style="text-align:right"><span class="pill ${cls(JOB.Status)}">${esc(JOB.Status)}</span><br>
        ${JOB.customer ? `<span class="meta">${esc(JOB.customer.Type)} · ${esc(JOB.customer.Tier)} pricing</span><br>` : ''}
        <span class="meta">Review text: ${e.eligible ? '<span class="ok">eligible</span>' : 'excluded (' + esc(e.reason) + ')'}</span></div></div>
        ${done ? `<div class="meta" style="margin-top:8px">Completed by ${esc(nameOf(JOB['Completed By']))} at ${esc(JOB['Completed At'])} · Review: ${esc(JOB['Review Decision'])} · FieldEdge: ${esc(JOB['FE Status'])} ${esc(JOB['FE Quote #'] || '')}</div>` : ''}
        ${isOffice() && !done ? `<div class="bar"><button class="btn ghost sm" data-act="editJob">Edit / reassign</button></div>` : ''}</div>

      <div class="card"><div class="row"><strong>Procedure</strong>
        <div class="bar" style="margin:0"><select id="pbName">${opts(L.playbooks)}</select><button class="btn ghost sm" data-act="startPlaybook">Start</button></div></div>
        <div class="meta">Starting a procedure creates a checklist of tasks for you and the office.</div></div>

      <div class="card section"><h3 style="margin-top:0">1. Service note</h3><div id="noteForm"></div>
        <h3>Preview (FieldEdge format)</h3><div class="note" id="notePreview"></div>
        <div class="bar"><button class="btn ghost sm" data-act="copyNote">Copy note</button></div>
        <label>Extra notes (anything the form doesn't cover)</label><textarea id="extraNotes" ${done ? 'disabled' : ''}>${esc(JOB['Extra Notes'])}</textarea>
        <label>Recommendations for the customer</label><textarea id="recs" ${done ? 'disabled' : ''}>${esc(JOB.Recommendations)}</textarea></div>

      <div class="card section"><h3 style="margin-top:0">2. Photos</h3><div class="meta">Required photos are marked <span class="req">*</span>. Photos are saved privately in Drive.</div>
        <div id="photoList"></div></div>

      <div class="card section"><h3 style="margin-top:0">3. Quote (if any)</h3>
        <div class="meta">Price each line from the FieldEdge pricebook. Use the price check for this customer's tier.</div>
        <div class="bar"><input id="pcBook" type="number" placeholder="Book price $"><button class="btn ghost sm" data-act="jobPrice">Their price</button><span id="pcOut" class="meta"></span></div>
        <div id="qLines"></div>${done ? '' : '<button class="btn ghost sm" data-act="addQLine">+ Line</button>'}
        <div class="meta" style="margin-top:8px">Total: <b id="qTotal"></b></div></div>

      ${done ? '' : `<div class="bar"><button class="btn navy" data-act="saveJob">Save progress</button><button class="btn green" data-act="completeJobOpen">Complete job</button></div>`}`;
    renderNoteForm(); renderPhotos(JOB.photos); renderQLines(JOB.quoteLines || []);
  });

  function fieldHTML(f) {
    if (f.show && !f.show(NOTE)) return '';
    const dis = JOB.Status === 'Complete' ? 'disabled' : '';
    if (f.type === 'check') return `<label class="chk"><input type="checkbox" data-nf="${f.id}" ${NOTE[f.id] ? 'checked' : ''} ${dis}> ${esc(f.label)}</label>`;
    if (f.type === 'select') return `<div><label>${esc(f.label)}</label><select data-nf="${f.id}" ${dis}>${f.options.map(o => `<option value="${esc(o.value)}" ${String(NOTE[f.id]) === String(o.value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></div>`;
    return `<div><label>${esc(f.label)}</label><input type="${f.type === 'number' ? 'number' : 'text'}" data-nf="${f.id}" value="${esc(NOTE[f.id])}" ${dis}></div>`;
  }
  function renderNoteForm() {
    const F = N.NOTE_FIELDS;
    let html = `<div class="grid2">${F.header.map(fieldHTML).join('')}</div>`;
    if (NOTE.system_type === 'mini split') {
      html += `<h3>Outdoor</h3><div class="grid2">${F.miniOutdoor.map(fieldHTML).join('')}</div>`;
      for (let i = 1; i <= (parseInt(NOTE.ms_indoor_count, 10) || 1); i++) html += `<h3>Indoor head ${i}</h3><div class="grid2">${F.miniIndoor(i).map(fieldHTML).join('')}</div>`;
    } else if (NOTE.system_type !== 'package unit') {
      html += `<h3>Indoor</h3><div class="grid2">${F.indoor.map(fieldHTML).join('')}</div>`;
      if (!N.isOutdoorHidden(NOTE)) html += `<h3>Outdoor</h3><div class="grid2">${F.outdoor.map(fieldHTML).join('')}</div>`;
    }
    $('noteForm').innerHTML = html;
    $('notePreview').textContent = N.buildServiceNote(NOTE);
  }
  function renderPhotos(photos) {
    JOB.photos = photos;
    $('photoList').innerHTML = L.photoTypes.map(p => {
      const n = photos.filter(x => x.key === p.key).length;
      return `<div class="photo-row"><div>${esc(p.label)} ${p.required ? '<span class="req">*</span>' : ''}<div class="meta">${n ? `<span class="ok">✓ ${n} uploaded</span>` : (p.required ? 'needed' : 'optional')}</div></div>
        ${JOB.Status === 'Complete' ? '' : `<span class="btn ghost sm filebtn">${n ? 'Add another' : 'Take photo'}<input type="file" accept="image/*" capture="environment" data-photo="${esc(p.key)}"></span>`}</div>`;
    }).join('');
  }
  function renderQLines(lines) {
    const dis = JOB.Status === 'Complete' ? 'disabled' : '';
    $('qLines').innerHTML = (lines.length ? lines : []).map((l, i) => `<div class="qline"><input data-q="desc" value="${esc(l.desc)}" placeholder="Repair / item" ${dis}>
      <input data-q="price" type="number" value="${esc(l.price)}" placeholder="$" ${dis}>${dis ? '<span></span>' : `<button class="btn ghost sm" data-act="delQLine" data-i="${i}">×</button>`}</div>`).join('');
    updateQTotal();
  }
  const readQLines = () => [...document.querySelectorAll('#qLines .qline')].map(r => ({ desc: r.querySelector('[data-q=desc]').value.trim(), price: Number(r.querySelector('[data-q=price]').value) || 0 }));
  const updateQTotal = () => { if ($('qTotal')) $('qTotal').textContent = money(readQLines().reduce((s, l) => s + l.price, 0)); };
  function jobWork() {
    return { formData: NOTE, serviceNote: N.buildServiceNote(NOTE), extraNotes: $('extraNotes').value.trim(), recommendations: $('recs').value.trim(), quoteLines: readQLines() };
  }

  // shrink a photo on the phone before upload (max 1600px, JPEG)
  function shrink(file) {
    return new Promise((resolve, reject) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 1600, s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = () => reject(new Error('Could not read that photo.')); img.src = url;
    });
  }

  // ---------- FIELDEDGE ENTRY QUEUE ----------
  VIEWS.fe = () => run(null, async () => {
    const q = await api('feQueue'); setBadge('fe', q.length);
    CTX.fe = q;
    $('main').innerHTML = `<h2>FieldEdge entry</h2><div class="meta">Paste each item into the FieldEdge job, then enter the quote number to close it. Oldest first.</div>
      ${q.length ? q.map((j, i) => `<div class="card"><div class="row"><div class="title">${esc(j.customer)} · FE ${esc(j.fe)}</div><span class="meta">${esc(nameOf(j.tech))} · done ${esc(j.completedAt)} · ${j.photoCount} photos</span></div>
        ${j.serviceNote ? `<label>Service note</label><div class="note">${esc(j.serviceNote)}</div><button class="btn ghost sm" data-act="feCopy" data-i="${i}" data-k="serviceNote">Copy note</button>` : ''}
        ${j.extraNotes ? `<label>Extra notes</label><div class="note">${esc(j.extraNotes)}</div><button class="btn ghost sm" data-act="feCopy" data-i="${i}" data-k="extraNotes">Copy</button>` : ''}
        ${j.recommendations ? `<label>Recommendations</label><div class="note">${esc(j.recommendations)}</div><button class="btn ghost sm" data-act="feCopy" data-i="${i}" data-k="recommendations">Copy</button>` : ''}
        ${j.quoteLines.length ? `<label>Quote lines</label><div class="note">${j.quoteLines.map(l => esc(l.desc) + ' — ' + money(l.price)).join('\n')}\nTotal: ${money(j.quoteTotal)}</div>
          <button class="btn ghost sm" data-act="feCopy" data-i="${i}" data-k="quote">Copy quote</button>` : ''}
        <div class="bar">${j.quoteLines.length ? `<input id="q_${esc(j.ID)}" placeholder="FieldEdge quote # (e.g. q1234)">` : ''}
          <button class="btn green sm" data-act="feDone" data-id="${esc(j.ID)}">Entered in FieldEdge</button></div></div>`).join('') : '<div class="card">Nothing waiting. Nice work.</div>'}`;
  });

  // ---------- REVIEWS QUEUE ----------
  VIEWS.reviews = () => run(null, async () => {
    const q = await api('reviewQueue'); setBadge('reviews', q.length);
    CTX.rev = q;
    $('main').innerHTML = `<h2>Review requests</h2>
      <div class="meta">These customers passed the rules (residential, never asked, OK to text). Approve to send, or decline with a reason.</div>
      ${q.length ? q.map((r, i) => `<div class="card"><div class="row"><div class="title">${esc(r['Customer Name'])}</div><span class="meta">${esc(r.Phone)} · tech ${esc(nameOf(r.Tech))}</span></div>
        <div class="note">${esc(r.Message)}</div>
        <div class="bar"><button class="btn green sm" data-act="revSend" data-id="${esc(r.ID)}">Send text</button>
          <button class="btn ghost sm" data-act="revManual" data-i="${i}">Copy &amp; mark sent</button>
          <input id="rd_${esc(r.ID)}" placeholder="Reason to decline"><button class="btn sm" data-act="revDecline" data-id="${esc(r.ID)}">Decline</button></div></div>`).join('') : '<div class="card">No requests waiting.</div>'}`;
  });

  // ---------- CUSTOMERS ----------
  VIEWS.customers = () => {
    $('main').innerHTML = `<div class="row"><h2>Customers</h2><button class="btn navy sm" data-act="newCustomer">+ Customer</button></div>
      <div class="bar"><input id="cQuery" placeholder="Search name, phone, address, town"><button class="btn ghost sm" data-act="loadCustomers">Search</button></div><div id="custList"></div>`;
    $('cQuery').onkeydown = e => { if (e.key === 'Enter') ACTS.loadCustomers(); };
    ACTS.loadCustomers();
  };

  // ---------- LEADS ----------
  function leadCard(l) {
    return `<div class="card"><div class="row"><div class="title">${esc(l['Customer Name'])}</div><span class="pill ${esc(l.Status)}">${esc(l.Status)}</span></div>
      <div class="meta">${esc(l.Date)} · ${esc(l['Lead Source'])} · ${esc(l['Job Type'])}${l.Phone ? ' · <a href="tel:' + esc(l.Phone) + '">' + esc(l.Phone) + '</a>' : ''}</div>
      <div class="meta">Lead cost ${money(l['Lead Cost'])} · Job value ${money(l['Job Value'])}${l['FieldEdge #'] ? ' · FE ' + esc(l['FieldEdge #']) : ''}</div>
      ${l.Notes ? `<div class="meta">${esc(l.Notes)}</div>` : ''}
      <div class="bar" style="margin-bottom:0"><button class="btn ghost sm" data-act="leadUpdate" data-id="${esc(l.ID)}" data-status="${esc(l.Status)}" data-value="${esc(l['Job Value'])}" data-fe="${esc(l['FieldEdge #'])}">Update</button></div></div>`;
  }
  VIEWS.leads = () => {
    $('main').innerHTML = `<div class="row"><h2>Leads</h2><button class="btn sm" data-act="newLead">+ New lead</button></div>
      <div class="bar"><select id="lStatus"><option>All</option><option selected>New</option><option>Booked</option><option>Sold</option><option>Lost</option></select>
      <select id="lSource"><option>All</option>${opts(L.sources)}</select><button class="btn ghost sm" data-act="loadLeads">Filter</button></div><div id="leadList"></div>`;
    ACTS.loadLeads();
  };

  // ---------- PRICING ----------
  let TIERS = [];
  VIEWS.pricing = () => run(null, async () => {
    TIERS = await api('getTiers');
    $('main').innerHTML = `<h2>Pricing tiers</h2><div class="meta">FieldEdge holds the real prices. This shows which tier each customer gets and how repairs adjust.</div>
      <div class="scroll"><table><tr><th>Tier</th><th class="n">Repair adj.</th><th class="n">Service call</th><th>Who qualifies</th><th>Notes</th>${isAdmin() ? '<th></th>' : ''}</tr>
      ${TIERS.map((t, i) => `<tr><td><b>${esc(t.Tier)}</b></td><td class="n">${t['Price Adjustment %'] > 0 ? '+' : ''}${esc(t['Price Adjustment %'])}%</td><td class="n">${money(t['Service Call Fee'])}</td>
        <td>${esc(t['Who Qualifies'])}</td><td>${esc(t.Notes)}</td>${isAdmin() ? `<td><button class="btn ghost sm" data-act="editTier" data-i="${i}">Edit</button></td>` : ''}</tr>`).join('')}</table></div>
      ${isAdmin() ? '<div class="bar"><button class="btn ghost sm" data-act="editTier">+ Tier</button></div>' : ''}`;
  });

  // ---------- REPORTS ----------
  VIEWS.reports = () => {
    $('main').innerHTML = `<div class="row"><h2>Reports</h2><select id="rDays" style="width:auto"><option value="1">Today</option><option value="7" selected>Last 7 days</option><option value="30">Last 30 days</option></select></div><div id="repOut" class="loading">Loading…</div>`;
    $('rDays').onchange = loadReports; loadReports();
  };
  function loadReports() {
    run(null, async () => {
      const r = await api('getReports', $('rDays').value);
      const pct = r.tasks.all ? Math.round(r.tasks.done / r.tasks.all * 100) : 0;
      const tbl = (head, rows) => `<div class="scroll"><table><tr>${head.map(h => `<th${h[1] ? ' class="n"' : ''}>${h[0]}</th>`).join('')}</tr>${rows.join('')}</table></div>`;
      $('repOut').innerHTML = `<p class="meta">${esc(r.since)} to ${esc(r.today)}</p>
        <div class="tiles"><div class="tile"><div class="n">${pct}%</div><div class="l">Office/tech tasks completed</div></div>
          <div class="tile ${r.tasks.notDone ? 'alert' : ''}"><div class="n">${r.tasks.notDone}</div><div class="l">Tasks not done</div></div>
          <div class="tile ${r.tasks.open ? 'alert' : ''}"><div class="n">${r.tasks.open}</div><div class="l">Past due, never touched</div></div>
          <div class="tile ${r.fieldEdge.waiting ? 'alert' : ''}"><div class="n">${r.fieldEdge.waiting}</div><div class="l">Waiting for FieldEdge entry</div></div>
          <div class="tile"><div class="n">${r.fieldEdge.avgHours ?? '—'}</div><div class="l">Avg hours to enter in FieldEdge</div></div>
          <div class="tile"><div class="n">${r.reviews.sent}</div><div class="l">Review texts sent</div></div></div>
        <h3>Technicians</h3>${tbl([['Tech'], ['Jobs', 1], ['Required photos', 1], ['Quotes', 1], ['Quoted $', 1], ['Review queued', 1], ['Held', 1], ['Excluded', 1]],
          r.byTech.map(t => `<tr><td>${esc(t.tech)}</td><td class="n">${t.jobs}</td><td class="n">${t.jobs ? Math.round(t.photosOk / t.jobs * 100) : 0}%</td><td class="n">${t.quotes}</td><td class="n">${money(t.quoteTotal)}</td><td class="n">${t.reviewQueued}</td><td class="n">${t.reviewHeld}</td><td class="n">${t.reviewExcluded}</td></tr>`))}
        ${r.byTech.some(t => t.holds.length) ? `<h3>Review texts held by techs</h3><div class="card">${r.byTech.map(t => t.holds.map(h => `<div class="meta"><b>${esc(t.tech)}</b>: ${esc(h)}</div>`).join('')).join('')}</div>` : ''}
        <h3>Tasks by person</h3>${tbl([['Person'], ['Done', 1], ['Not done', 1], ['Open', 1]], r.byPerson.map(p => `<tr><td>${esc(p.person)}</td><td class="n">${p.done}</td><td class="n">${p.notDone}</td><td class="n">${p.open}</td></tr>`))}
        <h3>Not done (with reasons)</h3>${r.notDone.length ? tbl([['Date'], ['Task'], ['By'], ['Reason']], r.notDone.map(x => `<tr><td>${esc(x.date)}</td><td>${esc(x.title)}</td><td>${esc(x.by)}</td><td>${esc(x.reason)}</td></tr>`)) : '<div class="meta">None.</div>'}
        <h3>Past due and never touched</h3>${r.stillOpen.length ? tbl([['Due'], ['Task'], ['Assigned']], r.stillOpen.map(x => `<tr><td>${esc(x.date)}</td><td>${esc(x.title)}</td><td>${esc(x.assigned)}</td></tr>`)) : '<div class="meta">None.</div>'}
        <h3>Leads by source</h3>${tbl([['Source'], ['Leads', 1], ['Booked', 1], ['Rate', 1], ['Lead cost', 1], ['Cost / booked', 1], ['Job value', 1]],
          r.bySource.map(s => `<tr><td>${esc(s.source)}</td><td class="n">${s.leads}</td><td class="n">${s.booked}</td><td class="n">${s.leads ? Math.round(s.booked / s.leads * 100) : 0}%</td><td class="n">${money(s.cost)}</td><td class="n">${s.booked ? money(s.cost / s.booked) : '—'}</td><td class="n">${money(s.value)}</td></tr>`))}`;
    });
  }

  // ---------- ADMIN ----------
  let ADMIN = null;
  VIEWS.admin = () => run(null, async () => {
    ADMIN = await api('getAdmin');
    const act = await api('getActivity');
    const s = ADMIN.settings;
    const yes = v => v === true || v === 'TRUE';
    $('main').innerHTML = `<h2>Admin</h2>
      <div class="card"><strong>Setup check</strong><div class="meta">Sign-in key: ${s.clientId ? '<span class="ok">set</span>' : '<span class="req">missing</span>'} ·
        Review link: ${s.reviewLink ? '<span class="ok">set</span>' : '<span class="req">missing</span>'} · Automatic texting (Quo): ${s.quo ? '<span class="ok">on</span>' : 'off (office copies and sends)'}</div></div>
      <h3>Approved users</h3><div class="meta">Any Google account works (company or personal). Only people on this list can sign in.</div>
      <div class="scroll"><table><tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th><th></th></tr>
        ${ADMIN.users.map((u, i) => `<tr><td>${esc(u.Name)}</td><td>${esc(u.Email)}</td><td>${esc(u.Role)}</td><td>${yes(u.Active) ? 'Yes' : 'No'}</td><td><button class="btn ghost sm" data-act="editUser" data-i="${i}">Edit</button></td></tr>`).join('')}</table></div>
      <div class="bar"><button class="btn navy sm" data-act="editUser">+ Add user</button></div>
      <h3>Daily recurring tasks</h3><div class="meta">These build the task list every morning.</div>
      <div class="scroll"><table><tr><th>Task</th><th>When</th><th>Assigned</th><th>Active</th><th></th></tr>
        ${ADMIN.recurring.map((r, i) => `<tr><td>${esc(r.Title)}</td><td>${esc(r.Frequency)}</td><td>${esc(nameOf(r['Assigned To']))}</td><td>${yes(r.Active) ? 'Yes' : 'No'}</td><td><button class="btn ghost sm" data-act="editRec" data-i="${i}">Edit</button></td></tr>`).join('')}</table></div>
      <div class="bar"><button class="btn ghost sm" data-act="editRec">+ Recurring task</button></div>
      <h3>Lead sources</h3><div class="scroll"><table><tr><th>Source</th><th>Type</th></tr>${ADMIN.sources.map(x => `<tr><td>${esc(x.Source)}</td><td>${esc(x.Type)}</td></tr>`).join('')}</table></div>
      <div class="bar"><input id="sName" placeholder="New source"><select id="sType"><option>Organic</option><option>Paid</option></select><button class="btn ghost sm" data-act="saveSource">Save source</button></div>
      <h3>Procedures</h3><div class="meta">Edit procedure steps on the <b>Playbooks</b> tab of the Google Sheet (see EDITING.md).</div>
      <h3>Activity log</h3><div class="scroll"><table><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr>
        ${act.map(a => `<tr><td>${esc(a.Timestamp)}</td><td>${esc(nameOf(a.User))}</td><td>${esc(a.Action)}</td><td>${esc(a.Details)}</td></tr>`).join('')}</table></div>`;
  });

  // ================= ACTIONS (data-act) =================
  const ACTS = {
    nav: el => { closeModal(); go(el.dataset.v); },
    openJob: el => { closeModal(); go('job', { id: el.dataset.id }); },

    // tasks
    loadTasks: () => run(null, async () => {
      const t = await api('listTasks', { status: $('tStatus').value, assignee: $('tWho')?.value || 'All', from: $('tFrom').value, to: $('tTo').value });
      $('taskList').innerHTML = t.length ? t.map(x => taskCard(x)).join('') : '<div class="card">No tasks match.</div>';
    }),
    taskDone: (el) => markTask(el, 'Done'),
    taskNotDone: (el) => markTask(el, 'Not Done'),
    taskReopen: (el) => markTask(el, 'Open'),
    taskReassign: el => modal(`<h3>Reassign task</h3><label>Assign to</label><select id="raWho">${userOpts(el.dataset.who)}</select>
      <label>Due date</label><input type="date" id="raDue" value="${esc(el.dataset.due)}">
      <div class="bar"><button class="btn navy" data-act="doReassign" data-id="${esc(el.dataset.id)}">Save</button><button class="btn ghost" data-act="close">Cancel</button></div>`),
    doReassign: el => run(el, async () => { await api('reassignTask', el.dataset.id, $('raWho').value, $('raDue').value); closeModal(); toast('Reassigned'); refresh(); }),
    newTask: () => modal(`<h3>New task</h3><label>Task</label><input id="ntTitle" placeholder="What needs to be done">
      <div class="grid2"><div><label>Due date</label><input type="date" id="ntDue" value="${today()}"></div>
      ${isOffice() ? `<div><label>Assign to</label><select id="ntWho">${userOpts('')}</select></div>` : '<div></div>'}
      <div><label>Type</label><select id="ntType">${opts(L.taskTypes, 'Follow up')}</select></div><div><label>Priority</label><select id="ntPrio">${opts(L.priorities, 'Normal')}</select></div></div>
      <div class="bar"><button class="btn navy" data-act="saveTask">Save task</button><button class="btn ghost" data-act="close">Cancel</button></div>`),
    saveTask: el => run(el, async () => {
      await api('addTask', { title: $('ntTitle').value.trim(), dueDate: $('ntDue').value, assignee: $('ntWho')?.value || '', type: $('ntType').value, priority: $('ntPrio').value, jobId: CTX.id && VIEW === 'job' ? CTX.id : '' });
      closeModal(); toast('Task added'); refresh();
    }),
    close: () => closeModal(),

    // jobs
    loadJobs: () => run(null, async () => {
      const j = await api('listJobs', { status: $('jStatus').value, tech: $('jTech')?.value || 'All' });
      $('jobList').innerHTML = j.length ? j.map(jobCard).join('') : '<div class="card">No jobs match.</div>';
    }),
    newJob: () => jobForm({}),
    editJob: () => jobForm({ id: JOB.ID, fe: JOB['FieldEdge Job #'], date: JOB.Date, type: JOB['Job Type'], tech: JOB['Assigned Tech'], customerId: JOB['Customer ID'], customerName: JOB['Customer Name'] }),
    jobCustSearch: () => run(null, async () => {
      const q = $('jfQuery').value.trim(); if (q.length < 2) return;
      const c = await api('searchCustomers', q);
      $('jfCust').innerHTML = '<option value="">— New customer —</option>' + c.map(x => `<option value="${esc(x.ID)}">${esc(x.Name)} · ${esc(x.Phone)} (${esc(x['Customer Type'])})</option>`).join('');
      ACTS.jobCustPick();
    }),
    jobCustPick: () => { $('jfNew').classList.toggle('hide', !!$('jfCust').value); },
    saveJobForm: el => run(el, async () => {
      const id = await api('saveJob', { id: el.dataset.id || '', fe: $('jfFe').value.trim(), date: $('jfDate').value, type: $('jfType').value,
        tech: $('jfTech')?.value || '', customerId: $('jfCust')?.value || el.dataset.cust || '',
        customerName: $('jfName')?.value.trim(), phone: $('jfPhone')?.value.trim(), address: $('jfAddr')?.value.trim(), town: $('jfTown')?.value.trim(),
        customerType: $('jfCType')?.value, leadSource: $('jfSource')?.value });
      closeModal(); toast('Job saved'); go('job', { id });
    }),
    saveJob: el => run(el, async () => { await api('saveJobWork', JOB.ID, jobWork()); toast('Saved'); }),
    copyNote: () => copy(N.buildServiceNote(NOTE), 'Note copied'),
    addQLine: () => { const l = readQLines(); l.push({ desc: '', price: '' }); renderQLines(l); },
    delQLine: el => { const l = readQLines(); l.splice(Number(el.dataset.i), 1); renderQLines(l); },
    jobPrice: el => run(el, async () => {
      const p = await api('priceCheck', JOB['Customer ID'], $('pcBook').value);
      $('pcOut').innerHTML = p.price !== null ? `<b>${money(p.price)}</b> (${esc(p.tier)} ${p.adjust > 0 ? '+' : ''}${p.adjust}%) · service call ${money(p.serviceFee)}` : esc(p.tier);
    }),
    startPlaybook: el => run(el, async () => { const n = await api('startPlaybook', JOB.ID, $('pbName').value); toast(n + ' procedure steps added to tasks'); }),
    completeJobOpen: () => {
      const e = JOB.reviewEligibility;
      modal(`<h3>Complete job</h3>
        <label class="chk"><input type="checkbox" id="cjWorked" checked> Work was performed</label>
        <h3>Google review text</h3>
        ${e.eligible ? `<div class="meta">This customer qualifies. The office approves before it's sent, signed with your name.</div>
          <label>Hold back the review text? (optional)</label><select id="cjHold"><option value="">No, send for approval</option>${opts(L.reviewHoldReasons)}</select>
          <input id="cjHoldNote" placeholder="Explain (required for Other)" style="margin-top:6px">` :
          `<div class="meta">Not sent: ${esc(e.reason)}.</div>`}
        <h3>Anything the office should know?</h3>
        <label class="chk"><input type="checkbox" id="cjIssue"> Issue on site / customer concern (office calls them today)</label>
        <input id="cjIssueNote" placeholder="What happened">
        <div class="bar"><button class="btn green" data-act="completeJob">Complete job</button><button class="btn ghost" data-act="close">Cancel</button></div>`);
    },
    completeJob: el => run(el, async () => {
      await api('saveJobWork', JOB.ID, jobWork());
      const r = await api('completeJob', JOB.ID, { workPerformed: $('cjWorked').checked, holdReason: $('cjHold')?.value || '', holdNote: $('cjHoldNote')?.value.trim() || '',
        issueOnSite: $('cjIssue').checked, issueNote: $('cjIssueNote').value.trim() });
      closeModal(); toast('Job complete. Review: ' + r.review); refresh();
    }),

    // FieldEdge queue
    feCopy: el => {
      const j = CTX.fe[Number(el.dataset.i)]; const k = el.dataset.k;
      copy(k === 'quote' ? j.quoteLines.map(l => l.desc + ' — $' + l.price).join('\n') + '\nTotal: $' + j.quoteTotal : j[k], 'Copied');
    },
    feDone: el => run(el, async () => { await api('markFeEntered', el.dataset.id, $('q_' + el.dataset.id)?.value || ''); toast('Marked entered'); refresh(); }),

    // reviews queue
    revSend: el => run(el, async () => { await api('decideReview', el.dataset.id, 'send'); toast('Review text sent'); refresh(); }),
    revManual: el => run(el, async () => {
      const r = CTX.rev[Number(el.dataset.i)];
      const res = await api('decideReview', r.ID, 'sent');
      CTX.revMsg = res.message;
      modal(`<h3>Text this to ${esc(r['Customer Name'])}</h3><div class="meta">${esc(r.Phone)}. Marked as sent.</div>
        <div class="note" style="margin-top:8px">${esc(res.message)}</div>
        <div class="bar"><button class="btn navy" data-act="copyRevMsg">Copy message</button>
        <a class="btn ghost" href="sms:${esc(r.Phone)}">Open texting</a><button class="btn ghost" data-act="closeRefresh">Done</button></div>`);
    }),
    copyRevMsg: () => copy(CTX.revMsg, 'Message copied'),
    closeRefresh: () => { closeModal(); refresh(); },
    revDecline: el => run(el, async () => { await api('decideReview', el.dataset.id, 'decline', $('rd_' + el.dataset.id).value); toast('Declined'); refresh(); }),

    // customers
    loadCustomers: () => run(null, async () => {
      const c = await api('searchCustomers', $('cQuery').value);
      $('custList').innerHTML = c.length ? c.map(x => `<div class="card clickable" data-act="openCustomer" data-id="${esc(x.ID)}">
        <div class="row"><div class="title">${esc(x.Name)}</div><div><span class="pill">${esc(x['Customer Type'] || '—')}</span> <span class="pill blue">${esc(x['Pricing Tier'] || 'Standard')}</span></div></div>
        <div class="meta">${esc(x.Phone)} ${x.Town ? '· ' + esc(x.Town) : ''} · Source: ${esc(x['Lead Source'] || '—')}</div></div>`).join('') : '<div class="card">No customers found.</div>';
    }),
    openCustomer: el => run(null, async () => {
      const d = await api('getCustomer', el.dataset.id); const c = d.customer; const t = d.tier; CTX.cust = c;
      modal(`<div class="row"><h3 style="margin:0">${esc(c.Name)}</h3><button class="btn ghost sm" data-act="close">Close</button></div>
        <div class="meta">${esc(c.Phone)} · ${esc(c.Email)}<br>${esc(c.Address)} ${esc(c.Town)}</div>
        <div class="card" style="margin-top:10px"><div class="grid3"><div><div class="meta">Type</div><b>${esc(c['Customer Type'] || '—')}</b></div><div><div class="meta">Pricing tier</div><b>${esc(c['Pricing Tier'] || 'Standard')}</b></div><div><div class="meta">Lead source</div><b>${esc(c['Lead Source'] || '—')}</b></div></div>
          ${t ? `<div class="meta" style="margin-top:6px">Repairs ${t['Price Adjustment %'] > 0 ? '+' : ''}${esc(t['Price Adjustment %'])}% vs book · service call ${money(t['Service Call Fee'])}</div>` : ''}
          <div class="meta">Review text: ${d.reviewEligibility.eligible ? 'eligible' : esc(d.reviewEligibility.reason)}</div></div>
        ${c.Notes ? `<div class="meta">${esc(c.Notes)}</div>` : ''}
        <div class="bar"><button class="btn navy sm" data-act="editCustomer">Edit</button><button class="btn ghost sm" data-act="newLeadFor">+ Lead</button></div>
        <h3>Jobs</h3>${d.jobs.length ? d.jobs.map(jobCard).join('') : '<div class="meta">None.</div>'}
        <h3>Tasks</h3>${d.tasks.length ? d.tasks.map(x => taskCard(x, false)).join('') : '<div class="meta">None.</div>'}
        <h3>Leads</h3>${d.leads.length ? d.leads.map(leadCard).join('') : '<div class="meta">None.</div>'}`);
    }),
    newCustomer: () => customerForm({}),
    editCustomer: () => customerForm(CTX.cust),
    saveCustomer: el => run(el, async () => {
      const o = { id: el.dataset.id || '', name: $('cfName').value.trim(), phone: $('cfPhone').value.trim(), email: $('cfEmail').value.trim(), town: $('cfTown').value.trim(),
        address: $('cfAddr').value.trim(), leadSource: $('cfSource').value, customerType: $('cfType').value, notes: $('cfNotes').value.trim(),
        doNotText: $('cfDnt').checked, leftReview: $('cfLeft').checked };
      if (isAdmin()) o.tier = $('cfTier').value;
      await api('saveCustomer', o); closeModal(); toast('Customer saved'); if (VIEW === 'customers') ACTS.loadCustomers();
    }),

    // leads
    loadLeads: () => run(null, async () => {
      const l = await api('listLeads', { status: $('lStatus').value, source: $('lSource').value });
      $('leadList').innerHTML = l.length ? l.map(leadCard).join('') : '<div class="card">No leads match.</div>';
    }),
    newLead: () => leadForm({}),
    newLeadFor: () => leadForm({ customerId: CTX.cust.ID, name: CTX.cust.Name, phone: CTX.cust.Phone }),
    saveLead: el => run(el, async () => {
      if (!$('lfSource').value) throw new Error('Pick a lead source. No source, no booking.');
      await api('addLead', { customerId: el.dataset.cust || '', customerName: $('lfName').value.trim(), phone: $('lfPhone').value.trim(), source: $('lfSource').value,
        jobType: $('lfType').value, date: $('lfDate').value, status: $('lfStatus').value, leadCost: $('lfCost').value, assignee: $('lfWho').value,
        customerType: $('lfCType')?.value || 'Residential', town: $('lfTown')?.value || '', address: $('lfAddr')?.value || '', notes: $('lfNotes').value.trim() });
      closeModal(); toast('Lead saved. Call-back task created.'); if (VIEW === 'leads') ACTS.loadLeads();
    }),
    leadUpdate: el => modal(`<h3>Update lead</h3><div class="grid3"><div><label>Status</label><select id="luStatus">${opts(L.leadStatuses, el.dataset.status)}</select></div>
      <div><label>Job value $</label><input type="number" id="luValue" value="${esc(el.dataset.value)}"></div><div><label>FieldEdge #</label><input id="luFE" value="${esc(el.dataset.fe)}"></div></div>
      <div class="bar"><button class="btn navy" data-act="saveLeadUpdate" data-id="${esc(el.dataset.id)}">Save</button><button class="btn ghost" data-act="close">Cancel</button></div>`),
    saveLeadUpdate: el => run(el, async () => { await api('updateLead', el.dataset.id, { status: $('luStatus').value, jobValue: $('luValue').value, fieldEdge: $('luFE').value.trim() }); closeModal(); toast('Lead updated'); if (VIEW === 'leads') ACTS.loadLeads(); }),

    // pricing
    editTier: el => {
      const t = el.dataset.i !== undefined ? TIERS[Number(el.dataset.i)] : {};
      modal(`<h3>${t.Tier ? 'Edit' : 'New'} pricing tier</h3><div class="grid2">
        <div><label>Tier name</label><input id="tfName" value="${esc(t.Tier)}"></div>
        <div><label>Repair adjustment % (−10 discount, 15 markup)</label><input type="number" id="tfAdj" value="${esc(t['Price Adjustment %'] ?? 0)}"></div>
        <div><label>Service call fee $</label><input type="number" id="tfFee" value="${esc(t['Service Call Fee'] ?? 75)}"></div>
        <div><label>Who qualifies</label><input id="tfWho" value="${esc(t['Who Qualifies'])}"></div></div>
        <label>Notes</label><input id="tfNotes" value="${esc(t.Notes)}">
        <div class="bar"><button class="btn navy" data-act="saveTier" data-orig="${esc(t.Tier || '')}">Save</button><button class="btn ghost" data-act="close">Cancel</button></div>`);
    },
    saveTier: el => run(el, async () => {
      await api('saveTier', { originalName: el.dataset.orig, tier: $('tfName').value.trim(), adjust: $('tfAdj').value, fee: $('tfFee').value, who: $('tfWho').value.trim(), notes: $('tfNotes').value.trim() });
      closeModal(); L = await api('refreshLists'); toast('Tier saved'); refresh();
    }),

    // admin
    editUser: el => {
      const u = el.dataset.i !== undefined ? ADMIN.users[Number(el.dataset.i)] : {};
      const active = u.Active === undefined || u.Active === true || u.Active === 'TRUE';
      modal(`<h3>${u.Email ? 'Edit' : 'Add'} user</h3><div class="grid2">
        <div><label>Email (Google account)</label><input id="ufEmail" value="${esc(u.Email)}" ${u.Email ? 'disabled' : ''} placeholder="name@gmail.com or name@haleshvac.com"></div>
        <div><label>Name</label><input id="ufName" value="${esc(u.Name)}"></div>
        <div><label>Role</label><select id="ufRole">${opts(L.roles, u.Role || 'Tech')}</select></div>
        <div><label>Mobile (optional)</label><input id="ufPhone" value="${esc(u.Phone)}"></div>
        <div><label>Quo user ID (optional, for texts sent as them)</label><input id="ufQuo" value="${esc(u['Quo User ID'])}"></div>
        <div><label>Active</label><select id="ufActive"><option value="1">Yes</option><option value="0" ${active ? '' : 'selected'}>No (blocked)</option></select></div></div>
        <div class="meta" style="margin-top:8px">Tech = sees only their own jobs and tasks. Office = everything except reports, pricing changes and users. Admin = everything.</div>
        <div class="bar"><button class="btn navy" data-act="saveUser">Save</button><button class="btn ghost" data-act="close">Cancel</button></div>`);
    },
    saveUser: el => run(el, async () => {
      await api('saveUser', { email: $('ufEmail').value.trim(), name: $('ufName').value.trim(), role: $('ufRole').value, phone: $('ufPhone').value.trim(), quoUserId: $('ufQuo').value.trim(), active: $('ufActive').value === '1' });
      closeModal(); L = await api('refreshLists'); toast('User saved'); refresh();
    }),
    editRec: el => {
      const r = el.dataset.i !== undefined ? ADMIN.recurring[Number(el.dataset.i)] : {};
      const active = r.Active === undefined || r.Active === true || r.Active === 'TRUE';
      modal(`<h3>${r.Title ? 'Edit' : 'New'} recurring task</h3><label>Task</label><input id="rfTitle" value="${esc(r.Title)}">
        <div class="grid2"><div><label>When</label><select id="rfFreq">${opts(L.frequencies, r.Frequency || 'Daily (weekdays)')}</select></div>
        <div><label>Assign to</label><select id="rfWho">${userOpts(r['Assigned To'] || '')}</select></div>
        <div><label>Type</label><select id="rfType">${opts(L.taskTypes, r.Type || 'Admin')}</select></div>
        <div><label>Priority</label><select id="rfPrio">${opts(L.priorities, r.Priority || 'Normal')}</select></div>
        <div><label>Active</label><select id="rfActive"><option value="1">Yes</option><option value="0" ${active ? '' : 'selected'}>No</option></select></div></div>
        <div class="bar"><button class="btn navy" data-act="saveRec" data-row="${esc(r._row || '')}">Save</button><button class="btn ghost" data-act="close">Cancel</button></div>`);
    },
    saveRec: el => run(el, async () => {
      await api('saveRecurring', { row: el.dataset.row || undefined, title: $('rfTitle').value.trim(), frequency: $('rfFreq').value, assignee: $('rfWho').value, type: $('rfType').value, priority: $('rfPrio').value, active: $('rfActive').value === '1' });
      closeModal(); toast('Saved. Applies starting tomorrow.'); refresh();
    }),
    saveSource: el => run(el, async () => { await api('saveSource', { source: $('sName').value.trim(), type: $('sType').value, active: true }); L = await api('refreshLists'); toast('Source saved'); refresh(); })
  };

  async function markTask(el, status) {
    const note = ($('note_' + el.dataset.id)?.value || '').trim();
    if (status === 'Not Done' && !note) return toast('Type the reason it was not done.', true);
    await run(el, async () => { await api('completeTask', el.dataset.id, status, note); toast('Task ' + status.toLowerCase()); refresh(); });
  }

  function jobForm(j) {
    const office = isOffice();
    modal(`<h3>${j.id ? 'Edit job' : 'New job'}</h3>
      <div class="grid2"><div><label>FieldEdge job #</label><input id="jfFe" value="${esc(j.fe)}"></div>
      <div><label>Date</label><input type="date" id="jfDate" value="${esc(j.date || today())}"></div>
      <div><label>Job type</label><select id="jfType">${opts(L.jobTypes, j.type || 'Service call')}</select></div>
      ${office ? `<div><label>Technician</label><select id="jfTech">${userOpts(j.tech || '', 'Tech')}</select></div>` : '<div></div>'}</div>
      ${j.id ? `<div class="meta" style="margin-top:8px">Customer: <b>${esc(j.customerName)}</b></div>` : `
      <h3>Customer</h3>
      ${office ? `<div class="bar"><input id="jfQuery" placeholder="Search existing (name or phone)"><button class="btn ghost sm" data-act="jobCustSearch">Search</button></div>
        <select id="jfCust"><option value="">— New customer —</option></select>` : ''}
      <div id="jfNew"><div class="grid2"><div><label>Name (as in FieldEdge)</label><input id="jfName"></div><div><label>Phone</label><input id="jfPhone" type="tel"></div>
        <div><label>Address</label><input id="jfAddr"></div><div><label>Town</label><input id="jfTown"></div>
        <div><label>Customer type</label><select id="jfCType">${opts(L.customerTypes, 'Residential')}</select></div>
        <div><label>Lead source</label><select id="jfSource"><option value=""></option>${opts(L.sources)}</select></div></div></div>`}
      <div class="bar"><button class="btn navy" data-act="saveJobForm" data-id="${esc(j.id || '')}" data-cust="${esc(j.customerId || '')}">Save job</button><button class="btn ghost" data-act="close">Cancel</button></div>`);
    if ($('jfCust')) $('jfCust').onchange = ACTS.jobCustPick;
  }

  function customerForm(c) {
    const yes = v => v === true || v === 'TRUE';
    modal(`<h3>${c.ID ? 'Edit' : 'New'} customer</h3><div class="grid2">
      <div><label>Name (as in FieldEdge)</label><input id="cfName" value="${esc(c.Name)}"></div><div><label>Phone</label><input id="cfPhone" type="tel" value="${esc(c.Phone)}"></div>
      <div><label>Email</label><input id="cfEmail" type="email" value="${esc(c.Email)}"></div><div><label>Town</label><input id="cfTown" value="${esc(c.Town)}"></div></div>
      <label>Address</label><input id="cfAddr" value="${esc(c.Address)}">
      <div class="grid3"><div><label>Customer type</label><select id="cfType">${opts(L.customerTypes, c['Customer Type'] || 'Residential')}</select></div>
      <div><label>Lead source</label><select id="cfSource"><option value=""></option>${opts(L.sources, c['Lead Source'])}</select></div>
      <div><label>Pricing tier ${isAdmin() ? '' : '(managers only)'}</label><select id="cfTier" ${isAdmin() ? '' : 'disabled'}>${opts(L.tiers, c['Pricing Tier'] || 'Standard')}</select></div></div>
      <label class="chk"><input type="checkbox" id="cfDnt" ${yes(c['Do Not Text']) ? 'checked' : ''}> Do not text this customer</label>
      <label class="chk"><input type="checkbox" id="cfLeft" ${yes(c['Left Review']) ? 'checked' : ''}> Already left us a Google review</label>
      <label>Notes</label><textarea id="cfNotes">${esc(c.Notes)}</textarea>
      <div class="bar"><button class="btn navy" data-act="saveCustomer" data-id="${esc(c.ID || '')}">Save</button><button class="btn ghost" data-act="close">Cancel</button></div>`);
  }

  function leadForm(x) {
    modal(`<h3>New lead</h3><div class="grid2">
      <div><label>Customer name</label><input id="lfName" value="${esc(x.name || '')}" ${x.customerId ? 'disabled' : ''}></div>
      <div><label>Phone</label><input id="lfPhone" type="tel" value="${esc(x.phone || '')}"></div>
      <div><label>Lead source (required)</label><select id="lfSource"><option value=""></option>${opts(L.sources)}</select></div>
      <div><label>Job type</label><select id="lfType">${opts(L.jobTypes, 'Service call')}</select></div>
      <div><label>Date</label><input type="date" id="lfDate" value="${today()}"></div>
      <div><label>Status</label><select id="lfStatus">${opts(L.leadStatuses, 'New')}</select></div>
      <div><label>Lead cost $ (if known)</label><input type="number" id="lfCost"></div>
      <div><label>Call-back assigned to</label><select id="lfWho">${userOpts(ME.email)}</select></div></div>
      ${x.customerId ? '' : `<div class="grid3"><div><label>Customer type</label><select id="lfCType">${opts(L.customerTypes, 'Residential')}</select></div><div><label>Town</label><input id="lfTown"></div><div><label>Address</label><input id="lfAddr"></div></div>`}
      <label>Notes</label><textarea id="lfNotes" placeholder="What they need"></textarea>
      <div class="bar"><button class="btn" data-act="saveLead" data-cust="${esc(x.customerId || '')}">Save lead</button><button class="btn ghost" data-act="close">Cancel</button></div>`);
  }

  // ================= EVENT WIRING =================
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = ACTS[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  $('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  $('signOutLink').addEventListener('click', () => signOut());

  // notes form: text fields update the preview; selects/checkboxes may show/hide fields, so redraw
  document.addEventListener('input', e => {
    const f = e.target.dataset?.nf;
    if (f && e.target.type !== 'checkbox' && e.target.tagName !== 'SELECT') { NOTE[f] = e.target.value; $('notePreview').textContent = N.buildServiceNote(NOTE); }
    if (e.target.closest?.('#qLines')) updateQTotal();
  });
  document.addEventListener('change', async e => {
    const f = e.target.dataset?.nf;
    if (f) {
      NOTE[f] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      // same smart defaults as the Hales-Tools notes app
      if (f === 'in_coil') TOUCHED.in_coil = true;
      if (f === 'out_ref_mode') TOUCHED.out_ref_mode = true;
      if (f === 'call_type' || f === 'in_type') {
        const heating = N.isHeatingCall(NOTE);
        if (!TOUCHED.in_coil && f === 'call_type') NOTE.in_coil = heating ? '' : 'clean';
        if (NOTE.in_type === 'dual fuel') NOTE.out_type = 'heat pump';
        if (!TOUCHED.out_ref_mode) NOTE.out_ref_mode = (NOTE.in_type === 'dual fuel' && heating) ? 'heating' : 'cooling';
      }
      // only dropdowns/checkboxes can show or hide other fields; text boxes never redraw (keeps focus while typing)
      if (e.target.type === 'checkbox' || e.target.tagName === 'SELECT') renderNoteForm(); else $('notePreview').textContent = N.buildServiceNote(NOTE);
      return;
    }
    const key = e.target.dataset?.photo;
    if (key && e.target.files?.length) {
      const files = [...e.target.files]; e.target.value = '';
      for (const file of files) {
        await run(null, async () => {
          toast('Uploading photo…');
          const r = await api('uploadPhoto', JOB.ID, key, await shrink(file));
          renderPhotos(r.photos); toast('Photo saved');
        });
      }
    }
  });

  if (TOKEN) start(); else showLogin();
})();
