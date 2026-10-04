const user = JSON.parse(localStorage.getItem('vetcare_user'));
const token = localStorage.getItem('vetcare_token');
if (!token || (user && user.role !== 'Lekar' && user.role !== 'Admin')) window.location.href = 'index.html';

const dnyVTydnu = [
    { id: 1, nazev: 'Pondělí' },
    { id: 2, nazev: 'Úterý' },
    { id: 3, nazev: 'Středa' },
    { id: 4, nazev: 'Čtvrtek' },
    { id: 5, nazev: 'Pátek' },
    { id: 6, nazev: 'Sobota' },
    { id: 0, nazev: 'Neděle' }
];

// Globální stav režiimů zobrazení kalendáře
let currentReservationMode = 'day'; // 'day', 'week', 'month'
let loadedReservationsCache = []; // Cache načtených rezervací

/* --- DETEKCE MOBILNÍHO ZAŘÍZENÍ --- */
function isMobileDevice() {
    const uaMobile = /Android.+Mobile|iPhone|iPod|Windows Phone|Mobi/i.test(navigator.userAgent);
    const narrow = window.matchMedia('(max-width: 767px)').matches;
    return uaMobile || narrow;
}
let wasMobile = isMobileDevice();

// Na mobilu skryje tlačítko "Měsíc" (a případný měsíční pohled přepne na týden)
function applyDeviceLayout() {
    const mobile = isMobileDevice();
    const btnMonth = document.getElementById('btn-mode-month');
    if (btnMonth) btnMonth.classList.toggle('hidden', mobile);
    if (mobile && currentReservationMode === 'month') {
        currentReservationMode = 'week';
    }
    // Znovu nastaví viditelnost pod-pohledů a stylů tlačítek (bez načtení dat)
    setReservationMode(currentReservationMode, true);
}

window.addEventListener('resize', () => {
    const mobile = isMobileDevice();
    if (mobile !== wasMobile) {
        wasMobile = mobile;
        applyDeviceLayout();
    }
});

window.addEventListener('DOMContentLoaded', () => {
    if (user) {
        document.getElementById('doc-name').textContent = `${user.titul || 'MVDr.'} ${user.jmeno} ${user.prijmeni}`;
        document.getElementById('doc-email-display').textContent = user.email || '';
    }

    const today = new Date();
    const localDate = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    document.getElementById('doc-filter-date').value = localDate;
    
    renderWorkingHoursFields();
    applyDeviceLayout();
    loadAgenda();
    loadAbsences();
    loadDoctorProfile();
});

function switchView(viewId) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.getElementById(viewId).classList.remove('hidden');

    if (viewId === 'view-nastaveni') loadDoctorProfile();
    else if (viewId === 'view-nepritomnost') loadAbsences();
    else if (viewId === 'view-rezervace') loadAgenda();
}

/* --- LOGIKA PŘEPÍNÁNÍ DEN / TÝDEN / MĚSÍC --- */
function setReservationMode(mode, skipLoad = false) {
    const mobile = isMobileDevice();
    if (mobile && mode === 'month') mode = 'week'; // měsíc se na mobilu nenabízí
    currentReservationMode = mode;

    // 1. Zobrazení / skrytí vstupního pole datum vpravo nahoře
    const filterDateInput = document.getElementById('doc-filter-date');
    if (filterDateInput) {
        if (mode === 'day') {
            filterDateInput.classList.remove('hidden');
        } else {
            filterDateInput.classList.add('hidden');
        }
    }

    // 2. Aktualizace stylů tlačítek a viditelnosti pod-pohledů
    ['day', 'week', 'month'].forEach(m => {
        const btn = document.getElementById(`btn-mode-${m}`);
        if (btn) {
            if (m === mode) {
                btn.className = "px-3 py-1.5 text-xs font-bold rounded-lg transition bg-white text-emerald-700 shadow-sm";
            } else {
                btn.className = "px-3 py-1.5 text-xs font-bold rounded-lg transition text-slate-600 hover:text-slate-900";
            }
        }

        // Na mobilu se tlačítko "Měsíc" nikdy nezobrazuje (className výše by třídu hidden přepsal)
        if (btn && m === 'month') btn.classList.toggle('hidden', mobile);

        const subview = document.getElementById(`subview-${m}`);
        if (subview) {
            // Týden: na mobilu se místo mřížky zobrazí svislý seznam dnů
            const visible = (m === mode) && !(m === 'week' && mobile);
            subview.classList.toggle('hidden', !visible);
        }
    });

    const mobileWeek = document.getElementById('subview-week-mobile');
    if (mobileWeek) mobileWeek.classList.toggle('hidden', !(mobile && mode === 'week'));

    if (!skipLoad) loadAgenda();
}

/* --- POMOCNÁ FUNKCE PRO AKTUALIZACI POPISKU MEZI ŠIPKAMI --- */
function updateNavigationLabel(baseDate) {
    const titleEl = document.getElementById('calendar-title');
    if (!titleEl) return;

    if (currentReservationMode === 'day') {
        titleEl.textContent = VetCareI18n.t('Seznam rezervací na {0}', baseDate.toLocaleDateString(VetCareI18n.locale()));
    } else if (currentReservationMode === 'week') {
        const { start, end } = getWeekRange(baseDate);
        titleEl.textContent = VetCareI18n.t('Týdenní kalendář ({0} – {1})', start.toLocaleDateString(VetCareI18n.locale()), end.toLocaleDateString(VetCareI18n.locale()));
    } else if (currentReservationMode === 'month') {
        const titleMonth = baseDate.toLocaleDateString(VetCareI18n.locale(), { month: 'long', year: 'numeric' });
        // Převod prvního písmena měsíce na velké
        const formattedMonth = titleMonth.charAt(0).toUpperCase() + titleMonth.slice(1);
        titleEl.textContent = VetCareI18n.t('Měsíční kalendář ({0})', formattedMonth);
    }
}

function navigateCalendar(delta) {
    const input = document.getElementById('doc-filter-date');
    const currentDate = new Date(input.value || new Date());

    if (currentReservationMode === 'day') {
        currentDate.setDate(currentDate.getDate() + delta);
    } else if (currentReservationMode === 'week') {
        currentDate.setDate(currentDate.getDate() + (delta * 7));
    } else if (currentReservationMode === 'month') {
        currentDate.setMonth(currentDate.getMonth() + delta);
    }

    const localDate = new Date(currentDate.getTime() - (currentDate.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    input.value = localDate;
    loadAgenda();
}

function navigateCalendarToToday() {
    const today = new Date();
    const localDate = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    document.getElementById('doc-filter-date').value = localDate;
    loadAgenda();
}

/* --- NAČÍTÁNÍ AGENDY PODLE ZVOLENÉHO REŽIMU --- */
async function loadAgenda() {
    const dateStr = document.getElementById('doc-filter-date').value;
    if (!dateStr) return;

    const baseDate = new Date(dateStr);
    const titleEl = document.getElementById('calendar-title');

    // Aktualizace popisu mezi šipkami
    updateNavigationLabel(baseDate);
    
    if (currentReservationMode === 'day') {
        titleEl.textContent = VetCareI18n.t('Seznam rezervací na {0}', baseDate.toLocaleDateString(VetCareI18n.locale()));
        await loadDayAgenda(dateStr);
    } else if (currentReservationMode === 'week') {
        const { start, end } = getWeekRange(baseDate);
        titleEl.textContent = VetCareI18n.t('Týdenní kalendář ({0} – {1})', start.toLocaleDateString(VetCareI18n.locale()), end.toLocaleDateString(VetCareI18n.locale()));
        await loadRangeAgenda(start, end, isMobileDevice() ? renderWeekMobile : renderWeekCalendar);
    } else if (currentReservationMode === 'month') {
        const titleMonth = baseDate.toLocaleDateString(VetCareI18n.locale(), { month: 'long', year: 'numeric' });
        titleEl.textContent = VetCareI18n.t('Měsíční kalendář ({0})', titleMonth);
        const { start, end } = getMonthRange(baseDate);
        await loadRangeAgenda(start, end, (reservations) => renderMonthCalendar(baseDate, reservations));
    }
}

async function loadDayAgenda(datum) {
    const tbody = document.getElementById('doc-agenda-table');

    try {
        const res = await fetch(`/api/lekar/rezervace?datum=${datum}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();

        if (!res.ok || !Array.isArray(data)) {
            const chybovaZprava = data.message || data.error || 'Chyba při načítání dat ze serveru.';
            tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-600 font-semibold"><i class="fa-solid fa-triangle-exclamation mr-1"></i> ${chybovaZprava}</td></tr>`;
            return;
        }

        loadedReservationsCache = data;

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-gray-400">Žádné rezervace pro tento den.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(r => `
            <tr class="hover:bg-gray-50">
                <td class="p-3 font-bold text-slate-700">${r.cas}</td>
                <td class="p-3"><div class="font-bold">${r.zvire_jmeno}</div><div class="text-xs text-gray-400">${r.zvire_druh}</div></td>
                <td class="p-3"><div>${r.klient_jmeno}</div><div class="text-xs text-gray-400">${r.klient_telefon || r.klient_email}</div></td>
                <td class="p-3">${r.ukon_nazev}</td>
                <td class="p-3"><span class="px-2 py-1 text-xs font-bold rounded-full ${r.stav === 'Plánovaná' || r.stav === 'Potvrzeno' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}">${r.stav}</span></td>
                <td class="p-3 text-right">
                    <div class="flex justify-end gap-2">
                        <button onclick="openEmailModal(${r.id}, '${r.klient_jmeno}')" class="text-emerald-600 hover:text-emerald-800 text-xs font-bold bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition">
                            <i class="fa-solid fa-envelope"></i> E-mail
                        </button>
                        <button onclick="openCancelModal(${r.id})" class="text-red-600 hover:text-red-800 text-xs font-bold bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition">
                            <i class="fa-solid fa-xmark"></i> Zrušit
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

    } catch (err) {
        console.error('Chyba při načítání agendy:', err);
        tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-600 font-semibold"><i class="fa-solid fa-plug-circle-xmark mr-1"></i> Chyba komunikace se serverem.</td></tr>`;
    }
}

async function loadRangeAgenda(startDate, endDate, renderCallback) {
    const startStr = formatDateIso(startDate);
    const endStr = formatDateIso(endDate);

    try {
        const res = await fetch(`/api/lekar/rezervace?datum_od=${startStr}&datum_do=${endStr}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        let data = await res.json();

        // Fallback pro backend bez podpory od/do: načteme po dnech nebo zpracujeme pole
        if (!res.ok || !Array.isArray(data)) {
            data = [];
        }

        loadedReservationsCache = data;
        renderCallback(data);
    } catch (err) {
        console.error('Chyba při načítání rozmezí agendy:', err);
        renderCallback([]);
    }
}

/* --- VYKRESLENÍ TÝDENNÍHO KALENDÁŘE S HODINAMI VLEVO I VPRAVO --- */
function renderWeekCalendar(reservations) {
    const baseDate = new Date(document.getElementById('doc-filter-date').value);
    const days = getWeekDays(baseDate);

    const headerEl = document.getElementById('week-calendar-header');
    const bodyEl = document.getElementById('week-calendar-body');

    // Nastavení rozsahu hodin pro kalendář
    const START_HOUR = 7;  // 07:00
    const END_HOUR = 19;   // 19:00
    const HOUR_HEIGHT = 120; // Výška jedné hodiny v px

    // 1. Vykreslení hlavičky týdne
    let headerHtml = `<div class="text-slate-400 font-normal self-center">Čas</div>`;
    headerHtml += days.map(d => {
        const isToday = isSameDay(d, new Date());
        return `
            <div class="py-1 ${isToday ? 'bg-emerald-50 text-emerald-700 font-extrabold rounded-lg' : ''}">
                <div>${d.toLocaleDateString(VetCareI18n.locale(), { weekday: 'short' })}</div>
                <div class="text-sm">${d.getDate()}. ${d.getMonth() + 1}.</div>
            </div>
        `;
    }).join('');
    headerHtml += `<div class="text-slate-400 font-normal self-center">Čas</div>`;
    headerEl.innerHTML = headerHtml;

    // 2. Příprava hodinového gridu
    const totalHours = END_HOUR - START_HOUR;
    const totalHeight = totalHours * HOUR_HEIGHT;

    // Sloupeček s časovými značkami
    let timeAxisHtml = '';
    for (let h = START_HOUR; h < END_HOUR; h++) {
        const timeStr = `${h.toString().padStart(2, '0')}:00`;
        timeAxisHtml += `
            <div style="height: ${HOUR_HEIGHT}px;" class="border-b border-gray-100 text-[11px] font-semibold text-slate-400 p-1 text-center select-none">
                ${timeStr}
            </div>
        `;
    }

    // Sloupce pro jednotlivé dny
    let daysColumnsHtml = days.map(d => {
        const dayStr = formatDateIso(d);
        const isToday = isSameDay(d, new Date());
        const dayReservations = reservations.filter(r => (r.datum === dayStr || r.datum_cas?.startsWith(dayStr)));

        // Vykreslení podkladových linek pro hodiny
        let hourGridLines = '';
        for (let h = START_HOUR; h < END_HOUR; h++) {
            hourGridLines += `<div style="height: ${HOUR_HEIGHT}px;" class="border-b border-gray-100"></div>`;
        }

        // Vykreslení jednotlivých rezervací v daném dni
        const reservationCardsHtml = dayReservations.map(r => {
            // Výpočet pozice z času rezervace (např. "08:30" nebo "08:30:00")
            let topPx = 0;
            let durationMinutes = r.delka || r.trvani || 30; // Výchozí trvání 30 min pokud není v API

            if (r.cas) {
                const parts = r.cas.split(':');
                const hour = parseInt(parts[0], 10);
                const min = parseInt(parts[1], 10);

                if (hour >= START_HOUR && hour < END_HOUR) {
                    const minutesFromStart = ((hour - START_HOUR) * 60) + min;
                    topPx = (minutesFromStart / 60) * HOUR_HEIGHT;
                } else if (hour < START_HOUR) {
                    topPx = 0; // Oříznutí na začátek
                }
            }

            const cardHeightPx = Math.max((durationMinutes / 60) * HOUR_HEIGHT, 28); // Minimální výška pro přehlednost

            return `
                <div onclick='openDetailModal(${JSON.stringify(r).replace(/'/g, "&apos;")})' 
                     style="top: ${topPx}px; height: ${cardHeightPx}px;"
                     class="absolute left-1 right-1 p-1.5 rounded-lg border text-xs cursor-pointer shadow-sm hover:shadow-md transition overflow-hidden z-10 ${r.stav === 'Zrušeno' ? 'bg-red-50 border-red-300 text-red-900' : 'bg-emerald-50 border-emerald-300 text-emerald-950 hover:bg-emerald-100'}">
                    <div class="font-bold text-[11px] flex justify-between items-center leading-tight">
                        <span class="truncate"><i class="fa-regular fa-clock mr-1"></i>${r.cas}</span>
                        <span class="text-[9px] px-1 py-0.2 rounded ${r.stav === 'Zrušeno' ? 'bg-red-200 text-red-800' : 'bg-emerald-200 text-emerald-800'}">${r.stav}</span>
                    </div>
                    <div class="font-semibold truncate text-[11px] mt-0.5">${r.zvire_jmeno} <span class="font-normal text-slate-500">(${r.zvire_druh || 'pacient'})</span></div>
                    ${cardHeightPx > 40 ? `<div class="text-[10px] text-slate-600 truncate">${r.ukon_nazev || ''}</div>` : ''}
                    ${cardHeightPx > 55 ? `<div class="text-[9px] text-slate-400 truncate mt-0.5"><i class="fa-solid fa-user mr-1"></i>${r.klient_jmeno || ''}</div>` : ''}
                </div>
            `;
        }).join('');

        return `
            <div class="relative ${isToday ? 'bg-emerald-50/20' : 'bg-white'}" style="height: ${totalHeight}px;">
                ${hourGridLines}
                ${reservationCardsHtml}
            </div>
        `;
    }).join('');

    // Sestavení celého těla kalendáře: Časový sloupec vlevo + 7 dní + Časový sloupec vpravo
    bodyEl.innerHTML = `
        <div class="bg-slate-50/50" style="height: ${totalHeight}px;">${timeAxisHtml}</div>
        ${daysColumnsHtml}
        <div class="bg-slate-50/50" style="height: ${totalHeight}px;">${timeAxisHtml}</div>
    `;
}

/* --- MOBILNÍ TÝDENNÍ POHLED: DNY POD SEBOU, ČASOVÁ OSA VPRAVO --- */
function renderWeekMobile(reservations) {
    const baseDate = new Date(document.getElementById('doc-filter-date').value);
    const days = getWeekDays(baseDate);
    const bodyEl = document.getElementById('week-mobile-body');
    if (!bodyEl) return;

    const HOUR_HEIGHT = 72;   // výška jedné hodiny v px
    const MIN_CARD_H = 44;    // minimální výška karty rezervace
    const dayNames = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];

    const toMinutes = (r) => {
        if (!r.cas) return 0;
        const p = r.cas.split(':');
        return parseInt(p[0], 10) * 60 + (parseInt(p[1], 10) || 0);
    };

    bodyEl.innerHTML = days.map(d => {
        const dayStr = formatDateIso(d);
        const isToday = isSameDay(d, new Date());
        const dayRes = reservations
            .filter(r => (r.datum === dayStr || r.datum_cas?.startsWith(dayStr)))
            .sort((a, b) => toMinutes(a) - toMinutes(b));

        const header = `
            <div class="px-3 py-2 flex justify-between items-center border-b ${isToday ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-slate-700'}">
                <div class="font-extrabold text-sm">${dayNames[d.getDay()]} <span class="font-semibold">${d.getDate()}. ${d.getMonth() + 1}.</span></div>
                <div class="text-[11px] font-semibold ${isToday ? 'text-emerald-700' : 'text-slate-400'}">${dayRes.length ? dayRes.length + ' rez.' : ''}${isToday ? (dayRes.length ? ' · ' : '') + 'dnes' : ''}</div>
            </div>`;

        if (dayRes.length === 0) {
            return `
                <div class="border rounded-2xl overflow-hidden bg-white shadow-sm">
                    ${header}
                    <div class="p-3 text-xs text-gray-400 text-center">Žádné rezervace</div>
                </div>`;
        }

        // Rozsah časové osy podle rezervací (min. 7:00–19:00)
        const durOf = (r) => r.delka || r.trvani || 30;
        let startHour = 7, endHour = 19;
        dayRes.forEach(r => {
            startHour = Math.min(startHour, Math.floor(toMinutes(r) / 60));
            endHour = Math.max(endHour, Math.ceil((toMinutes(r) + durOf(r)) / 60));
        });
        endHour = Math.min(endHour, 24);
        const totalHeight = (endHour - startHour) * HOUR_HEIGHT;

        // Rozložení překrývajících se rezervací vedle sebe
        const items = dayRes.map(r => {
            const top = ((toMinutes(r) - startHour * 60) / 60) * HOUR_HEIGHT;
            const height = Math.max((durOf(r) / 60) * HOUR_HEIGHT, MIN_CARD_H);
            return { r, top, height, col: 0, cols: 1 };
        });
        let cluster = [], clusterEnd = -1;
        const flush = () => {
            const n = Math.max(...cluster.map(i => i.col)) + 1;
            cluster.forEach(i => i.cols = n);
            cluster = [];
        };
        items.forEach(it => {
            if (cluster.length && it.top >= clusterEnd) { flush(); clusterEnd = -1; }
            const used = cluster.filter(c => c.top + c.height > it.top).map(c => c.col);
            let col = 0;
            while (used.includes(col)) col++;
            it.col = col;
            cluster.push(it);
            clusterEnd = Math.max(clusterEnd, it.top + it.height);
        });
        if (cluster.length) flush();

        let gridLines = '', axis = '';
        for (let h = startHour; h < endHour; h++) {
            gridLines += `<div style="height:${HOUR_HEIGHT}px;" class="border-b border-gray-100"></div>`;
            axis += `<div style="height:${HOUR_HEIGHT}px;" class="border-b border-gray-100 text-[11px] font-semibold text-slate-400 pt-1 text-center select-none">${h.toString().padStart(2, '0')}:00</div>`;
        }

        const cards = items.map(({ r, top, height, col, cols }) => {
            const widthPct = 100 / cols;
            const cancelled = r.stav === 'Zrušeno';
            return `
                <div onclick='openDetailModal(${JSON.stringify(r).replace(/'/g, "&apos;")})'
                     style="top:${top}px; height:${height}px; left:calc(${col * widthPct}% + 2px); width:calc(${widthPct}% - 4px);"
                     class="absolute p-1.5 rounded-lg border text-xs cursor-pointer shadow-sm overflow-hidden z-10 ${cancelled ? 'bg-red-50 border-red-300 text-red-900' : 'bg-emerald-50 border-emerald-300 text-emerald-950 active:bg-emerald-100'}">
                    <div class="font-bold text-[11px] flex justify-between items-center leading-tight gap-1">
                        <span class="truncate"><i class="fa-regular fa-clock mr-1"></i>${r.cas || ''}</span>
                        <span class="text-[9px] px-1 rounded ${cancelled ? 'bg-red-200 text-red-800' : 'bg-emerald-200 text-emerald-800'}">${r.stav || ''}</span>
                    </div>
                    <div class="font-semibold truncate text-[11px] mt-0.5">${r.zvire_jmeno || ''} <span class="font-normal text-slate-500">(${r.zvire_druh || 'pacient'})</span></div>
                    ${height > 58 ? `<div class="text-[10px] text-slate-600 truncate">${r.ukon_nazev || ''}</div>` : ''}
                    ${height > 74 ? `<div class="text-[9px] text-slate-400 truncate mt-0.5"><i class="fa-solid fa-user mr-1"></i>${r.klient_jmeno || ''}</div>` : ''}
                </div>`;
        }).join('');

        return `
            <div class="border rounded-2xl overflow-hidden bg-white shadow-sm">
                ${header}
                <div class="flex">
                    <div class="relative flex-1 ${isToday ? 'bg-emerald-50/20' : 'bg-white'}" style="height:${totalHeight}px;">
                        ${gridLines}
                        ${cards}
                    </div>
                    <div class="w-12 shrink-0 border-l border-gray-200 bg-slate-50/50" style="height:${totalHeight}px;">${axis}</div>
                </div>
            </div>`;
    }).join('');
}

/* --- VYKRESLENÍ MĚSÍČNÍHO KALENDÁŘE --- */
function renderMonthCalendar(baseDate, reservations) {
    const bodyEl = document.getElementById('month-calendar-body');
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    let startDayOfWeek = firstDayOfMonth.getDay() - 1; // 0 = Pondělí
    if (startDayOfWeek === -1) startDayOfWeek = 6; // Neděle

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];

    // Prázdné buňky před 1. dnem
    for (let i = 0; i < startDayOfWeek; i++) {
        cells.push(`<div class="bg-slate-50/50 p-2 min-h-[200px]"></div>`);
    }

    // Buňky pro jednotlivé dny
    for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month, day);
        const dayStr = formatDateIso(d);
        const isToday = isSameDay(d, new Date());

        const dayReservations = reservations.filter(r => (r.datum === dayStr || r.datum_cas?.startsWith(dayStr)));
        dayReservations.sort((a, b) => (a.cas || '').localeCompare(b.cas || ''));

        cells.push(`
            <div class="p-1.5 min-h-[220px] bg-white flex flex-col justify-start overflow-hidden">
                <div class="text-right text-xs font-bold mb-1">
                    <span class="${isToday ? 'bg-emerald-600 text-white w-5 h-5 inline-flex items-center justify-center rounded-full' : 'text-slate-600'}">${day}</span>
                </div>
                <div class="space-y-1 overflow-y-auto max-h-[190px]">
                    ${dayReservations.map(r => `
                        <div onclick='openDetailModal(${JSON.stringify(r).replace(/'/g, "&apos;")})' class="p-1 rounded text-[10px] cursor-pointer truncate font-medium ${r.stav === 'Zrušeno' ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200'}">
                            <span class="font-bold">${r.cas}</span> ${r.zvire_jmeno} -${r.ukon_nazev}
                        </div>
                    `).join('')}
                </div>
            </div>
        `);
    }

    bodyEl.innerHTML = cells.join('');
}

// Bezpečné vložení volného textu (poznámka od klienta) do HTML
function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/* --- MODAL DETAILU REZERVACE ZE TÝDENNÍHO / MĚSÍČNÍHO KALENDÁŘE --- */
function openDetailModal(resObj) {
    const modalBody = document.getElementById('detail-modal-body');
    modalBody.innerHTML = `
        <div class="bg-slate-50 p-3 rounded-xl space-y-1.5 border">
            <div><span class="font-bold text-gray-500 uppercase text-xs">Datum a Čas:</span> <span class="font-semibold text-slate-800">${resObj.datum || ''} v ${resObj.cas || ''}</span></div>
            <div><span class="font-bold text-gray-500 uppercase text-xs">Pacient:</span> <span class="font-semibold text-slate-800">${resObj.zvire_jmeno || ''}</span> (${resObj.zvire_druh || ''})</div>
            <div><span class="font-bold text-gray-500 uppercase text-xs">Majitel:</span> <span class="font-semibold text-slate-800">${resObj.klient_jmeno || ''}</span></div>
            <div><span class="font-bold text-gray-500 uppercase text-xs">Kontakt:</span> <span class="text-slate-800">${resObj.klient_email || ''} ${resObj.klient_telefon ? '| ' + resObj.klient_telefon : ''}</span></div>
            <div><span class="font-bold text-gray-500 uppercase text-xs">Úkon:</span> <span class="font-semibold text-slate-800">${resObj.ukon_nazev || ''}</span></div>
            <div><span class="font-bold text-gray-500 uppercase text-xs">Stav:</span> <span class="px-2 py-0.5 text-xs font-bold rounded-full ${resObj.stav === 'Zrušeno' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800'}">${resObj.stav || ''}</span></div>
            <div><span class="font-bold text-gray-500 uppercase text-xs">Poznámka:</span> ${(resObj.poznamka ?? resObj.Poznamka) ? `<span class="text-slate-800 whitespace-pre-line break-words">${escapeHtml(resObj.poznamka ?? resObj.Poznamka)}</span>` : `<span class="text-gray-400 italic">Bez poznámky</span>`}</div>
        </div>
    `;

    document.getElementById('btn-modal-email').onclick = () => {
        closeDetailModal();
        openEmailModal(resObj.id, resObj.klient_jmeno);
    };

    document.getElementById('btn-modal-cancel').onclick = () => {
        closeDetailModal();
        openCancelModal(resObj.id);
    };

    document.getElementById('detail-modal').classList.remove('hidden');
}

function closeDetailModal() {
    document.getElementById('detail-modal').classList.add('hidden');
}

/* --- POMOCNÉ KALENDÁŘNÍ FUNKCE --- */
function getWeekRange(date) {
    const days = getWeekDays(date);
    return { start: days[0], end: days[6] };
}

function getWeekDays(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Nastaví pondělí
    const monday = new Date(d.setDate(diff));

    const week = [];
    for (let i = 0; i < 7; i++) {
        const nextDay = new Date(monday);
        nextDay.setDate(monday.getDate() + i);
        week.push(nextDay);
    }
    return week;
}

function getMonthRange(date) {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return { start, end };
}

function formatDateIso(d) {
    return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
}

function isSameDay(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate();
}

/* --- PROFIL A ORDINAČNÍ DOBA --- */
function renderWorkingHoursFields() {
    const container = document.getElementById('working-hours-container');
    container.innerHTML = dnyVTydnu.map(day => `
        <div class="bg-gray-50 p-3 rounded-xl border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
            <span class="font-bold text-gray-700 md:w-24">${day.nazev}</span>
            <div class="flex items-center space-x-2 bg-white p-2 rounded-lg border border-gray-200">
                <span class="font-semibold text-emerald-600 w-16">Dopoledne:</span>
                <span class="text-gray-400">Od</span>
                <input type="time" id="wh-dop-od-${day.id}" class="p-1 border rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none">
                <span class="text-gray-400">Do</span>
                <input type="time" id="wh-dop-do-${day.id}" class="p-1 border rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none">
            </div>
            <div class="flex items-center space-x-2 bg-white p-2 rounded-lg border border-gray-200">
                <span class="font-semibold text-emerald-600 w-16">Odpoledne:</span>
                <span class="text-gray-400">Od</span>
                <input type="time" id="wh-odp-od-${day.id}" class="p-1 border rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none">
                <span class="text-gray-400">Do</span>
                <input type="time" id="wh-odp-do-${day.id}" class="p-1 border rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none">
            </div>
        </div>
    `).join('');
}

async function loadDoctorProfile() {
    try {
        const res = await fetch('/api/lekar/profil', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data = await res.json();

        if (data) {
            document.getElementById('prof-titul').value = data.titul || '';
            document.getElementById('prof-jmeno').value = data.jmeno || '';
            document.getElementById('prof-prijmeni').value = data.prijmeni || '';
            document.getElementById('prof-email').value = data.email || '';
            document.getElementById('prof-telefon').value = data.telefon || '';
            document.getElementById('prof-specializace').value = data.specializace || '';

            dnyVTydnu.forEach(day => {
                document.getElementById(`wh-dop-od-${day.id}`).value = '';
                document.getElementById(`wh-dop-do-${day.id}`).value = '';
                document.getElementById(`wh-odp-od-${day.id}`).value = '';
                document.getElementById(`wh-odp-do-${day.id}`).value = '';
            });

            if (data.pracovniDoba && Array.isArray(data.pracovniDoba)) {
                const grouped = {};
                data.pracovniDoba.forEach(pd => {
                    if (!grouped[pd.DenVTydnu]) grouped[pd.DenVTydnu] = [];
                    grouped[pd.DenVTydnu].push(pd);
                });

                Object.keys(grouped).forEach(denId => {
                    const slots = grouped[denId].sort((a, b) => a.Od.localeCompare(b.Od));
                    if (slots[0]) {
                        document.getElementById(`wh-dop-od-${denId}`).value = slots[0].Od;
                        document.getElementById(`wh-dop-do-${denId}`).value = slots[0].Do;
                    }
                    if (slots[1]) {
                        document.getElementById(`wh-odp-od-${denId}`).value = slots[1].Od;
                        document.getElementById(`wh-odp-do-${denId}`).value = slots[1].Do;
                    }
                });
            }
        }
    } catch (err) { console.error(err); }
}

async function saveDoctorProfile(e) {
    e.preventDefault();
    const pracovniDoba = [];

    dnyVTydnu.forEach(day => {
        const dopOd = document.getElementById(`wh-dop-od-${day.id}`).value;
        const dopDo = document.getElementById(`wh-dop-do-${day.id}`).value;
        const odpOd = document.getElementById(`wh-odp-od-${day.id}`).value;
        const odpDo = document.getElementById(`wh-odp-do-${day.id}`).value;

        if (dopOd && dopDo) pracovniDoba.push({ denVTydnu: day.id, od: dopOd, do: dopDo });
        if (odpOd && odpDo) pracovniDoba.push({ denVTydnu: day.id, od: odpOd, do: odpDo });
    });

    const payload = {
        titul: document.getElementById('prof-titul').value,
        jmeno: document.getElementById('prof-jmeno').value,
        prijmeni: document.getElementById('prof-prijmeni').value,
        telefon: document.getElementById('prof-telefon').value,
        specializace: document.getElementById('prof-specializace').value,
        pracovniDoba
    };

    try {
        const res = await fetch('/api/lekar/profil', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            alert('Profil a ordinační doba byly úspěšně aktualizovány.');
        } else {
            alert('Chyba při ukládání.');
        }
    } catch (err) { console.error(err); }
}

/* --- LOGIKA DIALOGOVÉHO OKNA PRO ZRUŠENÍ REZERVACE --- */
function openCancelModal(id) {
    document.getElementById('cancel-booking-id').value = id;
    document.getElementById('cancel-email-reason').value = '';
    // výchozí předmět e-mailu klientovi v aktuálním jazyce (hodnota inputu se nepřekládá automaticky)
    document.getElementById('cancel-email-subject').value = VetCareI18n.t('Zrušení rezervace - VetCare Ordinace');
    document.getElementById('cancel-modal').classList.remove('hidden');
}

function closeCancelModal() {
    document.getElementById('cancel-modal').classList.add('hidden');
}

async function confirmCancelBooking(e) {
    e.preventDefault();
    const id = document.getElementById('cancel-booking-id').value;
    const predmet = document.getElementById('cancel-email-subject').value;
    const duvod = document.getElementById('cancel-email-reason').value;

    const btnSubmit = document.getElementById('btn-submit-cancel');
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Odesílám...`;

    try {
        const res = await fetch(`/api/lekar/rezervace/${id}/zrusit-duvod`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            // Nezměněný výchozí předmět se neposílá – server ho doplní v jazyce klienta
            body: JSON.stringify({ predmet: predmet === VetCareI18n.t('Zrušení rezervace - VetCare Ordinace') ? '' : predmet, duvod })
        });

        if (res.ok) {
            closeCancelModal();
            loadAgenda();
            alert('Rezervace byla stornována a e-mail byl odeslán klientovi.');
        } else {
            const data = await res.json();
            alert('Chyba při rušení: ' + (data.message || 'Neznámá chyba'));
        }
    } catch (err) {
        console.error('Chyba při zrušení:', err);
        alert('Chyba komunikace se serverem.');
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = `<i class="fa-solid fa-paper-plane text-xs"></i> Odeslat a Zrušit`;
    }
}

/* --- LOGIKA NEPŘÍTOMNOSTI --- */
function toggleAbsenceTimes() {
    const celodenni = document.getElementById('abs-celodenni').checked;
    document.getElementById('abs-time-container').classList.toggle('hidden', celodenni);
}

function toggleAbsenceMode() {
    const isRange = document.querySelector('input[name="abs-mode"]:checked').value === 'range';
    const singleContainer = document.getElementById('abs-single-container');
    const rangeContainer = document.getElementById('abs-range-container');
    const timeWrapper = document.getElementById('abs-time-wrapper');

    if (isRange) {
        singleContainer.classList.add('hidden');
        rangeContainer.classList.remove('hidden');
        timeWrapper.classList.add('hidden');
        document.getElementById('abs-celodenni').checked = true;
    } else {
        singleContainer.classList.remove('hidden');
        rangeContainer.classList.add('hidden');
        timeWrapper.classList.remove('hidden');
        toggleAbsenceTimes();
    }
}

async function saveAbsence(e) {
    e.preventDefault();
    const isRange = document.querySelector('input[name="abs-mode"]:checked').value === 'range';

    let datumOd, datumDo;

    if (isRange) {
        datumOd = document.getElementById('abs-datum-od').value;
        datumDo = document.getElementById('abs-datum-do').value;

        if (!datumOd || !datumDo) {
            alert('Prosím vyplňte obě data (Od i Do).');
            return;
        }
        if (datumDo < datumOd) {
            alert('Datum "Do" nemůže být dřívější než datum "Od".');
            return;
        }
    } else {
        datumOd = document.getElementById('abs-datum').value;
        datumDo = datumOd;

        if (!datumOd) {
            alert('Prosím vyberte datum.');
            return;
        }
    }

    const celodenni = isRange ? true : document.getElementById('abs-celodenni').checked;

    const payload = {
        datum_od: datumOd,
        datum_do: datumDo,
        celodenni: celodenni,
        cas_od: celodenni ? null : (document.getElementById('abs-cas-od').value || null),
        cas_do: celodenni ? null : (document.getElementById('abs-cas-do').value || null),
        duvod: document.getElementById('abs-duvod').value
    };

    try {
        const res = await fetch('/api/lekar/nepritomnost', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            loadAbsences();
            e.target.reset();
            document.querySelector('input[name="abs-mode"][value="single"]').checked = true;
            toggleAbsenceMode();
        } else {
            const err = await res.json();
            alert('Chyba při ukládání: ' + (err.message || 'Neznámá chyba'));
        }
    } catch (err) {
        console.error(err);
        alert('Chyba při komunikaci se serverem.');
    }
}

async function loadAbsences() {
    try {
        const res = await fetch('/api/lekar/nepritomnost', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        const tbody = document.getElementById('absences-table-body');

        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-gray-400">Žádná zadaná nepřítomnost.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(a => `
            <tr class="hover:bg-gray-50">
                <td class="p-3 font-bold">${new Date(a.datum).toLocaleDateString(VetCareI18n.locale())}</td>
                <td class="p-3">${a.celodenni ? '<span class="text-xs bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded">Celý den</span>' : `${a.cas_od} -${a.cas_do}`}</td>
                <td class="p-3 text-gray-600">${a.duvod || '-'}</td>
                <td class="p-3 text-right">
                    <button onclick="deleteAbsence(${a.id})" class="text-red-600 hover:text-red-800 text-xs font-bold"><i class="fa-solid fa-trash"></i> Smazat</button>
                </td>
            </tr>
        `).join('');
    } catch (err) { console.error(err); }
}

async function deleteAbsence(id) {
    if (!confirm('Opravdu chcete smazat tuto nepřítomnost?')) return;

    await fetch(`/api/lekar/nepritomnost/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    loadAbsences();
}

/* --- LOGIKA DIALOGOVÉHO OKNA PRO AD-HOC E-MAIL --- */
function openEmailModal(id, klientJmeno) {
    document.getElementById('email-booking-id').value = id;
    document.getElementById('email-recipient-name').value = klientJmeno || VetCareI18n.t('Zákazník');
    document.getElementById('email-subject').value = '';
    document.getElementById('email-message').value = '';
    document.getElementById('email-modal').classList.remove('hidden');
}

function closeEmailModal() {
    document.getElementById('email-modal').classList.add('hidden');
}

async function sendInfoEmail(e) {
    e.preventDefault();
    const id = document.getElementById('email-booking-id').value;
    const predmet = document.getElementById('email-subject').value;
    const zprava = document.getElementById('email-message').value;

    const btnSubmit = document.getElementById('btn-submit-email');
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Odesílám...`;

    try {
        const res = await fetch(`/api/rezervace/${id}/poslat-email`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({ predmet, zprava })
        });

        if (res.ok) {
            closeEmailModal();
            alert('E-mail byl úspěšně odeslán zákazníkovi.');
        } else {
            const data = await res.json();
            alert('Chyba při odesílání e-mailu: ' + (data.error || 'Neznámá chybná odezva serveru'));
        }
    } catch (err) {
        console.error('Chyba při odesílání:', err);
        alert('Chyba komunikace se serverem.');
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = `<i class="fa-solid fa-paper-plane text-xs"></i> Odeslat E-mail`;
    }
}

function logout() {
    localStorage.clear();
    window.location.href = 'index.html';
}

/* --- ZMĚNA JAZYKA: texty přeloží i18n.js, zde se jen překreslí obsah s daty formátovanými podle jazyka --- */
window.addEventListener('vc-lang-change', () => {
    loadAgenda();
    loadAbsences();
});
