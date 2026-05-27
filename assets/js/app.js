window.APP_CONFIG = {
  API_BASE: 'https://kiem-ke-may-api.hoalangiongxoai.workers.dev',
  ADMIN_SESSION_HOURS: 12,
  DEFAULT_YEAR_BACK: 8,
  DEFAULT_YEAR_FORWARD: 1,
  COMPANY_NAME_TOP: 'CÔNG TY TNHH MAY XK',
  COMPANY_NAME_BOTTOM: 'VIỆT HỒNG'
};
const $ = (id) => document.getElementById(id);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const clean = (v) => String(v ?? '').trim();
const bool = (v) => v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true' || String(v).toLowerCase() === 'yes' || String(v).includes('✅');
function setStatus(text, type='info'){
  const el = $('statusText');
  if(!el) return;
  el.textContent = text;
  el.style.color = type === 'error' ? '#dc2626' : type === 'ok' ? '#15803d' : '#0f62fe';
}
function getSelectedYear(){ return Number($('yearSelect')?.value || new Date().getFullYear()); }
function formatDateDDMMYYYY(v){
  if(!v && v !== 0) return '';
  const s = String(v).trim();
  if(/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(s);
  if(Number.isNaN(d.getTime())) return s;
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}
function normalizeText(str){
  return String(str ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}
function currentBaseUrl(){ return location.href.split('#')[0]; }
function downloadText(filename, text, mime='text/plain;charset=utf-8'){
  const blob = new Blob([text], {type:mime});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
}
function csvCell(v){
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
}
function debounce(fn, wait=250){ let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args),wait); }; }
const AppState = {
  token: localStorage.getItem('kk_token') || '',
  role: localStorage.getItem('kk_role') || '',
  assets: [],
  filtered: [],
  editingId: null,
  hashOpened: false,
  isAdmin(){ return this.role === 'admin'; },
  isViewer(){ return this.role === 'viewer'; },
  saveSession(token, role){
    this.token = token; this.role = role;
    localStorage.setItem('kk_token', token);
    localStorage.setItem('kk_role', role);
    localStorage.setItem('kk_login_at', String(Date.now()));
  },
  clearSession(){
    this.token = ''; this.role = ''; this.assets = []; this.filtered = [];
    localStorage.removeItem('kk_token'); localStorage.removeItem('kk_role'); localStorage.removeItem('kk_login_at');
  }
};
const Api = {
  base(){ return (window.APP_CONFIG?.API_BASE || '').replace(/\/$/, ''); },
  async request(path, options={}){
    const headers = Object.assign({'Content-Type':'application/json'}, options.headers || {});
    if(AppState.token) headers.Authorization = `Bearer ${AppState.token}`;
    const res = await fetch(this.base() + path, Object.assign({}, options, {headers}));
    const data = await res.json().catch(() => ({success:false, message:'API không trả JSON'}));
    if(!res.ok || data.success === false) throw new Error(data.message || `Lỗi API ${res.status}`);
    return data;
  },
  loginAdmin(password){ return this.request('/api/login', {method:'POST', body:JSON.stringify({password})}); },
  loginViewer(){ return this.request('/api/login', {method:'POST', body:JSON.stringify({mode:'viewer'})}); },
  listAssets({year, q='', filter='all'}={}){
    const params = new URLSearchParams({year:String(year || getSelectedYear())});
    if(q) params.set('q', q); if(filter && filter !== 'all') params.set('filter', filter);
    return this.request('/api/assets?' + params.toString());
  },
  getByTag(tag, year){ return this.request(`/api/assets/by-tag/${encodeURIComponent(tag)}?year=${encodeURIComponent(year)}`); },
  saveAsset(payload){ return this.request('/api/assets', {method:'POST', body:JSON.stringify(payload)}); },
  deleteAsset(id){ return this.request(`/api/assets/${encodeURIComponent(id)}`, {method:'DELETE'}); },
  importAssets(rows){
  return this.request('/api/assets/import', {
    method:'POST',
    body:JSON.stringify({
      year:getSelectedYear(),
      rows
    })
  });
},

bulkPatch(rows){
  return this.request('/api/assets/bulk', {
    method:'PATCH',
    body:JSON.stringify({rows})
  });
}
};
const Modal = {
  fields: ['soThe','soMay','loaiMay','viTri','ngayMua','noiMua','ghiChu','suaChua'],
  checks: ['daKiemKe','chonIn','bdQ1','bdQ2','bdQ3','bdQ4'],
  dateFields: ['bdNgayQ1','bdNgayQ2','bdNgayQ3','bdNgayQ4'],
  open(asset=null){
    AppState.editingId = asset?.id || null;
    $('modalTitle').textContent = AppState.isViewer() ? 'Thông tin máy' : (asset ? 'Chỉnh sửa máy' : 'Thêm máy mới');
    this.setValues(asset || {});
    this.setReadonly(AppState.isViewer());
    $('btnDeleteAsset').style.visibility = asset && AppState.isAdmin() ? 'visible' : 'hidden';
    $('assetModal').classList.add('open');
    $('assetModal').setAttribute('aria-hidden','false');
    document.body.classList.add('no-scroll');
    setTimeout(()=> $('m_soThe')?.focus(), 80);
  },
  close(){
    $('assetModal').classList.remove('open');
    $('assetModal').setAttribute('aria-hidden','true');
    document.body.classList.remove('no-scroll');
    AppState.editingId = null;
  },
  setValues(a){
    $('m_soThe').value = a.soThe || '';
    $('m_soMay').value = a.soMay || '';
    $('m_loaiMay').value = a.loaiMay || '';
    $('m_viTri').value = a.viTri || '';
    $('m_ngayMua').value = formatDateDDMMYYYY(a.ngayMua || '');
    $('m_noiMua').value = a.noiMua || '';
    $('m_ghiChu').value = a.ghiChu || '';
    $('m_suaChua').value = a.suaChua || '';
    $('m_daKiemKe').checked = !!a.daKiemKe;
    $('m_chonIn').checked = !!a.chonIn;
    $('m_bdQ1').checked = !!a.bdQ1; $('m_bdNgayQ1').value = formatDateDDMMYYYY(a.bdNgayQ1 || '');
    $('m_bdQ2').checked = !!a.bdQ2; $('m_bdNgayQ2').value = formatDateDDMMYYYY(a.bdNgayQ2 || '');
    $('m_bdQ3').checked = !!a.bdQ3; $('m_bdNgayQ3').value = formatDateDDMMYYYY(a.bdNgayQ3 || '');
    $('m_bdQ4').checked = !!a.bdQ4; $('m_bdNgayQ4').value = formatDateDDMMYYYY(a.bdNgayQ4 || '');
  },
  setReadonly(readonly){
    $$('#assetForm input, #assetForm textarea').forEach(el => el.disabled = readonly);
    document.body.classList.toggle('viewer-mode', readonly);
  },
  readPayload(){
    return {
      id: AppState.editingId,
      soThe: clean($('m_soThe').value), soMay: clean($('m_soMay').value), loaiMay: clean($('m_loaiMay').value),
      viTri: clean($('m_viTri').value), ngayMua: clean($('m_ngayMua').value), noiMua: clean($('m_noiMua').value),
      ghiChu: clean($('m_ghiChu').value), suaChua: clean($('m_suaChua').value),
      daKiemKe: $('m_daKiemKe').checked, chonIn: $('m_chonIn').checked,
      bdQ1: $('m_bdQ1').checked, bdNgayQ1: clean($('m_bdNgayQ1').value),
      bdQ2: $('m_bdQ2').checked, bdNgayQ2: clean($('m_bdNgayQ2').value),
      bdQ3: $('m_bdQ3').checked, bdNgayQ3: clean($('m_bdNgayQ3').value),
      bdQ4: $('m_bdQ4').checked, bdNgayQ4: clean($('m_bdNgayQ4').value),
      nam: getSelectedYear()
    };
  }
};
const Table = {
  localFilter(){
    const q = normalizeText($('searchInput').value);
    const filter = $('statusFilter').value;
    AppState.filtered = AppState.assets.filter(a => {
      const text = normalizeText([a.soThe,a.soMay,a.loaiMay,a.viTri,a.ghiChu,a.noiMua,a.ngayMua,a.suaChua].join(' '));
      if(q && !text.includes(q)) return false;
      if(filter === 'daKiemKe' && !a.daKiemKe) return false;
      if(filter === 'chuaKiemKe' && a.daKiemKe) return false;
      if(filter === 'daIn' && !a.chonIn) return false;
      if(filter === 'chuaIn' && a.chonIn) return false;
      if(filter === 'canBaoDuong' && a.bdQ1 && a.bdQ2 && a.bdQ3 && a.bdQ4) return false;
      return true;
    });
  },
  render(){
    this.localFilter();
    this.renderKpis();
    $('resultInfo').textContent = `${AppState.filtered.length} / ${AppState.assets.length} dòng`;
    const tbody = $('assetTable').querySelector('tbody');
    tbody.innerHTML = AppState.filtered.map((a, idx) => this.rowHtml(a, idx)).join('');
    Qr.highlightFromHash();
  },
  rowHtml(a, idx){
    const checkedDisabled = AppState.isAdmin() ? '' : 'disabled';
    const actionButtons = AppState.isAdmin()
      ? `<button class="tiny-btn primary" data-act="edit" data-id="${a.id}"><i class="fa-solid fa-pen"></i></button><button class="tiny-btn" data-act="link" data-id="${a.id}"><i class="fa-solid fa-link"></i></button>`
      : `<button class="tiny-btn primary" data-act="view" data-id="${a.id}"><i class="fa-solid fa-eye"></i></button>`;
    return `<tr data-id="${esc(a.id)}" data-tag="${esc(a.soThe)}">
      <td class="sticky-col col-stt">${idx+1}</td>
      <td class="sticky-col col-tag"><b>VH-${esc(a.soThe)}</b></td>
      <td class="sticky-col col-machine">${esc(a.soMay)}</td>
      <td><div class="clamp">${esc(a.loaiMay)}</div></td>
      <td><div class="clamp">${esc(a.viTri)}</div></td>
      <td><div class="clamp">${esc(a.ghiChu)}</div></td>
      <td class="no-print"><div class="row-actions">${actionButtons}</div></td>
      <td><input class="row-check" data-field="daKiemKe" type="checkbox" ${a.daKiemKe?'checked':''} ${checkedDisabled}></td>
      <td><input class="row-check" data-field="chonIn" type="checkbox" ${a.chonIn?'checked':''} ${checkedDisabled}></td>
      <td>${esc(formatDateDDMMYYYY(a.ngayMua))}</td>
      <td><div class="clamp">${esc(a.noiMua)}</div></td>
      <td>${this.qBadge(a.bdQ1, a.bdNgayQ1)}</td>
      <td>${this.qBadge(a.bdQ2, a.bdNgayQ2)}</td>
      <td>${this.qBadge(a.bdQ3, a.bdNgayQ3)}</td>
      <td>${this.qBadge(a.bdQ4, a.bdNgayQ4)}</td>
      <td><div class="clamp">${esc(a.suaChua)}</div></td>
    </tr>`;
  },
  qBadge(done, date){
    return done ? `<span class="badge yes" title="${esc(formatDateDDMMYYYY(date))}">✓</span>` : '<span class="badge no">–</span>';
  },
  renderKpis(){
    const total = AppState.assets.length;
    const checked = AppState.assets.filter(x=>x.daKiemKe).length;
    const print = AppState.assets.filter(x=>x.chonIn).length;
    const q1 = AppState.assets.filter(x=>x.bdQ1).length;
    const q2 = AppState.assets.filter(x=>x.bdQ2).length;
    const need = AppState.assets.filter(x=>!(x.bdQ1 && x.bdQ2 && x.bdQ3 && x.bdQ4)).length;
    $('kpiGrid').innerHTML = [
      ['Tổng máy', total], ['Đã kiểm kê', checked], ['Chưa kiểm kê', total-checked], ['Đã chọn in', print], ['BD Q1/Q2', `${q1}/${q2}`], ['Còn thiếu BD', need]
    ].map(([label,value])=>`<div class="kpi"><span>${label}</span><b>${value}</b></div>`).join('');
  },
  findById(id){ return AppState.assets.find(a => String(a.id) === String(id)); },
  async patchCheckbox(id, field, value){
    const asset = this.findById(id); if(!asset) return;
    asset[field] = value;
    try{ await Api.saveAsset({...asset, nam:getSelectedYear()}); setStatus('Đã lưu thay đổi', 'ok'); this.render(); }
    catch(e){ asset[field] = !value; setStatus(e.message, 'error'); this.render(); }
  }
};
const Exporter = {
  csv(){
    const headers = ['STT','Số thẻ','Số máy','Loại máy','Vị trí','Ghi chú','Đã kiểm kê','Chọn in QR','Ngày mua','Nơi mua','BD Q1','Ngày BD Q1','BD Q2','Ngày BD Q2','BD Q3','Ngày BD Q3','BD Q4','Ngày BD Q4','Sửa chữa','Năm'];
    const rows = AppState.filtered.map((a,i)=>[
      i+1,a.soThe,a.soMay,a.loaiMay,a.viTri,a.ghiChu,a.daKiemKe?'TRUE':'FALSE',a.chonIn?'TRUE':'FALSE',a.ngayMua,a.noiMua,
      a.bdQ1?'TRUE':'FALSE',a.bdNgayQ1,a.bdQ2?'TRUE':'FALSE',a.bdNgayQ2,a.bdQ3?'TRUE':'FALSE',a.bdNgayQ3,a.bdQ4?'TRUE':'FALSE',a.bdNgayQ4,a.suaChua,a.nam || getSelectedYear()
    ]);
    const csv = '\uFEFF' + [headers, ...rows].map(r => r.map(csvCell).join(',')).join('\n');
    downloadText(`kiem-ke-may-${getSelectedYear()}.csv`, csv, 'text/csv;charset=utf-8');
  }
};
const Printer = {
  selectedForQr(){ return AppState.assets.filter(a => a.chonIn); },
  printQr(){
    const list = this.selectedForQr();
    if(!list.length){ alert('Chưa có dòng nào được chọn in QR.'); return; }
    const w = window.open('', '_blank');
    const base = currentBaseUrl();
    w.document.write(`<!DOCTYPE html><html><head><title>In tem QR</title><style>
      @page{size:A4 portrait;margin:4.3mm}body{font-family:Arial;margin:0;display:grid;grid-template-columns:repeat(5,1fr);gap:2mm;justify-items:center}.tem{width:32mm;height:34mm;border:.1px solid #000;border-radius:1px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;page-break-inside:avoid}.top,.bottom{font-weight:700;font-size:12px;line-height:1.1}.qr{line-height:0;margin:1px 0}canvas,img{width:76px!important;height:76px!important;display:block}</style></head><body>`);
    list.forEach(a=>w.document.write(`<div class="tem"><div class="top">VH-${esc(a.soThe)}</div><div class="qr" id="qr_${esc(a.soThe)}"></div><div class="bottom">SM: ${esc(a.soMay)}</div></div>`));
    w.document.write('</body></html>'); w.document.close();
    w.onload = () => {
      list.forEach(a => new QRCode(w.document.getElementById(`qr_${a.soThe}`), {text:`${base}#${encodeURIComponent(a.soThe)}`, width:90, height:90}));
      setTimeout(()=>{ w.focus(); w.print(); }, 500);
    };
  },
  printProfile(){
    const input = clean($('profileInput').value);
    if(!input){ alert("Nhập số thẻ, ví dụ: 1,2,3 hoặc all"); return; }
    const list = input.toLowerCase() === 'all' ? AppState.assets : input.split(',').map(x=>clean(x)).filter(Boolean).map(tag => AppState.assets.find(a => String(a.soThe) === String(tag))).filter(Boolean);
    if(!list.length){ alert('Không tìm thấy số thẻ cần in.'); return; }
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><title>In lý lịch máy</title><style>
      @page{size:A4 portrait;margin:18mm}body{font-family:Arial;color:#222}.page{page-break-after:always}.page:last-child{page-break-after:auto}.company{font-size:20px;font-weight:700;line-height:1.25}.title{text-align:center;font-size:22px;font-weight:800;margin:10px 0 14px}.topline{position:relative;min-height:112px}.qr{position:absolute;left:52px;top:4px}table{border-collapse:collapse;width:100%;margin-top:8px}th,td{border:1px solid #aaa;padding:8px;text-align:left;vertical-align:top}th{width:30%;background:#eee}.sign{text-align:right;margin-top:18px;line-height:1.8}.sign b{margin-right:92px}</style></head><body>`);
    list.forEach(a => {
      const qrId = `qr_${String(a.soThe).replace(/[^a-zA-Z0-9_-]/g,'_')}`;
      w.document.write(`<section class="page"><div class="company">${esc(window.APP_CONFIG.COMPANY_NAME_TOP)}<br><span style="margin-left:55px">${esc(window.APP_CONFIG.COMPANY_NAME_BOTTOM)}</span></div><div class="topline"><div class="qr" id="${qrId}"></div><div class="title">LÝ LỊCH MÁY VH-${esc(a.soThe)}</div></div>${this.profileTable(a)}<div class="sign">Vĩnh Long, ngày ..... tháng ..... năm .....<br><b>Người lập</b></div></section>`);
    });
    w.document.write('</body></html>'); w.document.close();
    w.onload = () => {
      list.forEach(a => {
        const qrId = `qr_${String(a.soThe).replace(/[^a-zA-Z0-9_-]/g,'_')}`;
        new QRCode(w.document.getElementById(qrId), {text:`${currentBaseUrl()}#${encodeURIComponent(a.soThe)}`, width:100, height:100});
      });
      setTimeout(()=>{ w.focus(); w.print(); }, 500);
    };
  },
  profileTable(a){
    const rows = [
      ['Số thẻ', `VH-${a.soThe}`], ['Số máy', a.soMay], ['Loại máy', a.loaiMay], ['Vị trí', a.viTri], ['Ghi chú', a.ghiChu],
      ['Đã kiểm kê', a.daKiemKe ? '✅' : '❌'], ['Ngày mua', a.ngayMua], ['Nơi mua', a.noiMua],
      ['Bảo dưỡng Q1', a.bdQ1 ? `✅ ${formatDateDDMMYYYY(a.bdNgayQ1)}` : ''], ['Bảo dưỡng Q2', a.bdQ2 ? `✅ ${formatDateDDMMYYYY(a.bdNgayQ2)}` : ''],
      ['Bảo dưỡng Q3', a.bdQ3 ? `✅ ${formatDateDDMMYYYY(a.bdNgayQ3)}` : ''], ['Bảo dưỡng Q4', a.bdQ4 ? `✅ ${formatDateDDMMYYYY(a.bdNgayQ4)}` : ''], ['Sửa chữa', a.suaChua]
    ];
    return `<table>${rows.map(([k,v])=>`<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>`;
  }
};
const Qr = {
  currentTag(){ return decodeURIComponent(location.hash.replace(/^#/, '') || '').trim(); },
  async openFromHash(){
    const tag = this.currentTag();
    if(!tag) return false;
    try{
      if(!AppState.token){ await App.loginViewer(true); }
      await App.loadAssets();
      const asset = AppState.assets.find(a => String(a.soThe).trim() === tag);
      if(asset){ Modal.open(asset); this.highlightFromHash(); return true; }
      const r = await Api.getByTag(tag, getSelectedYear());
      if(r?.data){ Modal.open(r.data); return true; }
      alert('Không tìm thấy máy: ' + tag);
    }catch(e){ alert(e.message); }
    return false;
  },
  highlightFromHash(){
    const tag = this.currentTag(); if(!tag) return;
    const row = document.querySelector(`#assetTable tbody tr[data-tag="${CSS.escape(tag)}"]`);
    if(row){ row.classList.add('hash-hit'); setTimeout(()=>row.scrollIntoView({behavior:'smooth', block:'center'}), 80); }
  },
  copyLink(asset){
    const link = `${currentBaseUrl()}#${encodeURIComponent(asset.soThe)}`;
    navigator.clipboard?.writeText(link).then(()=>alert('Đã copy link QR:\n' + link)).catch(()=>prompt('Copy link QR:', link));
  }
};
const Importer = {
  pick(){
    if(!AppState.isAdmin()){
      alert('Chỉ admin mới được nhập Excel');
      return;
    }
    $('excelInput').click();
  },

  async readFile(file){
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, {type:'array'});

    const sheetName = wb.SheetNames.includes('DanhSachMay')
      ? 'DanhSachMay'
      : wb.SheetNames[0];

    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, {defval:''});

    const data = rows
      .map(r => this.mapRow(r))
      .filter(r => r.soThe);

    if(!data.length){
      alert('Không đọc được dữ liệu. Kiểm tra lại file Excel.');
      return;
    }

    if(!confirm(`Nhập ${data.length} dòng vào năm ${getSelectedYear()}?\nNếu trùng Số thẻ sẽ ghi đè.`)){
      return;
    }

    try{
      setStatus('Đang nhập Excel...');
      const res = await Api.importAssets(data);
      await App.loadAssets();

      alert(`Đã nhập xong:\n- Thêm mới: ${res.inserted || 0}\n- Ghi đè: ${res.updated || 0}`);
      setStatus('Nhập Excel thành công', 'ok');
    }catch(e){
      alert(e.message);
      setStatus(e.message, 'error');
    }
  },

  mapRow(r){
    return {
      soThe: clean(r['Số thẻ']),
      soMay: clean(r['Số máy']),
      loaiMay: clean(r['Loại máy']),
      viTri: clean(r['Vị trí']),
      ghiChu: clean(r['Đơn vị mượn'] || r['Đơn vị mượn'] || r['Ghi chú']),

      daKiemKe: bool(r['Kiểm kê']),
      chonIn: bool(r['In mã QR']),

      ngayMua: formatDateDDMMYYYY(r['Ngày mua/mượn'] || r['Ngày mua/mượn']),
      noiMua: clean(r['Nơi mua']),

      bdQ1: bool(r['Bảo dưỡng Q1'] || r['Bảo dưỡng Q1']),
      bdQ2: bool(r['Bảo dưỡng Q2'] || r['Bảo dưỡng Q2']),
      bdQ3: bool(r['Bảo dưỡng Q3'] || r['Bảo dưỡng Q3']),
      bdQ4: bool(r['Bảo dưỡng Q4'] || r['Bảo dưỡng Q4']),

      bdNgayQ1: '',
      bdNgayQ2: '',
      bdNgayQ3: '',
      bdNgayQ4: '',

      suaChua: clean(r['Sửa chữa'])
    };
  }
};
const App = {
  init(){
    this.fillYears();
    this.bindEvents();
    this.restoreUi();
    if(Qr.currentTag()) Qr.openFromHash();
  },
  fillYears(){
    const y = new Date().getFullYear();
    const back = window.APP_CONFIG.DEFAULT_YEAR_BACK || 8;
    const forward = window.APP_CONFIG.DEFAULT_YEAR_FORWARD || 1;
    const saved = localStorage.getItem('kk_year') || String(y);
    $('yearSelect').innerHTML = '';
    for(let year = y + forward; year >= y - back; year--){
      const opt = document.createElement('option'); opt.value = year; opt.textContent = year; $('yearSelect').appendChild(opt);
    }
    $('yearSelect').value = saved;
  },
  restoreUi(){
    if(AppState.token && AppState.role){ this.showApp(); this.loadAssets(); }
    else this.showLogin();
  },
  showLogin(){
    $('loginView').classList.remove('hidden'); $('appView').classList.add('hidden'); $('btnLogout').classList.add('hidden');
    $('rolePill').textContent = 'Chưa đăng nhập'; document.body.classList.remove('viewer-mode');
  },
  showApp(){
    $('loginView').classList.add('hidden'); $('appView').classList.remove('hidden'); $('btnLogout').classList.remove('hidden');
    $('rolePill').textContent = AppState.isAdmin() ? 'Admin' : 'Chỉ xem'; document.body.classList.toggle('viewer-mode', AppState.isViewer());
  },
  async loginAdmin(){
    try{ const r = await Api.loginAdmin($('passwordInput').value); AppState.saveSession(r.token, r.role); this.showApp(); await this.loadAssets(); }
    catch(e){ alert(e.message); $('passwordInput').focus(); }
  },
  async loginViewer(silent=false){
    try{ const r = await Api.loginViewer(); AppState.saveSession(r.token, r.role); this.showApp(); return r; }
    catch(e){ if(!silent) alert(e.message); throw e; }
  },
  logout(){ AppState.clearSession(); this.showLogin(); },
  async loadAssets(){
    try{
      setStatus('Đang tải dữ liệu...');
      localStorage.setItem('kk_year', String(getSelectedYear()));
      const r = await Api.listAssets({year:getSelectedYear()});
      AppState.assets = (r.data || []).map(this.normalizeAsset);
      Table.render();
      setStatus(`Đã tải ${AppState.assets.length} dòng`, 'ok');
    }catch(e){ setStatus(e.message, 'error'); if(String(e.message).includes('token') || String(e.message).includes('hết hạn')) this.logout(); }
  },
  normalizeAsset(a){
    return { id:a.id, soThe:a.soThe||'', soMay:a.soMay||'', loaiMay:a.loaiMay||'', viTri:a.viTri||'', ghiChu:a.ghiChu||'', daKiemKe:!!a.daKiemKe, chonIn:!!a.chonIn, ngayMua:formatDateDDMMYYYY(a.ngayMua||''), noiMua:a.noiMua||'', bdQ1:!!a.bdQ1, bdNgayQ1:formatDateDDMMYYYY(a.bdNgayQ1||''), bdQ2:!!a.bdQ2, bdNgayQ2:formatDateDDMMYYYY(a.bdNgayQ2||''), bdQ3:!!a.bdQ3, bdNgayQ3:formatDateDDMMYYYY(a.bdNgayQ3||''), bdQ4:!!a.bdQ4, bdNgayQ4:formatDateDDMMYYYY(a.bdNgayQ4||''), suaChua:a.suaChua||'', nam:a.nam || getSelectedYear(), updatedAt:a.updatedAt || '' };
  },
  async saveAsset(payload){
    if(!payload.soThe){ alert('Số thẻ không được trống.'); return; }
    try{ setStatus('Đang lưu...'); await Api.saveAsset(payload); Modal.close(); await this.loadAssets(); setStatus('Đã lưu', 'ok'); }
    catch(e){ alert(e.message); setStatus(e.message, 'error'); }
  },
  async deleteCurrent(){
    if(!AppState.editingId) return;
    if(!confirm('Xóa máy này khỏi năm đang chọn?')) return;
    try{ await Api.deleteAsset(AppState.editingId); Modal.close(); await this.loadAssets(); setStatus('Đã xóa', 'ok'); }
    catch(e){ alert(e.message); }
  },
  async setPrintForFiltered(value){
    if(!AppState.filtered.length) return;
    if(!confirm(`${value ? 'Chọn' : 'Bỏ chọn'} in QR cho ${AppState.filtered.length} dòng đang lọc?`)) return;
    try{
      const rows = AppState.filtered.map(a => ({id:a.id, chonIn:value}));
      await Api.bulkPatch(rows); await this.loadAssets(); setStatus('Đã cập nhật chọn in QR', 'ok');
    }catch(e){ alert(e.message); }
  },
  bindEvents(){
    $('btnLogin').onclick = () => this.loginAdmin();
    $('passwordInput').onkeydown = e => { if(e.key === 'Enter') this.loginAdmin(); };
    $('btnViewer').onclick = () => this.loginViewer().then(()=>this.loadAssets());
    $('btnLogout').onclick = () => this.logout();
    $('btnReload').onclick = () => this.loadAssets();
    $('btnAdd').onclick = () => Modal.open(null);
    $('yearSelect').onchange = () => this.loadAssets();
    $('statusFilter').onchange = () => Table.render();
    $('searchInput').oninput = debounce(()=>Table.render(), 180);
    $('btnExportCsv').onclick = () => Exporter.csv();
    $('btnImportExcel').onclick = () => Importer.pick();

$('excelInput').onchange = e => {
  const file = e.target.files[0];
  if(file) Importer.readFile(file);
  e.target.value = '';
};
    $('btnPrintQr').onclick = () => Printer.printQr();
    $('btnPrintProfile').onclick = () => Printer.printProfile();
    $('btnCheckAllPrint').onclick = () => this.setPrintForFiltered(true);
    $('btnUncheckAllPrint').onclick = () => this.setPrintForFiltered(false);
    $('btnCloseModal').onclick = () => Modal.close(); $('btnCancelModal').onclick = () => Modal.close();
    $('btnDeleteAsset').onclick = () => this.deleteCurrent();
    $('assetModal').addEventListener('click', e => { if(e.target.id === 'assetModal') Modal.close(); });
    $('assetForm').addEventListener('submit', e => { e.preventDefault(); if(AppState.isAdmin()) this.saveAsset(Modal.readPayload()); });
    $('assetTable').addEventListener('click', e => {
      const btn = e.target.closest('button[data-act]'); if(!btn) return;
      const asset = Table.findById(btn.dataset.id); if(!asset) return;
      if(btn.dataset.act === 'edit' || btn.dataset.act === 'view') Modal.open(asset);
      if(btn.dataset.act === 'link') Qr.copyLink(asset);
    });
    $('assetTable').addEventListener('change', e => {
      const cb = e.target.closest('.row-check'); if(!cb || !AppState.isAdmin()) return;
      const row = cb.closest('tr'); Table.patchCheckbox(row.dataset.id, cb.dataset.field, cb.checked);
    });
    window.addEventListener('hashchange', () => Qr.openFromHash());
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
function formatDateDDMMYYYY(v){

  if(v === null || v === undefined || v === ''){
    return '';
  }

  // Excel serial date
  if(typeof v === 'number' || /^\d+$/.test(v)){

    const num = Number(v);

    // Excel serial date thường > 30000
    if(num > 30000){

      const excelEpoch = new Date(1899, 11, 30);

      const d = new Date(
        excelEpoch.getTime() + num * 86400000
      );

      const dd = String(d.getDate()).padStart(2,'0');
      const mm = String(d.getMonth()+1).padStart(2,'0');
      const yyyy = d.getFullYear();

      return `${dd}/${mm}/${yyyy}`;
    }
  }

  // đã đúng format rồi
  if(String(v).includes('/')){
    return String(v);
  }

  return String(v);
}
