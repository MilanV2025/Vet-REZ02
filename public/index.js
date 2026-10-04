        // Nastavení výchozího dnešního data
        document.getElementById('book-datum').valueAsDate = new Date();

        // 1. Získání ICO z URL adresy (např. ?ico=12345678)
        const urlParams = new URLSearchParams(window.location.search);
        const companyIco = urlParams.get('ico');

        document.addEventListener('DOMContentLoaded', async () => {
            if (companyIco) {
                await loadCompanyByICO(companyIco);
            } else {
                await loadAllOrdinace();
            }
            await loadServices();
        });

        // Načte informace o firmě a jejích ordinacích podle ICO z /api/ordinace
        async function loadCompanyByICO(ico) {
            try {
                const res = await fetch('/api/ordinace');
                if (!res.ok) throw new Error('Chyba při načítání ordinací');
                const ordinaceList = await res.json();
                
                const filtered = ordinaceList.filter(o => o.ICO === ico);

                if (filtered.length > 0) {
                    const company = filtered[0];
                    document.getElementById('company-info-card').classList.remove('hidden');
                    document.getElementById('info-ico').textContent = company.ICO || ico;
                    document.getElementById('info-nazev').textContent = company.FirmaNazev || 'Veterinární klinika';
                    document.getElementById('info-adresa').textContent = company.Adresa || company.adresa || '-';
                    document.getElementById('info-telefon').innerHTML = `<i class="fa-solid fa-phone text-emerald-400 mr-1"></i> ${company.Telefon || company.telefon || 'Nespecifikováno'}`;
                    document.getElementById('info-email').innerHTML = `<i class="fa-solid fa-envelope text-emerald-400 mr-1"></i> ${company.Email || company.email || 'Nespecifikováno'}`;
                    document.getElementById('nav-company-name').textContent = company.FirmaNazev;

                    populateOrdinaceDropdown(filtered);
                } else {
                    await loadAllOrdinace();
                }
                alert('API dostupné, NAČTENO.');
            } catch (err) {
                alert('API nedostupné, načítám výchozí data.');
                populateOrdinaceDropdown([
                    { Id: 1, Nazev: 'Centrální klinika Praha 1' },
                    { Id: 2, Nazev: 'Pobočka Smíchov' }
                ]);
            }
        }

        async function loadAllOrdinace() {
            try {
                const res = await fetch('/api/ordinace');
                const list = await res.json();
                populateOrdinaceDropdown(list);
            } catch (e) {
                populateOrdinaceDropdown([
                    { Id: 1, Nazev: 'Centrální klinika Praha 1' },
                    { Id: 2, Nazev: 'Pobočka Smíchov' }
                ]);
            }
        }

        function populateOrdinaceDropdown(ordinaceList) {
            const select = document.getElementById('book-ordinace');
            select.innerHTML = '<option value="">-- Vyberte ordinaci --</option>';
            ordinaceList.forEach(ord => {
                select.innerHTML += `<option value="${ord.Id || ord.id}">${ord.Nazev || ord.nazev}</option>`;
            });
            if (ordinaceList.length === 1) {
                select.selectedIndex = 1;
                onOrdinaceSelect();
            }
        }

        // Oprava: Načítání úkonů z endpointu /api/ukony
        async function loadServices() {
            try {
                const res = await fetch('/api/ukony');
                const services = await res.json();
                const select = document.getElementById('book-ukon');
                select.innerHTML = '<option value="">-- Vyberte úkon --</option>';
                services.forEach(s => {
                    const id = s.Id || s.id;
                    const nazev = s.Nazev || s.nazev;
                    const delka = s.DelkaMinuty || s.delkaMinuty || 30;
                    const cena = s.Cena || s.cena;
                    const cenaText = cena ? ` - ${cena} Kč` : '';
                    select.innerHTML += `<option value="${id}">${nazev} (${delka} min${cenaText})</option>`;
                });
            } catch (e) {
                const select = document.getElementById('book-ukon');
                select.innerHTML = `
                    <option value="1">Očkování (15 min - 500 Kč)</option>
                    <option value="2">Preventivní prohlídka (30 min - 800 Kč)</option>
                    <option value="3">Akutní stav (30 min - 1200 Kč)</option>
                    <option value="4">Chirurgický zákrok (60 min - 3500 Kč)</option>
                `;
            }
        }

        // Oprava: Načítání lékařů pomocí query parametru /api/lekari?ordinaceId=
        async function onOrdinaceSelect() {
            const ordinaceId = document.getElementById('book-ordinace').value;
            const lekarSelect = document.getElementById('book-lekar');
            
            if (ordinaceId) {
                document.getElementById('tv-link').href = `tv.html?ordinaceId=${ordinaceId}`;
            }

            if (!ordinaceId) return;

            try {
                const res = await fetch(`/api/lekari?ordinaceId=${ordinaceId}`);
                const lekari = await res.json();
                lekarSelect.innerHTML = '<option value="">-- Vyberte lékaře --</option>';
                lekari.forEach(l => {
                    const titul = l.Titul ? `${l.Titul} ` : '';
                    const spec = l.Specializace ? ` (${l.Specializace})` : '';
                    lekarSelect.innerHTML += `<option value="${l.Id}">${titul}${l.Jmeno} ${l.Prijmeni}${spec}</option>`;
                });
            } catch (e) {
                console.error('Chyba při načítání lékařů:', err);
            }
            loadAvailableSlots();
        }

        // Oprava: Volání volných termínů z /api/volne-terminy a zpracování response
        async function loadAvailableSlots() {
            const ordinaceId = document.getElementById('book-ordinace').value;
            const datum = document.getElementById('book-datum').value;
            const ukonId = document.getElementById('book-ukon').value;
            const lekarId = document.getElementById('book-lekar').value;
            const container = document.getElementById('slots-container');

            if (!ordinaceId || !datum || !ukonId) {
                container.innerHTML = '<span class="text-xs text-slate-500 col-span-full text-center">Vyberte pobočku, úkon, lékaře a datum pro zobrazení časů.</span>';
                return;
            }

            if (!lekarId) {
                container.innerHTML = '<span class="text-xs text-amber-400 col-span-full text-center">Pro výpočet termínů prosím vyberte konkrétního lékaře.</span>';
                return;
            }

            try {
                // Přidán parametr ordinaceId=${ordinaceId}

alert(`/api/volne-terminy?lekarId=${lekarId}&ordinaceId=${ordinaceId}&typUkonuId=${ukonId}&datum=${datum}`);

                const res = await fetch(`/api/volne-terminy?lekarId=${lekarId}&ordinaceId=${ordinaceId}&typUkonuId=${ukonId}&datum=${datum}`);
                const data = await res.json();

                alert('API dostupné, načítám volné sloty...');
                alert(renderSlots(data.volneSloty))
                
                if (res.ok && data.volneSloty) {
                    renderSlots(data.volneSloty);
                } else {
                    renderSlots([]);
                }
            } catch (e) {
                //renderSlots(['08:00', '08:30', '09:00', '09:30', '10:15', '11:00', '13:00', '14:00', '15:30']);
            }
        }

        function renderSlots(slots) {
            const container = document.getElementById('slots-container');
            container.innerHTML = '';

            if (!slots || slots.length === 0) {
                container.innerHTML = '<span class="text-xs text-red-400 col-span-full text-center">Pro vybraný den a lékaře nejsou k dispozici žádné volné termíny.</span>';
                return;
            }

            slots.forEach(slotTime => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'slot-btn py-2 text-xs font-bold bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 border border-slate-700 text-slate-200 rounded-lg transition';
                btn.textContent = slotTime;
                btn.onclick = () => {
                    document.querySelectorAll('.slot-btn').forEach(b => {
                        b.className = 'slot-btn py-2 text-xs font-bold bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 border border-slate-700 text-slate-200 rounded-lg transition';
                    });
                    btn.className = 'slot-btn py-2 text-xs font-bold bg-emerald-500 text-slate-950 border border-emerald-400 rounded-lg shadow-md';
                    document.getElementById('selected-slot').value = slotTime;
                };
                container.appendChild(btn);
            });
        }

        // Odeslání veřejné rezervace
        async function handlePublicBooking(e) {
            e.preventDefault();
            const slot = document.getElementById('selected-slot').value;
            const statusDiv = document.getElementById('booking-status');

            if (!slot) {
                alert('Vyberte prosím konkrétní časový termín z nabídky.');
                return;
            }

            const payload = {
                ordinaceId: document.getElementById('book-ordinace').value,
                typUkonuId: document.getElementById('book-ukon').value,
                lekarId: document.getElementById('book-lekar').value || null,
                datumCasStart: `${document.getElementById('book-datum').value}T${slot}:00`,
                majitelJmeno: document.getElementById('cust-jmeno').value,
                majitelTelefon: document.getElementById('cust-telefon').value,
                majitelEmail: document.getElementById('cust-email').value,
                zvireJmeno: document.getElementById('pet-jmeno').value,
                zvireDruh: document.getElementById('pet-druh').value,
                poznamka: document.getElementById('book-poznamka').value
            };

            try {
                const res = await fetch('/api/rezervace/verejna', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await res.json();

                if (res.ok && data.success) {
                    statusDiv.className = 'mt-4 p-4 rounded-xl text-center font-bold bg-emerald-500/20 border border-emerald-500 text-emerald-300';
                    statusDiv.textContent = data.message || 'Rezervace byla úspěšně vytvořena!';
                    document.getElementById('public-booking-form').reset();
                    document.getElementById('selected-slot').value = '';
                    loadAvailableSlots();
                } else {
                    throw new Error(data.error || data.message || 'Chyba při ukládání');
                }
            } catch (err) {
                statusDiv.className = 'mt-4 p-4 rounded-xl text-center font-bold bg-red-500/20 border border-red-500 text-red-300';
                statusDiv.textContent = 'Chyba při odesílání rezervace: ' + err.message;
            }
            statusDiv.classList.remove('hidden');
        }

        // Autentizační logika (Modal)
        function openAuthModal(type = 'login') {
            document.getElementById('auth-modal').classList.remove('hidden');
            switchAuthTab(type);
        }
        function closeAuthModal() {
            document.getElementById('auth-modal').classList.add('hidden');
        }
        function switchAuthTab(tab) {
            const loginForm = document.getElementById('form-login');
            const regForm = document.getElementById('form-register');
            const loginBtn = document.getElementById('tab-login-btn');
            const regBtn = document.getElementById('tab-reg-btn');

            if (tab === 'login') {
                loginForm.classList.remove('hidden');
                regForm.classList.add('hidden');
                loginBtn.className = "w-1/2 py-2 font-bold text-emerald-400 border-b-2 border-emerald-400";
                regBtn.className = "w-1/2 py-2 font-bold text-slate-400 hover:text-slate-200";
            } else {
                loginForm.classList.add('hidden');
                regForm.classList.remove('hidden');
                regBtn.className = "w-1/2 py-2 font-bold text-emerald-400 border-b-2 border-emerald-400";
                loginBtn.className = "w-1/2 py-2 font-bold text-slate-400 hover:text-slate-200";
            }
        }

        async function handleLogin(e) {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;

            try {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await res.json();

                if (res.ok) {
                    localStorage.setItem('vetcare_token', data.token);
                    localStorage.setItem('vetcare_user', JSON.stringify(data.user));
                    redirectByRole(data.user.role);
                } else {
                    alert(data.message || 'Chyba při přihlášení');
                }
            } catch (err) {
                alert('Chyba při komunikaci se serverem: ' + err.message);
            }
        }

        // Doplněno: Zpracování registrace
        async function handleRegister(e) {
            e.preventDefault();
            const jmeno = document.getElementById('reg-jmeno').value;
            const prijmeni = document.getElementById('reg-prijmeni').value;
            const email = document.getElementById('reg-email').value;
            const telefon = document.getElementById('reg-telefon').value;
            const password = document.getElementById('reg-password').value;

            try {
                const res = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password, jmeno, prijmeni, telefon })
                });
                const data = await res.json();

                if (res.ok) {
                    localStorage.setItem('vetcare_token', data.token);
                    localStorage.setItem('vetcare_user', JSON.stringify(data.user));
                    redirectByRole(data.user.role);
                } else {
                    alert(data.message || 'Chyba při registraci');
                }
            } catch (err) {
                alert('Chyba při komunikaci se serverem: ' + err.message);
            }
        }

        function redirectByRole(role) {

alert('Přihlášení proběhlo úspěšně. Přesměrování na stránku podle role: ' + role);

            if (role === 'Admin') window.location.href = 'admin.html';
            else if (role === 'Lekar') window.location.href = 'doctor.html';
            else if (role === 'TV') window.location.href = 'tv.html';
            else if (role === 'SuperAdmin') window.location.href = 'superadmin.html';
            else window.location.href = 'client.html';
        }