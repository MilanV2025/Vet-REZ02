const API_URL = 'http://localhost:3000/api';
let jwtToken = localStorage.getItem('vetcare_token') || null;
let currentUser = JSON.parse(localStorage.getItem('vetcare_user')) || null;
let selectedSlotTime = null;

document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setInterval(updateTvClock, 1000);
});

async function initApp() {
    renderNav();
    // Nastavení výchozího dne na dnes
    document.getElementById('input-datum').valueAsDate = new Date();
    
    await loadClinics();
    await loadServices();
    if (currentUser) {
        await loadUserPets();
    }
}

function renderNav() {
    const navUser = document.getElementById('nav-user-info');
    if (currentUser) {
        navUser.innerHTML = `
            <span class="text-sm">Přihlášen: <b>${currentUser.jmeno} ${currentUser.prijmeni}</b> (${currentUser.role})</span>
            <button onclick="logout()" class="px-3 py-1 bg-emerald-800 text-xs rounded hover:bg-emerald-900">Odhlásit</button>
        `;
    } else {
        navUser.innerHTML = `
            <button onclick="mockLogin()" class="px-3 py-1 bg-emerald-500 text-xs font-bold rounded hover:bg-emerald-400">Přihlásit (Demo)</button>
        `;
    }
}

function mockLogin() {
    // Rychlé demo přihlášení
    alert('Demo přihlášení jako Petr Dvořák (Zakaznik)');
    currentUser = { id: 4, jmeno: 'Petr', prijmeni: 'Dvořák', role: 'Zakaznik', preferovanaOrdinaceId: 1 };
    jwtToken = 'demo_token';
    localStorage.setItem('vetcare_user', JSON.stringify(currentUser));
    localStorage.setItem('vetcare_token', jwtToken);
    renderNav();
    loadUserPets();
}

function logout() {
    localStorage.removeItem('vetcare_user');
    localStorage.removeItem('vetcare_token');
    currentUser = null;
    jwtToken = null;
    renderNav();
}

function switchTab(tab) {
    document.getElementById('view-booking').classList.add('hidden');
    document.getElementById('view-doctor').classList.add('hidden');
    document.getElementById('view-tv').classList.add('hidden');

    if (tab === 'booking') document.getElementById('view-booking').classList.remove('hidden');
    if (tab === 'doctor') {
        document.getElementById('view-doctor').classList.remove('hidden');
        loadDoctorAgenda();
    }
    if (tab === 'tv') {
        document.getElementById('view-tv').classList.remove('hidden');
        loadTvScreen();
    }
}

// --- LOGIKA FORMULÁŘE ---

async function loadClinics() {
    try {
        const res = await fetch(`${API_URL}/ordinace`);
        const data = await res.json();
        const select = document.getElementById('select-ordinace');
        select.innerHTML = '';

        data.forEach(ord => {
            const opt = document.createElement('option');
            opt.value = ord.Id;
            opt.textContent = `${ord.Nazev} (${ord.Adresa})`;
            if (currentUser && currentUser.preferovanaOrdinaceId === ord.Id) {
                opt.selected = true;
            }
            select.appendChild(opt);
        });

        loadDoctorsForClinic();
        renderClinicInfo(data[0]);
    } catch (err) {
        console.error('Chyba načítání klinik:', err);
    }
}

async function loadDoctorsForClinic() {
    const ordinaceId = document.getElementById('select-ordinace').value;
    try {
        const res = await fetch(`${API_URL}/lekari?ordinaceId=${ordinaceId}`);
        const data = await res.json();
        const select = document.getElementById('select-lekar');
        select.innerHTML = '';

        data.forEach(doc => {
            const opt = document.createElement('option');
            opt.value = doc.Id;
            opt.textContent = `${doc.Titul || ''} ${doc.Jmeno} ${doc.Prijmeni} - ${doc.Specializace}`;
            select.appendChild(opt);
        });

        loadAvailableSlots();
    } catch (err) {
        console.error(err);
    }
}

async function loadServices() {
    try {
        const res = await fetch(`${API_URL}/ukony`);
        const data = await res.json();
        const select = document.getElementById('select-ukon');
        select.innerHTML = '';

        data.forEach(uk => {
            const opt = document.createElement('option');
            opt.value = uk.Id;
            opt.textContent = `${uk.Nazev} (${uk.DelkaMinuty} min) - ${uk.Cena} Kč`;
            select.appendChild(opt);
        });
    } catch (err) {
        console.error(err);
    }
}

async function loadUserPets() {
    try {
        const res = await fetch(`${API_URL}/zvirata`, {
            headers: { 'Authorization': `Bearer ${jwtToken}` }
        });
        const data = await res.json();
        const select = document.getElementById('select-zvire');
        select.innerHTML = '';

        if (Array.isArray(data)) {
            data.forEach(pet => {
                const opt = document.createElement('option');
                opt.value = pet.Id;
                opt.textContent = `${pet.Jmeno} (${pet.Druh} - ${pet.Rasa || 'Nespecifikováno'})`;
                select.appendChild(opt);
            });
        }
    } catch (err) {
        console.error(err);
    }
}

async function loadAvailableSlots() {
    const lekarId = document.getElementById('select-lekar').value;
    const typUkonuId = document.getElementById('select-ukon').value;
    const datum = document.getElementById('input-datum').value;
    const slotsContainer = document.getElementById('slots-container');

    if (!lekarId || !typUkonuId || !datum) return;

    slotsContainer.innerHTML = '<span class="text-sm text-gray-500 col-span-full">Načítám volné sloty...</span>';

    try {
        const res = await fetch(`${API_URL}/volne-terminy?lekarId=${lekarId}&typUkonuId=${typUkonuId}&datum=${datum}`);
        const data = await res.json();

        slotsContainer.innerHTML = '';
        if (!data.volneSloty || data.volneSloty.length === 0) {
            slotsContainer.innerHTML = '<span class="text-sm text-red-500 col-span-full">Žádné volné termíny v tento den.</span>';
            return;
        }

        data.volneSloty.forEach(slot => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'py-1.5 px-2 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded border border-emerald-300 hover:bg-emerald-600 hover:text-white transition';
            btn.textContent = slot;
            btn.onclick = () => selectSlot(btn, slot);
            slotsContainer.appendChild(btn);
        });
    } catch (err) {
        slotsContainer.innerHTML = '<span class="text-sm text-red-500 col-span-full">Chyba načítání slotů.</span>';
    }
}

function selectSlot(btn, timeStr) {
    document.querySelectorAll('#slots-container button').forEach(b => {
        b.classList.remove('bg-emerald-600', 'text-white');
        b.classList.add('bg-emerald-50', 'text-emerald-700');
    });
    btn.classList.remove('bg-emerald-50', 'text-emerald-700');
    btn.classList.add('bg-emerald-600', 'text-white');
    
    selectedSlotTime = timeStr;
    document.getElementById('selected-slot').value = timeStr;
}

async function handleBookingSubmit(e) {
    e.preventDefault();
    if (!currentUser) {
        alert('Pro vytvoření rezervace se prosím přihlaste.');
        return;
    }
    if (!selectedSlotTime) {
        alert('Vyberte prosím volný časový slot.');
        return;
    }

    const datum = document.getElementById('input-datum').value;
    const payload = {
        zvireId: document.getElementById('select-zvire').value,
        lekarId: document.getElementById('select-lekar').value,
        ordinaceId: document.getElementById('select-ordinace').value,
        typUkonuId: document.getElementById('select-ukon').value,
        datumCasStart: `${datum}T${selectedSlotTime}:00`,
        poznamka: document.getElementById('input-poznamka').value
    };

    try {
        const res = await fetch(`${API_URL}/rezervace`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${jwtToken}`
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (res.ok) {
            alert('Rezervace byla úspěšně vytvořena! Potvrzení bylo odesláno na váš e-mail.');
            document.getElementById('form-booking').reset();
            loadAvailableSlots();
        } else {
            alert('Chyba: ' + data.message);
        }
    } catch (err) {
        console.error(err);
    }
}

function renderClinicInfo(clinic) {
    const details = document.getElementById('clinic-details');
    if (!clinic) return;
    details.innerHTML = `
        <p><i class="fa-solid fa-building mr-2"></i><b>${clinic.FirmaNazev}</b> (IČO: ${clinic.ICO})</p>
        <p><i class="fa-solid fa-location-dot mr-2"></i>${clinic.Adresa}</p>
        <p><i class="fa-solid fa-phone mr-2"></i>${clinic.Telefon || 'Není zadán'}</p>
        <p><i class="fa-solid fa-envelope mr-2"></i>${clinic.Email || 'Není zadán'}</p>
    `;
}

// --- ČEKÁRNA & TV ---

function updateTvClock() {
    const clock = document.getElementById('tv-clock');
    if (clock) clock.textContent = new Date().toLocaleTimeString('cs-CZ');
}

async function loadTvScreen() {
    try {
        const res = await fetch(`${API_URL}/cekarna/dnes?ordinaceId=1`);
        const data = await res.json();

        const inRoomContainer = document.getElementById('tv-in-room');
        const waitingContainer = document.getElementById('tv-waiting-list');

        inRoomContainer.innerHTML = '';
        waitingContainer.innerHTML = '';

        const vOrdinaci = data.filter(d => d.Stav === 'VOrdinaci');
        const cekajici = data.filter(d => d.Stav === 'CekaVCekarne' || d.Stav === 'Potvrzeno');

        if (vOrdinaci.length === 0) {
            inRoomContainer.innerHTML = '<div class="p-4 bg-gray-800 rounded-xl text-gray-400">V ordinaci právě neprobíhá žádný úkon.</div>';
        } else {
            vOrdinaci.forEach(item => {
                inRoomContainer.innerHTML += `
                    <div class="p-6 bg-emerald-950 border-2 border-emerald-500 rounded-2xl animate-pulse">
                        <div class="text-xs text-emerald-400 font-bold uppercase tracking-wider">${item.LekarJmeno}</div>
                        <div class="text-3xl font-black text-white my-1">${item.Zvire} (${item.Druh})</div>
                        <div class="text-sm text-gray-300">Majitel: ${item.MajitelPrijmeni} | ${item.Ukon}</div>
                    </div>
                `;
            });
        }

        if (cekajici.length === 0) {
            waitingContainer.innerHTML = '<div class="p-4 bg-gray-800 rounded-xl text-gray-400">Čekárna je prázdná.</div>';
        } else {
            cekajici.forEach(item => {
                waitingContainer.innerHTML += `
                    <div class="p-4 bg-gray-800 rounded-xl flex justify-between items-center border-l-4 border-yellow-500">
                        <div>
                            <div class="text-lg font-bold">${item.Zvire} <span class="text-sm font-normal text-gray-400">(${item.MajitelPrijmeni})</span></div>
                            <div class="text-xs text-gray-400">${item.Ukon}</div>
                        </div>
                        <div class="text-right">
                            <div class="text-sm font-mono text-yellow-400">${new Date(item.DatumCasStart).toLocaleTimeString('cs-CZ', {hour:'2-digit', minute:'2-digit'})}</div>
                        </div>
                    </div>
                `;
            });
        }
    } catch (err) {
        console.error(err);
    }
}