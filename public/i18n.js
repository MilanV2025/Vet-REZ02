/*
 * VetCare – vícejazyčnost (čeština, slovenčina, polski, Deutsch, English)
 * -------------------------------------------------------------------------
 * Použití: do <head> každé stránky ZA theme.js vložit
 *     <script src="i18n.js"></script>
 *
 * Jak to funguje
 *  - Zdrojovým jazykem všech stránek je čeština. Slovník (DICT níže) mapuje české texty
 *    na překlady: [cs, sk, pl, de, en].
 *  - Skript přeloží texty a atributy (placeholder, title, aria-label, alt) staticky načtené
 *    stránky i všechen obsah, který později vykreslí JavaScript (sleduje změny DOM).
 *    Původní české znění se pamatuje, takže přepnutí jazyka funguje opakovaně a hned.
 *  - alert() / confirm() / prompt() se také překládají.
 *  - Text s proměnnou částí se zapisuje se zástupci: {0} libovolný text, {n0} číslo,
 *    {d0} datum, {t0} čas (např. "Záznamů: {0}").
 *  - Zprávy končící dvojtečkou fungují i jako předpona ("Chyba při ukládání: <text>").
 *  - Volba jazyka se ukládá do localStorage (klíč vetcare_lang) a zachová se po odhlášení.
 *  - Tlačítko s volbou jazyka se vloží do horní lišty vedle přepínače motivů.
 *
 *  - Prohlížeč posílá jazyk serveru v hlavičce X-Lang (u požadavků na /api/…). Přihlášenému uživateli se
 *    ručně zvolený jazyk uloží i do databáze (PUT /api/uzivatel/jazyk, sloupec Uzivatele.Jazyk).
 *    Server (server.js) tento soubor načte také (require) a použije pickLang() + tl() pro e-maily.
 *
 * Veřejné API:  VetCareI18n.t('Seznam rezervací na {0}', datum)   // překlad v kódu
 *               VetCareI18n.tl('de', 'Termín:')                   // překlad do zadaného jazyka (server)
 *               VetCareI18n.pickLang(xLang, acceptLanguage)       // výběr jazyka požadavku (server)
 *               VetCareI18n.locale()                              // např. 'de-DE' pro toLocale…String
 *               VetCareI18n.getLang() / setLang('pl')
 *  Událost 'vc-lang-change' se vyvolá po každé změně jazyka (stránky jí překreslují obsah,
 *  který obsahuje data formátovaná podle jazyka).
 */
(function (root) {
    'use strict';

    var KEY = 'vetcare_lang';
    var LANGS = [
        { id: 'cs', code: 'CS', name: 'Čeština',    locale: 'cs-CZ' },
        { id: 'sk', code: 'SK', name: 'Slovenčina', locale: 'sk-SK' },
        { id: 'pl', code: 'PL', name: 'Polski',     locale: 'pl-PL' },
        { id: 'de', code: 'DE', name: 'Deutsch',    locale: 'de-DE' },
        { id: 'en', code: 'EN', name: 'English',    locale: 'en-GB' }
    ];

    /* =====================================================================
     *  SLOVNÍK:  [ čeština, slovenčina, polski, Deutsch, English ]
     * ===================================================================== */
    var DICT = [
        /* ---------- Společné: navigace, tlačítka, formuláře ---------- */
        ["Odhlásit", "Odhlásiť", "Wyloguj", "Abmelden", "Log out"],
        ["Odhlásit se", "Odhlásiť sa", "Wyloguj się", "Abmelden", "Log out"],
        ["Přihlásit", "Prihlásiť", "Zaloguj", "Anmelden", "Log in"],
        ["Přihlášení", "Prihlásenie", "Logowanie", "Anmeldung", "Login"],
        ["Registrace", "Registrácia", "Rejestracja", "Registrierung", "Sign up"],
        ["Heslo", "Heslo", "Hasło", "Passwort", "Password"],
        ["E-mail", "E-mail", "E-mail", "E-Mail", "Email"],
        ["Email", "E-mail", "E-mail", "E-Mail", "Email"],
        ["Jméno", "Meno", "Imię", "Vorname", "First name"],
        ["Příjmení", "Priezvisko", "Nazwisko", "Nachname", "Last name"],
        ["Telefon", "Telefón", "Telefon", "Telefon", "Phone"],
        ["Telefon *", "Telefón *", "Telefon *", "Telefon *", "Phone *"],
        ["Adresa", "Adresa", "Adres", "Adresse", "Address"],
        ["Název", "Názov", "Nazwa", "Name", "Name"],
        ["Akce", "Akcie", "Akcje", "Aktionen", "Actions"],
        ["Role", "Rola", "Rola", "Rolle", "Role"],
        ["Stav", "Stav", "Status", "Status", "Status"],
        ["Datum", "Dátum", "Data", "Datum", "Date"],
        ["Čas", "Čas", "Godzina", "Uhrzeit", "Time"],
        ["Den", "Deň", "Dzień", "Tag", "Day"],
        ["Od", "Od", "Od", "Von", "From"],
        ["Do", "Do", "Do", "Bis", "To"],
        ["Zrušit", "Zrušiť", "Anuluj", "Abbrechen", "Cancel"],
        ["Zavřít", "Zavrieť", "Zamknij", "Schließen", "Close"],
        ["Smazat", "Zmazať", "Usuń", "Löschen", "Delete"],
        ["Upravit", "Upraviť", "Edytuj", "Bearbeiten", "Edit"],
        ["Vytvořit", "Vytvoriť", "Utwórz", "Erstellen", "Create"],
        ["Načítání...", "Načítava sa...", "Ładowanie...", "Wird geladen...", "Loading..."],
        ["Načítání agendy...", "Načítavam agendu...", "Ładowanie agendy...", "Agenda wird geladen...", "Loading schedule..."],
        ["Načítání firmy...", "Načítavam firmu...", "Ładowanie firmy...", "Firma wird geladen...", "Loading company..."],
        ["Načítání rezervací...", "Načítavam rezervácie...", "Ładowanie rezerwacji...", "Reservierungen werden geladen...", "Loading bookings..."],
        ["Načítání tabulek...", "Načítavam tabuľky...", "Ładowanie tabel...", "Tabellen werden geladen...", "Loading tables..."],
        ["Načítání zvířat...", "Načítavam zvieratá...", "Ładowanie zwierząt...", "Tiere werden geladen...", "Loading pets..."],
        ["Neznámá chyba", "Neznáma chyba", "Nieznany błąd", "Unbekannter Fehler", "Unknown error"],
        ["Nespecifikováno", "Nešpecifikované", "Nie określono", "Nicht angegeben", "Not specified"],
        ["Nespecifikován", "Neurčený", "Nie określono", "Nicht angegeben", "Not specified"],
        ["Všeobecný", "Všeobecný", "Ogólny", "Allgemein", "General"],

        /* ---------- Přepínač motivů a jazyků ---------- */
        ["Motiv vzhledu", "Motív vzhľadu", "Motyw wyglądu", "Farbschema", "Theme"],
        ["Změnit motiv vzhledu", "Zmeniť motív vzhľadu", "Zmień motyw wyglądu", "Farbschema ändern", "Change theme"],
        ["Změnit jazyk", "Zmeniť jazyk", "Zmień język", "Sprache ändern", "Change language"],
        ["Jazyk", "Jazyk", "Język", "Sprache", "Language"],
        ["Výchozí", "Predvolený", "Domyślny", "Standard", "Default"],
        ["Tmavý", "Tmavý", "Ciemny", "Dunkel", "Dark"],
        ["Modrý (zdravotnický)", "Modrý (zdravotnícky)", "Niebieski (medyczny)", "Blau (medizinisch)", "Blue (medical)"],
        ["Teplý", "Teplý", "Ciepły", "Warm", "Warm"],
        ["Vysoký kontrast", "Vysoký kontrast", "Wysoki kontrast", "Hoher Kontrast", "High contrast"],
        ["Světle zelený", "Svetlozelený", "Jasnozielony", "Hellgrün", "Light green"],
        ["Světle žlutý", "Svetložltý", "Jasnożółty", "Hellgelb", "Light yellow"],
        ["Světle modrý", "Svetlomodrý", "Jasnoniebieski", "Hellblau", "Light blue"],

        /* ---------- Titulky stránek a značka ---------- */
        ["VetCare - Rezervace termínu", "VetCare - Rezervácia termínu", "VetCare - Rezerwacja terminu", "VetCare - Terminbuchung", "VetCare - Appointment booking"],
        ["VetCare - Portál Klienta", "VetCare - Portál klienta", "VetCare - Portal klienta", "VetCare - Kundenportal", "VetCare - Client portal"],
        ["VetCare - Panel Lékaře", "VetCare - Panel lekára", "VetCare - Panel lekarza", "VetCare - Tierarzt-Panel", "VetCare - Vet panel"],
        ["VetCare - Administrační centrum", "VetCare - Administračné centrum", "VetCare - Centrum administracyjne", "VetCare - Verwaltungszentrum", "VetCare - Admin centre"],
        ["VetCare - Správa Databáze", "VetCare - Správa databázy", "VetCare - Zarządzanie bazą danych", "VetCare - Datenbankverwaltung", "VetCare - Database management"],
        ["VetCare - Čekárna TV", "VetCare - Čakáreň TV", "VetCare - Telewizor w poczekalni", "VetCare - Wartezimmer-TV", "VetCare - Waiting room TV"],
        ["VET-CARE | Můj Účet", "VET-CARE | Môj účet", "VET-CARE | Moje konto", "VET-CARE | Mein Konto", "VET-CARE | My account"],
        ["VET-CARE | Ordinační Přehled", "VET-CARE | Prehľad ambulancie", "VET-CARE | Przegląd gabinetu", "VET-CARE | Praxisübersicht", "VET-CARE | Clinic overview"],
        ["VET-CARE | Správa firmy", "VET-CARE | Správa firmy", "VET-CARE | Zarządzanie firmą", "VET-CARE | Firmenverwaltung", "VET-CARE | Company management"],
        ["VET-CARE | Správa Databáze", "VET-CARE | Správa databázy", "VET-CARE | Zarządzanie bazą danych", "VET-CARE | Datenbankverwaltung", "VET-CARE | Database management"],
        ["Veterinární rezervační systém", "Veterinárny rezervačný systém", "Weterynaryjny system rezerwacji", "Tierärztliches Reservierungssystem", "Veterinary booking system"],
        ["Veterinární klinika", "Veterinárna klinika", "Klinika weterynaryjna", "Tierklinik", "Veterinary clinic"],
        ["Centrální Ordinace", "Centrálna ambulancia", "Gabinet centralny", "Zentralpraxis", "Central clinic"],
        ["© 2026 VET-CARE Rezervační Systém", "© 2026 VET-CARE Rezervačný systém", "© 2026 VET-CARE System rezerwacji", "© 2026 VET-CARE Reservierungssystem", "© 2026 VET-CARE Booking System"],

        /* ---------- Veřejná rezervace (index) ---------- */
        ["Čekárna TV", "Čakáreň TV", "Poczekalnia TV", "Wartezimmer-TV", "Waiting room TV"],
        ["Online rezervace termínu", "Online rezervácia termínu", "Rezerwacja terminu online", "Online-Terminbuchung", "Online appointment booking"],
        ["Vyberte pobočku, úkon a preferovaný čas návštěvy.", "Vyberte pobočku, úkon a preferovaný čas návštevy.", "Wybierz oddział, zabieg i preferowany termin wizyty.", "Wählen Sie Filiale, Behandlung und Ihre bevorzugte Besuchszeit.", "Choose a branch, a procedure and your preferred visit time."],
        ["1. Vyberte pobočku / ordinaci *", "1. Vyberte pobočku / ambulanciu *", "1. Wybierz oddział / gabinet *", "1. Filiale / Praxis wählen *", "1. Select branch / clinic *"],
        ["2. Typ požadovaného úkonu *", "2. Typ požadovaného úkonu *", "2. Rodzaj zabiegu *", "2. Gewünschte Behandlung *", "2. Type of procedure *"],
        ["3. Preferovaný lékař *", "3. Preferovaný lekár *", "3. Preferowany lekarz *", "3. Bevorzugter Tierarzt *", "3. Preferred vet *"],
        ["4. Datum návštěvy *", "4. Dátum návštevy *", "4. Data wizyty *", "4. Besuchsdatum *", "4. Visit date *"],
        ["5. Volné časové termíny *", "5. Voľné časové termíny *", "5. Wolne terminy *", "5. Freie Termine *", "5. Available time slots *"],
        ["-- Vyberte ordinaci --", "-- Vyberte ambulanciu --", "-- Wybierz gabinet --", "-- Praxis wählen --", "-- Select clinic --"],
        ["-- Vyberte úkon --", "-- Vyberte úkon --", "-- Wybierz zabieg --", "-- Behandlung wählen --", "-- Select procedure --"],
        ["-- Vyberte lékaře --", "-- Vyberte lekára --", "-- Wybierz lekarza --", "-- Tierarzt wählen --", "-- Select vet --"],
        ["-- Vyberte --", "-- Vyberte --", "-- Wybierz --", "-- Auswählen --", "-- Select --"],
        ["Nejprve zvolte pobočku, úkon, lékaře a datum...", "Najprv zvoľte pobočku, úkon, lekára a dátum...", "Najpierw wybierz oddział, zabieg, lekarza i datę...", "Wählen Sie zuerst Filiale, Behandlung, Tierarzt und Datum...", "First choose a branch, procedure, vet and date..."],
        ["Vyberte pobočku, úkon, lékaře a datum pro zobrazení časů.", "Vyberte pobočku, úkon, lekára a dátum na zobrazenie časov.", "Wybierz oddział, zabieg, lekarza i datę, aby zobaczyć terminy.", "Wählen Sie Filiale, Behandlung, Tierarzt und Datum, um die Zeiten anzuzeigen.", "Select a branch, procedure, vet and date to see available times."],
        ["Pro výpočet termínů prosím vyberte konkrétního lékaře.", "Pre výpočet termínov prosím vyberte konkrétneho lekára.", "Aby obliczyć terminy, wybierz konkretnego lekarza.", "Bitte wählen Sie einen bestimmten Tierarzt, um die Termine zu berechnen.", "Please choose a specific vet to calculate the available times."],
        ["Pro vybraný den a lékaře nejsou k dispozici žádné volné termíny.", "Pre vybraný deň a lekára nie sú k dispozícii žiadne voľné termíny.", "Brak wolnych terminów dla wybranego dnia i lekarza.", "Für den gewählten Tag und Tierarzt sind keine freien Termine verfügbar.", "No free slots are available for the selected day and vet."],
        ["Údaje o majiteli a pacientovi", "Údaje o majiteľovi a pacientovi", "Dane właściciela i pacjenta", "Angaben zu Besitzer und Patient", "Owner and patient details"],
        ["Jméno a Příjmení majitele *", "Meno a priezvisko majiteľa *", "Imię i nazwisko właściciela *", "Vor- und Nachname des Besitzers *", "Owner's full name *"],
        ["E-mail (pro potvrzení) *", "E-mail (na potvrdenie) *", "E-mail (do potwierdzenia) *", "E-Mail (für die Bestätigung) *", "Email (for confirmation) *"],
        ["Jméno zvířete *", "Meno zvieraťa *", "Imię zwierzęcia *", "Name des Tieres *", "Pet name *"],
        ["Jméno zvířete", "Meno zvieraťa", "Imię zwierzęcia", "Name des Tieres", "Pet name"],
        ["Druh zvířete *", "Druh zvieraťa *", "Gatunek zwierzęcia *", "Tierart *", "Pet species *"],
        ["Pes", "Pes", "Pies", "Hund", "Dog"],
        ["Kočka", "Mačka", "Kot", "Katze", "Cat"],
        ["Hlodavec", "Hlodavec", "Gryzoń", "Nagetier", "Rodent"],
        ["Pták", "Vták", "Ptak", "Vogel", "Bird"],
        ["Jiné", "Iné", "Inne", "Andere", "Other"],
        ["Poznámka / Důvod návštěvy", "Poznámka / Dôvod návštevy", "Uwagi / Powód wizyty", "Anmerkung / Besuchsgrund", "Note / Reason for visit"],
        ["Popište zdravotní potíže zvířete...", "Popíšte zdravotné ťažkosti zvieraťa...", "Opisz problemy zdrowotne zwierzęcia...", "Beschreiben Sie die gesundheitlichen Beschwerden des Tieres...", "Describe your pet's health problems..."],
        ["Potvrdit a odeslat rezervaci", "Potvrdiť a odoslať rezerváciu", "Potwierdź i wyślij rezerwację", "Reservierung bestätigen und senden", "Confirm and send booking"],
        ["Vstoupit do systému", "Vstúpiť do systému", "Wejdź do systemu", "Im System anmelden", "Sign in to the system"],
        ["Vytvořit účet", "Vytvoriť účet", "Utwórz konto", "Konto erstellen", "Create account"],
        ["Rezervace byla úspěšně vytvořena!", "Rezervácia bola úspešne vytvorená!", "Rezerwacja została pomyślnie utworzona!", "Die Reservierung wurde erfolgreich erstellt!", "Booking created successfully!"],
        ["Vyberte prosím konkrétní časový termín z nabídky.", "Vyberte prosím konkrétny časový termín z ponuky.", "Wybierz konkretny termin z oferty.", "Bitte wählen Sie einen konkreten Termin aus dem Angebot.", "Please select a specific time slot from the list."],
        ["API dostupné, NAČTENO.", "API dostupné, NAČÍTANÉ.", "API dostępne, WCZYTANO.", "API erreichbar, GELADEN.", "API available, LOADED."],
        ["API dostupné, načítám volné sloty...", "API dostupné, načítavam voľné sloty...", "API dostępne, wczytuję wolne terminy...", "API erreichbar, freie Zeitfenster werden geladen...", "API available, loading free slots..."],
        ["API nedostupné, načítám výchozí data.", "API nedostupné, načítavam predvolené údaje.", "API niedostępne, wczytuję dane domyślne.", "API nicht erreichbar, Standarddaten werden geladen.", "API unavailable, loading default data."],
        ["Přihlášení proběhlo úspěšně. Přesměrování na stránku podle role:", "Prihlásenie prebehlo úspešne. Presmerovanie na stránku podľa roly:", "Logowanie zakończone sukcesem. Przekierowanie na stronę zgodnie z rolą:", "Anmeldung erfolgreich. Weiterleitung zur Seite entsprechend der Rolle:", "Login successful. Redirecting to the page for the role:"],
        ["Očkování", "Očkovanie", "Szczepienie", "Impfung", "Vaccination"],
        ["Preventivní prohlídka", "Preventívna prehliadka", "Badanie profilaktyczne", "Vorsorgeuntersuchung", "Preventive check-up"],
        ["Akutní stav", "Akútny stav", "Stan nagły", "Akutfall", "Acute condition"],
        ["Chirurgický zákrok", "Chirurgický zákrok", "Zabieg chirurgiczny", "Chirurgischer Eingriff", "Surgical procedure"],
        ["Rex (Pes)", "Rex (Pes)", "Rex (Pies)", "Rex (Hund)", "Rex (Dog)"],
        ["Majitel: Dvořák", "Majiteľ: Dvořák", "Właściciel: Dvořák", "Besitzer: Dvořák", "Owner: Dvořák"],
        ["Právě v ordinaci", "Práve v ambulancii", "Teraz w gabinecie", "Gerade im Behandlungsraum", "Currently in the consulting room"],
        ["ČEKAJÍCÍ PACIENTI", "ČAKAJÚCI PACIENTI", "OCZEKUJĄCY PACJENCI", "WARTENDE PATIENTEN", "WAITING PATIENTS"],

        /* ---------- Chyby a hlášení (prefixy končí dvojtečkou) ---------- */
        ["Chyba:", "Chyba:", "Błąd:", "Fehler:", "Error:"],
        ["Chyba při odesílání rezervace:", "Chyba pri odosielaní rezervácie:", "Błąd podczas wysyłania rezerwacji:", "Fehler beim Senden der Reservierung:", "Error sending the booking:"],
        ["Chyba při komunikaci se serverem:", "Chyba pri komunikácii so serverom:", "Błąd komunikacji z serwerem:", "Fehler bei der Kommunikation mit dem Server:", "Error communicating with the server:"],
        ["Chyba při ukládání:", "Chyba pri ukladaní:", "Błąd podczas zapisywania:", "Fehler beim Speichern:", "Error while saving:"],
        ["Chyba při rušení:", "Chyba pri rušení:", "Błąd podczas anulowania:", "Fehler beim Stornieren:", "Error while cancelling:"],
        ["Chyba při odesílání e-mailu:", "Chyba pri odosielaní e-mailu:", "Błąd podczas wysyłania e-maila:", "Fehler beim Senden der E-Mail:", "Error sending the email:"],
        ["Chyba uložení:", "Chyba uloženia:", "Błąd zapisu:", "Speicherfehler:", "Save error:"],
        ["Chyba při mazání:", "Chyba pri mazaní:", "Błąd podczas usuwania:", "Fehler beim Löschen:", "Error while deleting:"],
        ["Chyba při přihlášení", "Chyba pri prihlásení", "Błąd logowania", "Fehler bei der Anmeldung", "Login error"],
        ["Chyba při registraci", "Chyba pri registrácii", "Błąd rejestracji", "Fehler bei der Registrierung", "Registration error"],
        ["Chyba při ukládání", "Chyba pri ukladaní", "Błąd podczas zapisywania", "Fehler beim Speichern", "Error while saving"],
        ["Chyba při ukládání.", "Chyba pri ukladaní.", "Błąd podczas zapisywania.", "Fehler beim Speichern.", "Error while saving."],
        ["Chyba při odesílání rezervace", "Chyba pri odosielaní rezervácie", "Błąd podczas wysyłania rezerwacji", "Fehler beim Senden der Reservierung", "Error sending the booking"],
        ["Chyba při komunikaci se serverem.", "Chyba pri komunikácii so serverom.", "Błąd komunikacji z serwerem.", "Fehler bei der Kommunikation mit dem Server.", "Error communicating with the server."],
        ["Chyba komunikace se serverem.", "Chyba komunikácie so serverom.", "Błąd komunikacji z serwerem.", "Kommunikationsfehler mit dem Server.", "Server communication error."],
        ["Chyba při načítání dat ze serveru.", "Chyba pri načítaní údajov zo servera.", "Błąd podczas pobierania danych z serwera.", "Fehler beim Laden der Daten vom Server.", "Error loading data from the server."],
        ["Chyba při načítání zvířat", "Chyba pri načítaní zvierat", "Błąd podczas ładowania zwierząt", "Fehler beim Laden der Tiere", "Error loading pets"],
        ["Chyba při výpočtu volných termínů.", "Chyba pri výpočte voľných termínov.", "Błąd podczas obliczania wolnych terminów.", "Fehler bei der Berechnung der freien Termine.", "Error calculating the free slots."],
        ["Neznámá chybná odezva serveru", "Neznáma chybná odpoveď servera", "Nieznana błędna odpowiedź serwera", "Unbekannte fehlerhafte Serverantwort", "Unknown invalid server response"],
        ["Nepodařilo se přidat zvíře", "Nepodarilo sa pridať zviera", "Nie udało się dodać zwierzęcia", "Das Tier konnte nicht hinzugefügt werden", "Could not add the pet"],
        ["Nepodařilo se smazat zvíře", "Nepodarilo sa zmazať zviera", "Nie udało się usunąć zwierzęcia", "Das Tier konnte nicht gelöscht werden", "Could not delete the pet"],
        ["Nepodařilo se načíst rezervace", "Nepodarilo sa načítať rezervácie", "Nie udało się wczytać rezerwacji", "Die Reservierungen konnten nicht geladen werden", "Could not load the bookings"],
        ["Nepodařilo se stornovat rezervaci", "Nepodarilo sa stornovať rezerváciu", "Nie udało się anulować rezerwacji", "Die Reservierung konnte nicht storniert werden", "Could not cancel the booking"],
        ["Nepodařilo se smazat úkon. Tento úkon je pravděpodobně přiřazen k nějakému záznamu.", "Nepodarilo sa zmazať úkon. Tento úkon je pravdepodobne priradený k nejakému záznamu.", "Nie udało się usunąć zabiegu. Ten zabieg jest prawdopodobnie przypisany do jakiegoś rekordu.", "Die Behandlung konnte nicht gelöscht werden. Sie ist wahrscheinlich einem Datensatz zugeordnet.", "Could not delete the procedure. It is probably assigned to a record."],

        /* ---------- Klientský portál ---------- */
        ["Přihlášený uživatel", "Prihlásený používateľ", "Zalogowany użytkownik", "Angemeldeter Benutzer", "Logged-in user"],
        ["Vytvořené rezervace", "Vytvorené rezervácie", "Utworzone rezerwacje", "Erstellte Reservierungen", "Created bookings"],
        ["Moje zvířata", "Moje zvieratá", "Moje zwierzęta", "Meine Tiere", "My pets"],
        ["Vytvoření rezervace", "Vytvorenie rezervácie", "Utwórz rezerwację", "Reservierung erstellen", "Create a booking"],
        ["Moje vytvořené rezervace", "Moje vytvorené rezervácie", "Moje utworzone rezerwacje", "Meine erstellten Reservierungen", "My bookings"],
        ["Všechny", "Všetky", "Wszystkie", "Alle", "All"],
        ["Plánované", "Plánované", "Zaplanowane", "Geplant", "Scheduled"],
        ["Proběhlé", "Prebehnuté", "Odbyte", "Abgeschlossen", "Completed"],
        ["Stornované", "Stornované", "Anulowane", "Storniert", "Cancelled"],
        ["Datum a čas", "Dátum a čas", "Data i godzina", "Datum und Uhrzeit", "Date and time"],
        ["Zvíře", "Zviera", "Zwierzę", "Tier", "Pet"],
        ["Lékař / Ordinace", "Lekár / Ambulancia", "Lekarz / Gabinet", "Tierarzt / Praxis", "Vet / Clinic"],
        ["Úkon", "Úkon", "Zabieg", "Behandlung", "Procedure"],
        ["Lékař", "Lekár", "Lekarz", "Tierarzt", "Vet"],
        ["Nová Rezervace", "Nová rezervácia", "Nowa rezerwacja", "Neue Reservierung", "New booking"],
        ["Ordinace / Pobočka", "Ambulancia / Pobočka", "Gabinet / Oddział", "Praxis / Filiale", "Clinic / Branch"],
        ["Typ Úkonu", "Typ úkonu", "Rodzaj zabiegu", "Behandlungsart", "Procedure type"],
        ["Moje Zvíře", "Moje zviera", "Moje zwierzę", "Mein Tier", "My pet"],
        ["Poznámka pro lékaře (volitelné)", "Poznámka pre lekára (voliteľné)", "Uwagi dla lekarza (opcjonalnie)", "Hinweis für den Tierarzt (optional)", "Note for the vet (optional)"],
        ["Důvod návštěvy...", "Dôvod návštevy...", "Powód wizyty...", "Besuchsgrund...", "Reason for visit..."],
        ["Volné časové sloty", "Voľné časové sloty", "Wolne terminy", "Freie Zeitfenster", "Available time slots"],
        ["Vyberte lékaře, úkon a datum pro zobrazení slotů", "Vyberte lekára, úkon a dátum na zobrazenie slotov", "Wybierz lekarza, zabieg i datę, aby zobaczyć terminy", "Wählen Sie Tierarzt, Behandlung und Datum, um die Zeitfenster anzuzeigen", "Select a vet, procedure and date to see the time slots"],
        ["Vyberte lékaře, úkon a datum", "Vyberte lekára, úkon a dátum", "Wybierz lekarza, zabieg i datę", "Tierarzt, Behandlung und Datum wählen", "Select a vet, procedure and date"],
        ["Odeslat Rezervaci", "Odoslať rezerváciu", "Wyślij rezerwację", "Reservierung senden", "Submit booking"],
        ["Přidat nové zvíře", "Pridať nové zviera", "Dodaj nowe zwierzę", "Neues Tier hinzufügen", "Add a new pet"],
        ["Druh", "Druh", "Gatunek", "Art", "Species"],
        ["Rasa / Plemeno", "Rasa / Plemeno", "Rasa", "Rasse", "Breed"],
        ["Věk (v letech)", "Vek (v rokoch)", "Wiek (w latach)", "Alter (in Jahren)", "Age (in years)"],
        ["např. Alík", "napr. Alík", "np. Burek", "z. B. Bello", "e.g. Rex"],
        ["např. Pes, Kočka, Králík", "napr. Pes, Mačka, Králik", "np. Pies, Kot, Królik", "z. B. Hund, Katze, Kaninchen", "e.g. Dog, Cat, Rabbit"],
        ["např. Zlatý retrívr", "napr. Zlatý retriever", "np. Golden retriever", "z. B. Golden Retriever", "e.g. Golden Retriever"],
        ["např. 3", "napr. 3", "np. 3", "z. B. 3", "e.g. 3"],
        ["Uložit zvíře", "Uložiť zviera", "Zapisz zwierzę", "Tier speichern", "Save pet"],
        ["Nemáte zatím evidovaná žádná zvířata.", "Zatiaľ nemáte evidované žiadne zvieratá.", "Nie masz jeszcze zarejestrowanych zwierząt.", "Sie haben noch keine Tiere registriert.", "You have no pets registered yet."],
        ["Zvíře nelze smazat, protože má v databázi záznam v rezervacích.", "Zviera nie je možné zmazať, pretože má v databáze záznam v rezerváciách.", "Zwierzęcia nie można usunąć, ponieważ ma wpisy w rezerwacjach.", "Das Tier kann nicht gelöscht werden, da es Einträge in den Reservierungen hat.", "This pet cannot be deleted because it has bookings on record."],
        ["-- Nejprve přidejte zvíře --", "-- Najprv pridajte zviera --", "-- Najpierw dodaj zwierzę --", "-- Bitte zuerst ein Tier hinzufügen --", "-- Add a pet first --"],
        ["Stornovat", "Stornovať", "Anuluj", "Stornieren", "Cancel"],
        ["Plánovaná", "Plánovaná", "Zaplanowana", "Geplant", "Scheduled"],
        ["Proběhlá", "Prebehnutá", "Odbyta", "Abgeschlossen", "Completed"],
        ["Stornována", "Stornovaná", "Anulowana", "Storniert", "Cancelled"],
        ["Potvrzeno", "Potvrdené", "Potwierdzona", "Bestätigt", "Confirmed"],
        ["Storno", "Storno", "Anulowana", "Storniert", "Cancelled"],
        ["Zrušeno", "Zrušené", "Anulowana", "Storniert", "Cancelled"],
        ["Žádné rezervace neodpovídají tomuto filtru.", "Žiadne rezervácie nezodpovedajú tomuto filtru.", "Żadne rezerwacje nie pasują do tego filtra.", "Keine Reservierungen entsprechen diesem Filter.", "No bookings match this filter."],
        ["Pro tento den nejsou k dispozici žádné volné termíny.", "Pre tento deň nie sú k dispozícii žiadne voľné termíny.", "Na ten dzień nie ma wolnych terminów.", "Für diesen Tag sind keine freien Termine verfügbar.", "No free slots are available for this day."],
        ["Opravdu si přejete smazat toto zvíře?", "Naozaj si prajete zmazať toto zviera?", "Czy na pewno chcesz usunąć to zwierzę?", "Möchten Sie dieses Tier wirklich löschen?", "Are you sure you want to delete this pet?"],
        ["Opravdu si přejete stornovat tuto rezervaci?", "Naozaj si prajete stornovať túto rezerváciu?", "Czy na pewno chcesz anulować tę rezerwację?", "Möchten Sie diese Reservierung wirklich stornieren?", "Are you sure you want to cancel this booking?"],
        ["Rezervace byla úspěšně stornována.", "Rezervácia bola úspešne stornovaná.", "Rezerwacja została pomyślnie anulowana.", "Die Reservierung wurde erfolgreich storniert.", "The booking was cancelled successfully."],
        ["Vyberte prosím volný časový slot.", "Vyberte prosím voľný časový slot.", "Wybierz wolny termin.", "Bitte wählen Sie ein freies Zeitfenster.", "Please select a free time slot."],
        ["Nejprve si prosím v sekci \"Moje zvířata\" zaregistrujte zvíře.", "Najprv si prosím v sekcii \"Moje zvieratá\" zaregistrujte zviera.", "Najpierw zarejestruj zwierzę w sekcji \"Moje zwierzęta\".", "Bitte registrieren Sie zuerst ein Tier im Bereich \"Meine Tiere\".", "Please register a pet in the \"My pets\" section first."],
        ["Pro vytvoření rezervace se prosím přihlaste.", "Na vytvorenie rezervácie sa prosím prihláste.", "Aby utworzyć rezerwację, zaloguj się.", "Bitte melden Sie sich an, um eine Reservierung zu erstellen.", "Please log in to create a booking."],

        /* ---------- Panel lékaře ---------- */
        ["Přihlášený lékař", "Prihlásený lekár", "Zalogowany lekarz", "Angemeldeter Tierarzt", "Logged-in vet"],
        ["Nastavení uživatele", "Nastavenia používateľa", "Ustawienia użytkownika", "Benutzereinstellungen", "User settings"],
        ["Seznam rezervací", "Zoznam rezervácií", "Lista rezerwacji", "Reservierungsliste", "Booking list"],
        ["Seznam rezervací na zvolený den", "Zoznam rezervácií na zvolený deň", "Lista rezerwacji na wybrany dzień", "Reservierungsliste für den gewählten Tag", "Booking list for the selected day"],
        ["Nepřítomnost", "Neprítomnosť", "Nieobecność", "Abwesenheit", "Absence"],
        ["Profil a Ordinační Doba Lékaře", "Profil a ordinačné hodiny lekára", "Profil i godziny przyjęć lekarza", "Profil und Sprechzeiten des Tierarztes", "Vet profile and opening hours"],
        ["Dnes", "Dnes", "Dzisiaj", "Heute", "Today"],
        ["Týden", "Týždeň", "Tydzień", "Woche", "Week"],
        ["Měsíc", "Mesiac", "Miesiąc", "Monat", "Month"],
        ["Předchozí", "Predchádzajúci", "Poprzedni", "Vorheriger", "Previous"],
        ["Následující", "Nasledujúci", "Następny", "Nächster", "Next"],
        ["Pacient", "Pacient", "Pacjent", "Patient", "Patient"],
        ["Majitel / Kontakt", "Majiteľ / Kontakt", "Właściciel / Kontakt", "Besitzer / Kontakt", "Owner / Contact"],
        ["Detail rezervace", "Detail rezervácie", "Szczegóły rezerwacji", "Reservierungsdetails", "Booking details"],
        ["Zrušit rezervaci", "Zrušiť rezerváciu", "Anuluj rezerwację", "Reservierung stornieren", "Cancel booking"],
        ["Důvod Zrušení (pro klienta)", "Dôvod zrušenia (pre klienta)", "Powód anulowania (dla klienta)", "Stornierungsgrund (für den Kunden)", "Cancellation reason (for the client)"],
        ["Napište klientovi důvod zrušení (např. akutní operační zákrok, nemoc)...", "Napíšte klientovi dôvod zrušenia (napr. akútny operačný zákrok, choroba)...", "Napisz klientowi powód anulowania (np. pilny zabieg operacyjny, choroba)...", "Schreiben Sie dem Kunden den Stornierungsgrund (z. B. Notoperation, Krankheit)...", "Write the reason for cancelling for the client (e.g. emergency surgery, illness)..."],
        ["Klientovi bude automaticky odeslán e-mail s informací o stornování objednávky.", "Klientovi bude automaticky odoslaný e-mail s informáciou o stornovaní objednávky.", "Klient automatycznie otrzyma e-mail z informacją o anulowaniu rezerwacji.", "Der Kunde erhält automatisch eine E-Mail mit der Information über die Stornierung.", "The client will automatically receive an email about the cancellation."],
        ["Odeslat a Zrušit", "Odoslať a zrušiť", "Wyślij i anuluj", "Senden und stornieren", "Send and cancel"],
        ["Odeslat e-mail zákazníkovi", "Odoslať e-mail zákazníkovi", "Wyślij e-mail do klienta", "E-Mail an den Kunden senden", "Send email to the customer"],
        ["Příjemce", "Príjemca", "Odbiorca", "Empfänger", "Recipient"],
        ["Předmět E-mailu", "Predmet e-mailu", "Temat e-maila", "E-Mail-Betreff", "Email subject"],
        ["Zpráva", "Správa", "Wiadomość", "Nachricht", "Message"],
        ["Napište předmět e-mailu...", "Napíšte predmet e-mailu...", "Wpisz temat e-maila...", "Betreff der E-Mail eingeben...", "Enter the email subject..."],
        ["Napište zprávu pro zákazníka...", "Napíšte správu pre zákazníka...", "Napisz wiadomość do klienta...", "Nachricht an den Kunden schreiben...", "Write a message for the customer..."],
        ["Odeslat E-mail", "Odoslať e-mail", "Wyślij e-mail", "E-Mail senden", "Send email"],
        ["Zákazník", "Zákazník", "Klient", "Kunde", "Customer"],
        ["Odesílám...", "Odosielam...", "Wysyłanie...", "Wird gesendet...", "Sending..."],
        ["Zadání nepřítomnosti", "Zadanie neprítomnosti", "Wprowadzanie nieobecności", "Abwesenheit eintragen", "Add an absence"],
        ["Jeden den", "Jeden deň", "Jeden dzień", "Ein Tag", "Single day"],
        ["Více dní (interval)", "Viac dní (interval)", "Kilka dni (zakres)", "Mehrere Tage (Zeitraum)", "Multiple days (range)"],
        ["Datum Od", "Dátum od", "Data od", "Datum von", "Date from"],
        ["Datum Do", "Dátum do", "Data do", "Datum bis", "Date to"],
        ["Celodenní nepřítomnost", "Celodenná neprítomnosť", "Nieobecność całodniowa", "Ganztägige Abwesenheit", "All-day absence"],
        ["Důvod (volitelné)", "Dôvod (voliteľné)", "Powód (opcjonalnie)", "Grund (optional)", "Reason (optional)"],
        ["Dovolená, školení, nemoc...", "Dovolenka, školenie, choroba...", "Urlop, szkolenie, choroba...", "Urlaub, Schulung, Krankheit...", "Vacation, training, illness..."],
        ["Uložit nepřítomnost", "Uložiť neprítomnosť", "Zapisz nieobecność", "Abwesenheit speichern", "Save absence"],
        ["Plánované nepřítomnosti", "Plánované neprítomnosti", "Zaplanowane nieobecności", "Geplante Abwesenheiten", "Planned absences"],
        ["Rozsah", "Rozsah", "Zakres", "Zeitraum", "Range"],
        ["Důvod", "Dôvod", "Powód", "Grund", "Reason"],
        ["Celý den", "Celý deň", "Cały dzień", "Ganztägig", "All day"],
        ["Celodenní", "Celodenná", "Całodniowa", "Ganztägig", "All day"],
        ["Žádná zadaná nepřítomnost.", "Žiadna zadaná neprítomnosť.", "Brak wprowadzonych nieobecności.", "Keine Abwesenheit eingetragen.", "No absences entered."],
        ["Základní informace", "Základné informácie", "Informacje podstawowe", "Grundinformationen", "Basic information"],
        ["Titul", "Titul", "Tytuł", "Titel", "Title"],
        ["Specializace", "Špecializácia", "Specjalizacja", "Spezialisierung", "Specialization"],
        ["Chirurgie, Stomatologie, Malá zvířata...", "Chirurgia, Stomatológia, Malé zvieratá...", "Chirurgia, Stomatologia, Małe zwierzęta...", "Chirurgie, Zahnmedizin, Kleintiere...", "Surgery, Dentistry, Small animals..."],
        ["Uložit Změny Profilu", "Uložiť zmeny profilu", "Zapisz zmiany profilu", "Profiländerungen speichern", "Save profile changes"],
        ["Ordinační Doba (Dopoledne / Odpoledne)", "Ordinačné hodiny (Dopoludnia / Popoludní)", "Godziny przyjęć (Przedpołudnie / Popołudnie)", "Sprechzeiten (Vormittag / Nachmittag)", "Opening hours (Morning / Afternoon)"],
        ["Dopoledne:", "Dopoludnia:", "Przedpołudnie:", "Vormittag:", "Morning:"],
        ["Odpoledne:", "Popoludní:", "Popołudnie:", "Nachmittag:", "Afternoon:"],
        ["Pondělí", "Pondelok", "Poniedziałek", "Montag", "Monday"],
        ["Úterý", "Utorok", "Wtorek", "Dienstag", "Tuesday"],
        ["Středa", "Streda", "Środa", "Mittwoch", "Wednesday"],
        ["Čtvrtek", "Štvrtok", "Czwartek", "Donnerstag", "Thursday"],
        ["Pátek", "Piatok", "Piątek", "Freitag", "Friday"],
        ["Sobota", "Sobota", "Sobota", "Samstag", "Saturday"],
        ["Neděle", "Nedeľa", "Niedziela", "Sonntag", "Sunday"],
        ["Žádné rezervace pro tento den.", "Žiadne rezervácie na tento deň.", "Brak rezerwacji na ten dzień.", "Keine Reservierungen für diesen Tag.", "No bookings for this day."],
        ["Žádné rezervace", "Žiadne rezervácie", "Brak rezerwacji", "Keine Reservierungen", "No bookings"],
        ["dnes", "dnes", "dziś", "heute", "today"],
        ["· dnes", "· dnes", "· dziś", "· heute", "· today"],
        ["Datum a Čas:", "Dátum a čas:", "Data i godzina:", "Datum und Uhrzeit:", "Date and time:"],
        ["Pacient:", "Pacient:", "Pacjent:", "Patient:", "Patient:"],
        ["Majitel:", "Majiteľ:", "Właściciel:", "Besitzer:", "Owner:"],
        ["Kontakt:", "Kontakt:", "Kontakt:", "Kontakt:", "Contact:"],
        ["Úkon:", "Úkon:", "Zabieg:", "Behandlung:", "Procedure:"],
        ["Stav:", "Stav:", "Status:", "Status:", "Status:"],
        ["Poznámka:", "Poznámka:", "Uwagi:", "Anmerkung:", "Note:"],
        ["Profil a ordinační doba byly úspěšně aktualizovány.", "Profil a ordinačné hodiny boli úspešne aktualizované.", "Profil i godziny przyjęć zostały pomyślnie zaktualizowane.", "Profil und Sprechzeiten wurden erfolgreich aktualisiert.", "Profile and opening hours were updated successfully."],
        ["Rezervace byla stornována a e-mail byl odeslán klientovi.", "Rezervácia bola stornovaná a e-mail bol odoslaný klientovi.", "Rezerwacja została anulowana, a e-mail wysłano do klienta.", "Die Reservierung wurde storniert und die E-Mail an den Kunden gesendet.", "The booking was cancelled and the email was sent to the client."],
        ["Chyba při rušení: {0}", "Chyba pri rušení: {0}", "Błąd podczas anulowania: {0}", "Fehler beim Stornieren: {0}", "Error while cancelling: {0}"],
        ["Prosím vyplňte obě data (Od i Do).", "Prosím vyplňte oba dátumy (Od aj Do).", "Wypełnij obie daty (Od i Do).", "Bitte füllen Sie beide Daten aus (Von und Bis).", "Please fill in both dates (From and To)."],
        ["Datum \"Do\" nemůže být dřívější než datum \"Od\".", "Dátum \"Do\" nemôže byť skorší ako dátum \"Od\".", "Data \"Do\" nie może być wcześniejsza niż data \"Od\".", "Das Datum \"Bis\" darf nicht vor dem Datum \"Von\" liegen.", "The \"To\" date cannot be earlier than the \"From\" date."],
        ["Prosím vyberte datum.", "Prosím vyberte dátum.", "Wybierz datę.", "Bitte wählen Sie ein Datum.", "Please select a date."],
        ["Opravdu chcete smazat tuto nepřítomnost?", "Naozaj chcete zmazať túto neprítomnosť?", "Czy na pewno chcesz usunąć tę nieobecność?", "Möchten Sie diese Abwesenheit wirklich löschen?", "Are you sure you want to delete this absence?"],
        ["E-mail byl úspěšně odeslán zákazníkovi.", "E-mail bol úspešne odoslaný zákazníkovi.", "E-mail został pomyślnie wysłany do klienta.", "Die E-Mail wurde erfolgreich an den Kunden gesendet.", "The email was sent to the customer successfully."],

        /* ---------- Administrace firmy ---------- */
        ["+ Přidat novou ordinaci", "+ Pridať novú ambulanciu", "+ Dodaj nowy gabinet", "+ Neue Praxis hinzufügen", "+ Add a new clinic"],
        ["Přidat novou ordinaci", "Pridať novú ambulanciu", "Dodaj nowy gabinet", "Neue Praxis hinzufügen", "Add a new clinic"],
        ["1. Ordinace", "1. Ambulancie", "1. Gabinety", "1. Praxen", "1. Clinics"],
        ["2. Lékaři", "2. Lekári", "2. Lekarze", "2. Tierärzte", "2. Vets"],
        ["3. Uživatelé", "3. Používatelia", "3. Użytkownicy", "3. Benutzer", "3. Users"],
        ["Seznam ordinací Vaší firmy", "Zoznam ambulancií vašej firmy", "Lista gabinetów Twojej firmy", "Liste der Praxen Ihrer Firma", "List of your company's clinics"],
        ["Vnořený detail / Editace", "Vnorený detail / Úprava", "Szczegóły / Edycja", "Detail / Bearbeitung", "Detail / Edit"],
        ["Vnořený detail", "Vnorený detail", "Szczegóły", "Detail", "Detail"],
        ["Detail / Editace", "Detail / Úprava", "Szczegóły / Edycja", "Detail / Bearbeitung", "Detail / Edit"],
        ["Zobrazit vnořený detail", "Zobraziť vnorený detail", "Pokaż szczegóły", "Detail anzeigen", "Show detail"],
        ["Název ordinace", "Názov ambulancie", "Nazwa gabinetu", "Name der Praxis", "Clinic name"],
        ["Lékaři firmy (Uzivatele + Lekari)", "Lekári firmy (Uzivatele + Lekari)", "Lekarze firmy (Uzivatele + Lekari)", "Tierärzte der Firma (Uzivatele + Lekari)", "Company vets (Uzivatele + Lekari)"],
        ["Titul / Spec.", "Titul / Špec.", "Tytuł / Spec.", "Titel / Fachgebiet", "Title / Spec."],
        ["Kontakt", "Kontakt", "Kontakt", "Kontakt", "Contact"],
        ["ID / Jméno", "ID / Meno", "ID / Imię i nazwisko", "ID / Name", "ID / Name"],
        ["Přiřazené Ordinace", "Priradené ambulancie", "Przypisane gabinety", "Zugeordnete Praxen", "Assigned clinics"],
        ["Uživatelé firmy (PreferovanaOrdinaceId = FirmaId)", "Používatelia firmy (PreferovanaOrdinaceId = FirmaId)", "Użytkownicy firmy (PreferovanaOrdinaceId = FirmaId)", "Benutzer der Firma (PreferovanaOrdinaceId = FirmaId)", "Company users (PreferovanaOrdinaceId = FirmaId)"],
        ["Detail a editace ordinace #{0}", "Detail a úprava ambulancie #{0}", "Szczegóły i edycja gabinetu #{0}", "Details und Bearbeitung der Praxis #{0}", "Clinic details and editing #{0}"],
        ["Typy úkonů pro tuto ordinaci", "Typy úkonov pre túto ambulanciu", "Rodzaje zabiegów w tym gabinecie", "Behandlungsarten für diese Praxis", "Procedure types for this clinic"],
        ["Název úkonu", "Názov úkonu", "Nazwa zabiegu", "Name der Behandlung", "Procedure name"],
        ["Délka (min)", "Dĺžka (min)", "Czas (min)", "Dauer (Min.)", "Duration (min)"],
        ["Cena (Kč)", "Cena (Kč)", "Cena (Kč)", "Preis (Kč)", "Price (Kč)"],
        ["Délka (v minutách)", "Dĺžka (v minútach)", "Czas trwania (w minutach)", "Dauer (in Minuten)", "Duration (in minutes)"],
        ["Žádné typy úkonů pro tuto ordinaci.", "Žiadne typy úkonov pre túto ambulanciu.", "Brak rodzajów zabiegów dla tego gabinetu.", "Keine Behandlungsarten für diese Praxis.", "No procedure types for this clinic."],
        ["Přidat nový typ úkonu pro ordinaci", "Pridať nový typ úkonu pre ambulanciu", "Dodaj nowy rodzaj zabiegu dla gabinetu", "Neue Behandlungsart für die Praxis hinzufügen", "Add a new procedure type for the clinic"],
        ["+ Nový typ úkonu", "+ Nový typ úkonu", "+ Nowy rodzaj zabiegu", "+ Neue Behandlungsart", "+ New procedure type"],
        ["Vytvořit úkon", "Vytvoriť úkon", "Utwórz zabieg", "Behandlung erstellen", "Create procedure"],
        ["Uložit úkon", "Uložiť úkon", "Zapisz zabieg", "Behandlung speichern", "Save procedure"],
        ["Smazat úkon", "Zmazať úkon", "Usuń zabieg", "Behandlung löschen", "Delete procedure"],
        ["Uložit ordinaci", "Uložiť ambulanciu", "Zapisz gabinet", "Praxis speichern", "Save clinic"],
        ["Editace Lékaře a jeho závislostí (#{0})", "Úprava lekára a jeho závislostí (#{0})", "Edycja lekarza i jego powiązań (#{0})", "Bearbeitung des Tierarztes und seiner Zuordnungen (#{0})", "Editing the vet and related data (#{0})"],
        ["1. Údaje z tabulek Uzivatele + Lekari", "1. Údaje z tabuliek Uzivatele + Lekari", "1. Dane z tabel Uzivatele + Lekari", "1. Daten aus den Tabellen Uzivatele + Lekari", "1. Data from the tables Uzivatele + Lekari"],
        ["2. Propojení do Ordinací", "2. Prepojenie do ambulancií", "2. Powiązanie z gabinetami", "2. Verknüpfung mit Praxen", "2. Link to clinics"],
        ["3. Pracovní doba (PracDoba)", "3. Pracovný čas (PracDoba)", "3. Godziny pracy (PracDoba)", "3. Arbeitszeit (PracDoba)", "3. Working hours (PracDoba)"],
        ["4. Nepřítomnost (Nepritomnost)", "4. Neprítomnosť (Nepritomnost)", "4. Nieobecność (Nepritomnost)", "4. Abwesenheit (Nepritomnost)", "4. Absence (Nepritomnost)"],
        ["+ Přidat den", "+ Pridať deň", "+ Dodaj dzień", "+ Tag hinzufügen", "+ Add day"],
        ["+ Přidat nepřítomnost", "+ Pridať neprítomnosť", "+ Dodaj nieobecność", "+ Abwesenheit hinzufügen", "+ Add absence"],
        ["Uložit všechny změny lekare", "Uložiť všetky zmeny lekára", "Zapisz wszystkie zmiany lekarza", "Alle Änderungen am Tierarzt speichern", "Save all vet changes"],
        ["Detailní profil uživatele (Pouze pro čtení)", "Detailný profil používateľa (Iba na čítanie)", "Szczegółowy profil użytkownika (tylko do odczytu)", "Detailliertes Benutzerprofil (nur Lesezugriff)", "Detailed user profile (read only)"],
        ["ID uživatele:", "ID používateľa:", "ID użytkownika:", "Benutzer-ID:", "User ID:"],
        ["Celé jméno:", "Celé meno:", "Imię i nazwisko:", "Vollständiger Name:", "Full name:"],
        ["Emailová adresa:", "E-mailová adresa:", "Adres e-mail:", "E-Mail-Adresse:", "Email address:"],
        ["Telefonní číslo:", "Telefónne číslo:", "Numer telefonu:", "Telefonnummer:", "Phone number:"],
        ["Přiřazená role:", "Priradená rola:", "Przypisana rola:", "Zugewiesene Rolle:", "Assigned role:"],
        ["Preferovaná ordinace / FirmaId:", "Preferovaná ambulancia / FirmaId:", "Preferowany gabinet / FirmaId:", "Bevorzugte Praxis / FirmaId:", "Preferred clinic / FirmaId:"],
        ["Opravdu smazat tuto ordinaci?", "Naozaj zmazať túto ambulanciu?", "Czy na pewno usunąć ten gabinet?", "Diese Praxis wirklich löschen?", "Really delete this clinic?"],
        ["Opravdu smazat tento typ úkonu?", "Naozaj zmazať tento typ úkonu?", "Czy na pewno usunąć ten rodzaj zabiegu?", "Diese Behandlungsart wirklich löschen?", "Really delete this procedure type?"],
        ["Opravdu smazat tohoto lékaře?", "Naozaj zmazať tohto lekára?", "Czy na pewno usunąć tego lekarza?", "Diesen Tierarzt wirklich löschen?", "Really delete this vet?"],
        ["Úkon byl smazán.", "Úkon bol zmazaný.", "Zabieg został usunięty.", "Die Behandlung wurde gelöscht.", "The procedure was deleted."],
        ["Lékař byl úspěšně aktualizován.", "Lekár bol úspešne aktualizovaný.", "Lekarz został pomyślnie zaktualizowany.", "Der Tierarzt wurde erfolgreich aktualisiert.", "The vet was updated successfully."],
        ["Lekar", "Lekár", "Lekarz", "Tierarzt", "Vet"],
        ["Zakaznik", "Zákazník", "Klient", "Kunde", "Customer"],
        ["Základní informace ordinace", "Základné informácie o ambulancii", "Informacje podstawowe o gabinecie", "Grundinformationen zur Praxis", "Basic clinic information"],

        /* ---------- Správa databáze (superadmin) ---------- */
        ["Tabulky v Databázi", "Tabuľky v databáze", "Tabele w bazie danych", "Tabellen in der Datenbank", "Tables in the database"],
        ["Přidat nový záznam", "Pridať nový záznam", "Dodaj nowy rekord", "Neuen Datensatz hinzufügen", "Add a new record"],
        ["Vyberte tabulku z levého menu pro zobrazení a editaci dat.", "Vyberte tabuľku z ľavého menu na zobrazenie a úpravu údajov.", "Wybierz tabelę z lewego menu, aby wyświetlić i edytować dane.", "Wählen Sie im linken Menü eine Tabelle zum Anzeigen und Bearbeiten der Daten.", "Select a table from the left menu to view and edit its data."],
        ["Záznamů: {0}", "Záznamov: {0}", "Rekordów: {0}", "Datensätze: {0}", "Records: {0}"],
        ["Tabulka '{0}' neobsahuje žádné záznamy.", "Tabuľka '{0}' neobsahuje žiadne záznamy.", "Tabela '{0}' nie zawiera żadnych rekordów.", "Die Tabelle '{0}' enthält keine Datensätze.", "The table '{0}' contains no records."],
        ["Přidat nový záznam do {0}", "Pridať nový záznam do {0}", "Dodaj nowy rekord do {0}", "Neuen Datensatz zu {0} hinzufügen", "Add a new record to {0}"],
        ["Upravit záznam v {0}", "Upraviť záznam v {0}", "Edytuj rekord w {0}", "Datensatz in {0} bearbeiten", "Edit record in {0}"],
        ["Uložit záznam", "Uložiť záznam", "Zapisz rekord", "Datensatz speichern", "Save record"],
        ["Opravdu chcete smazat záznam kde {0} = {1}?", "Naozaj chcete zmazať záznam, kde {0} = {1}?", "Czy na pewno chcesz usunąć rekord, w którym {0} = {1}?", "Möchten Sie den Datensatz mit {0} = {1} wirklich löschen?", "Are you sure you want to delete the record where {0} = {1}?"],
        ["(PK - nechte prázdné pro auto-increment)", "(PK – nechajte prázdne pre auto-increment)", "(PK – zostaw puste dla auto-increment)", "(PK – für Auto-Increment leer lassen)", "(PK – leave empty for auto-increment)"],
        ["Auto-increment", "Auto-increment", "Auto-increment", "Auto-Increment", "Auto-increment"],

        /* ---------- Hlášky serveru (server.js) ---------- */
        ["Chyba při načítání agendy ze serveru.", "Chyba pri načítaní agendy zo servera.", "Błąd podczas pobierania agendy z serwera.", "Fehler beim Laden der Agenda vom Server.", "Error loading the schedule from the server."],
        ["Chyba při načítání profilu.", "Chyba pri načítaní profilu.", "Błąd podczas ładowania profilu.", "Fehler beim Laden des Profils.", "Error loading the profile."],
        ["Chyba při rušení rezervace nebo odesílání e-mailu.", "Chyba pri rušení rezervácie alebo odosielaní e-mailu.", "Błąd podczas anulowania rezerwacji lub wysyłania e-maila.", "Fehler beim Stornieren der Reservierung oder beim Senden der E-Mail.", "Error cancelling the booking or sending the email."],
        ["Chyba při ukládání profilu na serveru.", "Chyba pri ukladaní profilu na serveri.", "Błąd podczas zapisywania profilu na serwerze.", "Fehler beim Speichern des Profils auf dem Server.", "Error saving the profile on the server."],
        ["Chyba při výpočtu volných termínů na serveru.", "Chyba pri výpočte voľných termínov na serveri.", "Błąd podczas obliczania wolnych terminów na serwerze.", "Fehler bei der Berechnung der freien Termine auf dem Server.", "Error calculating the free slots on the server."],
        ["Chyba serveru při ukládání nepřítomnosti.", "Chyba servera pri ukladaní neprítomnosti.", "Błąd serwera podczas zapisywania nieobecności.", "Serverfehler beim Speichern der Abwesenheit.", "Server error while saving the absence."],
        ["Chybí povinné parametry: lekarId, typUkonuId nebo datum.", "Chýbajú povinné parametre: lekarId, typUkonuId alebo dátum.", "Brak wymaganych parametrów: lekarId, typUkonuId lub data.", "Pflichtparameter fehlen: lekarId, typUkonuId oder Datum.", "Required parameters are missing: lekarId, typUkonuId or date."],
        ["Firma byla úspěšně smazána.", "Firma bola úspešne zmazaná.", "Firma została pomyślnie usunięta.", "Die Firma wurde erfolgreich gelöscht.", "The company was deleted successfully."],
        ["Jméno a příjmení jsou povinné.", "Meno a priezvisko sú povinné.", "Imię i nazwisko są wymagane.", "Vor- und Nachname sind Pflichtfelder.", "First and last name are required."],
        ["Koncové datum nesmí být před počátečním.", "Koncový dátum nesmie byť pred začiatočným.", "Data końcowa nie może być wcześniejsza niż początkowa.", "Das Enddatum darf nicht vor dem Startdatum liegen.", "The end date must not be before the start date."],
        ["Lékař byl úspěšně aktualizován.", "Lekár bol úspešne aktualizovaný.", "Lekarz został pomyślnie zaktualizowany.", "Der Tierarzt wurde erfolgreich aktualisiert.", "The vet was updated successfully."],
        ["Lékař má v tento den celodenní nepřítomnost.", "Lekár má v tento deň celodennú neprítomnosť.", "Lekarz ma w tym dniu całodniową nieobecność.", "Der Tierarzt ist an diesem Tag ganztägig abwesend.", "The vet is absent all day on this date."],
        ["Lékař smazán.", "Lekár zmazaný.", "Lekarz usunięty.", "Tierarzt gelöscht.", "Vet deleted."],
        ["Lékař v tento den nemá vypsanou pracovní dobu.", "Lekár v tento deň nemá vypísaný pracovný čas.", "Lekarz nie ma w tym dniu ustalonych godzin pracy.", "Der Tierarzt hat an diesem Tag keine Arbeitszeit eingetragen.", "The vet has no working hours set for this day."],
        ["Nelze smazat posledního Administrátora této firmy.", "Nie je možné zmazať posledného administrátora tejto firmy.", "Nie można usunąć ostatniego administratora tej firmy.", "Der letzte Administrator dieser Firma kann nicht gelöscht werden.", "The last administrator of this company cannot be deleted."],
        ["Nelze smazat posledního SuperAdmina v systému.", "Nie je možné zmazať posledného SuperAdmina v systéme.", "Nie można usunąć ostatniego SuperAdmina w systemie.", "Der letzte SuperAdmin im System kann nicht gelöscht werden.", "The last SuperAdmin in the system cannot be deleted."],
        ["Nemáte oprávnění k mazání firmy. Tuto akci může provést pouze SuperAdmin.", "Nemáte oprávnenie na mazanie firmy. Túto akciu môže vykonať iba SuperAdmin.", "Nie masz uprawnień do usuwania firmy. Tę czynność może wykonać tylko SuperAdmin.", "Sie haben keine Berechtigung, die Firma zu löschen. Diese Aktion kann nur ein SuperAdmin ausführen.", "You do not have permission to delete the company. Only a SuperAdmin can do this."],
        ["Nemáte oprávnění stornovat tuto rezervaci.", "Nemáte oprávnenie stornovať túto rezerváciu.", "Nie masz uprawnień do anulowania tej rezerwacji.", "Sie haben keine Berechtigung, diese Reservierung zu stornieren.", "You do not have permission to cancel this booking."],
        ["Nemůžete smazat svůj vlastní účet.", "Nemôžete zmazať svoj vlastný účet.", "Nie możesz usunąć własnego konta.", "Sie können Ihr eigenes Konto nicht löschen.", "You cannot delete your own account."],
        ["Neplatný formát data.", "Neplatný formát dátumu.", "Nieprawidłowy format daty.", "Ungültiges Datumsformat.", "Invalid date format."],
        ["Neplatný nebo vypršený token", "Neplatný alebo expirovaný token", "Nieprawidłowy lub wygasły token", "Ungültiges oder abgelaufenes Token", "Invalid or expired token"],
        ["Nepřítomnost byla úspěšně smazána.", "Neprítomnosť bola úspešne zmazaná.", "Nieobecność została pomyślnie usunięta.", "Die Abwesenheit wurde erfolgreich gelöscht.", "The absence was deleted successfully."],
        ["Nepřítomnost byla úspěšně uložena.", "Neprítomnosť bola úspešne uložená.", "Nieobecność została pomyślnie zapisana.", "Die Abwesenheit wurde erfolgreich gespeichert.", "The absence was saved successfully."],
        ["Nesprávný e-mail nebo heslo.", "Nesprávny e-mail alebo heslo.", "Nieprawidłowy e-mail lub hasło.", "Falsche E-Mail oder falsches Passwort.", "Incorrect email or password."],
        ["Ordinace byla úspěšně smazána.", "Ambulancia bola úspešne zmazaná.", "Gabinet został pomyślnie usunięty.", "Die Praxis wurde erfolgreich gelöscht.", "The clinic was deleted successfully."],
        ["Ordinace opravena.", "Ambulancia opravená.", "Gabinet zaktualizowany.", "Praxis aktualisiert.", "Clinic updated."],
        ["Ordinace smazána.", "Ambulancia zmazaná.", "Gabinet usunięty.", "Praxis gelöscht.", "Clinic deleted."],
        ["Ordinace vytvořena.", "Ambulancia vytvorená.", "Gabinet utworzony.", "Praxis erstellt.", "Clinic created."],
        ["Profil a ordinační doba byly úspěšně uloženy.", "Profil a ordinačné hodiny boli úspešne uložené.", "Profil i godziny przyjęć zostały pomyślnie zapisane.", "Profil und Sprechzeiten wurden erfolgreich gespeichert.", "Profile and opening hours were saved successfully."],
        ["Profil lékaře nenalezen.", "Profil lekára sa nenašiel.", "Nie znaleziono profilu lekarza.", "Tierarztprofil nicht gefunden.", "Vet profile not found."],
        ["Přístup odepřen: Chybí token", "Prístup zamietnutý: chýba token", "Odmowa dostępu: brak tokena", "Zugriff verweigert: Token fehlt", "Access denied: token missing"],
        ["Rezervace byla zrušena a e-mail byl klientovi odeslán.", "Rezervácia bola zrušená a e-mail bol odoslaný klientovi.", "Rezerwacja została anulowana, a e-mail wysłano do klienta.", "Die Reservierung wurde storniert und die E-Mail an den Kunden gesendet.", "The booking was cancelled and the email was sent to the client."],
        ["Rezervace byla úspěšně vytvořena.", "Rezervácia bola úspešne vytvorená.", "Rezerwacja została pomyślnie utworzona.", "Die Reservierung wurde erfolgreich erstellt.", "Booking created successfully."],
        ["Rezervace nenalezena.", "Rezervácia sa nenašla.", "Nie znaleziono rezerwacji.", "Reservierung nicht gefunden.", "Booking not found."],
        ["Tabulka nenalezena.", "Tabuľka sa nenašla.", "Nie znaleziono tabeli.", "Tabelle nicht gefunden.", "Table not found."],
        ["Uživatel nenalezen.", "Používateľ sa nenašiel.", "Nie znaleziono użytkownika.", "Benutzer nicht gefunden.", "User not found."],
        ["Uživatel s tímto e-mailem již existuje.", "Používateľ s týmto e-mailom už existuje.", "Użytkownik z tym adresem e-mail już istnieje.", "Ein Benutzer mit dieser E-Mail-Adresse existiert bereits.", "A user with this email already exists."],
        ["Uživatel smazán.", "Používateľ zmazaný.", "Użytkownik usunięty.", "Benutzer gelöscht.", "User deleted."],
        ["Zadejte platné datum nebo interval.", "Zadajte platný dátum alebo interval.", "Podaj prawidłową datę lub zakres.", "Geben Sie ein gültiges Datum oder einen Zeitraum ein.", "Enter a valid date or range."],
        ["Zvíře bylo úspěšně smazáno.", "Zviera bolo úspešne zmazané.", "Zwierzę zostało pomyślnie usunięte.", "Das Tier wurde erfolgreich gelöscht.", "The pet was deleted successfully."],
        ["Zvíře nebylo nalezeno nebo k němu nemáte přístup.", "Zviera sa nenašlo alebo k nemu nemáte prístup.", "Nie znaleziono zwierzęcia lub nie masz do niego dostępu.", "Das Tier wurde nicht gefunden oder Sie haben keinen Zugriff darauf.", "The pet was not found or you do not have access to it."],
        ["Zvíře nelze smazat, protože již má vytvořený zápis v databázi rezervací.", "Zviera nie je možné zmazať, pretože už má vytvorený záznam v databáze rezervácií.", "Zwierzęcia nie można usunąć, ponieważ ma już wpis w bazie rezerwacji.", "Das Tier kann nicht gelöscht werden, da bereits ein Eintrag in der Reservierungsdatenbank existiert.", "The pet cannot be deleted because it already has an entry in the bookings database."],
        ["Záznam byl smazán.", "Záznam bol zmazaný.", "Rekord został usunięty.", "Der Datensatz wurde gelöscht.", "The record was deleted."],
        ["Záznam byl úspěšně upraven.", "Záznam bol úspešne upravený.", "Rekord został pomyślnie zmieniony.", "Der Datensatz wurde erfolgreich geändert.", "The record was updated successfully."],
        ["Záznam nebyl nalezen nebo nemáte oprávnění jej smazat.", "Záznam sa nenašiel alebo nemáte oprávnenie ho zmazať.", "Nie znaleziono rekordu lub nie masz uprawnień do jego usunięcia.", "Der Datensatz wurde nicht gefunden oder Sie haben keine Berechtigung, ihn zu löschen.", "The record was not found or you do not have permission to delete it."],
        ["Úkon aktualizován.", "Úkon aktualizovaný.", "Zabieg zaktualizowany.", "Behandlung aktualisiert.", "Procedure updated."],
        ["Úkon smazán.", "Úkon zmazaný.", "Zabieg usunięty.", "Behandlung gelöscht.", "Procedure deleted."],
        ["Úkon vytvořen.", "Úkon vytvorený.", "Zabieg utworzony.", "Behandlung erstellt.", "Procedure created."],

        /* ---------- E-maily odesílané serverem (server.js) ---------- */
        ["Potvrzení rezervace #{0} - VetCare", "Potvrdenie rezervácie #{0} - VetCare", "Potwierdzenie rezerwacji #{0} - VetCare", "Bestätigung der Reservierung #{0} - VetCare", "Booking confirmation #{0} - VetCare"],
        ["Dobrý den, {0},", "Dobrý deň, {0},", "Dzień dobry, {0},", "Guten Tag, {0},", "Hello {0},"],
        ["Dobrý den {0},", "Dobrý deň {0},", "Dzień dobry {0},", "Guten Tag {0},", "Hello {0},"],
        ["Vaše rezervace na úkon <b>{0}</b> byla úspěšně vytvořena.", "Vaša rezervácia na úkon <b>{0}</b> bola úspešne vytvorená.", "Twoja rezerwacja na zabieg <b>{0}</b> została pomyślnie utworzona.", "Ihre Reservierung für die Behandlung <b>{0}</b> wurde erfolgreich erstellt.", "Your booking for <b>{0}</b> was created successfully."],
        ["Termín:", "Termín:", "Termin:", "Termin:", "Date and time:"],
        ["Děkujeme za vaši důvěru!", "Ďakujeme za vašu dôveru!", "Dziękujemy za zaufanie!", "Vielen Dank für Ihr Vertrauen!", "Thank you for your trust!"],
        ["Změna stavu rezervace #{0} - {1}", "Zmena stavu rezervácie #{0} - {1}", "Zmiana statusu rezerwacji #{0} - {1}", "Statusänderung der Reservierung #{0} - {1}", "Booking #{0} status changed - {1}"],
        ["Dobrý den {0}, stav vaší rezervace pro zvíře <b>{1}</b> byl změněn na: <b>{2}</b>.", "Dobrý deň {0}, stav vašej rezervácie pre zviera <b>{1}</b> sa zmenil na: <b>{2}</b>.", "Dzień dobry {0}, status Twojej rezerwacji dla zwierzęcia <b>{1}</b> został zmieniony na: <b>{2}</b>.", "Guten Tag {0}, der Status Ihrer Reservierung für das Tier <b>{1}</b> wurde geändert auf: <b>{2}</b>.", "Hello {0}, the status of your booking for <b>{1}</b> has changed to: <b>{2}</b>."],
        ["Zrušení rezervace - VetCare ({0})", "Zrušenie rezervácie - VetCare ({0})", "Anulowanie rezerwacji - VetCare ({0})", "Stornierung der Reservierung - VetCare ({0})", "Booking cancelled - VetCare ({0})"],
        ["Nepodporovaný jazyk.", "Nepodporovaný jazyk.", "Nieobsługiwany język.", "Nicht unterstützte Sprache.", "Unsupported language."],
        ["Zrušení rezervace - VetCare Ordinace", "Zrušenie rezervácie - VetCare Ambulancia", "Anulowanie rezerwacji - VetCare Gabinet", "Stornierung der Reservierung - VetCare Praxis", "Booking cancelled - VetCare Clinic"],
        ["Vaše rezervace plánovaná na {0} v {1} (pacient: {2}) byla zrušena.", "Vaša rezervácia naplánovaná na {0} o {1} (pacient: {2}) bola zrušená.", "Twoja rezerwacja zaplanowana na {0} o {1} (pacjent: {2}) została anulowana.", "Ihre für den {0} um {1} geplante Reservierung (Patient: {2}) wurde storniert.", "Your booking scheduled for {0} at {1} (patient: {2}) has been cancelled."],
        ["Důvod zrušení:", "Dôvod zrušenia:", "Powód anulowania:", "Grund der Stornierung:", "Reason for cancellation:"],
        ["Důvod nebyl specifikován.", "Dôvod nebol špecifikovaný.", "Nie podano powodu.", "Es wurde kein Grund angegeben.", "No reason was given."],
        ["Omlouváme se za způsobené komplikace.", "Ospravedlňujeme sa za spôsobené komplikácie.", "Przepraszamy za utrudnienia.", "Wir entschuldigen uns für die entstandenen Unannehmlichkeiten.", "We apologise for any inconvenience."],
        ["S pozdravem,", "S pozdravom,", "Z poważaniem,", "Mit freundlichen Grüßen,", "Kind regards,"],
        ["Veterinární klinika VetCare", "Veterinárna klinika VetCare", "Klinika weterynaryjna VetCare", "Tierklinik VetCare", "VetCare Veterinary Clinic"],

        /* ---------- Texty s proměnnou částí ---------- */
        ["{n0} zvířat", "Zvierat: {0}", "Zwierzęta: {0}", "Tiere: {0}", "Pets: {0}"],
        ["Věk: {n0} let", "Vek: {0} rokov", "Wiek: {0} lat", "Alter: {0} Jahre", "Age: {0} years"],
        ["{0} ({n1} min - {2} Kč)", "{0} ({1} min - {2} Kč)", "{0} ({1} min - {2} Kč)", "{0} ({1} Min. - {2} Kč)", "{0} ({1} min - {2} Kč)"],
        ["{0} ({n1} min)", "{0} ({1} min)", "{0} ({1} min)", "{0} ({1} Min.)", "{0} ({1} min)"],
        ["Seznam rezervací na {0}", "Zoznam rezervácií na {0}", "Lista rezerwacji na {0}", "Reservierungsliste für {0}", "Bookings for {0}"],
        ["Týdenní kalendář ({0} – {1})", "Týždenný kalendár ({0} – {1})", "Kalendarz tygodniowy ({0} – {1})", "Wochenkalender ({0} – {1})", "Weekly calendar ({0} – {1})"],
        ["Měsíční kalendář ({0})", "Mesačný kalendár ({0})", "Kalendarz miesięczny ({0})", "Monatskalender ({0})", "Monthly calendar ({0})"],
        ["{n0} rez. · dnes", "{0} rez. · dnes", "{0} rez. · dziś", "{0} Res. · heute", "{0} bkg. · today"],
        ["{n0} rez.", "{0} rez.", "{0} rez.", "{0} Res.", "{0} bkg."],
        ["{d0} v {t1}", "{0} o {1}", "{0} o {1}", "{0} um {1}", "{0} at {1}"],
        ["({0})", "({0})", "({0})", "({0})", "({0})"],
        ["Majitel: {0}", "Majiteľ: {0}", "Właściciel: {0}", "Besitzer: {0}", "Owner: {0}"],
        ["Pacient: {0}", "Pacient: {0}", "Pacjent: {0}", "Patient: {0}", "Patient: {0}"]
    ];

    /* =====================================================================
     *  JÁDRO PŘEKLADU
     * ===================================================================== */
    var L = { cs: 0, sk: 1, pl: 2, de: 3, en: 4 };
    var exact = {};      // český text -> [cs, sk, pl, de, en]
    var patterns = [];   // texty se zástupci
    var prefixes = [];   // klíče končící dvojtečkou (použitelné jako předpona)
    var PH = /\{([nd t]?)(\d+)\}/g;
    var TYPE_RX = { '': '(.+?)', n: '(\\d+(?:[.,]\\d+)?)', d: '([\\d.\\-\\/: ]+?)', t: '(\\d{1,2}:\\d{2}(?::\\d{2})?)' };

    function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    function norm(s) { return s.replace(/\s+/g, ' ').trim(); }

    DICT.forEach(function (row) {
        var key = row[0];
        if (/\{[nd t]?\d+\}/.test(key)) {
            var order = [], rx = '', last = 0, m;
            PH.lastIndex = 0;
            while ((m = PH.exec(key))) {
                rx += esc(key.slice(last, m.index)) + TYPE_RX[m[1].trim()];
                order.push(parseInt(m[2], 10));
                last = m.index + m[0].length;
            }
            rx += esc(key.slice(last));
            var fixed = key.replace(PH, '').length;
            patterns.push({ rx: new RegExp('^' + rx + '$'), order: order, row: row, weight: fixed });
        } else {
            if (!exact[key]) exact[key] = row;
            if (/:$/.test(key)) prefixes.push(key);
        }
    });
    patterns.sort(function (a, b) { return b.weight - a.weight; });
    prefixes.sort(function (a, b) { return b.length - a.length; });

    var current = 'cs';
    var cache = { sk: {}, pl: {}, de: {}, en: {} };

    function lookup(key, lang) {
        var i = L[lang], hit = exact[key];
        if (hit) return hit[i];
        var c = cache[lang];
        if (Object.prototype.hasOwnProperty.call(c, key)) return c[key];
        var res = null, n, p;
        // 1) vzory se zástupci
        for (n = 0; n < patterns.length && res === null; n++) {
            p = patterns[n];
            var m = p.rx.exec(key);
            if (m) {
                var vals = {};
                p.order.forEach(function (idx, k) {
                    var raw = m[k + 1], tr = lookup(norm(raw), lang);
                    vals[idx] = tr === null ? raw : tr;
                });
                res = p.row[i].replace(/\{(\d+)\}/g, function (_, d) { return vals[d] !== undefined ? vals[d] : ''; });
            }
        }
        // 2) předpona + zbytek ("Chyba při ukládání: …")
        if (res === null) {
            for (n = 0; n < prefixes.length; n++) {
                var pre = prefixes[n];
                if (key.length > pre.length && key.indexOf(pre) === 0 && /\s/.test(key.charAt(pre.length))) {
                    var rest = norm(key.slice(pre.length)), tr2 = lookup(rest, lang);
                    res = exact[pre][i] + ' ' + (tr2 === null ? rest : tr2);
                    break;
                }
            }
        }
        c[key] = res;
        return res;
    }

    // Překlad textu se zachováním okrajových mezer
    function tr(text, lang) {
        lang = lang || current;
        if (lang === 'cs' || !text) return text;
        var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
        if (!m[2]) return text;
        var r = lookup(norm(m[2]), lang);
        return r === null ? text : m[1] + r + m[3];
    }

    // Překlad v kódu: t('Seznam rezervací na {0}', datum)
    function t(key) {
        var args = Array.prototype.slice.call(arguments, 1);
        var row = exact[key], tpl = key;
        if (!row) {
            for (var n = 0; n < patterns.length; n++) if (patterns[n].row[0] === key) { row = patterns[n].row; break; }
        }
        if (row) tpl = row[L[current]];
        return tpl.replace(/\{[nd t]?(\d+)\}/g, function (_, d) { return args[d] !== undefined ? args[d] : ''; });
    }

    function langInfo(id) { for (var i = 0; i < LANGS.length; i++) if (LANGS[i].id === id) return LANGS[i]; return LANGS[0]; }
    function isValid(id) { for (var i = 0; i < LANGS.length; i++) if (LANGS[i].id === id) return true; return false; }

    var byKey = {};      // český text -> řádek slovníku (i u textů se zástupci)
    DICT.forEach(function (row) { if (!byKey[row[0]]) byKey[row[0]] = row; });

    // Překlad do zadaného jazyka bez ohledu na aktuální jazyk stránky (používá server.js pro e-maily)
    function tl(lang, key) {
        var args = Array.prototype.slice.call(arguments, 2);
        var row = byKey[key], i = isValid(lang) ? L[lang] : 0;
        var tpl = row ? row[i] : key;
        return tpl.replace(/\{[nd t]?(\d+)\}/g, function (_, d) { return args[d] !== undefined ? args[d] : ''; });
    }

    // Výběr jazyka požadavku: hlavička X-Lang, jinak Accept-Language, jinak čeština
    function pickLang(xLang, acceptLanguage) {
        var x = String(xLang || '').slice(0, 2).toLowerCase();
        if (isValid(x)) return x;
        var parts = String(acceptLanguage || '').split(',');
        for (var i = 0; i < parts.length; i++) {
            var c = parts[i].split(';')[0].trim().slice(0, 2).toLowerCase();
            if (isValid(c)) return c;
        }
        return 'cs';
    }

    var api = {
        langs: LANGS, dict: DICT, tr: tr, t: t, tl: tl, pickLang: pickLang,
        getLang: function () { return current; },
        locale: function () { return langInfo(current).locale; },
        localeOf: function (lang) { return langInfo(lang).locale; }
    };

    /* Bez DOMu (např. test v Node.js) končíme zde */
    if (!root.document) { current = 'cs'; root.VetCareI18n = api; if (typeof module !== 'undefined') module.exports = api; return; }

    /* =====================================================================
     *  DOM: překlad textů a atributů, sledování změn
     * ===================================================================== */
    var doc = root.document, rootEl = doc.documentElement;
    var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
    var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1 };
    var textRec = new WeakMap();   // textový uzel -> { src, out }
    var attrRec = new WeakMap();   // element -> { atribut: { src, out } }
    var observer = null;

    function readStored() {
        try {
            var v = root.localStorage.getItem(KEY);
            if (isValid(v)) return v;
        } catch (e) { /* ignorováno */ }
        var nav = (root.navigator && (root.navigator.languages || [root.navigator.language])) || [];
        for (var i = 0; i < nav.length; i++) {
            var short = String(nav[i] || '').slice(0, 2).toLowerCase();
            if (isValid(short)) return short;
        }
        return 'cs';
    }

    function skipNode(n) {
        var p = n.parentNode;
        while (p && p.nodeType === 1) {
            if (SKIP[p.nodeName] || (p.hasAttribute && (p.hasAttribute('data-no-i18n') || p.classList.contains('notranslate')))) return true;
            p = p.parentNode;
        }
        return false;
    }

    function doText(n) {
        if (skipNode(n)) return;
        var rec = textRec.get(n), cur = n.nodeValue;
        if (!rec) { rec = { src: cur, out: cur }; textRec.set(n, rec); }
        else if (cur !== rec.out) rec.src = cur;          // text změnil skript stránky
        var out = tr(rec.src, current);
        if (out !== cur) n.nodeValue = out;
        rec.out = out;
    }

    function doAttr(el, name) {
        if (!el.hasAttribute(name)) return;
        var map = attrRec.get(el);
        if (!map) { map = {}; attrRec.set(el, map); }
        var cur = el.getAttribute(name), rec = map[name];
        if (!rec) { rec = { src: cur, out: cur }; map[name] = rec; }
        else if (cur !== rec.out) rec.src = cur;
        var out = tr(rec.src, current);
        if (out !== cur) el.setAttribute(name, out);
        rec.out = out;
    }

    function walk(node) {
        if (node.nodeType === 3) { doText(node); return; }
        if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return;
        if (node.nodeType === 1) {
            if (node.nodeName === 'SCRIPT' || node.nodeName === 'STYLE') return;
            for (var a = 0; a < ATTRS.length; a++) doAttr(node, ATTRS[a]);   // i placeholder u <textarea>
            if (SKIP[node.nodeName]) return;                                 // obsah <textarea>/<noscript> se nepřekládá
        }
        var c = node.firstChild;
        while (c) { var next = c.nextSibling; walk(c); c = next; }
    }

    function onMutations(list) {
        for (var i = 0; i < list.length; i++) {
            var m = list[i];
            if (m.type === 'characterData') doText(m.target);
            else if (m.type === 'attributes') doAttr(m.target, m.attributeName);
            else for (var j = 0; j < m.addedNodes.length; j++) walk(m.addedNodes[j]);
        }
    }

    function startObserver() {
        if (observer || !root.MutationObserver) return;
        observer = new MutationObserver(onMutations);
        observer.observe(rootEl, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    }

    function applyAll() { walk(rootEl); }

    /* alert / confirm / prompt */
    ['alert', 'confirm', 'prompt'].forEach(function (fn) {
        var native = root[fn];
        if (typeof native !== 'function') return;
        root[fn] = function (msg) {
            var args = Array.prototype.slice.call(arguments);
            if (args.length && args[0] !== undefined && args[0] !== null) args[0] = tr(String(args[0]), current);
            return native.apply(root, args);
        };
    });

    /* každý požadavek na vlastní server nese jazyk (hlavička X-Lang) – server podle ní píše e-maily */
    if (typeof root.fetch === 'function') {
        var nativeFetch = root.fetch;
        root.fetch = function (input, init) {
            try {
                var url = typeof input === 'string' ? input : '';
                var sameOrigin = /^\/(?!\/)/.test(url) || (url && url.indexOf(root.location.origin) === 0);
                if (sameOrigin && url.indexOf('/api/') !== -1) {
                    init = Object.assign({}, init);
                    var h = new root.Headers(init.headers || {});
                    h.set('X-Lang', current);
                    init.headers = h;
                }
            } catch (e) { /* ignorováno */ }
            return nativeFetch.call(root, input, init);
        };
    }

    /* odhlášení volá localStorage.clear(): volba jazyka se má zachovat */
    try {
        var prevClear = root.Storage.prototype.clear;
        root.Storage.prototype.clear = function () {
            var keep = null;
            try { if (this === root.localStorage) keep = this.getItem(KEY); } catch (e) { /* ignorováno */ }
            prevClear.call(this);
            if (keep !== null) { try { this.setItem(KEY, keep); } catch (e) { /* ignorováno */ } }
        };
    } catch (e) { /* ignorováno */ }

    /* =====================================================================
     *  Přepnutí jazyka
     * ===================================================================== */
    var refreshUi = function () { /* nahradí se po sestavení tlačítka */ };

    // Přihlášený uživatel: ručně zvolený jazyk se uloží i na serveru (podle něj dostává e-maily)
    function saveLangOnServer(id) {
        try {
            var tok = root.localStorage.getItem('vetcare_token');
            if (!tok || typeof root.fetch !== 'function') return;
            root.fetch('/api/uzivatel/jazyk', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
                body: JSON.stringify({ jazyk: id })
            }).catch(function () { /* ignorováno */ });
        } catch (e) { /* ignorováno */ }
    }

    function setLang(id, silent) {
        if (!isValid(id)) return;
        var changed = id !== current;
        current = id;
        rootEl.setAttribute('lang', id);
        if (!silent) { try { root.localStorage.setItem(KEY, id); } catch (e) { /* ignorováno */ } }
        if (!silent && changed) saveLangOnServer(id);
        startObserver();
        applyAll();
        refreshUi();
        if (changed) { try { root.dispatchEvent(new CustomEvent('vc-lang-change', { detail: { lang: id } })); } catch (e) { /* ignorováno */ } }
    }
    api.setLang = function (id) { setLang(id, false); };
    api.apply = function (node) { walk(node || rootEl); };
    root.VetCareI18n = api;

    /* Počáteční jazyk – hned, aby se zbytečně neblikala čeština */
    current = readStored();
    rootEl.setAttribute('lang', current);
    var pending = current !== 'cs';
    if (pending) {
        var st = doc.createElement('style');
        st.id = 'vc-i18n-pending';
        st.textContent = 'html.vc-i18n-pending body{visibility:hidden}';
        (doc.head || rootEl).appendChild(st);
        rootEl.classList.add('vc-i18n-pending');
    }
    function release() { rootEl.classList.remove('vc-i18n-pending'); }

    /* =====================================================================
     *  Tlačítko pro volbu jazyka v horní liště (vedle přepínače motivů)
     * ===================================================================== */
    function buildSwitcher() {
        var wrap = doc.createElement('div');
        wrap.className = 'vc-theme vc-lang';

        var btn = doc.createElement('button');
        btn.type = 'button';
        btn.className = 'vc-theme-btn';
        btn.setAttribute('aria-haspopup', 'true');
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-label', 'Změnit jazyk');
        btn.title = 'Změnit jazyk';
        btn.innerHTML = '<i class="fa-solid fa-globe" aria-hidden="true"></i><span class="vc-theme-label vc-lang-code"></span>';

        var menu = doc.createElement('div');
        menu.className = 'vc-theme-menu';
        menu.setAttribute('role', 'menu');
        menu.hidden = true;

        var title = doc.createElement('div');
        title.className = 'vc-theme-title';
        title.textContent = 'Jazyk';
        menu.appendChild(title);

        var items = LANGS.map(function (l) {
            var it = doc.createElement('button');
            it.type = 'button';
            it.className = 'vc-theme-item vc-lang-item';
            it.setAttribute('role', 'menuitemradio');
            it.setAttribute('data-lang-id', l.id);
            it.setAttribute('lang', l.id);
            it.setAttribute('data-no-i18n', '');
            it.innerHTML = '<span class="vc-lang-flag">' + l.code + '</span><span></span><i class="fa-solid fa-check vc-check" aria-hidden="true"></i>';
            it.children[1].textContent = l.name;
            it.addEventListener('click', function () { choose(l.id); });
            menu.appendChild(it);
            return it;
        });

        wrap.appendChild(btn);
        wrap.appendChild(menu);

        refreshUi = function () {
            var code = btn.querySelector('.vc-lang-code');
            code.setAttribute('data-no-i18n', '');
            code.textContent = langInfo(current).code;
            items.forEach(function (it) { it.setAttribute('aria-checked', it.getAttribute('data-lang-id') === current ? 'true' : 'false'); });
        };

        function open() {
            menu.hidden = false;
            btn.setAttribute('aria-expanded', 'true');
            var sel = menu.querySelector('[aria-checked="true"]') || items[0];
            if (sel) sel.focus();
        }
        function close(returnFocus) {
            menu.hidden = true;
            btn.setAttribute('aria-expanded', 'false');
            if (returnFocus) btn.focus();
        }
        function choose(id) { setLang(id, false); close(true); }

        btn.addEventListener('click', function (e) { e.stopPropagation(); if (menu.hidden) open(); else close(false); });
        doc.addEventListener('click', function (e) { if (!menu.hidden && !wrap.contains(e.target)) close(false); });
        wrap.addEventListener('keydown', function (e) {
            if (menu.hidden) return;
            if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                var idx = items.indexOf(doc.activeElement);
                var next = e.key === 'ArrowDown' ? idx + 1 : idx - 1;
                if (next < 0) next = items.length - 1;
                if (next >= items.length) next = 0;
                items[next].focus();
            }
        });

        // Změna jazyka v jiné kartě
        root.addEventListener('storage', function (e) { if (e.key === KEY && isValid(e.newValue)) setLang(e.newValue, true); });

        // Umístění: do stejné skupiny jako přepínač motivů, jinak do horní lišty
        var themeWrap = doc.querySelector('.vc-theme-holder .vc-theme');
        if (themeWrap) {
            themeWrap.parentNode.insertBefore(wrap, themeWrap);
        } else {
            var bar = doc.querySelector('nav') || doc.querySelector('header');
            var last = bar && bar.lastElementChild;
            if (bar && last) {
                var holder = doc.createElement('div');
                holder.className = 'vc-theme-holder';
                bar.insertBefore(holder, last);
                holder.appendChild(wrap);
                holder.appendChild(last);
            } else if (bar) {
                bar.appendChild(wrap);
            } else {
                wrap.className += ' vc-theme-floating';
                doc.body.appendChild(wrap);
            }
        }
        refreshUi();
    }

    function init() {
        buildSwitcher();
        if (current !== 'cs') { startObserver(); applyAll(); }
        release();
    }
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
    root.setTimeout(release, 2500);   // pojistka: stránka nikdy nezůstane skrytá

})(typeof window !== 'undefined' ? window : globalThis);
