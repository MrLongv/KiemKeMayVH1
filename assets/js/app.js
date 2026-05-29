window.APP_CONFIG = {
  API_BASE: 'https://kiem-ke-may-api.hoalangiongxoai.workers.dev',
  ADMIN_SESSION_HOURS: 12,
  DEFAULT_YEAR_BACK: 8,
  DEFAULT_YEAR_FORWARD: 1,
  COMPANY_NAME_TOP: 'CÔNG TY TNHH MAY XK',
  COMPANY_NAME_BOTTOM: 'VIỆT HỒNG'
};

/* =========================================================
   HELPERS
========================================================= */
const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const esc = (v) =>
  String(v ?? '').replace(/[&<>'"]/g, c => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    "'":'&#39;',
    '"':'&quot;'
  }[c]));

const clean = (v) => String(v ?? '').trim();

const bool = (v) =>
  v === true ||
  v === 1 ||
  v === '1' ||
  String(v).toLowerCase() === 'true' ||
  String(v).toLowerCase() === 'yes' ||
  String(v).includes('✅');

function setStatus(text, type = 'info'){
  const el = $('statusText');
  if(!el) return;

  el.textContent = text;
  el.style.color =
    type === 'error' ? '#dc2626' :
    type === 'ok' ? '#15803d' :
    '#0f62fe';
}

function getSelectedYear(){
  return Number($('yearSelect')?.value || new Date().getFullYear());
}

function normalizeText(str){
  return String(str ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .trim();
}

function currentBaseUrl(){
  return location.href.split('#')[0];
}

function downloadText(filename, text, mime = 'text/plain;charset=utf-8'){
  const blob = new Blob([text], { type:mime });
  const a = document.createElement('a');

  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();

  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function csvCell(v){
  const s = String(v ?? '');
  return /[",\n\r]/.test(s)
    ? `"${s.replace(/"/g,'""')}"`
    : s;
}

function debounce(fn, wait = 250){
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function formatDateDDMMYYYY(v){
  if(v === null || v === undefined || v === ''){
    return '';
  }

  if(typeof v === 'number' || /^\d+$/.test(String(v))){
    const num = Number(v);

    if(num > 30000){
      const excelEpoch = new Date(1899, 11, 30);
      const d = new Date(excelEpoch.getTime() + num * 86400000);

      const dd = String(d.getDate()).padStart(2,'0');
      const mm = String(d.getMonth() + 1).padStart(2,'0');
      const yyyy = d.getFullYear();

      return `${dd}/${mm}/${yyyy}`;
    }
  }

  const s = String(v).trim();

  if(/^\d{2}\/\d{2}\/\d{4}$/.test(s)){
    return s;
  }

  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m){
    return `${m[3]}/${m[2]}/${m[1]}`;
  }

  if(s.includes('/')){
    return s;
  }

  const d = new Date(s);
  if(!Number.isNaN(d.getTime())){
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }

  return s;
}

/* =========================================================
   STATE
========================================================= */
const AppState = {
  token: localStorage.getItem('kk_token') || '',
  role: localStorage.getItem('kk_role') || '',

  assets: [],
  filtered: [],
  totalRows: 0,
  stats: null,

  page: 1,
  pageSize: window.innerWidth <= 768 ? 50 : 100,

  editingId: null,

  isAdmin(){
    return this.role === 'admin';
  },

  isViewer(){
    return this.role === 'viewer';
  },

  saveSession(token, role){
    this.token = token;
    this.role = role;

    localStorage.setItem('kk_token', token);
    localStorage.setItem('kk_role', role);
    localStorage.setItem('kk_login_at', String(Date.now()));
  },

  clearSession(){
    this.token = '';
    this.role = '';
    this.assets = [];
    this.filtered = [];
    this.totalRows = 0;
    this.stats = null;
    this.page = 1;

    localStorage.removeItem('kk_token');
    localStorage.removeItem('kk_role');
    localStorage.removeItem('kk_login_at');
  }
};

/* =========================================================
   API
========================================================= */
const Api = {
  base(){
    return (window.APP_CONFIG?.API_BASE || '').replace(/\/$/, '');
  },

  async request(path, options = {}){
    const headers = Object.assign(
      {'Content-Type':'application/json'},
      options.headers || {}
    );

    if(AppState.token){
      headers.Authorization = `Bearer ${AppState.token}`;
    }

    const res = await fetch(
      this.base() + path,
      Object.assign({}, options, {headers})
    );

    const data = await res.json().catch(() => ({
      success:false,
      message:'API không trả JSON'
    }));

    if(!res.ok || data.success === false){
      throw new Error(data.message || `Lỗi API ${res.status}`);
    }

    return data;
  },

  loginAdmin(password){
    return this.request('/api/login', {
      method:'POST',
      body:JSON.stringify({password})
    });
  },

  loginViewer(){
    return this.request('/api/login', {
      method:'POST',
      body:JSON.stringify({mode:'viewer'})
    });
  },

  listAssets({
    year,
    q = '',
    filter = 'all',
    page = 1,
    pageSize = 50
  } = {}){
    const params = new URLSearchParams({
      year:String(year || getSelectedYear()),
      page:String(page),
      pageSize:String(pageSize)
    });

    if(q){
      params.set('q', q);
    }

    if(filter && filter !== 'all'){
      params.set('filter', filter);
    }

    return this.request('/api/assets?' + params.toString());
  },
exportAllAssets(year){
  return this.request(
    `/api/assets/export?year=${encodeURIComponent(year || getSelectedYear())}`
  );
},
  getByTag(tag, year){
    return this.request(
      `/api/assets/by-tag/${encodeURIComponent(tag)}?year=${encodeURIComponent(year)}`
    );
  },

  saveAsset(payload){
    return this.request('/api/assets', {
      method:'POST',
      body:JSON.stringify(payload)
    });
  },

  deleteAsset(id){
    return this.request(`/api/assets/${encodeURIComponent(id)}`, {
      method:'DELETE'
    });
  },

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

/* =========================================================
   MODAL
========================================================= */
const Modal = {
  open(asset = null){
    AppState.editingId = asset?.id || null;

    $('modalTitle').textContent = AppState.isViewer()
      ? 'Thông tin máy'
      : (asset ? 'Chỉnh sửa máy' : 'Thêm máy mới');

    this.setValues(asset || {});
    this.setReadonly(AppState.isViewer());

    $('btnDeleteAsset').style.visibility =
      asset && AppState.isAdmin() ? 'visible' : 'hidden';

    $('assetModal').classList.add('open');
    $('assetModal').setAttribute('aria-hidden','false');
    document.body.classList.add('no-scroll');

    setTimeout(() => $('m_soThe')?.focus(), 80);
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

    $('m_bdQ1').checked = !!a.bdQ1;
    $('m_bdNgayQ1').value = formatDateDDMMYYYY(a.bdNgayQ1 || '');

    $('m_bdQ2').checked = !!a.bdQ2;
    $('m_bdNgayQ2').value = formatDateDDMMYYYY(a.bdNgayQ2 || '');

    $('m_bdQ3').checked = !!a.bdQ3;
    $('m_bdNgayQ3').value = formatDateDDMMYYYY(a.bdNgayQ3 || '');

    $('m_bdQ4').checked = !!a.bdQ4;
    $('m_bdNgayQ4').value = formatDateDDMMYYYY(a.bdNgayQ4 || '');
  },

  setReadonly(readonly){
    $$('#assetForm input, #assetForm textarea').forEach(el => {
      el.disabled = readonly;
    });

    document.body.classList.toggle('viewer-mode', readonly);
  },

  readPayload(){
    return {
      id: AppState.editingId,

      soThe: clean($('m_soThe').value),
      soMay: clean($('m_soMay').value),
      loaiMay: clean($('m_loaiMay').value),
      viTri: clean($('m_viTri').value),
      ngayMua: clean($('m_ngayMua').value),
      noiMua: clean($('m_noiMua').value),
      ghiChu: clean($('m_ghiChu').value),
      suaChua: clean($('m_suaChua').value),

      daKiemKe: $('m_daKiemKe').checked,
      chonIn: $('m_chonIn').checked,

      bdQ1: $('m_bdQ1').checked,
      bdNgayQ1: clean($('m_bdNgayQ1').value),

      bdQ2: $('m_bdQ2').checked,
      bdNgayQ2: clean($('m_bdNgayQ2').value),

      bdQ3: $('m_bdQ3').checked,
      bdNgayQ3: clean($('m_bdNgayQ3').value),

      bdQ4: $('m_bdQ4').checked,
      bdNgayQ4: clean($('m_bdNgayQ4').value),

      nam: getSelectedYear()
    };
  }
};

/* =========================================================
   TABLE
========================================================= */
const Table = {
  localFilter(){
    AppState.filtered = AppState.assets;
  },

  pageCount(){
    return Math.max(
      1,
      Math.ceil(AppState.totalRows / AppState.pageSize)
    );
  },

  pageRows(){
    return AppState.filtered;
  },

  render(){
    this.localFilter();

    const maxPage = this.pageCount();

    if(AppState.page > maxPage) AppState.page = maxPage;
    if(AppState.page < 1) AppState.page = 1;

    this.renderKpis();

    $('resultInfo').textContent =
      `Đang xem ${AppState.assets.length} / ${AppState.totalRows} dòng`;

    const pagerInfo = $('pagerInfo');
    if(pagerInfo){
      pagerInfo.textContent =
        `Trang ${AppState.page}/${maxPage} · ${AppState.pageSize} dòng/trang`;
    }

    const prev = $('btnPrevPage');
    const next = $('btnNextPage');

    if(prev) prev.disabled = AppState.page <= 1;
    if(next) next.disabled = AppState.page >= maxPage;

    const tbody = $('assetTable').querySelector('tbody');
    const startIndex = (AppState.page - 1) * AppState.pageSize;

    tbody.innerHTML = this.pageRows()
      .map((a, idx) => this.rowHtml(a, startIndex + idx))
      .join('');

    Qr.highlightFromHash();
  },

  rowHtml(a, idx){
    const checkedDisabled = AppState.isAdmin() ? '' : 'disabled';

    const actionButtons = AppState.isAdmin()
      ? `<button class="tiny-btn primary" data-act="edit" data-id="${esc(a.id)}"><i class="fa-solid fa-pen"></i></button>
         <button class="tiny-btn" data-act="link" data-id="${esc(a.id)}"><i class="fa-solid fa-link"></i></button>`
      : `<button class="tiny-btn primary" data-act="view" data-id="${esc(a.id)}"><i class="fa-solid fa-eye"></i></button>`;

    return `<tr data-id="${esc(a.id)}" data-tag="${esc(a.soThe)}">
      <td class="col-stt">${idx + 1}</td>
      <td class="sticky-col col-tag"><b>VH-${esc(a.soThe)}</b></td>
      <td class="col-machine">${esc(a.soMay)}</td>
      <td><div class="clamp">${esc(a.loaiMay)}</div></td>
      <td><div class="clamp">${esc(a.viTri)}</div></td>
      <td><div class="clamp">${esc(a.ghiChu)}</div></td>
      <td class="no-print"><div class="row-actions">${actionButtons}</div></td>
      <td><input class="row-check" data-field="daKiemKe" type="checkbox" ${a.daKiemKe ? 'checked' : ''} ${checkedDisabled}></td>
      <td><input class="row-check" data-field="chonIn" type="checkbox" ${a.chonIn ? 'checked' : ''} ${checkedDisabled}></td>
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
    return done
      ? `<span class="badge yes" title="${esc(formatDateDDMMYYYY(date))}">✓</span>`
      : '<span class="badge no">–</span>';
  },

  renderKpis(){
    const s = AppState.stats || {};

    const total = Number(s.total ?? AppState.totalRows ?? 0);
    const checked = Number(s.checked ?? 0);
    const print = Number(s.print ?? 0);
    const q1 = Number(s.q1 ?? 0);
    const q2 = Number(s.q2 ?? 0);
    const need = Number(s.need ?? 0);

    $('kpiGrid').innerHTML = [
      ['Tổng máy', total],
      ['Đã kiểm kê', checked],
      ['Chưa kiểm kê', total - checked],
      ['Đã chọn in', print],
      ['BD Q1/Q2', `${q1}/${q2}`],
      ['Còn thiếu BD', need]
    ].map(([label, value]) =>
      `<div class="kpi"><span>${label}</span><b>${value}</b></div>`
    ).join('');
  },

  findById(id){
    return AppState.assets.find(a => String(a.id) === String(id));
  },

  async patchCheckbox(id, field, value){
    const asset = this.findById(id);
    if(!asset) return;

    asset[field] = value;

    try{
      await Api.saveAsset({...asset, nam:getSelectedYear()});
      setStatus('Đã lưu thay đổi', 'ok');
      await App.loadAssets();
    }catch(e){
      asset[field] = !value;
      setStatus(e.message, 'error');
      this.render();
    }
  }
};

/* =========================================================
   EXPORT
========================================================= */
const Exporter = {
  async csv(){
    try{
      setStatus('Đang xuất Excel toàn bộ dữ liệu...');

      const r = await Api.exportAllAssets(getSelectedYear());
      const list = (r.data || []).map(a => App.normalizeAsset(a));

      const rows = list.map((a, i) => ({
        'STT': i + 1,
        'Số thẻ': a.soThe,
        'Số máy': a.soMay,
        'Loại máy': a.loaiMay,
        'Vị trí': a.viTri,
        'Ghi chú': a.ghiChu,
        'Đã kiểm kê': a.daKiemKe ? 'TRUE' : 'FALSE',
        'Chọn in QR': a.chonIn ? 'TRUE' : 'FALSE',
        'Ngày mua': a.ngayMua,
        'Nơi mua': a.noiMua,
        'BD Q1': a.bdQ1 ? 'TRUE' : 'FALSE',
        'Ngày BD Q1': a.bdNgayQ1,
        'BD Q2': a.bdQ2 ? 'TRUE' : 'FALSE',
        'Ngày BD Q2': a.bdNgayQ2,
        'BD Q3': a.bdQ3 ? 'TRUE' : 'FALSE',
        'Ngày BD Q3': a.bdNgayQ3,
        'BD Q4': a.bdQ4 ? 'TRUE' : 'FALSE',
        'Ngày BD Q4': a.bdNgayQ4,
        'Sửa chữa': a.suaChua,
        'Năm': a.nam || getSelectedYear()
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);

      ws['!cols'] = [
        {wch:6},
        {wch:12},
        {wch:16},
        {wch:28},
        {wch:24},
        {wch:26},
        {wch:12},
        {wch:12},
        {wch:14},
        {wch:22},
        {wch:10},
        {wch:14},
        {wch:10},
        {wch:14},
        {wch:10},
        {wch:14},
        {wch:10},
        {wch:14},
        {wch:30},
        {wch:8}
      ];

      XLSX.utils.book_append_sheet(
        wb,
        ws,
        `KiemKe_${getSelectedYear()}`
      );

      XLSX.writeFile(
        wb,
        `kiem-ke-may-${getSelectedYear()}-tat-ca.xlsx`
      );

      setStatus(`Đã xuất Excel ${list.length} dòng`, 'ok');

    }catch(e){
      alert(e.message);
      setStatus(e.message, 'error');
    }
  }
};
/* =========================================================
   PRINT
========================================================= */
const Printer = {
  selectedForQr(){
    return AppState.assets.filter(a => a.chonIn);
  },

  printQr(){
    const list = this.selectedForQr();

    if(!list.length){
      alert('Chưa có dòng nào được chọn in QR trên trang hiện tại.');
      return;
    }

    const w = window.open('', '_blank');
    const base = currentBaseUrl();

    w.document.write(`<!DOCTYPE html><html><head><title>In tem QR</title><style>
      @page{size:A4 portrait;margin:4.3mm}
      body{font-family:Arial;margin:0;display:grid;grid-template-columns:repeat(5,1fr);gap:2mm;justify-items:center}
      .tem{width:32mm;height:34mm;border:.1px solid #000;border-radius:1px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;page-break-inside:avoid}
      .top,.bottom{font-weight:700;font-size:12px;line-height:1.1}
      .qr{line-height:0;margin:1px 0}
      canvas,img{width:76px!important;height:76px!important;display:block}
    </style></head><body>`);

    list.forEach(a => {
      w.document.write(`
        <div class="tem">
          <div class="top">VH-${esc(a.soThe)}</div>
          <div class="qr" id="qr_${esc(a.soThe)}"></div>
          <div class="bottom">SM: ${esc(a.soMay)}</div>
        </div>
      `);
    });

    w.document.write('</body></html>');
    w.document.close();

    w.onload = () => {
      list.forEach(a => {
        new QRCode(
          w.document.getElementById(`qr_${a.soThe}`),
          {
            text:`${base}#${encodeURIComponent(a.soThe)}`,
            width:90,
            height:90
          }
        );
      });

      setTimeout(() => {
        w.focus();
        w.print();
      }, 500);
    };
  },

  printProfile(){
    const input = clean($('profileInput').value);

    if(!input){
      alert('Nhập số thẻ, ví dụ: 1,2,3 hoặc all');
      return;
    }

    const list = input.toLowerCase() === 'all'
      ? AppState.assets
      : input.split(',')
          .map(x => clean(x))
          .filter(Boolean)
          .map(tag => AppState.assets.find(a => String(a.soThe) === String(tag)))
          .filter(Boolean);

    if(!list.length){
      alert('Không tìm thấy số thẻ cần in trên trang hiện tại.');
      return;
    }

    const w = window.open('', '_blank');

    w.document.write(`<!DOCTYPE html><html><head><title>In lý lịch máy</title><style>
      @page{size:A4 portrait;margin:18mm}
      body{font-family:Arial;color:#222}
      .page{page-break-after:always}
      .page:last-child{page-break-after:auto}
      .company{font-size:20px;font-weight:700;line-height:1.25}
      .title{text-align:center;font-size:22px;font-weight:800;margin:10px 0 14px}
      .topline{position:relative;min-height:112px}
      .qr{position:absolute;left:52px;top:4px}
      table{border-collapse:collapse;width:100%;margin-top:8px}
      th,td{border:1px solid #aaa;padding:8px;text-align:left;vertical-align:top}
      th{width:30%;background:#eee}
      .sign{text-align:right;margin-top:18px;line-height:1.8}
      .sign b{margin-right:92px}
    </style></head><body>`);

    list.forEach(a => {
      const qrId = `qr_${String(a.soThe).replace(/[^a-zA-Z0-9_-]/g,'_')}`;

      w.document.write(`
        <section class="page">
          <div class="company">
            ${esc(window.APP_CONFIG.COMPANY_NAME_TOP)}<br>
            <span style="margin-left:55px">${esc(window.APP_CONFIG.COMPANY_NAME_BOTTOM)}</span>
          </div>

          <div class="topline">
            <div class="qr" id="${qrId}"></div>
            <div class="title">LÝ LỊCH MÁY VH-${esc(a.soThe)}</div>
          </div>

          ${this.profileTable(a)}

          <div class="sign">
            Vĩnh Long, ngày ..... tháng ..... năm .....<br>
            <b>Người lập</b>
          </div>
        </section>
      `);
    });

    w.document.write('</body></html>');
    w.document.close();

    w.onload = () => {
      list.forEach(a => {
        const qrId = `qr_${String(a.soThe).replace(/[^a-zA-Z0-9_-]/g,'_')}`;

        new QRCode(
          w.document.getElementById(qrId),
          {
            text:`${currentBaseUrl()}#${encodeURIComponent(a.soThe)}`,
            width:100,
            height:100
          }
        );
      });

      setTimeout(() => {
        w.focus();
        w.print();
      }, 500);
    };
  },

  profileTable(a){
    const rows = [
      ['Số thẻ', `VH-${a.soThe}`],
      ['Số máy', a.soMay],
      ['Loại máy', a.loaiMay],
      ['Vị trí', a.viTri],
      ['Ghi chú', a.ghiChu],
      ['Đã kiểm kê', a.daKiemKe ? '✅' : '❌'],
      ['Ngày mua', a.ngayMua],
      ['Nơi mua', a.noiMua],
      ['Bảo dưỡng Q1', a.bdQ1 ? `✅ ${formatDateDDMMYYYY(a.bdNgayQ1)}` : ''],
      ['Bảo dưỡng Q2', a.bdQ2 ? `✅ ${formatDateDDMMYYYY(a.bdNgayQ2)}` : ''],
      ['Bảo dưỡng Q3', a.bdQ3 ? `✅ ${formatDateDDMMYYYY(a.bdNgayQ3)}` : ''],
      ['Bảo dưỡng Q4', a.bdQ4 ? `✅ ${formatDateDDMMYYYY(a.bdNgayQ4)}` : ''],
      ['Sửa chữa', a.suaChua]
    ];

    return `<table>${rows.map(([k,v]) =>
      `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`
    ).join('')}</table>`;
  }
};

/* =========================================================
   QR
========================================================= */
const Qr = {
  currentTag(){
    return decodeURIComponent(location.hash.replace(/^#/, '') || '').trim();
  },

  async goToHashRow(){
    const tag = this.currentTag();

    if(!tag){
      return;
    }

    try{
      setStatus('Đang tìm máy theo QR...');

      const r = await Api.getByTag(tag, getSelectedYear());

      const asset = App.normalizeAsset(r.data);

      AppState.page = 1;
      AppState.assets = [asset];
      AppState.filtered = [asset];
      AppState.totalRows = 1;
      AppState.stats = {
        total:1,
        checked: asset.daKiemKe ? 1 : 0,
        print: asset.chonIn ? 1 : 0,
        q1: asset.bdQ1 ? 1 : 0,
        q2: asset.bdQ2 ? 1 : 0,
        need: asset.bdQ1 && asset.bdQ2 && asset.bdQ3 && asset.bdQ4 ? 0 : 1
      };

      $('searchInput').value = tag;
      $('statusFilter').value = 'all';

      Table.render();

      setTimeout(() => {
        this.highlightFromHash();
      }, 120);

      setStatus(`Đã tìm thấy VH-${tag}`, 'ok');

    }catch(e){
      setStatus(e.message, 'error');
      alert(e.message);
    }
  },

  highlightFromHash(){
    const tag = this.currentTag();

    if(!tag){
      return;
    }

    document
      .querySelectorAll('#assetTable tbody tr.hash-hit')
      .forEach(row => row.classList.remove('hash-hit'));

    const row = document.querySelector(
      `#assetTable tbody tr[data-tag="${CSS.escape(tag)}"]`
    );

    if(row){
      row.classList.add('hash-hit');
      row.scrollIntoView({
        behavior:'smooth',
        block:'center'
      });
    }
  },

  copyLink(asset){
    const link = `${currentBaseUrl()}#${encodeURIComponent(asset.soThe)}`;

    navigator.clipboard?.writeText(link)
      .then(() => alert('Đã copy link QR:\n' + link))
      .catch(() => prompt('Copy link QR:', link));
  }
};

/* =========================================================
   IMPORT EXCEL
========================================================= */
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

      AppState.page = 1;
      await App.loadAssets();

      alert(
        `Đã nhập xong:\n` +
        `- Xử lý: ${res.processed || res.inserted || 0}\n` +
        `- Bỏ qua: ${res.skipped || 0}`
      );

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

/* =========================================================
   APP
========================================================= */
const App = {
  init(){
    this.fillYears();
    this.bindEvents();
    this.restoreUi();
  },

  fillYears(){
    const y = new Date().getFullYear();
    const back = window.APP_CONFIG.DEFAULT_YEAR_BACK || 8;
    const forward = window.APP_CONFIG.DEFAULT_YEAR_FORWARD || 1;
    const saved = localStorage.getItem('kk_year') || String(y);

    $('yearSelect').innerHTML = '';

    for(let year = y + forward; year >= y - back; year--){
      const opt = document.createElement('option');
      opt.value = year;
      opt.textContent = year;
      $('yearSelect').appendChild(opt);
    }

    $('yearSelect').value = saved;
  },

  restoreUi(){
    if(AppState.token && AppState.role){
      this.showApp();

      if(Qr.currentTag()){
        Qr.goToHashRow();
      }else{
        this.loadAssets();
      }

    }else{
      this.showLogin();
    }
  },

  showLogin(){
    $('loginView').classList.remove('hidden');
    $('appView').classList.add('hidden');
    $('btnLogout').classList.add('hidden');

    $('rolePill').textContent = 'Chưa đăng nhập';

    document.body.classList.remove('viewer-mode');
  },

  showApp(){
    $('loginView').classList.add('hidden');
    $('appView').classList.remove('hidden');
    $('btnLogout').classList.remove('hidden');

    $('rolePill').textContent = AppState.isAdmin()
      ? 'Admin'
      : 'Chỉ xem';

    document.body.classList.toggle('viewer-mode', AppState.isViewer());
  },

  async loginAdmin(){
    try{
      const r = await Api.loginAdmin($('passwordInput').value);

      AppState.saveSession(r.token, r.role);
      this.showApp();

      if(Qr.currentTag()){
        await Qr.goToHashRow();
      }else{
        await this.loadAssets();
      }

    }catch(e){
      alert(e.message);
      $('passwordInput').focus();
    }
  },

  async loginViewer(silent = false){
    try{
      if(Qr.currentTag()){
        alert('Vui lòng đăng nhập admin để xem thông tin máy từ QR.');
        throw new Error('QR yêu cầu đăng nhập admin');
      }

      const r = await Api.loginViewer();

      AppState.saveSession(r.token, r.role);
      this.showApp();

      return r;

    }catch(e){
      if(!silent){
        alert(e.message);
      }
      throw e;
    }
  },

  logout(){
    AppState.clearSession();
    this.showLogin();
  },

  normalizeAsset(a){
    return {
      id:a.id,
      soThe:a.soThe || '',
      soMay:a.soMay || '',
      loaiMay:a.loaiMay || '',
      viTri:a.viTri || '',
      ghiChu:a.ghiChu || '',

      daKiemKe:!!a.daKiemKe,
      chonIn:!!a.chonIn,

      ngayMua:formatDateDDMMYYYY(a.ngayMua || ''),
      noiMua:a.noiMua || '',

      bdQ1:!!a.bdQ1,
      bdNgayQ1:formatDateDDMMYYYY(a.bdNgayQ1 || ''),

      bdQ2:!!a.bdQ2,
      bdNgayQ2:formatDateDDMMYYYY(a.bdNgayQ2 || ''),

      bdQ3:!!a.bdQ3,
      bdNgayQ3:formatDateDDMMYYYY(a.bdNgayQ3 || ''),

      bdQ4:!!a.bdQ4,
      bdNgayQ4:formatDateDDMMYYYY(a.bdNgayQ4 || ''),

      suaChua:a.suaChua || '',
      nam:a.nam || getSelectedYear(),
      updatedAt:a.updatedAt || ''
    };
  },

  async loadAssets(){
    try{
      setStatus('Đang tải dữ liệu...');

      localStorage.setItem('kk_year', String(getSelectedYear()));

      const r = await Api.listAssets({
        year:getSelectedYear(),
        q: clean($('searchInput').value),
        filter: $('statusFilter').value,
        page: AppState.page,
        pageSize: AppState.pageSize
      });

      AppState.assets = (r.data || []).map(a => this.normalizeAsset(a));
      AppState.filtered = AppState.assets;
      AppState.totalRows = r.total || 0;
      AppState.stats = r.stats || null;

      Table.render();

      setStatus(
        `Đã tải ${AppState.assets.length}/${AppState.totalRows} dòng`,
        'ok'
      );

    }catch(e){
      setStatus(e.message, 'error');

      if(
        String(e.message).includes('token') ||
        String(e.message).includes('Token') ||
        String(e.message).includes('hết hạn') ||
        String(e.message).includes('đăng nhập')
      ){
        this.logout();
      }else{
        alert(e.message);
      }
    }
  },

  async saveAsset(payload){
    if(!payload.soThe){
      alert('Số thẻ không được trống.');
      return;
    }

    try{
      setStatus('Đang lưu...');

      await Api.saveAsset(payload);

      Modal.close();

      if(Qr.currentTag()){
        await Qr.goToHashRow();
      }else{
        await this.loadAssets();
      }

      setStatus('Đã lưu', 'ok');

    }catch(e){
      alert(e.message);
      setStatus(e.message, 'error');
    }
  },

  async deleteCurrent(){
    if(!AppState.editingId){
      return;
    }

    if(!confirm('Xóa máy này khỏi năm đang chọn?')){
      return;
    }

    try{
      await Api.deleteAsset(AppState.editingId);

      Modal.close();

      if(Qr.currentTag()){
        location.hash = '';
      }

      await this.loadAssets();

      setStatus('Đã xóa', 'ok');

    }catch(e){
      alert(e.message);
    }
  },

  async setPrintForFiltered(value){
    if(!AppState.filtered.length){
      return;
    }

    if(!confirm(`${value ? 'Chọn' : 'Bỏ chọn'} in QR cho ${AppState.filtered.length} dòng đang hiển thị?`)){
      return;
    }

    try{
      const rows = AppState.filtered.map(a => ({
        id:a.id,
        chonIn:value
      }));

      await Api.bulkPatch(rows);
      await this.loadAssets();

      setStatus('Đã cập nhật chọn in QR', 'ok');

    }catch(e){
      alert(e.message);
    }
  },

  bindEvents(){
    $('btnLogin').onclick = () => this.loginAdmin();

    $('passwordInput').onkeydown = e => {
      if(e.key === 'Enter'){
        this.loginAdmin();
      }
    };
   
    $('btnLogout').onclick = () => this.logout();

    $('btnReload').onclick = () => {
      AppState.page = 1;

      if(Qr.currentTag()){
        Qr.goToHashRow();
      }else{
        this.loadAssets();
      }
    };

    $('btnAdd').onclick = () => Modal.open(null);

    $('yearSelect').onchange = () => {
      AppState.page = 1;

      if(Qr.currentTag()){
        Qr.goToHashRow();
      }else{
        this.loadAssets();
      }
    };

    $('statusFilter').onchange = () => {
      AppState.page = 1;
      this.loadAssets();
    };

    $('searchInput').oninput = debounce(() => {
      AppState.page = 1;
      this.loadAssets();
    }, 300);

    $('btnExportCsv').onclick = () => Exporter.csv();

    $('btnImportExcel').onclick = () => Importer.pick();

    $('excelInput').onchange = e => {
      const file = e.target.files[0];

      if(file){
        Importer.readFile(file);
      }

      e.target.value = '';
    };

    $('btnPrintQr').onclick = () => Printer.printQr();

    $('btnPrintProfile').onclick = () => Printer.printProfile();

    $('btnCheckAllPrint').onclick = () => this.setPrintForFiltered(true);

    $('btnUncheckAllPrint').onclick = () => this.setPrintForFiltered(false);

    $('btnCloseModal').onclick = () => Modal.close();

    $('btnCancelModal').onclick = () => Modal.close();

    $('btnDeleteAsset').onclick = () => this.deleteCurrent();

    $('assetModal').addEventListener('click', e => {
      if(e.target.id === 'assetModal'){
        Modal.close();
      }
    });

    $('assetForm').addEventListener('submit', e => {
      e.preventDefault();

      if(AppState.isAdmin()){
        this.saveAsset(Modal.readPayload());
      }
    });

    $('assetTable').addEventListener('click', e => {
      const btn = e.target.closest('button[data-act]');
      if(!btn) return;

      const asset = Table.findById(btn.dataset.id);
      if(!asset) return;

      if(btn.dataset.act === 'edit' || btn.dataset.act === 'view'){
        Modal.open(asset);
      }

      if(btn.dataset.act === 'link'){
        Qr.copyLink(asset);
      }
    });

    $('assetTable').addEventListener('change', e => {
      const cb = e.target.closest('.row-check');

      if(!cb || !AppState.isAdmin()){
        return;
      }

      const row = cb.closest('tr');

      Table.patchCheckbox(
        row.dataset.id,
        cb.dataset.field,
        cb.checked
      );
    });

    window.addEventListener('hashchange', () => {
      if(AppState.token && AppState.role){
        Qr.goToHashRow();
      }else{
        App.showLogin();
      }
    });

    $('btnPrevPage').onclick = () => {
      AppState.page--;

      if(AppState.page < 1){
        AppState.page = 1;
      }

      this.loadAssets();
    };

    $('btnNextPage').onclick = () => {
      const maxPage = Table.pageCount();

      if(AppState.page >= maxPage){
        return;
      }

      AppState.page++;
      this.loadAssets();
    };
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
