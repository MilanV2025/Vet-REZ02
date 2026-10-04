/*
 * VetCare – přepínač motivů vzhledu
 * -------------------------------------------------------------
 * Použití: do <head> každé stránky (za Tailwind CDN skript) vložit
 *     <link rel="stylesheet" href="themes.css">
 *     <script src="theme.js"></script>
 * a na <html> přidat atribut data-page="light" (světlá stránka) nebo "dark" (tmavá stránka).
 *
 * Skript: 1) hned při načtení nastaví uložený motiv (bez problikávání),
 *         2) po načtení stránky vloží tlačítko "Motiv" do horní lišty (nav / header),
 *         3) volbu pamatuje v localStorage (klíč vetcare_theme) a sdílí mezi všemi stránkami a kartami.
 */
(function () {
    'use strict';

    var KEY = 'vetcare_theme';
    var THEMES = [
        { id: 'default',     name: 'Výchozí',                a: '#0f172a', b: '#10b981' },
        { id: 'dark',        name: 'Tmavý',                  a: '#0a0f1a', b: '#34d399' },
        { id: 'blue',        name: 'Modrý (zdravotnický)',   a: '#e6effc', b: '#2563eb' },
        { id: 'warm',        name: 'Teplý',                  a: '#faf0e0', b: '#ea580c' },
        { id: 'contrast',    name: 'Vysoký kontrast',        a: '#000000', b: '#ffd400' },
        { id: 'lightgreen',  name: 'Světle zelený',          a: '#eef8f1', b: '#047857' },
        { id: 'lightyellow', name: 'Světle žlutý',           a: '#fffbe6', b: '#a16207' },
        { id: 'lightblue',   name: 'Světle modrý',           a: '#eef7fd', b: '#0369a1' }
    ];
    var root = document.documentElement;

    /* ---- Odhlášení volá localStorage.clear(): volba motivu a jazyka se mají zachovat ---- */
    try {
        var nativeClear = Storage.prototype.clear;
        var KEEP = [KEY, 'vetcare_lang'];
        Storage.prototype.clear = function () {
            var keep = {};
            try {
                if (this === window.localStorage) KEEP.forEach(function (k) { var v = window.localStorage.getItem(k); if (v !== null) keep[k] = v; });
            } catch (e) { /* ignorováno */ }
            nativeClear.call(this);
            Object.keys(keep).forEach(function (k) { try { window.localStorage.setItem(k, keep[k]); } catch (e) { /* ignorováno */ } });
        };
    } catch (e) { /* ignorováno */ }

    function isValid(id) {
        for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return true;
        return false;
    }

    function readStored() {
        try {
            var v = window.localStorage.getItem(KEY);
            return isValid(v) ? v : 'default';
        } catch (e) { return 'default'; }
    }

    function applyTheme(id) {
        if (id === 'default') root.removeAttribute('data-theme');
        else root.setAttribute('data-theme', id);
    }

    // Motiv se nastaví okamžitě, ještě před vykreslením stránky
    var current = readStored();
    applyTheme(current);

    function swatch(t) {
        return 'linear-gradient(135deg,' + t.a + ' 50%,' + t.b + ' 50%)';
    }

    function themeById(id) {
        for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i];
        return THEMES[0];
    }

    function build() {
        // Záložní určení typu stránky, pokud chybí atribut data-page
        if (!root.getAttribute('data-page')) {
            var cls = (document.body && document.body.className) || '';
            root.setAttribute('data-page', /\bbg-(slate|gray)-(800|900|950)\b/.test(cls) ? 'dark' : 'light');
        }

        var wrap = document.createElement('div');
        wrap.className = 'vc-theme';

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'vc-theme-btn';
        btn.setAttribute('aria-haspopup', 'true');
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-label', 'Změnit motiv vzhledu');
        btn.title = 'Změnit motiv vzhledu';
        btn.innerHTML = '<i class="fa-solid fa-palette" aria-hidden="true"></i><span class="vc-theme-label"></span>';

        var menu = document.createElement('div');
        menu.className = 'vc-theme-menu';
        menu.setAttribute('role', 'menu');
        menu.hidden = true;

        var title = document.createElement('div');
        title.className = 'vc-theme-title';
        title.textContent = 'Motiv vzhledu';
        menu.appendChild(title);

        var items = THEMES.map(function (t) {
            var it = document.createElement('button');
            it.type = 'button';
            it.className = 'vc-theme-item';
            it.setAttribute('role', 'menuitemradio');
            it.setAttribute('data-theme-id', t.id);
            it.innerHTML = '<span class="vc-sw" style="background:' + swatch(t) + '"></span>' +
                           '<span></span><i class="fa-solid fa-check vc-check" aria-hidden="true"></i>';
            it.children[1].textContent = t.name;
            it.addEventListener('click', function () { choose(t.id); });
            menu.appendChild(it);
            return it;
        });

        wrap.appendChild(btn);
        wrap.appendChild(menu);

        function refresh() {
            btn.querySelector('.vc-theme-label').textContent = themeById(current).name;
            items.forEach(function (it) {
                it.setAttribute('aria-checked', it.getAttribute('data-theme-id') === current ? 'true' : 'false');
            });
        }

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
        function choose(id) {
            current = id;
            applyTheme(id);
            try { window.localStorage.setItem(KEY, id); } catch (e) { /* ignorováno */ }
            refresh();
            close(true);
        }

        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (menu.hidden) open(); else close(false);
        });
        document.addEventListener('click', function (e) {
            if (!menu.hidden && !wrap.contains(e.target)) close(false);
        });
        wrap.addEventListener('keydown', function (e) {
            if (menu.hidden) return;
            if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                var idx = items.indexOf(document.activeElement);
                var next = e.key === 'ArrowDown' ? idx + 1 : idx - 1;
                if (next < 0) next = items.length - 1;
                if (next >= items.length) next = 0;
                items[next].focus();
            }
        });

        // Změna motivu v jiné kartě / na jiné stránce
        function sync() { current = readStored(); applyTheme(current); refresh(); }
        window.addEventListener('storage', function (e) { if (e.key === KEY) sync(); });
        window.addEventListener('vc-theme-sync', sync);

        // Vložení do horní lišty: tlačítko se přidá před poslední prvek lišty (např. uživatelské menu / Odhlásit)
        var bar = document.querySelector('nav') || document.querySelector('header');
        var last = bar && bar.lastElementChild;
        if (bar && last) {
            var holder = document.createElement('div');
            holder.className = 'vc-theme-holder';
            bar.insertBefore(holder, last);
            holder.appendChild(wrap);
            holder.appendChild(last);
        } else if (bar) {
            bar.appendChild(wrap);
        } else {
            wrap.className += ' vc-theme-floating';
            document.body.appendChild(wrap);
        }

        refresh();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
    else build();

    // Malé veřejné API (např. pro konzoli): VetCareTheme.set('warm')
    window.VetCareTheme = {
        themes: THEMES,
        get: function () { return current; },
        set: function (id) {
            if (!isValid(id)) return;
            current = id; applyTheme(id);
            try { window.localStorage.setItem(KEY, id); } catch (e) { /* ignorováno */ }
            window.dispatchEvent(new Event('vc-theme-sync'));
        }
    };
})();
