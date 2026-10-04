const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'VeterinaDB',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function testConnection() {
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request().query('SELECT DB_NAME() AS dbName, @@VERSION AS version');
        console.log(dbConfig);
        console.log('✅ ÚSPĚCH: Připojení k MS SQL databázi funguje!');
        console.log('📌 Název databáze:', result.recordset[0].dbName);
        console.log('ℹ️ Verze SQL Serveru:', result.recordset[0].version.split('\n')[0]);
    } catch (err) {
        console.error('❌ CHYBA: Nepodařilo se připojit k databázi!');
        console.error('Detaily chyby:', err.message);
    }
}

testConnection();

// Nastavení e-mailového transportera
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

async function sendEmailNotification(to, subject, htmlContent) {
    if (!process.env.SMTP_USER) {
        console.log(`[E-mail simulace] Pro: ${to} | Předmět: ${subject}`);
        return;
    }
    try {
        await transporter.sendMail({
            from: `"VetCare Klinika" <${process.env.SMTP_USER}>`,
            to: to,
            subject: subject,
            html: htmlContent
        });
    } catch (err) {
        console.error('Chyba při odesílání e-mailu:', err.message);
    }
}

// Middleware pro ověření JWT tokenu
function verifyToken(req, res, next) {
    const bearerHeader = req.headers['authorization'];
    if (!bearerHeader) return res.status(401).json({ message: 'Přístup odepřen: Chybí token' });
    
    const token = bearerHeader.split(' ')[1];
    jwt.verify(token, process.env.JWT_SECRET || 'secret', (err, authData) => {
        if (err) return res.status(403).json({ message: 'Neplatný nebo vypršený token' });
        req.user = authData;
        next();
    });
}

// --- AUTENTIZACE & UŽIVATELÉ ---

app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, jmeno, prijmeni, telefon, preferovanaOrdinaceId } = req.body;
        const pool = await sql.connect(dbConfig);
        
        const existing = await pool.request()
            .input('Email', sql.NVarChar, email)
            .query('SELECT Id FROM Uzivatele WHERE Email = @Email');
            
        if (existing.recordset.length > 0) {
            return res.status(400).json({ message: 'Uživatel s tímto e-mailem již existuje.' });
        }

        const passHash = await bcrypt.hash(password, 10);
        
        const result = await pool.request()
            .input('Email', sql.NVarChar, email)
            .input('HesloHash', sql.NVarChar, passHash)
            .input('Role', sql.NVarChar, 'Zakaznik')
            .input('Jmeno', sql.NVarChar, jmeno)
            .input('Prijmeni', sql.NVarChar, prijmeni)
            .input('Telefon', sql.NVarChar, telefon)
            .input('PreferovanaOrdinaceId', sql.Int, preferovanaOrdinaceId || null)
            .query(`INSERT INTO Uzivatele (Email, HesloHash, Role, Jmeno, Prijmeni, Telefon, PreferovanaOrdinaceId)
                    OUTPUT INSERTED.Id
                    VALUES (@Email, @HesloHash, @Role, @Jmeno, @Prijmeni, @Telefon, @PreferovanaOrdinaceId)`);

        const userId = result.recordset[0].Id;
        const token = jwt.sign({ id: userId, email, role: 'Zakaznik' }, process.env.JWT_SECRET || 'secret', { expiresIn: '24h' });

        res.status(201).json({ success: true, token, user: { id: userId, email, role: 'Zakaznik', jmeno, prijmeni, preferovanaOrdinaceId } });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const pool = await sql.connect(dbConfig);

        const result = await pool.request()
            .input('Email', sql.NVarChar, email)
            .query('SELECT * FROM Uzivatele WHERE Email = @Email');

        if (result.recordset.length === 0) {
            return res.status(401).json({ message: 'Nesprávný e-mail nebo heslo.' });
        }

        const user = result.recordset[0];
        const validPassword = await bcrypt.compare(password, user.HesloHash);
        if (!validPassword) {
            return res.status(401).json({ message: 'Nesprávný e-mail nebo heslo.' });
        }

        const token = jwt.sign({ id: user.Id, email: user.Email, role: user.Role }, process.env.JWT_SECRET || 'secret', { expiresIn: '24h' });
        
        res.json({
            token,
            user: {
                id: user.Id,
                email: user.Email,
                role: user.Role,
                jmeno: user.Jmeno,
                prijmeni: user.Prijmeni,
                preferovanaOrdinaceId: user.PreferovanaOrdinaceId
            }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- PŘEHLEDOVÉ ČÍSELNÍKY ---

app.get('/api/ordinace', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request().query(`
            SELECT o.*, f.Nazev as FirmaNazev, f.ICO 
            FROM Ordinace o 
            JOIN Firmy f ON o.FirmaId = f.Id
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get('/api/lekari', async (req, res) => {
    try {
        const ordinaceId = req.query.ordinaceId;
        const pool = await sql.connect(dbConfig);
        let query = `
            SELECT l.Id, l.Titul, u.Jmeno, u.Prijmeni, l.Specializace
            FROM Lekari l
            JOIN Uzivatele u ON l.UzivatelId = u.Id
        `;

        console.log('ORDINACE ID:', ordinaceId);
        console.log(ordinaceId);

        if (ordinaceId) {
            query += ` JOIN LekariOrdinace lo ON l.Id = lo.LekarId WHERE lo.OrdinaceId = ${parseInt(ordinaceId, 10)}`;
        }

        console.log(query);

        const result = await pool.request().query(query);

        console.log(result.recordset);

        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get('/api/ukony', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request().query('SELECT * FROM TypyUkonu');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- VÝPOČET VOLNÝCH ČASOVÝCH SLOTŮ ---
/*
app.get('/api/volne-terminy', async (req, res) => {
    try {
        const { lekarId, ordinaceId, typUkonuId, datum } = req.query;

        if (!lekarId || !typUkonuId || !datum) {
            return res.status(400).json({ 
                success: false, 
                message: 'Chybí povinné parametry: lekarId, typUkonuId nebo datum.' 
            });
        }

        const pLekarId = parseInt(lekarId, 10);
        const pTypUkonuId = parseInt(typUkonuId, 10);
        const pOrdinaceId = (ordinaceId && ordinaceId !== 'null' && ordinaceId !== 'undefined') 
            ? parseInt(ordinaceId, 10) 
            : null;

        const [rok, mesic, den] = datum.split('-').map(Number);
        const dateObj = new Date(rok, mesic - 1, den);
        if (isNaN(dateObj.getTime())) {
            return res.status(400).json({ success: false, message: 'Neplatný formát data.' });
        }
        const denVTydnu = dateObj.getDay();

        const reqPracDoba = new sql.Request();
        reqPracDoba.input('lekarId', sql.Int, pLekarId);
        reqPracDoba.input('denVTydnu', sql.Int, denVTydnu);

        let sqlPracDoba = `
            SELECT Od, Do 
            FROM dbo.PracDoba 
            WHERE LekarId = @lekarId 
              AND DenVTydnu = @denVTydnu
        `;

        if (pOrdinaceId !== null && !isNaN(pOrdinaceId)) {
            reqPracDoba.input('ordinaceId', sql.Int, pOrdinaceId);
            sqlPracDoba += ` AND (OrdinaceId IS NULL OR OrdinaceId = @ordinaceId)`;
        }

        const resPracDoba = await reqPracDoba.query(sqlPracDoba);
        const pracovniDoba = resPracDoba.recordset || [];

        if (pracovniDoba.length === 0) {
            return res.json({
                success: true,
                datum,
                lekarId: pLekarId,
                ordinaceId: pOrdinaceId,
                typUkonuId: pTypUkonuId,
                delkaUkonuMinuty: 0,
                volneSloty: [],
                message: 'Lékař v tento den nemá vypsanou pracovní dobu.'
            });
        }

        const reqUkon = new sql.Request();
        reqUkon.input('typUkonuId', sql.Int, pTypUkonuId);
        
        const resUkon = await reqUkon.query('SELECT DelkaMinuty FROM dbo.TypyUkonu WHERE Id = @typUkonuId');
        const ukon = resUkon.recordset[0];
        const delkaUkonuMinuty = ukon && ukon.DelkaMinuty ? parseInt(ukon.DelkaMinuty, 10) : 30;

        const reqRezervace = new sql.Request();
        reqRezervace.input('lekarId', sql.Int, pLekarId);
        reqRezervace.input('datum', sql.VarChar(10), datum);

        const sqlRezervace = `
            SELECT 
                DatumCasStart, 
                DATEADD(minute, ISNULL(
                    (SELECT DelkaMinuty FROM dbo.TypyUkonu WHERE Id = Rezervace.TypUkonuId), 30
                ), DatumCasStart) AS DatumCasKonec
            FROM dbo.Rezervace 
            WHERE LekarId = @lekarId 
              AND CAST(DatumCasStart AS DATE) = CAST(@datum AS DATE)
              AND (Stav IS NULL OR Stav != 'Storno')
        `;

        const resRezervace = await reqRezervace.query(sqlRezervace);
        const stavajiciRezervace = resRezervace.recordset || [];

        const obsazeneIntervaly = stavajiciRezervace.map(rez => {
            const dtStart = new Date(rez.DatumCasStart);
            const dtKonec = new Date(rez.DatumCasKonec);
            return {
                startMin: dtStart.getHours() * 60 + dtStart.getMinutes(),
                konecMin: dtKonec.getHours() * 60 + dtKonec.getMinutes()
            };
        });

        const timeToMinutes = (timeStr) => {
            const [h, m] = timeStr.split(':').map(Number);
            return h * 60 + m;
        };

        const volneSloty = [];
        const krokSlotu = 15;

        for (const pd of pracovniDoba) {
            const zacatekOrdinace = timeToMinutes(pd.Od);
            const konecOrdinace = timeToMinutes(pd.Do);

            for (let min = zacatekOrdinace; min + delkaUkonuMinuty <= konecOrdinace; min += krokSlotu) {
                const slotStartMin = min;
                const slotKonecMin = min + delkaUkonuMinuty;

                const jeKolize = obsazeneIntervaly.some(obsazeno => {
                    return (slotStartMin < obsazeno.konecMin && slotKonecMin > obsazeno.startMin);
                });

                if (!jeKolize) {
                    const hodiny = String(Math.floor(slotStartMin / 60)).padStart(2, '0');
                    const minut = String(slotStartMin % 60).padStart(2, '0');
                    const slotStr = `${hodiny}:${minut}`;
                    if (!volneSloty.includes(slotStr)) {
                        volneSloty.push(slotStr);
                    }
                }
            }
        }

        volneSloty.sort();

        res.json({
            success: true,
            datum,
            lekarId: pLekarId,
            ordinaceId: pOrdinaceId,
            typUkonuId: pTypUkonuId,
            delkaUkonuMinuty,
            volneSloty
        });

    } catch (error) {
        console.error('Chyba při výpočtu volných termínů:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Chyba při výpočtu volných termínů na serveru.',
            error: error.message 
        });
    }
});
*/
app.get('/api/volne-terminy', async (req, res) => {
    try {
        const { lekarId, ordinaceId, typUkonuId, datum } = req.query;

        if (!lekarId || !typUkonuId || !datum) {
            return res.status(400).json({ 
                success: false, 
                message: 'Chybí povinné parametry: lekarId, typUkonuId nebo datum.' 
            });
        }

        const pLekarId = parseInt(lekarId, 10);
        const pTypUkonuId = parseInt(typUkonuId, 10);
        const pOrdinaceId = (ordinaceId && ordinaceId !== 'null' && ordinaceId !== 'undefined') 
            ? parseInt(ordinaceId, 10) 
            : null;

        const [rok, mesic, den] = datum.split('-').map(Number);
        const dateObj = new Date(rok, mesic - 1, den);
        if (isNaN(dateObj.getTime())) {
            return res.status(400).json({ success: false, message: 'Neplatný formát data.' });
        }
        const denVTydnu = dateObj.getDay();

        // 1. Pracovní doba lékaře
        const reqPracDoba = new sql.Request();
        reqPracDoba.input('lekarId', sql.Int, pLekarId);
        reqPracDoba.input('denVTydnu', sql.Int, denVTydnu);

        let sqlPracDoba = `
            SELECT Od, Do 
            FROM dbo.PracDoba 
            WHERE LekarId = @lekarId 
              AND DenVTydnu = @denVTydnu
        `;

        if (pOrdinaceId !== null && !isNaN(pOrdinaceId)) {
            reqPracDoba.input('ordinaceId', sql.Int, pOrdinaceId);
            sqlPracDoba += ` AND (OrdinaceId IS NULL OR OrdinaceId = @ordinaceId)`;
        }

        const resPracDoba = await reqPracDoba.query(sqlPracDoba);
        const pracovniDoba = resPracDoba.recordset || [];

        if (pracovniDoba.length === 0) {
            return res.json({
                success: true,
                datum,
                lekarId: pLekarId,
                ordinaceId: pOrdinaceId,
                typUkonuId: pTypUkonuId,
                delkaUkonuMinuty: 0,
                volneSloty: [],
                message: 'Lékař v tento den nemá vypsanou pracovní dobu.'
            });
        }

        // 2. KONTROLA NEPŘÍTOMNOSTI LÉKAŘE
        const reqNepritomnost = new sql.Request();
        reqNepritomnost.input('lekarId', sql.Int, pLekarId);
        reqNepritomnost.input('datum', sql.VarChar(10), datum);

        const sqlNepritomnost = `
            SELECT 
                celodenni, 
                CONVERT(VARCHAR(5), cas_od, 108) AS cas_od, 
                CONVERT(VARCHAR(5), cas_do, 108) AS cas_do 
            FROM dbo.Nepritomnost 
            WHERE lekar_id = @lekarId 
              AND CAST(datum AS DATE) = CAST(@datum AS DATE)
        `;

        const resNepritomnost = await reqNepritomnost.query(sqlNepritomnost);
        const nepritomnosti = resNepritomnost.recordset || [];

        // Pokud je zadaná celodenní nepřítomnost, rovnou vrátíme prázdné sloty
        const jeCelodenneNepritomen = nepritomnosti.some(n => n.celodenni === true || n.celodenni === 1);
        if (jeCelodenneNepritomen) {
            return res.json({
                success: true,
                datum,
                lekarId: pLekarId,
                ordinaceId: pOrdinaceId,
                typUkonuId: pTypUkonuId,
                delkaUkonuMinuty: 0,
                volneSloty: [],
                message: 'Lékař má v tento den celodenní nepřítomnost.'
            });
        }

        // 3. Délka úkonu
        const reqUkon = new sql.Request();
        reqUkon.input('typUkonuId', sql.Int, pTypUkonuId);
        
        const resUkon = await reqUkon.query('SELECT DelkaMinuty FROM dbo.TypyUkonu WHERE Id = @typUkonuId');
        const ukon = resUkon.recordset[0];
        const delkaUkonuMinuty = ukon && ukon.DelkaMinuty ? parseInt(ukon.DelkaMinuty, 10) : 30;

        // 4. Stávající rezervace
        const reqRezervace = new sql.Request();
        reqRezervace.input('lekarId', sql.Int, pLekarId);
        reqRezervace.input('datum', sql.VarChar(10), datum);

        const sqlRezervace = `
            SELECT 
                DatumCasStart, 
                DATEADD(minute, ISNULL(
                    (SELECT DelkaMinuty FROM dbo.TypyUkonu WHERE Id = Rezervace.TypUkonuId), 30
                ), DatumCasStart) AS DatumCasKonec
            FROM dbo.Rezervace 
            WHERE LekarId = @lekarId 
              AND CAST(DatumCasStart AS DATE) = CAST(@datum AS DATE)
              AND (Stav IS NULL OR Stav != 'Storno')
        `;

        const resRezervace = await reqRezervace.query(sqlRezervace);
        const stavajiciRezervace = resRezervace.recordset || [];

        // Pomocná funkce pro převod 'HH:MM' na minuty od začátku dne
        const timeToMinutes = (timeStr) => {
            if (!timeStr) return 0;
            const [h, m] = timeStr.split(':').map(Number);
            return h * 60 + m;
        };

        // Převod rezervací na obsazené intervaly
        const obsazeneIntervaly = stavajiciRezervace.map(rez => {
            const dtStart = new Date(rez.DatumCasStart);
            const dtKonec = new Date(rez.DatumCasKonec);
            return {
                startMin: dtStart.getHours() * 60 + dtStart.getMinutes(),
                konecMin: dtKonec.getHours() * 60 + dtKonec.getMinutes()
            };
        });

        // 5. ZAPOČÍTÁNÍ ČÁSTEČNÝCH NEPŘÍTOMNOSTÍ MEZI OBSAZENÉ INTERVALY
        for (const nep of nepritomnosti) {
            if (!nep.celodenni && nep.cas_od && nep.cas_do) {
                obsazeneIntervaly.push({
                    startMin: timeToMinutes(nep.cas_od),
                    konecMin: timeToMinutes(nep.cas_do)
                });
            }
        }

        // 6. Výpočet volných slotů
        const volneSloty = [];
        const krokSlotu = 15;

        for (const pd of pracovniDoba) {
            const zacatekOrdinace = timeToMinutes(pd.Od);
            const konecOrdinace = timeToMinutes(pd.Do);

            for (let min = zacatekOrdinace; min + delkaUkonuMinuty <= konecOrdinace; min += krokSlotu) {
                const slotStartMin = min;
                const slotKonecMin = min + delkaUkonuMinuty;

                const jeKolize = obsazeneIntervaly.some(obsazeno => {
                    return (slotStartMin < obsazeno.konecMin && slotKonecMin > obsazeno.startMin);
                });

                if (!jeKolize) {
                    const hodiny = String(Math.floor(slotStartMin / 60)).padStart(2, '0');
                    const minut = String(slotStartMin % 60).padStart(2, '0');
                    const slotStr = `${hodiny}:${minut}`;
                    if (!volneSloty.includes(slotStr)) {
                        volneSloty.push(slotStr);
                    }
                }
            }
        }

        volneSloty.sort();

        res.json({
            success: true,
            datum,
            lekarId: pLekarId,
            ordinaceId: pOrdinaceId,
            typUkonuId: pTypUkonuId,
            delkaUkonuMinuty,
            volneSloty
        });

    } catch (error) {
        console.error('Chyba při výpočtu volných termínů:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Chyba při výpočtu volných termínů na serveru.',
            error: error.message 
        });
    }
});

// --- ZVÍŘATA / PACIENTI ---

// GET: Načtení zvířat uživatele s počtem jejich rezervací
app.get('/api/zvirata', verifyToken, async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        let query = `
            SELECT z.*, 
                   (SELECT COUNT(*) FROM Rezervace r WHERE r.ZvireId = z.Id) AS PocetRezervaci
            FROM Zvirata z
        `;
        if (req.user.role === 'Zakaznik') {
            query += ` WHERE z.MajitelId = ${parseInt(req.user.id, 10)}`;
        }
        const result = await pool.request().query(query);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST: Přidání nového zvířete
app.post('/api/zvirata', verifyToken, async (req, res) => {
    try {
        const { jmeno, prezdivka, druh, rasa, vek } = req.body;
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('MajitelId', sql.Int, req.user.id)
            .input('Jmeno', sql.NVarChar, jmeno)
            .input('Prezdivka', sql.NVarChar, prezdivka || null)
            .input('Druh', sql.NVarChar, druh)
            .input('Rasa', sql.NVarChar, rasa || null)
            .input('Vek', sql.Int, vek || null)
            .query(`INSERT INTO Zvirata (MajitelId, Jmeno, Prezdivka, Druh, Rasa, Vek)
                    OUTPUT INSERTED.Id
                    VALUES (@MajitelId, @Jmeno, @Prezdivka, @Druh, @Rasa, @Vek)`);

        res.status(201).json({ success: true, id: result.recordset[0].Id });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// DELETE: Smazání zvířete (pouze pokud nemá zápis v databázi rezervací)
app.delete('/api/zvirata/:id', verifyToken, async (req, res) => {
    try {
        const petId = parseInt(req.params.id, 10);
        const pool = await sql.connect(dbConfig);

        // Kontrola vlastnictví zvířete
        const petCheck = await pool.request()
            .input('Id', sql.Int, petId)
            .input('MajitelId', sql.Int, req.user.id)
            .query('SELECT Id FROM Zvirata WHERE Id = @Id AND MajitelId = @MajitelId');

        if (petCheck.recordset.length === 0) {
            return res.status(404).json({ message: 'Zvíře nebylo nalezeno nebo k němu nemáte přístup.' });
        }

        // Kontrola, zda má zvíře v databázi zápis v rezervacích
        const rezCheck = await pool.request()
            .input('ZvireId', sql.Int, petId)
            .query('SELECT COUNT(*) AS Pocet FROM Rezervace WHERE ZvireId = @ZvireId');

        if (rezCheck.recordset[0].Pocet > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Zvíře nelze smazat, protože již má vytvořený zápis v databázi rezervací.' 
            });
        }

        await pool.request()
            .input('Id', sql.Int, petId)
            .query('DELETE FROM Zvirata WHERE Id = @Id');

        res.json({ success: true, message: 'Zvíře bylo úspěšně smazáno.' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- REZERVAČNÍ SYSTÉM ---

app.post('/api/rezervace', verifyToken, async (req, res) => {
    try {
        const { zvireId, lekarId, ordinaceId, typUkonuId, datumCasStart, poznamka } = req.body;
        const pool = await sql.connect(dbConfig);

        // Délka úkonu
        const ukonRes = await pool.request()
            .input('UkId', sql.Int, typUkonuId)
            .query('SELECT Nazev, DelkaMinuty FROM TypyUkonu WHERE Id = @UkId');
        
        const delka = ukonRes.recordset[0].DelkaMinuty;
        const nazevUkonu = ukonRes.recordset[0].Nazev;

        const start = new Date(datumCasStart);
        const end = new Date(start.getTime() + delka * 60000);

        const result = await pool.request()
            .input('ZvireId', sql.Int, zvireId)
            .input('LekarId', sql.Int, lekarId)
            .input('OrdinaceId', sql.Int, ordinaceId)
            .input('TypUkonuId', sql.Int, typUkonuId)
            .input('Start', sql.DateTime2, start)
            .input('End', sql.DateTime2, end)
            .input('Poznamka', sql.NVarChar, poznamka || null)
            .query(`INSERT INTO Rezervace (ZvireId, LekarId, OrdinaceId, TypUkonuId, DatumCasStart, DatumCasKonec, Poznamka)
                    OUTPUT INSERTED.Id
                    VALUES (@ZvireId, @LekarId, @OrdinaceId, @TypUkonuId, @Start, @End, @Poznamka)`);

        const rezId = result.recordset[0].Id;

        // Odeslání e-mailu klientovi
        const userRes = await pool.request().input('UId', sql.Int, req.user.id).query('SELECT Email, Jmeno FROM Uzivatele WHERE Id = @UId');
        const userEmail = userRes.recordset[0]?.Email;
        
        if (userEmail) {
            await sendEmailNotification(
                userEmail,
                `Potvrzení rezervace #${rezId} - VetCare`,
                `<h3>Dobrý den, ${userRes.recordset[0].Jmeno},</h3>
                 <p>Vaše rezervace na úkon <b>${nazevUkonu}</b> byla úspěšně vytvořena.</p>
                 <p><b>Termín:</b> ${start.toLocaleString('cs-CZ')}</p>
                 <p>Děkujeme za vaši důvěru!</p>`
            );
        }

        res.status(201).json({ success: true, rezervaceId: rezId });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST: Veřejná rezervace bez nutnosti přihlášení
app.post('/api/rezervace/verejna', async (req, res) => {
    const transaction = new sql.Transaction();
    try {
        const {
            ordinaceId,
            typUkonuId,
            lekarId,
            datumCasStart,
            majitelJmeno,
            majitelTelefon,
            majitelEmail,
            zvireJmeno,
            zvireDruh,
            poznamka
        } = req.body;

console.log(req.body);

        // Rozdělení jména na Jméno a Příjmení pro databázi
        const jmenoParts = (majitelJmeno || '').trim().split(' ');
        const jmeno = jmenoParts[0] || '';
        const prijmeni = jmenoParts.slice(1).join(' ') || '';

        let pool = await sql.connect(dbConfig);
        await transaction.begin();

console.log("MILAN 1");

        // 1. Zjištění délky úkonu z DB pro výpočet konce rezervace
        let ukonRes = await transaction.request()
            .input('ukonId', sql.Int, typUkonuId)
            .query("SELECT DelkaMinuty FROM TypyUkonu WHERE Id = @ukonId");

        const delkaMinuty = ukonRes.recordset.length > 0 ? ukonRes.recordset[0].DelkaMinuty : 30;
        
        const startDt = new Date(datumCasStart);
        const konecDt = new Date(startDt.getTime() + delkaMinuty * 60000);

console.log("MILAN 2");

        // 2. Majitel (vyhledání nebo nový)
        let majitelId;
        let mRes = await transaction.request()
            .input('email', sql.NVarChar, majitelEmail)
            .query("SELECT Id FROM Uzivatele WHERE Email = @email");

        if (mRes.recordset.length > 0) {
            majitelId = mRes.recordset[0].Id;
        } else {
            const passHash = await bcrypt.hash(majitelEmail, 10);

            let novyM = await transaction.request()
                .input('jmeno', sql.NVarChar, jmeno)
                .input('prijmeni', sql.NVarChar, prijmeni)
                .input('telefon', sql.NVarChar, majitelTelefon)
                .input('email', sql.NVarChar, majitelEmail)
                .input('HesloHash', sql.NVarChar, passHash)
                .input('PreferovanaOrdinaceId', sql.Int, ordinaceId || null)
                .query(`INSERT INTO Uzivatele (Jmeno, Prijmeni, Telefon, Email, role, HesloHash, PreferovanaOrdinaceId) 
                        OUTPUT INSERTED.Id VALUES (@jmeno, @prijmeni, @telefon, @email, 'Zakaznik', @HesloHash, @PreferovanaOrdinaceId)`);
            majitelId = novyM.recordset[0].Id;
        }

console.log("MILAN 3");

        // 3. Zvíře
        let novyZ = await transaction.request()
            .input('majitelId', sql.Int, majitelId)
            .input('jmeno', sql.NVarChar, zvireJmeno)
            .input('druh', sql.NVarChar, zvireDruh)
            .query(`INSERT INTO Zvirata (MajitelId, Jmeno, Druh) 
                    OUTPUT INSERTED.Id VALUES (@majitelId, @jmeno, @druh)`);
        const zvireId = novyZ.recordset[0].Id;

        console.log("MILAN 4");

        // 4. Rezervace
        await transaction.request()
            .input('zvireId', sql.Int, zvireId)
            .input('ordinaceId', sql.Int, ordinaceId)
            .input('lekarId', sql.Int, lekarId || null)
            .input('ukonId', sql.Int, typUkonuId)
            .input('start', sql.DateTime2, startDt)
            .input('konec', sql.DateTime2, konecDt)
            .input('poznamka', sql.NVarChar, poznamka || '')
            .query(`INSERT INTO Rezervace (ZvireId, ordinaceId, LekarId, TypUkonuId, DatumCasStart, DatumCasKonec, Stav, Poznamka)
                    VALUES (@zvireId, @ordinaceId, @lekarId, @ukonId, @start, @konec, 'Potvrzeno', @poznamka)`);

        await transaction.commit();
        res.json({ success: true, message: 'Rezervace byla úspěšně vytvořena.' });
    } catch (err) {
        await transaction.rollback();
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET: Veřejný přehled rezervací / volných časů pro daný den
app.get('/api/rezervace/verejna', async (req, res) => {
    try {
        const { datum } = req.query;
        let pool = await sql.connect(dbConfig);
        
        let result = await pool.request()
            .input('datum', sql.Date, datum)
            .query(`
                SELECT DatumCasStart, DatumCasKonec, Stav 
                FROM Rezervace 
                WHERE CAST(DatumCasStart AS DATE) = @datum AND Stav != 'Zrušeno'
            `);

        res.json({ success: true, rezervace: result.recordset });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET: Načtení rezervací přihlášeného klienta s filtrací dle stavu
app.get('/api/rezervace/moje', verifyToken, async (req, res) => {
    try {
        const { stav } = req.query; // 'vse', 'Plánovaná', 'Proběhlá', 'Storno'
        const pool = await sql.connect(dbConfig);

        let query = `
            SELECT 
                r.Id, 
                r.DatumCasStart, 
                r.DatumCasKonec, 
                ISNULL(r.Stav, 'Plánovaná') AS Stav, 
                r.Poznamka,
                z.Id AS ZvireId,
                z.Jmeno AS ZvireJmeno,
                tu.Nazev AS UkonNazev,
                o.Nazev AS OrdinaceNazev,
                (l.Titul + ' ' + lU.Jmeno + ' ' + lU.Prijmeni) AS LekarJmeno
            FROM Rezervace r
            JOIN Zvirata z ON r.ZvireId = z.Id
            JOIN TypyUkonu tu ON r.TypUkonuId = tu.Id
            LEFT JOIN Ordinace o ON r.OrdinaceId = o.Id
            LEFT JOIN Lekari l ON r.LekarId = l.Id
            LEFT JOIN Uzivatele lU ON l.UzivatelId = lU.Id
            WHERE z.MajitelId = @MajitelId
        `;

        const request = pool.request().input('MajitelId', sql.Int, req.user.id);

        if (stav && stav !== 'vse') {
            if (stav === 'Plánovaná') {
                query += ` AND (r.Stav = @Stav OR r.Stav IS NULL OR r.Stav = 'Potvrzeno')`;
            } else {
                query += ` AND r.Stav = @Stav`;
            }
            request.input('Stav', sql.NVarChar, stav);
        }

        query += ` ORDER BY r.DatumCasStart DESC`;

        const result = await request.query(query);
        res.json({ success: true, rezervace: result.recordset });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST: Vytvoření rezervace přihlášeným uživatelem
app.post('/api/rezervace', verifyToken, async (req, res) => {
    try {
        const { zvireId, lekarId, ordinaceId, typUkonuId, datumCasStart, poznamka } = req.body;
        const pool = await sql.connect(dbConfig);

        const ukonRes = await pool.request()
            .input('UkId', sql.Int, typUkonuId)
            .query('SELECT Nazev, DelkaMinuty FROM TypyUkonu WHERE Id = @UkId');
        
        const delka = ukonRes.recordset[0]?.DelkaMinuty || 30;
        const nazevUkonu = ukonRes.recordset[0]?.Nazev || 'Úkon';

        const start = new Date(datumCasStart);
        const end = new Date(start.getTime() + delka * 60000);

        const result = await pool.request()
            .input('ZvireId', sql.Int, zvireId)
            .input('LekarId', sql.Int, lekarId)
            .input('OrdinaceId', sql.Int, ordinaceId)
            .input('TypUkonuId', sql.Int, typUkonuId)
            .input('Start', sql.DateTime2, start)
            .input('End', sql.DateTime2, end)
            .input('Stav', sql.NVarChar, 'Plánovaná')
            .input('Poznamka', sql.NVarChar, poznamka || null)
            .query(`INSERT INTO Rezervace (ZvireId, LekarId, OrdinaceId, TypUkonuId, DatumCasStart, DatumCasKonec, Stav, Poznamka)
                    OUTPUT INSERTED.Id
                    VALUES (@ZvireId, @LekarId, @OrdinaceId, @TypUkonuId, @Start, @End, @Stav, @Poznamka)`);

        const rezId = result.recordset[0].Id;

        // Odeslání e-mailového potvrzení
        const userRes = await pool.request().input('UId', sql.Int, req.user.id).query('SELECT Email, Jmeno FROM Uzivatele WHERE Id = @UId');
        const userEmail = userRes.recordset[0]?.Email;
        
        if (userEmail) {
            await sendEmailNotification(
                userEmail,
                `Potvrzení rezervace #${rezId} - VetCare`,
                `<h3>Dobrý den, ${userRes.recordset[0].Jmeno},</h3>
                 <p>Vaše rezervace na úkon <b>${nazevUkonu}</b> byla úspěšně vytvořena.</p>
                 <p><b>Termín:</b> ${start.toLocaleString('cs-CZ')}</p>
                 <p>Děkujeme za vaši důvěru!</p>`
            );
        }

        res.status(201).json({ success: true, rezervaceId: rezId });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// PATCH: Stornování rezervace přímo klientem
app.patch('/api/rezervace/:id/storno', verifyToken, async (req, res) => {
    try {
        const rezId = parseInt(req.params.id, 10);
        const pool = await sql.connect(dbConfig);



        const check = await pool.request()
            .input('RezId', sql.Int, rezId)
            .input('MajitelId', sql.Int, req.user.id)
            .query(`
                SELECT r.Id 
                FROM Rezervace r 
                JOIN Zvirata z ON r.ZvireId = z.Id 
                WHERE r.Id = @RezId AND z.MajitelId = @MajitelId
            `);

        if (check.recordset.length === 0) {
            return res.status(403).json({ message: 'Nemáte oprávnění stornovat tuto rezervaci.' });
        }

        console.log('stornování rezervace s ID:', rezId);

        await pool.request()
            .input('RezId', sql.Int, rezId)
            .query("UPDATE Rezervace SET Stav = 'Storno' WHERE Id = @RezId");

        console.log('Rezervace s ID:', rezId, 'byla stornována.');

        res.json({ success: true, message: 'Rezervace byla úspěšně stornována.' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- LÉKAŘ ---

// =================================================================
// 3. GET /api/lekar/rezervace - Načtení rezervací přihlášeného lékaře (den nebo rozmezí od/do)
// =================================================================
app.get('/api/lekar/rezervace', verifyToken, async (req, res) => {
    try {
        console.log('req.user:', req.user);

        const uzivatelId = req.user.id;
        const { datum, datum_od, datum_do } = req.query;

        const pool = await sql.connect(dbConfig);

        // Zjištění ID lékaře podle ID přihlášeného uživatele
        const lekarRes = await pool.request()
            .input('uzivatelId', sql.Int, uzivatelId)
            .query(`SELECT Id FROM dbo.Lekari WHERE UzivatelId = @uzivatelId`);

        if (lekarRes.recordset.length === 0) {
            // Uživatel nemá záznam v tabulce Lekari
            return res.json([]);
        }

        const lekarId = lekarRes.recordset[0].Id;

        console.log('lekarId:', lekarId);
        console.log('datum:', datum, '| datum_od:', datum_od, '| datum_do:', datum_do);
        console.log('uzivatelId:', uzivatelId);

        const request = pool.request();
        request.input('lekarId', sql.Int, lekarId);

        let dateCondition = '';

        // 1. Priorita: Intervalové vyhledávání (datum_od a datum_do)
        if (datum_od && datum_do) {
            request.input('datumOd', sql.VarChar(10), datum_od.trim());
            request.input('datumDo', sql.VarChar(10), datum_do.trim());
            dateCondition = ' AND CAST(r.DatumCasStart AS DATE) BETWEEN CAST(@datumOd AS DATE) AND CAST(@datumDo AS DATE)';
        } 
        // 2. Priorita: Vyhledávání dle jednoho konkrétního dne (datum)
        else if (datum && datum.trim() !== '') {
            request.input('datum', sql.VarChar(10), datum.trim());
            dateCondition = ' AND CAST(r.DatumCasStart AS DATE) = CAST(@datum AS DATE)';
        }

        const query = `
            SELECT 
                r.Id AS id,
                r.DatumCasStart AS datum_cas,
                CONVERT(VARCHAR(5), r.DatumCasStart, 108) AS cas,
                ISNULL(z.Jmeno, 'Neuvedeno') AS zvire_jmeno,
                ISNULL(z.Druh, '') AS zvire_druh,
                CONCAT(u.Jmeno, ' ', u.Prijmeni) AS klient_jmeno,
                u.Telefon AS klient_telefon,
                u.Email AS klient_email,
                ISNULL(uk.Nazev, 'Konzultace') AS ukon_nazev,
                ISNULL(r.Stav, 'Plánovaná') AS stav,
                r.Poznamka
            FROM dbo.Rezervace r
            LEFT JOIN dbo.Zvirata z ON r.ZvireId = z.Id
            LEFT JOIN dbo.Uzivatele u ON z.MajitelId = u.Id
            LEFT JOIN dbo.TypyUkonu uk ON r.TypUkonuId = uk.Id
            WHERE r.LekarId = @lekarId ${dateCondition}
            ORDER BY r.DatumCasStart ASC
        `;

        const result = await request.query(query);
        res.json(result.recordset);

    } catch (error) {
        console.error('Chyba při načítání rezervací lékaře:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Chyba při načítání agendy ze serveru.', 
            error: error.message 
        });
    }
});

// Změna stavu rezervace doktorem/adminem
app.patch('/api/rezervace/:id/stav', verifyToken, async (req, res) => {
    try {
        const { stav } = req.body;
        const rezId = req.params.id;
        const pool = await sql.connect(dbConfig);

        await pool.request()
            .input('Stav', sql.NVarChar, stav)
            .input('Id', sql.Int, rezId)
            .query('UPDATE Rezervace SET Stav = @Stav WHERE Id = @Id');

        const detailRes = await pool.request()
            .input('Id', sql.Int, rezId)
            .query(`SELECT u.Email, u.Jmeno, z.Jmeno as ZvireJmeno, r.DatumCasStart 
                    FROM Rezervace r
                    JOIN Zvirata z ON r.ZvireId = z.Id
                    JOIN Uzivatele u ON z.MajitelId = u.Id
                    WHERE r.Id = @Id`);

        if (detailRes.recordset.length > 0) {
            const d = detailRes.recordset[0];
            await sendEmailNotification(
                d.Email,
                `Změna stavu rezervace #${rezId} - ${stav}`,
                `<p>Dobrý den ${d.Jmeno}, stav vaší rezervace pro zvíře <b>${d.ZvireJmeno}</b> byl změněn na: <b>${stav}</b>.</p>`
            );
        }

        res.json({ success: true, stav });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// =================================================================
// POST /api/lekar/rezervace/:id/zrusit - Zrušení rezervace + e-mail
// =================================================================
app.post('/api/lekar/rezervace/:id/zrusit-duvod', verifyToken, async (req, res) => {
    try {
        const rezervaceId = req.params.id;
        const { predmet, duvod } = req.body; // Data z modálního okna

        const pool = await sql.connect(dbConfig);

        // 1. Získání detailů o rezervaci, klientovi a lékaři před stornováním
        const infoResult = await pool.request()
            .input('id', sql.Int, rezervaceId)
            .query(`
                SELECT 
                    r.Id,
                    CONVERT(VARCHAR(10), r.Datum, 104) AS datum,
                    CONVERT(VARCHAR(5), r.Cas, 108) AS cas,
                    u.Email AS klient_email,
                    CONCAT(u.Jmeno, ' ', u.Prijmeni) AS klient_jmeno,
                    ISNULL(z.Jmeno, 'Pacient') AS zvire_jmeno,
                    CONCAT(doc.Titul, ' ', doc.Jmeno, ' ', doc.Prijmeni) AS lekar_jmeno
                FROM dbo.Rezervace r
                LEFT JOIN dbo.Uzivatele u ON r.UzivatelId = u.Id OR r.KlientId = u.Id
                LEFT JOIN dbo.Zvirata z ON r.ZvireId = z.Id
                LEFT JOIN dbo.Lekari l ON r.LekarId = l.Id
                LEFT JOIN dbo.Uzivatele doc ON l.UzivatelId = doc.Id
                WHERE r.Id = @id
            `);

        if (infoResult.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Rezervace nenalezena.' });
        }

        const rez = infoResult.recordset[0];

        // 2. Smazání rezervace z databáze (případně UPDATE dbo.Rezervace SET Stav = 'Zrušeno')
        await pool.request()
            .input('id', sql.Int, rezervaceId)
            .query(`DELETE FROM dbo.Rezervace WHERE Id = @id`);

        // 3. Odeslání e-mailu klientovi, pokud má vyplněný e-mail
        if (rez.klient_email) {
            const emailSubject = predmet || `Zrušení rezervace - VetCare (${rez.datum})`;
            const emailBody = `Dobrý den, ${rez.klient_jmeno},\n\n` +
                `Vaše rezervace plánovaná na ${rez.datum} v ${rez.cas} (pacient: ${rez.zvire_jmeno}) byla zrušena.\n\n` +
                `Důvod zrušení:\n${duvod || 'Důvod nebyl specifikován.'}\n\n` +
                `Omlouváme se za způsobené komplikace.\n\n` +
                `S pozdravem,\n${rez.lekar_jmeno}\nVeterinární klinika VetCare`;

            await transporter.sendMail({
                from: '"VetCare Ordinace" <no-reply@vetcare.cz>',
                to: rez.klient_email,
                subject: emailSubject,
                text: emailBody
            });
        }

        res.json({ success: true, message: 'Rezervace byla zrušena a e-mail byl klientovi odeslán.' });

    } catch (error) {
        console.error('Chyba při rušení rezervace a odesílání e-mailu:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Chyba při rušení rezervace nebo odesílání e-mailu.', 
            error: error.message 
        });
    }
});

// POST: Odeslání e-mailu klientovi z detailu rezervace
app.post('/api/rezervace/:id/poslat-email', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { predmet, zprava } = req.body;

        const pool = await sql.connect(dbConfig);
        const info = await pool.request()
            .input('id', sql.Int, id)
            .query(`
                SELECT u.Email AS email, u.Jmeno AS jmeno FROM Rezervace r
                JOIN Zvirata z ON r.ZvireId = z.Id
                JOIN Uzivatele u ON z.MajitelId = u.Id
                WHERE r.Id = @id
            `);

        if (info.recordset.length === 0) return res.status(404).json({ error: 'Rezervace nenalezena.' });
        const klient = info.recordset[0];

        await sendEmailNotification(
            klient.email,
            predmet,
            `<p>Dobrý den ${klient.jmeno},</p><p>${zprava.replace(/\n/g, '<br>')}</p><p>S pozdravem,<br>Veterinární klinika VetCare</p>`
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- PROFIL LÉKAŘE ---

// =================================================================
// 1. GET /api/lekar/profil - Načtení profilu lékaře a ordinační doby
// =================================================================
app.get('/api/lekar/profil', verifyToken, async (req, res) => {
    try {
        const uzivatelId = req.user.id; // ID přihlášeného uživatele z JWT
        const pool = await sql.connect(dbConfig);

        // Načtení dat z Uzivatele a Lekari
        const resLekar = await pool.request()
            .input('uzivatelId', sql.Int, uzivatelId)
            .query(`
                SELECT 
                    u.Id AS uzivatelId,
                    u.Email AS email,
                    u.Jmeno AS jmeno,
                    u.Prijmeni AS prijmeni,
                    u.Telefon AS telefon,
                    l.Id AS lekarId,
                    l.Titul AS titul,
                    l.Specializace AS specializace
                FROM dbo.Uzivatele u
                LEFT JOIN dbo.Lekari l ON u.Id = l.UzivatelId
                WHERE u.Id = @uzivatelId
            `);

        if (resLekar.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Uživatel nenalezen.' });
        }

        const lekar = resLekar.recordset[0];

        // Načtení pracovní doby z PracDoba
        let pracovniDoba = [];
        if (lekar.lekarId) {
            const resPracDoba = await pool.request()
                .input('lekarId', sql.Int, lekar.lekarId)
                .query(`
                    SELECT 
                        DenVTydnu, 
                        CONVERT(VARCHAR(5), Od, 108) AS Od, 
                        CONVERT(VARCHAR(5), Do, 108) AS Do
                    FROM dbo.PracDoba
                    WHERE LekarId = @lekarId
                    ORDER BY DenVTydnu, Od
                `);
            pracovniDoba = resPracDoba.recordset;
        }

        res.json({
            ...lekar,
            pracovniDoba
        });

    } catch (error) {
        console.error('Chyba při načítání profilu lékaře:', error);
        res.status(500).json({ success: false, message: 'Chyba při načítání profilu.', error: error.message });
    }
});


// =================================================================
// 2. PUT /api/lekar/profil - Uložení profilu a víceúsekové ordinační doby
// =================================================================
app.put('/api/lekar/profil', verifyToken, async (req, res) => {
    const pool = await sql.connect(dbConfig);
    const transaction = new sql.Transaction(pool);

    try {
        const uzivatelId = req.user.id;
        const { titul, jmeno, prijmeni, telefon, specializace, pracovniDoba } = req.body;

        if (!jmeno || !prijmeni) {
            return res.status(400).json({ success: false, message: 'Jméno a příjmení jsou povinné.' });
        }

        await transaction.begin();

        // 1. Aktualizace tabulky Uzivatele
        const reqUziv = new sql.Request(transaction);
        reqUziv.input('uzivatelId', sql.Int, uzivatelId);
        reqUziv.input('jmeno', sql.NVarChar(50), jmeno);
        reqUziv.input('prijmeni', sql.NVarChar(50), prijmeni);
        reqUziv.input('telefon', sql.NVarChar(20), telefon || null);
        await reqUziv.query(`
            UPDATE dbo.Uzivatele
            SET Jmeno = @jmeno, Prijmeni = @prijmeni, Telefon = @telefon
            WHERE Id = @uzivatelId
        `);

        // 2. Aktualizace / Vložení do tabulky Lekari
        const reqLekarCheck = new sql.Request(transaction);
        reqLekarCheck.input('uzivatelId', sql.Int, uzivatelId);
        const resLekarCheck = await reqLekarCheck.query(`SELECT Id FROM dbo.Lekari WHERE UzivatelId = @uzivatelId`);

        let lekarId;
        if (resLekarCheck.recordset.length > 0) {
            lekarId = resLekarCheck.recordset[0].Id;
            const reqLekarUpd = new sql.Request(transaction);
            reqLekarUpd.input('lekarId', sql.Int, lekarId);
            reqLekarUpd.input('titul', sql.NVarChar(20), titul || null);
            reqLekarUpd.input('specializace', sql.NVarChar(255), specializace || null);
            await reqLekarUpd.query(`
                UPDATE dbo.Lekari
                SET Titul = @titul, Specializace = @specializace
                WHERE Id = @lekarId
            `);
        } else {
            const reqLekarIns = new sql.Request(transaction);
            reqLekarIns.input('uzivatelId', sql.Int, uzivatelId);
            reqLekarIns.input('titul', sql.NVarChar(20), titul || null);
            reqLekarIns.input('specializace', sql.NVarChar(255), specializace || null);
            const resIns = await reqLekarIns.query(`
                INSERT INTO dbo.Lekari (UzivatelId, Titul, Specializace)
                OUTPUT INSERTED.Id
                VALUES (@uzivatelId, @titul, @specializace)
            `);
            lekarId = resIns.recordset[0].Id;
        }

        // 3. Aktualizace tabulky PracDoba (Smazání starých záznamů a vložení nových)
        if (lekarId && Array.isArray(pracovniDoba)) {
            const reqDelPD = new sql.Request(transaction);
            reqDelPD.input('lekarId', sql.Int, lekarId);
            await reqDelPD.query(`DELETE FROM dbo.PracDoba WHERE LekarId = @lekarId`);

            for (const pd of pracovniDoba) {
                if (pd.od && pd.do) {
                    const reqInsPD = new sql.Request(transaction);
                    reqInsPD.input('lekarId', sql.Int, lekarId);
                    reqInsPD.input('denVTydnu', sql.Int, pd.denVTydnu);
                    reqInsPD.input('od', sql.VarChar(5), pd.od);
                    reqInsPD.input('do', sql.VarChar(5), pd.do);
                    await reqInsPD.query(`
                        INSERT INTO dbo.PracDoba (LekarId, DenVTydnu, Od, Do)
                        VALUES (@lekarId, @denVTydnu, CAST(@od AS TIME), CAST(@do AS TIME))
                    `);
                }
            }
        }

        await transaction.commit();
        res.json({ success: true, message: 'Profil a ordinační doba byly úspěšně uloženy.' });

    } catch (err) {
        await transaction.rollback();
        console.error('Chyba při ukládání profilu:', err);
        res.status(500).json({ success: false, message: 'Chyba při ukládání profilu na serveru.', error: err.message });
    }
});

// --- LÉKAŘ - PRÁCE S NEPŘÍTOMNOSTÍ ---

// Přidání nepřítomnosti
app.post('/api/lekar/nepritomnost', verifyToken, async (req, res) => {
    try {
        const uzivatelId = req.user.id;
        const { datum, datum_od, datum_do, celodenni, cas_od, cas_do, duvod } = req.body;

        // Fallback pro zachování zpětné kompatibility
        const startStr = datum_od || datum;
        const endStr = datum_do || datum_od || datum;

        if (!startStr) {
            return res.status(400).json({ message: 'Zadejte platné datum nebo interval.' });
        }

        const pool = await sql.connect(dbConfig);

        console.log('uzivatelId:', uzivatelId, 'startStr:', startStr, 'endStr:', endStr);

        const lekarRes = await pool.request()
            .input('uzivatelId', sql.Int, uzivatelId)
            .query(`SELECT Id FROM dbo.Lekari WHERE UzivatelId = @uzivatelId`);

        if (lekarRes.recordset.length === 0) {
            return res.status(404).json({ message: 'Profil lékaře nenalezen.' });
        }

        const lekarId = lekarRes.recordset[0].Id;

        console.log('lekarId:', lekarId);

        let dStart = new Date(startStr);
        let dEnd = new Date(endStr);

        if (dEnd < dStart) {
            return res.status(400).json({ message: 'Koncové datum nesmí být před počátečním.' });
        }

        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            let currentDate = new Date(dStart);

            while (currentDate <= dEnd) {
                const formattedDate = currentDate.toISOString().split('T')[0];

                const request = new sql.Request(transaction);
                request.input('lekarId', sql.Int, lekarId);
                request.input('datum', sql.Date, formattedDate);
                request.input('celodenni', sql.Bit, celodenni ? 1 : 0);
                request.input('cas_od', sql.VarChar(5), cas_od || null);
                request.input('cas_do', sql.VarChar(5), cas_do || null);
                request.input('duvod', sql.NVarChar(255), duvod || null);

                await request.query(`
                    INSERT INTO dbo.Nepritomnost (Lekar_Id, Datum, Celodenni, Cas_Od, Cas_Do, Duvod)
                    VALUES (@lekarId, @datum, @celodenni, @cas_od, @cas_do, @duvod)
                `);

                currentDate.setDate(currentDate.getDate() + 1);
            }

            await transaction.commit();

            res.json({ success: true, message: 'Nepřítomnost byla úspěšně uložena.' });

        } catch (err) {
            await transaction.rollback();
            throw err;
        }

    } catch (error) {
        console.error('Chyba při ukládání nepřítomnosti:', error);
        res.status(500).json({ message: 'Chyba serveru při ukládání nepřítomnosti.' });
    }
});


// Získání seznamu nepřítomností
app.get('/api/lekar/nepritomnost', verifyToken, async (req, res) => {
    try {
        const uzivatelId = req.user.id;

        console.log('uzivatelId:', uzivatelId);

        const pool = await sql.connect(dbConfig);
        const lekarRes = await pool.request()
            .input('uzivatelId', sql.Int, uzivatelId)
            .query(`SELECT Id FROM dbo.Lekari WHERE UzivatelId = @uzivatelId`);

        if (lekarRes.recordset.length === 0) {
            return res.status(404).json({ message: 'Profil lékaře nenalezen.' });
        }

        const lekarId = lekarRes.recordset[0].Id;

        console.log('lekarId:', lekarId);

        const result = await pool.request()
            .input('lekarId', sql.Int, lekarId)
            .query(`
                SELECT id, datum, celodenni, CONVERT(VARCHAR(5), cas_od, 108) AS cas_od, CONVERT(VARCHAR(5), cas_do, 108) AS cas_do, duvod
                FROM Nepritomnost
                WHERE lekar_id = @lekarId AND datum >= CAST(GETDATE() AS DATE)
                ORDER BY datum ASC
            `);

        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Smazání nepřítomnosti
app.delete('/api/lekar/nepritomnost/:id', verifyToken, async (req, res) => {
    try {
        const uzivatelId = req.user.id;
        const { id } = req.params;

        console.log('uzivatelId:', uzivatelId, 'id nepřítomnosti k smazání:', id);

        const pool = await sql.connect(dbConfig);

        // 1. Zjištění ID lékaře na základě ID přihlášeného uživatele
        const lekarRes = await pool.request()
            .input('uzivatelId', sql.Int, uzivatelId)
            .query('SELECT Id FROM dbo.Lekari WHERE UzivatelId = @uzivatelId');

        if (lekarRes.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Profil lékaře nenalezen.' });
        }

        const lekarId = lekarRes.recordset[0].Id;

        console.log('lekarId:', lekarId);

        // 2. Mazání záznamu ze správné tabulky s ověřením vlastnictví (LekarId)
        const result = await pool.request()
            .input('id', sql.Int, id)
            .input('lekarId', sql.Int, lekarId)
            .query('DELETE FROM dbo.Nepritomnost WHERE Id = @id AND lekar_id = @lekarId');

        // 3. Kontrola, zda byl záznam skutečně smazán
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Záznam nebyl nalezen nebo nemáte oprávnění jej smazat.' 
            });
        }

        res.json({ success: true, message: 'Nepřítomnost byla úspěšně smazána.' });
    } catch (err) {
        console.error('Chyba při mazání nepřítomnosti:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- ADMIN a SUPERADMIN ---

// Pomocná funkce pro získání FirmaId nalogovaného uživatele (z pole PreferovanaOrdinaceId)
async function getAdminFirmaId(pool, uzivatelId) {

console.log('uzivatelId:', uzivatelId);

    const res = await pool.request()
        .input('uid', sql.Int, uzivatelId)
        .query(`SELECT PreferovanaOrdinaceId FROM dbo.Uzivatele WHERE Id = @uid`);
    return res.recordset[0]?.PreferovanaOrdinaceId || null;
}

// ==========================================
// 1. ORDINACE (Správa ordinací dané firmy)
// ==========================================
app.get('/api/admin/ordinace', verifyToken, async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const firmaId = await getAdminFirmaId(pool, req.user.id);

        console.log('firmaId:', firmaId);

        const result = await pool.request()
            .input('firmaId', sql.Int, firmaId)
            .query(`
                SELECT Id, Nazev, Adresa, Telefon, Email
                FROM dbo.Ordinace
                WHERE FirmaId = @firmaId
                ORDER BY Nazev
            `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/ordinace', verifyToken, async (req, res) => {
    try {
        const { nazev, adresa, telefon, email, web } = req.body;
        const pool = await sql.connect(dbConfig);
        const firmaId = await getAdminFirmaId(pool, req.user.id);

        await pool.request()
            .input('nazev', sql.NVarChar, nazev)
            .input('adresa', sql.NVarChar, adresa)
            .input('telefon', sql.NVarChar, telefon)
            .input('email', sql.NVarChar, email)
            .input('firmaId', sql.Int, firmaId)
            .query(`
                INSERT INTO dbo.Ordinace (Nazev, Adresa, Telefon, Email, FirmaId)
                VALUES (@nazev, @adresa, @telefon, @email, @firmaId)
            `);
        res.json({ success: true, message: 'Ordinace vytvořena.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/ordinace/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { nazev, adresa, telefon, email, web } = req.body;
        const pool = await sql.connect(dbConfig);

        await pool.request()
            .input('id', sql.Int, id)
            .input('nazev', sql.NVarChar, nazev)
            .input('adresa', sql.NVarChar, adresa)
            .input('telefon', sql.NVarChar, telefon)
            .input('email', sql.NVarChar, email)
            .query(`
                UPDATE dbo.Ordinace 
                SET Nazev = @nazev, Adresa = @adresa, Telefon = @telefon, Email = @email 
                WHERE Id = @id
            `);
        res.json({ success: true, message: 'Ordinace opravena.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/ordinace/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const pool = await sql.connect(dbConfig);
        await pool.request().input('id', sql.Int, id).query(`DELETE FROM dbo.Ordinace WHERE Id = @id`);
        res.json({ success: true, message: 'Ordinace smazána.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 2. LÉKAŘI (Uzivatele + Lekari + PracDoba + Nepritomnost + LekariOrdinace)
// ==========================================
app.get('/api/admin/lekari', verifyToken, async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const firmaId = await getAdminFirmaId(pool, req.user.id);

        console.log('AAA - firmaId:', firmaId);

        const lekariRes = await pool.request()
            .input('firmaId', sql.Int, firmaId)
            .query(`
                SELECT DISTINCT 
                    l.Id AS LekarId, u.Id AS UzivatelId, u.Jmeno, u.Prijmeni, 
                    u.Email, u.Telefon, l.Titul, l.Specializace
                FROM dbo.Lekari l
                JOIN dbo.Uzivatele u ON l.UzivatelId = u.Id
                LEFT JOIN dbo.LekariOrdinace lo ON l.Id = lo.LekarId
                WHERE u.PreferovanaOrdinaceId = @firmaId OR lo.FirId = @firmaId OR @firmaId IS NULL
                ORDER BY u.Prijmeni, u.Jmeno
            `);

        const lekari = lekariRes.recordset;

        console.log('AAA - lekari:', lekari);

        for (let l of lekari) {
            // Pracovní doba
            const pd = await pool.request()
                .input('lid', sql.Int, l.LekarId)
                .query(`SELECT Id, DenVTydnu, Od, Do FROM dbo.PracDoba WHERE LekarId = @lid ORDER BY DenVTydnu`);
            l.pracovniDoba = pd.recordset;

            // Nepřítomnost
            const np = await pool.request()
                .input('lid', sql.Int, l.LekarId)
                .query(`SELECT Id, Datum, Celodenni, 
                    CONVERT(varchar(5), cas_od, 108) AS CasOd,
                    CONVERT(varchar(5), cas_do, 108) AS CasDo,
                    Duvod FROM dbo.Nepritomnost WHERE lekar_id = @lid ORDER BY Datum DESC`);
            l.nepritomnost = np.recordset;

            // Přiřazené ordinace
            const ord = await pool.request()
                .input('lid', sql.Int, l.LekarId)
                .query(`
                    SELECT o.Id, o.Nazev 
                    FROM dbo.LekariOrdinace lo
                    JOIN dbo.Ordinace o ON lo.OrdinaceId = o.Id
                    WHERE lo.LekarId = @lid
                `);
            l.ordinace = ord.recordset;
        }

        res.json(lekari);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/lekari/:lekarId', verifyToken, async (req, res) => {
    try {
        const { lekarId } = req.params;
        const { uzivatelId, jmeno, prijmeni, email, telefon, titul, specializace, ordinaceIds, pracovniDoba, nepritomnosti } = req.body;
        const pool = await sql.connect(dbConfig);
        const firmaId = await getAdminFirmaId(pool, req.user.id);

        const transaction = new sql.Transaction(pool);
        await transaction.begin();

console.log('PUT /api/admin/lekari/:lekarId - lekarId:', lekarId, 'uzivatelId:', uzivatelId, 'firmaId:', firmaId);

        try {
            // 1. Úprava Uzivatele
            await new sql.Request(transaction)
                .input('uid', sql.Int, uzivatelId)
                .input('jmeno', sql.NVarChar, jmeno)
                .input('prijmeni', sql.NVarChar, prijmeni)
                .input('email', sql.NVarChar, email)
                .input('telefon', sql.NVarChar, telefon)
                .query(`UPDATE dbo.Uzivatele SET Jmeno = @jmeno, Prijmeni = @prijmeni, Email = @email, Telefon = @telefon WHERE Id = @uid`);

console.log('PUT /api/admin/lekari/:lekarId - Uzivatele updated');

            // 2. Úprava Lekari
            await new sql.Request(transaction)
                .input('lid', sql.Int, lekarId)
                .input('titul', sql.NVarChar, titul || null)
                .input('spec', sql.NVarChar, specializace || null)
                .query(`UPDATE dbo.Lekari SET Titul = @titul, Specializace = @spec WHERE Id = @lid`);

console.log('PUT /api/admin/lekari/:lekarId - Lekari updated');

            // 3. Propojení do Ordinací (LekariOrdinace)
            await new sql.Request(transaction)
                .input('lid', sql.Int, lekarId)
                .query(`DELETE FROM dbo.LekariOrdinace WHERE LekarId = @lid`);

console.log('PUT /api/admin/lekari/:lekarId - ordinaceIds to be updated:', ordinaceIds  );

            if (Array.isArray(ordinaceIds)) {
                for (let ordId of ordinaceIds) {
                    await new sql.Request(transaction)
                        .input('lid', sql.Int, lekarId)
                        .input('oid', sql.Int, ordId)
                        .input('fid', sql.Int, firmaId)
                        .query(`INSERT INTO dbo.LekariOrdinace (LekarId, OrdinaceId, FirId) VALUES (@lid, @oid, @fid)`);
                }
            }

console.log('PUT /api/admin/lekari/:lekarId - LekariOrdinace updated');

            // 4. Pracovní doba
            await new sql.Request(transaction)
                .input('lid', sql.Int, lekarId)
                .query(`DELETE FROM dbo.PracDoba WHERE LekarId = @lid`);

console.log('PUT /api/admin/lekari/:lekarId - PracovniDoba to be updated:', pracovniDoba  );    

            if (Array.isArray(pracovniDoba)) {
                for (let pd of pracovniDoba) {
                    await new sql.Request(transaction)
                        .input('lid', sql.Int, lekarId)
                        .input('den', sql.Int, pd.DenVTydnu)
                        .input('od', sql.VarChar, pd.CasOd)
                        .input('do', sql.VarChar, pd.CasDo)
                        .query(`INSERT INTO dbo.PracDoba (LekarId, DenVTydnu, Od, Do) VALUES (@lid, @den, @od, @do)`);
                }
            }

console.log('PUT /api/admin/lekari/:lekarId - PracovniDoba updated');

            // 5. Nepřítomnosti
            await new sql.Request(transaction)
                .input('lid', sql.Int, lekarId)
                .query(`DELETE FROM dbo.Nepritomnost WHERE lekar_id = @lid`);

console.log('PUT /api/admin/lekari/:lekarId - NepritomnostLekare to be updated:', nepritomnosti  );

            if (Array.isArray(nepritomnosti)) {
                for (let np of nepritomnosti) {
                    await new sql.Request(transaction)
                        .input('lid', sql.Int, lekarId)
                        .input('datum', sql.Date, np.Datum)
                        .input('celodenni', sql.Bit, np.Celodenni ? 1 : 0)
                        .input('od', sql.VarChar, np.CasOd || null)
                        .input('do', sql.VarChar, np.CasDo || null)
                        .input('duvod', sql.NVarChar, np.Duvod || null)
                        .query(`INSERT INTO dbo.Nepritomnost (lekar_id, datum, celodenni, cas_od, cas_do, duvod) VALUES (@lid, @datum, @celodenni, @od, @do, @duvod)`);
                }
            }

console.log('PUT /api/admin/lekari/:lekarId - NepritomnostLekare updated'); 

            await transaction.commit();
            res.json({ success: true, message: 'Lékař byl úspěšně aktualizován.' });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/lekari/:lekarId', verifyToken, async (req, res) => {
    try {
        const { lekarId } = req.params;
        const pool = await sql.connect(dbConfig);
        await pool.request().input('lid', sql.Int, lekarId).query(`DELETE FROM dbo.Lekari WHERE Id = @lid`);
        res.json({ success: true, message: 'Lékař smazán.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 3. TYPY ÚKONŮ (TypyUkonu)
// ==========================================
app.get('/api/admin/typy-ukonu', verifyToken, async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        //const firmaId = await getAdminFirmaId(pool, req.user.id);

        console.log('GET /api/admin/typy-ukonu - req.query:', req.query);
        console.log('GET /api/admin/typy-ukonu - req.query.ordinaceId:', req.query.ordinaceId);

        const OrdinaceId = req.query.ordinaceId ? parseInt(req.query.ordinaceId) : null;

        console.log('GET /api/admin/typy-ukonu - OrdinaceId:', OrdinaceId);

        const result = await pool.request()
            .input('OrdinaceId', sql.Int, OrdinaceId)
            .query(`
                SELECT Id, Nazev, DelkaMinuty, Cena, OrdinaceId
                FROM dbo.TypyUkonu
                WHERE OrdinaceId = @OrdinaceId OR @OrdinaceId IS NULL
                ORDER BY Nazev
            `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/typy-ukonu', verifyToken, async (req, res) => {
    try {
        const { nazev, delkaMinuty, cena, ordinaceId } = req.body;
        const pool = await sql.connect(dbConfig);
        await pool.request()
            .input('nazev', sql.NVarChar, nazev)
            .input('delka', sql.Int, delkaMinuty)
            .input('cena', sql.Decimal(10, 2), cena || null)
            .input('ordId', sql.Int, ordinaceId)
            .query(`INSERT INTO dbo.TypyUkonu (Nazev, DelkaMinuty, Cena, OrdinaceId) VALUES (@nazev, @delka, @cena, @ordId)`);
        res.json({ success: true, message: 'Úkon vytvořen.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/typy-ukonu/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { nazev, delkaMinuty, cena, ordinaceId } = req.body;
        const pool = await sql.connect(dbConfig);
        await pool.request()
            .input('id', sql.Int, id)
            .input('nazev', sql.NVarChar, nazev)
            .input('delka', sql.Int, delkaMinuty)
            .input('cena', sql.Decimal(10, 2), cena || null)
            .input('ordId', sql.Int, ordinaceId)
            .query(`UPDATE dbo.TypyUkonu SET Nazev = @nazev, DelkaMinuty = @delka, Cena = @cena, OrdinaceId = @ordId WHERE Id = @id`);
        res.json({ success: true, message: 'Úkon aktualizován.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/typy-ukonu/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const pool = await sql.connect(dbConfig);

        await pool.request().input('id', sql.Int, id).query(`DELETE FROM dbo.TypyUkonu WHERE Id = @id`);
        res.json({ success: true, message: 'Úkon smazán.' });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 4. UŽIVATELÉ (Uzivatele)
// ==========================================
app.get('/api/admin/uzivatele', verifyToken, async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const firmaId = await getAdminFirmaId(pool, req.user.id);

        const result = await pool.request()
            .input('firmaId', sql.Int, firmaId)
            .query(`
                SELECT u.Id, u.Jmeno, u.Prijmeni, u.Email, u.Telefon, u.Role, u.PreferovanaOrdinaceId,
                       o.Nazev AS PreferovanaOrdinaceNazev
                FROM dbo.Uzivatele u
                LEFT JOIN dbo.Ordinace o ON u.PreferovanaOrdinaceId = o.Id
                WHERE u.PreferovanaOrdinaceId = @firmaId OR @firmaId IS NULL
                ORDER BY u.Prijmeni, u.Jmeno
            `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// 1. Získání seznamu všech tabulek v databázi
app.get('/api/admin/db/tables', verifyToken, async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request().query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME != 'sysdiagrams'
            ORDER BY TABLE_NAME
        `);
        res.json(result.recordset.map(r => r.TABLE_NAME));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Načtení dat a struktury sloupců vybrané tabulky
app.get('/api/admin/db/tables/:tableName', verifyToken, async (req, res) => {
    try {
        const { tableName } = req.params;
        const pool = await sql.connect(dbConfig);

        // Ověření existence tabulky
        const checkTable = await pool.request()
            .input('tableName', sql.VarChar, tableName)
            .query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = @tableName`);

        if (checkTable.recordset.length === 0) {
            return res.status(404).json({ message: 'Tabulka nenalezena.' });
        }

        // Získání struktury sloupců a primárního klíče
        const columnsRes = await pool.request()
            .input('tableName', sql.VarChar, tableName)
            .query(`
                SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = @tableName
            `);

        // Získání dat z tabulky (omezení na prvních 500 záznamů)
        const dataRes = await pool.request().query(`SELECT TOP 500 * FROM [dbo].[${tableName}]`);

        res.json({
            columns: columnsRes.recordset,
            rows: dataRes.recordset
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Úprava existujícího záznamu
app.put('/api/admin/db/tables/:tableName/:pkColumn/:pkValue', verifyToken, async (req, res) => {
    try {
        const { tableName, pkColumn, pkValue } = req.params;
        const rowData = req.body; // Objekt { Sloupec: Hodnota }

        const pool = await sql.connect(dbConfig);

        // Sestavení dynamického SET zápisu
        const setClauses = [];
        const request = pool.request();

        Object.keys(rowData).forEach((col, idx) => {
            if (col !== pkColumn) {
                const paramName = `val_${idx}`;
                setClauses.push(`[${col}] = @${paramName}`);
                request.input(paramName, rowData[col] === '' ? null : rowData[col]);
            }
        });

        request.input('pkVal', pkValue);

        const sqlQuery = `
            UPDATE [dbo].[${tableName}] 
            SET ${setClauses.join(', ')} 
            WHERE [${pkColumn}] = @pkVal
        `;

        await request.query(sqlQuery);
        res.json({ success: true, message: 'Záznam byl úspěšně upraven.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Smazání záznamu
app.delete('/api/admin/db/tables/:tableName/:pkColumn/:pkValue', verifyToken, async (req, res) => {
    try {
        const { tableName, pkColumn, pkValue } = req.params;
        const pool = await sql.connect(dbConfig);

        await pool.request()
            .input('pkVal', pkValue)
            .query(`DELETE FROM [dbo].[${tableName}] WHERE [${pkColumn}] = @pkVal`);

        res.json({ success: true, message: 'Záznam byl smazán.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- KONTROLA PŘI MAZÁNÍ UŽIVATELE ---
app.delete('/api/uzivatele/:id', verifyToken, async (req, res) => {
    const currentUserId = req.user.id;
    const currentUserRole = req.user.role;
    const targetUserId = parseInt(req.params.id);

    // 1. Zákaz smazání sám sebe
    if (currentUserId === targetUserId) {
        return res.status(400).json({ message: 'Nemůžete smazat svůj vlastní účet.' });
    }

    const pool = await sql.connect(dbConfig);
    
    // Zjištění role a firmy mazaného uživatele
    const targetUser = await pool.request()
        .input('id', sql.Int, targetUserId)
        .query('SELECT Id, Role FROM dbo.Uzivatele WHERE Id = @id');

    if (targetUser.recordset.length === 0) {
        return res.status(404).json({ message: 'Uživatel nenalezen.' });
    }

    const targetRole = targetUser.recordset[0].Role;

    // 2. Kontrola SuperAdmina: Musí zůstat alespoň jeden
    if (targetRole === 'SuperAdmin') {
        const countSuper = await pool.request().query("SELECT COUNT(*) AS count FROM dbo.Uzivatele WHERE Role = 'SuperAdmin'");
        if (countSuper.recordset[0].count <= 1) {
            return res.status(400).json({ message: 'Nelze smazat posledního SuperAdmina v systému.' });
        }
    }

    // 3. Kontrola Admina firmy: Musí zůstat alespoň jeden Admin pro danou firmu/ordinaci
    if (targetRole === 'Admin') {
        // Zjištění firmy mazaného admina z LekariOrdinace / UzivateleOrdinace
        const firmRes = await pool.request()
            .input('userId', sql.Int, targetUserId)
            .query('SELECT OrdinaceId FROM dbo.LekariOrdinace WHERE LekarId = (SELECT Id FROM dbo.Lekari WHERE UzivatelId = @userId)');
        
        if (firmRes.recordset.length > 0) {
            const ordinaceId = firmRes.recordset[0].OrdinaceId;
            const countAdmins = await pool.request()
                .input('ordId', sql.Int, ordinaceId)
                .query(`
                    SELECT COUNT(*) AS count 
                    FROM dbo.LekariOrdinace lo
                    JOIN dbo.Lekari l ON lo.LekarId = l.Id
                    JOIN dbo.Uzivatele u ON l.UzivatelId = u.Id
                    WHERE lo.OrdinaceId = @ordId AND u.Role = 'Admin'
                `);
            
            if (countAdmins.recordset[0].count <= 1) {
                return res.status(400).json({ message: 'Nelze smazat posledního Administrátora této firmy.' });
            }
        }
    }

    // Smazání uživatele
    await pool.request().input('id', sql.Int, targetUserId).query('DELETE FROM dbo.Uzivatele WHERE Id = @id');
    res.json({ success: true, message: 'Uživatel smazán.' });
});

// --- KONTROLA PŘI MAZÁNÍ ORDINACE ---
app.delete('/api/ordinace/:id', verifyToken, async (req, res) => {
    // Smazat firmu může pouze SuperAdmin
    if (req.user.role !== 'SuperAdmin') {
        return res.status(403).json({ message: 'Nemáte oprávnění k mazání firmy. Tuto akci může provést pouze SuperAdmin.' });
    }

    const ordinaceId = req.params.id;
    const pool = await sql.connect(dbConfig);
    
    await pool.request().input('id', sql.Int, ordinaceId).query('DELETE FROM dbo.Ordinace WHERE Id = @id');
    res.json({ success: true, message: 'Ordinace byla úspěšně smazána.' });
});

// --- KONTROLA PŘI MAZÁNÍ FIRMY ---
app.delete('/api/ordinace/:id', verifyToken, async (req, res) => {
    // Smazat firmu může pouze SuperAdmin
    if (req.user.role !== 'SuperAdmin') {
        return res.status(403).json({ message: 'Nemáte oprávnění k mazání firmy. Tuto akci může provést pouze SuperAdmin.' });
    }

    const firmaId = req.params.id;
    const pool = await sql.connect(dbConfig);
    
    await pool.request().input('id', sql.Int, firmaId).query('DELETE FROM dbo.Firmy WHERE Id = @id');
    res.json({ success: true, message: 'Firma byla úspěšně smazána.' });
});

// --- ČEKÁRNA TV PREVIEW ---

app.get('/api/cekarna/dnes', async (req, res) => {
    try {
        const ordinaceId = req.query.ordinaceId || 1;
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('OrdId', sql.Int, ordinaceId)
            .query(`
                SELECT r.Id, z.Jmeno as Zvire, z.Druh, u.Prijmeni as MajitelPrijmeni, 
                       r.Stav, r.DatumCasStart, tu.Nazev as Ukon,
                       (l.Titul + ' ' + lU.Jmeno + ' ' + lU.Prijmeni) as LekarJmeno
                FROM Rezervace r
                JOIN Zvirata z ON r.ZvireId = z.Id
                JOIN Uzivatele u ON z.MajitelId = u.Id
                JOIN TypyUkonu tu ON r.TypUkonuId = tu.Id
                JOIN Lekari l ON r.LekarId = l.Id
                JOIN Uzivatele lU ON l.UzivatelId = lU.Id
                WHERE r.OrdinaceId = @OrdId 
                  AND CAST(r.DatumCasStart AS DATE) = CAST(GETDATE() AS DATE)
                  AND r.Stav IN ('CekaVCekarne', 'VOrdinaci', 'Potvrzeno', 'Plánovaná')
                ORDER BY r.DatumCasStart ASC
            `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`=================================`);
    console.log(`VetCare Backend běží na portu ${PORT}`);
    console.log(`=================================`);
});