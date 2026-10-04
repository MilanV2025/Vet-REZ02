        // --- 1. AUTENTIZACE & HEADER HEADERS ---
        const user = JSON.parse(localStorage.getItem('vetcare_user'));
        const token = localStorage.getItem('vetcare_token');

        if (!token || !user || user.role !== 'Zakaznik') {
            window.location.href = 'index.html';
        }

        document.getElementById('user-display-name').textContent = `${user.jmeno} ${user.prijmeni}`;
        document.getElementById('user-email-display').textContent = user.email || '';
        document.getElementById('sel-datum').valueAsDate = new Date();

        function getAuthHeaders() {
            return {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            };
        }

        function logout() {
            localStorage.clear();
            window.location.href = 'index.html';
        }        
        
        // --- 2. PŘEPÍNÁNÍ POHLEDŮ ---
        function switchView(viewId) {
            document.querySelectorAll('.view-section').forEach(sec => sec.classList.add('hidden'));
            const target = document.getElementById(`view-${viewId}`);
            if (target) {
                target.classList.remove('hidden');
            }

            if (viewId === 'moje-zvirata') loadPets();
            if (viewId === 'vytvorene-rezervace') loadBookings('vse');
            if (viewId === 'nova-rezervace') loadSlots();
        }        
        
        // --- 3. NACITANI ZVÍŘAT & SPRÁVA ---
        async function loadPets() {
            try {
                const res = await fetch('/api/zvirata', { headers: getAuthHeaders() });
                const data = await res.json();
                
                const container = document.getElementById('pets-list');
                const badge = document.getElementById('pet-count-badge');
                
                if (!res.ok) throw new Error(data.message || 'Chyba při načítání zvířat');

                badge.textContent = `${data.length} zvířat`;

                if (data.length === 0) {
                    container.innerHTML = `<p class="text-gray-400 text-sm col-span-full">Nemáte zatím evidovaná žádná zvířata.</p>`;
                } else {
                    container.innerHTML = data.map(pet => {
                        const hasReservations = (pet.PocetRezervaci && pet.PocetRezervaci > 0);
                        return `
                            <div class="p-4 border border-gray-100 rounded-xl bg-gray-50 flex justify-between items-start">
                                <div>
                                    <h4 class="font-bold text-gray-800 text-base flex items-center gap-2">
                                        <i class="fa-solid ${pet.Druh && pet.Druh.toLowerCase() === 'kočka' ? 'fa-cat' : 'fa-dog'} text-emerald-600"></i>
                                        ${pet.Jmeno}
                                    </h4>
                                    <p class="text-xs text-gray-500 mt-1">${pet.Druh} ${pet.Rasa ? '• ' + pet.Rasa : ''}</p>
                                    ${pet.Vek ? `<p class="text-xs text-gray-400">Věk: ${pet.Vek} let</p>` : ''}
                                </div>
                                <div>
                                    ${hasReservations 
                                        ? `<span class="inline-block" title="Zvíře nelze smazat, protože má v databázi záznam v rezervacích.">
                                             <button disabled class="px-2 py-1 bg-gray-200 text-gray-400 rounded-lg text-xs font-bold cursor-not-allowed">
                                                <i class="fa-solid fa-lock"></i> Smazat
                                             </button>
                                           </span>`
                                        : `<button onclick="deletePet(${pet.Id})" class="px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-xs font-bold transition">
                                            <i class="fa-solid fa-trash"></i> Smazat
                                           </button>`
                                    }
                                </div>
                            </div>
                        `;
                    }).join('');
                }

                // Aktualizace dropdownu pro výběr zvířete v rezervačním formuláři
                const selZvire = document.getElementById('sel-zvire');
                if (data.length > 0) {
                    selZvire.innerHTML = data.map(p => `<option value="${p.Id}">${p.Jmeno} (${p.Druh})</option>`).join('');
                } else {
                    selZvire.innerHTML = `<option value="">-- Nejprve přidejte zvíře --</option>`;
                }

            } catch (err) {
                console.error(err);
            }
        }

        async function addPet(e) {
            e.preventDefault();
            const jmeno = document.getElementById('pet-jmeno').value;
            const druh = document.getElementById('pet-druh').value;
            const rasa = document.getElementById('pet-rasa').value;
            const vek = document.getElementById('pet-vek').value;

            try {
                const res = await fetch('/api/zvirata', {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ jmeno, druh, rasa, vek: vek ? parseInt(vek, 10) : null })
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.message || 'Nepodařilo se přidat zvíře');

                e.target.reset();
                await loadPets();
            } catch (err) {
                alert(err.message);
            }
        }

        async function deletePet(id) {
            if (!confirm('Opravdu si přejete smazat toto zvíře?')) return;

            try {
                const res = await fetch(`/api/zvirata/${id}`, {
                    method: 'DELETE',
                    headers: getAuthHeaders()
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.message || 'Nepodařilo se smazat zvíře');

                await loadPets();
            } catch (err) {
                alert(err.message);
            }
        }
               // --- 4. REZERVAČNÍ SYSTÉM (NAČÍTÁNÍ & FILTROVÁNÍ REZERVACÍ) ---
        let currentBookingFilter = 'vse';
        async function loadBookings(status = 'vse') {
            currentBookingFilter = status;
            // Aktualizace filtrů
            document.querySelectorAll('.filter-btn').forEach(btn => {
                if (btn.dataset.status === status) {
                    btn.className = "filter-btn active-filter px-3 py-1.5 text-xs font-bold rounded-lg border bg-emerald-600 text-white";
                } else {
                    btn.className = "filter-btn px-3 py-1.5 text-xs font-bold rounded-lg border bg-white text-gray-600 hover:bg-gray-50";
                }
            });

            const tbody = document.getElementById('bookings-table-body');
            tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-gray-400">Načítání rezervací...</td></tr>`;

            try {
                const res = await fetch(`/api/rezervace/moje?stav=${encodeURIComponent(status)}`, {
                    headers: getAuthHeaders()
                });
                const data = await res.json();

                if (!res.ok || !data.success) throw new Error(data.message || 'Nepodařilo se načíst rezervace');

                if (data.rezervace.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-gray-400">Žádné rezervace neodpovídají tomuto filtru.</td></tr>`;
                    return;
                }

                tbody.innerHTML = data.rezervace.map(r => {
                    const dt = new Date(r.DatumCasStart).toLocaleString(VetCareI18n.locale(), { dateStyle: 'medium', timeStyle: 'short' });
                    let statusBadge = '';
                    if (r.Stav === 'Plánovaná' || r.Stav === 'Potvrzeno') {
                        statusBadge = `<span class="bg-blue-100 text-blue-800 text-xs px-2.5 py-1 rounded-full font-bold">Plánovaná</span>`;
                    } else if (r.Stav === 'Proběhlá') {
                        statusBadge = `<span class="bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-full font-bold">Proběhlá</span>`;
                    } else if (r.Stav === 'Storno') {
                        statusBadge = `<span class="bg-red-100 text-red-800 text-xs px-2.5 py-1 rounded-full font-bold">Stornována</span>`;
                    } else {
                        statusBadge = `<span class="bg-yellow-100 text-yellow-800 text-xs px-2.5 py-1 rounded-full font-bold">${r.Stav}</span>`;
                    }

                    const canCancel = (r.Stav === 'Plánovaná' || r.Stav === 'Potvrzeno');

                    return `
                        <tr class="hover:bg-gray-50 transition border-b">
                            <td class="p-3 font-bold text-gray-800">${dt}</td>
                            <td class="p-3 font-medium">${r.ZvireJmeno}</td>
                            <td class="p-3">${r.LekarJmeno || 'Nespecifikován'} <br><span class="text-xs text-gray-400">${r.OrdinaceNazev || ''}</span></td>
                            <td class="p-3">${r.UkonNazev}</td>
                            <td class="p-3">${statusBadge}</td>
                            <td class="p-3 text-right">
                                ${canCancel ? `
                                    <button onclick="cancelBooking(${r.Id})" class="text-xs text-red-600 hover:text-red-800 font-bold border border-red-200 px-2.5 py-1 rounded-lg hover:bg-red-50 transition">
                                        Stornovat
                                    </button>
                                ` : '-'}
                            </td>
                        </tr>
                    `;
                }).join('');

            } catch (err) {
                tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-500">${err.message}</td></tr>`;
            }
        }

        async function cancelBooking(id) {
            if (!confirm('Opravdu si přejete stornovat tuto rezervaci?')) return;

            try {
                const res = await fetch(`/api/rezervace/${id}/storno`, {
                    method: 'PATCH',
                    headers: getAuthHeaders()
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.message || 'Nepodařilo se stornovat rezervaci');

                alert('Rezervace byla úspěšně stornována.', data);

                await loadBookings('vse');
            } catch (err) {
                alert(err.message);
            }
        }

        // --- 5. POMOCNÉ FUNKCE PRO FORMULÁŘ NOVÉ REZERVACE ---
        async function loadOrdinace() {
            try {
                const res = await fetch('/api/ordinace');
                const data = await res.json();
                const sel = document.getElementById('sel-ordinace');
                sel.innerHTML = data.map(o => `<option value="${o.Id}">${o.Nazev} (${o.Adresa || ''})</option>`).join('');
                if (user.preferovanaOrdinaceId) {
                    sel.value = user.preferovanaOrdinaceId;
                }
                await onOrdinaceChange();
            } catch (err) {
                console.error('Chyba při načítání ordinací:', err);
            }
        }

        async function onOrdinaceChange() {
            const ordinaceId = document.getElementById('sel-ordinace').value;
            const lekarSelect = document.getElementById('sel-lekar');

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
            await loadSlots();
        }

        async function loadUkony() {
            try {
                const res = await fetch('/api/ukony');
                const data = await res.json();
                const sel = document.getElementById('sel-ukon');
                sel.innerHTML = data.map(u => `<option value="${u.Id}">${u.Nazev} (${u.DelkaMinuty} min - ${u.Cena} Kč)</option>`).join('');
            } catch (err) {
                console.error('Chyba při načítání úkonů:', err);
            }
        }

        async function loadSlots() {
            const lekarId = document.getElementById('sel-lekar').value;
            const ordinaceId = document.getElementById('sel-ordinace').value;
            const typUkonuId = document.getElementById('sel-ukon').value;
            const datum = document.getElementById('sel-datum').value;

            const grid = document.getElementById('slots-grid');
            document.getElementById('selected-slot').value = '';

            if (!lekarId || !typUkonuId || !datum) {
                grid.innerHTML = `<span class="text-xs text-gray-400 col-span-full text-center">Vyberte lékaře, úkon a datum</span>`;
                return;
            }

            try {
                const res = await fetch(`/api/volne-terminy?lekarId=${lekarId}&ordinaceId=${ordinaceId}&typUkonuId=${typUkonuId}&datum=${datum}`);
                const data = await res.json();

                if (!data.volneSloty || data.volneSloty.length === 0) {
                    grid.innerHTML = `<span class="text-xs text-red-400 col-span-full text-center">Pro tento den nejsou k dispozici žádné volné termíny.</span>`;
                    return;
                }

                grid.innerHTML = data.volneSloty.map(slot => `
                    <button type="button" onclick="selectSlot('${slot}', this)" class="slot-btn border p-2 rounded-lg text-xs font-bold bg-white hover:bg-emerald-50 hover:border-emerald-500 text-gray-700 transition">
                        ${slot}
                    </button>
                `).join('');
            } catch (err) {
                grid.innerHTML = `<span class="text-xs text-red-500 col-span-full text-center">Chyba při výpočtu volných termínů.</span>`;
            }
        }

        function selectSlot(slot, btn) {
            document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('bg-emerald-600', 'text-white', 'border-emerald-600'));
            document.querySelectorAll('.slot-btn').forEach(b => b.classList.add('bg-white'));
            btn.classList.remove('bg-white');
            btn.classList.add('bg-emerald-600', 'text-white', 'border-emerald-600');
            document.getElementById('selected-slot').value = slot;
        }

        async function submitBooking(e) {
            e.preventDefault();
            const slot = document.getElementById('selected-slot').value;
            if (!slot) {
                alert('Vyberte prosím volný časový slot.');
                return;
            }

            const zvireId = document.getElementById('sel-zvire').value;
            const lekarId = document.getElementById('sel-lekar').value;
            const ordinaceId = document.getElementById('sel-ordinace').value;
            const typUkonuId = document.getElementById('sel-ukon').value;
            const datum = document.getElementById('sel-datum').value;
            const poznamka = document.getElementById('sel-poznamka').value;

            if (!zvireId) {
                alert('Nejprve si prosím v sekci "Moje zvířata" zaregistrujte zvíře.');
                return;
            }

            const datumCasStart = `${datum}T${slot}:00`;

            try {
                const res = await fetch('/api/rezervace', {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ zvireId, lekarId, ordinaceId, typUkonuId, datumCasStart, poznamka })
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.message || 'Chyba při odesílání rezervace');

                alert('Rezervace byla úspěšně vytvořena!');
                e.target.reset();
                document.getElementById('sel-datum').valueAsDate = new Date();
                switchView('vytvorene-rezervace');
            } catch (err) {
                alert(err.message);
            }
        }

        // --- 6. INICIALIZACE PO NAČTENÍ ---
        async function initClient() {
            await loadBookings('vse');
            await loadUkony();
            await loadPets();
            await loadOrdinace();
        }

        window.onload = initClient;

        // --- 7. ZMĚNA JAZYKA: texty přeloží i18n.js, zde se jen znovu vykreslí data formátovaná podle jazyka ---
        window.addEventListener('vc-lang-change', () => { loadBookings(currentBookingFilter); });
