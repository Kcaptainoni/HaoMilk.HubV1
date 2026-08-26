// ==UserScript==
// @name         Auto Tools Hub — link4m
// @namespace    http://tampermonkey.net/
// @version      6.85-link4m
// @description  link4m - auto dán mã KM + tab Config + tìm Google tab mới + hết spam cuộn
// @author       You
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @connect      api.pateway.ai
// @connect      pateway.ai
// @connect      *
// @run-at       document-start
// @all_frames   true
// @downloadURL  https://raw.githubusercontent.com/USER/REPO/main/Auto_Tools_Hub_link4m.user.js
// @updateURL    https://raw.githubusercontent.com/USER/REPO/main/Auto_Tools_Hub_link4m.user.js
// ==/UserScript==
// ↑ Đổi USER/REPO thành repo GitHub của bạn (hoặc dùng link raw Gist)

(function () {
    'use strict';

    // ====================== reCAPTCHA iframe: tự tick checkbox ======================
    // Chạy trong frame Google (@all_frames true)
    (function autoTickRecaptchaFrame() {
        try {
            const href = location.href || '';
            const host = location.hostname || '';
            if (!/google\.[^/]+$/i.test(host) && !host.includes('recaptcha')) return;
            if (!/recaptcha|anchor/i.test(href) && !document.querySelector('.recaptcha-checkbox')) return;

            const clickBox = () => {
                const sels = [
                    '#recaptcha-anchor',
                    '.recaptcha-checkbox',
                    '.recaptcha-checkbox-border',
                    '.recaptcha-checkbox-checkmark',
                    'span[role="checkbox"]',
                    '#recaptcha-anchor-label'
                ];
                for (const s of sels) {
                    const el = document.querySelector(s);
                    if (!el) continue;
                    // Đã tick rồi thì thôi
                    const checked = el.getAttribute('aria-checked') === 'true' ||
                        (el.className && String(el.className).includes('checked'));
                    if (checked) return true;
                    try {
                        el.click();
                        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                        console.log('[Auto Tools] reCAPTCHA frame click:', s);
                        return true;
                    } catch (e) {}
                }
                return false;
            };

            // Chỉ auto khi đang flow dán mã
            const should = () => {
                try { return !!GM_getValue('as_need_captcha_click', false); } catch (e) { return false; }
            };

            const run = () => {
                if (!should()) return;
                if (clickBox()) {
                    try { GM_setValue('as_need_captcha_click', false); } catch (e) {}
                }
            };

            setTimeout(run, 400);
            setTimeout(run, 1200);
            setTimeout(run, 2500);
            try {
                const obs = new MutationObserver(() => run());
                obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
                setTimeout(() => obs.disconnect(), 15000);
            } catch (e) {}
        } catch (e) {}
    })();

    // Frame reCAPTCHA: không chạy UI tool
    try {
        if (window !== window.top && /recaptcha|google\./i.test(location.hostname + location.href)) {
            return;
        }
    } catch (e) {}

    // ----- Inject vào PAGE context: bắt handler click/touchstart của what-on -----
    // (userscript isolated world không thấy listener của trang)
    (function injectPageHook() {
        const code = function () {
            if (window.__asHooked) return;
            window.__asHooked = true;
            const store = new WeakMap();
            const orig = EventTarget.prototype.addEventListener;
            EventTarget.prototype.addEventListener = function (type, fn, opts) {
                try {
                    if ((type === 'click' || type === 'touchstart' || type === 'mousedown' || type === 'pointerdown') && typeof fn === 'function') {
                        let arr = store.get(this);
                        if (!arr) { arr = []; store.set(this, arr); }
                        arr.push({ type: type, fn: fn });
                    }
                } catch (e) {}
                return orig.call(this, type, fn, opts);
            };
            window.__asInvokeHandlers = function (el, types) {
                if (!el) return false;
                let ok = false;
                const list = types || ['touchstart', 'click', 'mousedown', 'pointerdown'];
                const fake = {
                    type: 'click',
                    target: el,
                    currentTarget: el,
                    srcElement: el,
                    preventDefault: function () {},
                    stopPropagation: function () {},
                    stopImmediatePropagation: function () {},
                    isTrusted: true,
                    bubbles: true,
                    cancelable: true,
                    clientX: 0,
                    clientY: 0,
                    touches: [],
                    changedTouches: []
                };
                try {
                    const r = el.getBoundingClientRect();
                    fake.clientX = r.left + r.width / 2;
                    fake.clientY = r.top + r.height / 2;
                    const t = {
                        identifier: 1,
                        target: el,
                        clientX: fake.clientX,
                        clientY: fake.clientY,
                        pageX: fake.clientX + (window.scrollX || 0),
                        pageY: fake.clientY + (window.scrollY || 0),
                        screenX: fake.clientX,
                        screenY: fake.clientY,
                        radiusX: 8,
                        radiusY: 8,
                        force: 1
                    };
                    fake.touches = [t];
                    fake.changedTouches = [t];
                } catch (e) {}

                const tryEl = function (node) {
                    if (!node) return;
                    const arr = store.get(node) || [];
                    for (let i = 0; i < arr.length; i++) {
                        if (list.indexOf(arr[i].type) === -1) continue;
                        try {
                            fake.type = arr[i].type;
                            // what-on dùng global `event`
                            try { window.event = fake; } catch (e) {}
                            arr[i].fn.call(node, fake);
                            ok = true;
                        } catch (e) {}
                    }
                    if (typeof node.onclick === 'function') {
                        try { node.onclick(fake); ok = true; } catch (e) {}
                    }
                };
                tryEl(el);
                try {
                    const kids = el.querySelectorAll('*');
                    for (let i = 0; i < kids.length; i++) tryEl(kids[i]);
                } catch (e) {}
                // Bubble parents
                try {
                    let p = el.parentElement;
                    let depth = 0;
                    while (p && depth < 5) {
                        tryEl(p);
                        p = p.parentElement;
                        depth++;
                    }
                } catch (e) {}
                return ok;
            };
        };
        try {
            const s = document.createElement('script');
            s.textContent = '(' + code.toString() + ')();';
            const root = document.documentElement || document.head || document;
            root.appendChild(s);
            s.remove();
        } catch (e) {}
        // Retry inject nếu document chưa sẵn
        if (!document.documentElement) {
            document.addEventListener('DOMContentLoaded', function () {
                try {
                    const s = document.createElement('script');
                    s.textContent = '(' + code.toString() + ')();';
                    document.documentElement.appendChild(s);
                    s.remove();
                } catch (e) {}
            });
        }
    })();

    const config = {
        scrollAmount: 70,
        scrollDelay: 1100,
        countdownScrollAmount: 45,
        countdownScrollDelay: 900,
    };

    let isScrolling = false;
    let scrollTimer = null;
    let scrollDir = -1;
    let countdownScrollMode = false;
    // Khóa cuộn khi đang dán mã / quay lại — tránh spam vuốt lên xuống
    let scrollLocked = false;
    try {
        if (GM_getValue('as_scroll_lock', false) || GM_getValue('as_stop_scroll', false) || GM_getValue('as_pending_code', '')) {
            scrollLocked = true;
        }
    } catch (e) {}

    let autoLayMaEnabled = true;
    let autoLayMaBusy = false;
    let autoDanMaEnabled = true; // tự copy mã KM → về web đầu → dán
    let autoDanMaBusy = false;
    let lastAutoDanCode = '';

    // ====================== LƯU CẤU HÌNH (GM storage — giữ khi đổi trang) ======================
    const CFG_KEY = 'as_user_config_v1';

    function loadUserConfig() {
        try {
            const raw = GM_getValue(CFG_KEY, null);
            if (!raw) return;
            const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (typeof o.scrollAmount === 'number') config.scrollAmount = o.scrollAmount;
            if (typeof o.scrollDelay === 'number') config.scrollDelay = o.scrollDelay;
            if (typeof o.countdownScrollAmount === 'number') config.countdownScrollAmount = o.countdownScrollAmount;
            if (typeof o.countdownScrollDelay === 'number') config.countdownScrollDelay = o.countdownScrollDelay;
            if (typeof o.autoLayMaEnabled === 'boolean') autoLayMaEnabled = o.autoLayMaEnabled;
            if (typeof o.autoDanMaEnabled === 'boolean') autoDanMaEnabled = o.autoDanMaEnabled;
            console.log('[Auto Tools] Đã load config:', o);
        } catch (e) {
            console.log('[Auto Tools] Load config lỗi:', e);
        }
    }

    function saveUserConfig() {
        try {
            const o = {
                scrollAmount: config.scrollAmount,
                scrollDelay: config.scrollDelay,
                countdownScrollAmount: config.countdownScrollAmount,
                countdownScrollDelay: config.countdownScrollDelay,
                autoLayMaEnabled: autoLayMaEnabled,
                autoDanMaEnabled: autoDanMaEnabled,
                savedAt: Date.now()
            };
            GM_setValue(CFG_KEY, o);
        } catch (e) {}
    }

    loadUserConfig();

    // ====================== SCROLL ======================
    function scrollStep() {
        if (!isScrolling) return;

        if (countdownScrollMode) {
            // what-on: "Kéo lên chậm chậm để đếm ngược"
            const y = window.scrollY || document.documentElement.scrollTop || 0;
            if (y <= 8) {
                window.scrollBy({ top: 140, behavior: 'smooth' });
            } else {
                window.scrollBy({ top: -config.countdownScrollAmount, behavior: 'smooth' });
            }
            scrollTimer = setTimeout(scrollStep, config.countdownScrollDelay);
            return;
        }

        window.scrollBy({ top: config.scrollAmount * scrollDir, behavior: 'smooth' });
        scrollDir *= -1;
        scrollTimer = setTimeout(scrollStep, config.scrollDelay);
    }
    function startScroll(opts) {
        if (scrollLocked) {
            console.log('[Auto Tools] Cuộn bị khóa (đang dán mã / quay lại) — bỏ qua startScroll');
            return;
        }
        try {
            if (GM_getValue('as_scroll_lock', false) || GM_getValue('as_stop_scroll', false)) {
                scrollLocked = true;
                stopScroll();
                return;
            }
        } catch (e) {}
        if (opts && opts.countdown) countdownScrollMode = true;
        if (isScrolling && countdownScrollMode) {
            updateSwitch();
            return;
        }
        if (isScrolling && !countdownScrollMode) return;
        isScrolling = true;
        if (!countdownScrollMode) scrollDir = -1;
        clearTimeout(scrollTimer);
        scrollStep();
        updateSwitch();
        console.log('[Auto Tools] Tự cuộn:', countdownScrollMode ? 'CHẬM LÊN (đếm ngược)' : 'lên/xuống');
    }
    function stopScroll() {
        isScrolling = false;
        countdownScrollMode = false;
        clearTimeout(scrollTimer);
        updateSwitch();
    }
    function lockScroll(reason) {
        scrollLocked = true;
        try {
            GM_setValue('as_scroll_lock', true);
            GM_setValue('as_stop_scroll', true);
        } catch (e) {}
        stopScroll();
        console.log('[Auto Tools] Khóa cuộn:', reason || '');
    }
    function unlockScroll() {
        scrollLocked = false;
        try {
            GM_deleteValue('as_scroll_lock');
            GM_deleteValue('as_stop_scroll');
        } catch (e) {}
    }
    function toggleScroll() {
        if (isScrolling) {
            stopScroll();
            return;
        }
        // User bật tay → mở khóa
        unlockScroll();
        countdownScrollMode = false;
        startScroll();
    }
    function updateSwitch() {
        const sw = document.getElementById('as-sw');
        if (sw) sw.className = 'as-switch' + (isScrolling ? ' on' : '');
        const sw2 = document.getElementById('as-layma-sw');
        if (sw2) sw2.className = 'as-switch' + (autoLayMaEnabled ? ' on' : '');
        const sw3 = document.getElementById('as-cfg-scroll-sw');
        if (sw3) sw3.className = 'as-switch' + (isScrolling ? ' on' : '');
        const sw4 = document.getElementById('as-cfg-layma-sw');
        if (sw4) sw4.className = 'as-switch' + (autoLayMaEnabled ? ' on' : '');
        const sw5 = document.getElementById('as-cfg-danma-sw');
        if (sw5) sw5.className = 'as-switch' + (autoDanMaEnabled ? ' on' : '');
        const sw6 = document.getElementById('as-danma-sw');
        if (sw6) sw6.className = 'as-switch' + (autoDanMaEnabled ? ' on' : '');
    }

    // ====================== TỰ KÉO LÊN KHI THẤY ĐẾM NGƯỢC WHAT-ON ======================
    // Chỉ nhận diện widget đang ĐẾM GIÂY thật — không dính chữ hướng dẫn trong bài viết
    function isCountdownVisible() {
        const nodes = document.querySelectorAll(
            '.whatoncode, .whatoncode-wrapper, #BuURfz [class*="whaton"], [id*="BuURfz"] .whatoncode, [id*="BuURfz"]'
        );
        for (const n of nodes) {
            const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
            if (!t || t.length > 220) continue;
            const low = t.toLowerCase();

            // Pattern chính: "Vui lòng chờ 59s (1/2)" + "Kéo lên chậm chậm để đếm ngược"
            if (/\d+\s*s\s*\(\s*\d+\s*\/\s*\d+\s*\)/i.test(t)) return true;
            if (/kéo lên chậm chậm để đếm ngược/i.test(t)) return true;
            if (/vui lòng chờ\s*\d+/i.test(t) && /kéo lên|đếm ngược/i.test(t)) return true;

            if (
                (low.includes('kéo lên') || low.includes('chậm chậm') || low.includes('rất tốt')) &&
                (low.includes('chờ') || low.includes('wait') || low.includes('đếm ngược') || /\d+\s*s/i.test(t))
            ) return true;

            if (low.includes('please wait') && /\d+\s*s/i.test(t)) return true;
            if (low.includes('get code after') && /\d+/i.test(t)) return true;
        }
        return false;
    }

    // Trích mã KM từ khung đỏ what-on: "Mã KM: lLmdHW"
    function extractPromoCode() {
        // 0) Ưu tiên ô đỏ style + icon-copy (dạng KHÔNG popup)
        try {
            for (const n of document.querySelectorAll('div, span, p')) {
                const styleAttr = (n.getAttribute('style') || '');
                if (!/237\s*,\s*28\s*,\s*36|#ed1c24/i.test(styleAttr)) {
                    let bg = '';
                    try { bg = getComputedStyle(n).backgroundColor || ''; } catch (e) {}
                    if (!/237\s*,\s*28\s*,\s*36/i.test(bg)) continue;
                }
                const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
                const m = t.match(/Mã\s*KM\s*[:：]\s*([A-Za-z0-9]{3,16})/i);
                if (!m) continue;
                // Có icon-copy càng chắc
                const hasCopy = !!(n.querySelector && n.querySelector('img[src*="icon-copy"], img[src*="what-on"]'));
                if (hasCopy || /Mã\s*KM/i.test(t)) return m[1];
            }
        } catch (e) {}
        // 1) Div đỏ style background rgb(237, 28, 36) / #ed1c24 + icon-copy
        const candidates = [];
        try {
            document.querySelectorAll('div, span, p, strong, b').forEach((el) => {
                try {
                    if (el.id === 'as-code' || (el.closest && el.closest('#as-panel, #as-btn'))) return;
                } catch (e) {}
                const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
                if (!t || t.length > 80) return;
                const m = t.match(/Mã\s*(?:KM|KN)?\s*[:：]\s*([A-Za-z0-9]{3,16})/i) ||
                    t.match(/(?:code|mã)\s*[:：]\s*([A-Za-z0-9]{3,16})/i);
                if (!m) return;
                let score = 10;
                try {
                    const st = (el.getAttribute('style') || '') + ' ' + (getComputedStyle(el).backgroundColor || '');
                    if (/237\s*,\s*28\s*,\s*36|#ed1c24|rgb\(\s*237/i.test(st)) score += 20;
                    if (el.querySelector('img[src*="icon-copy"], img[src*="what-on"]')) score += 15;
                    if (el.closest('#BuURfz, .whatoncode, [id*="BuURfz"], [class*="whaton"]')) score += 10;
                } catch (e) {}
                candidates.push({ code: m[1], score, t });
            });
        } catch (e) {}

        // 2) Fallback text trong widget
        if (!candidates.length) {
            try {
                const nodes = document.querySelectorAll('.whatoncode, #BuURfz, [id*="BuURfz"], [class*="whaton"]');
                for (const n of nodes) {
                    const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
                    const m = t.match(/Mã\s*(?:KM|KN)?\s*[:：]\s*([A-Za-z0-9]{3,16})/i);
                    if (m && !/chờ|wait|kéo lên|đếm ngược/i.test(t.slice(0, 40))) {
                        candidates.push({ code: m[1], score: 8, t: t.slice(0, 60) });
                    }
                }
            } catch (e) {}
        }

        candidates.sort((a, b) => b.score - a.score);
        return candidates.length ? candidates[0].code : '';
    }

    function isCodeReady() {
        if (extractPromoCode()) return true;
        const nodes = document.querySelectorAll('.whatoncode, #BuURfz, [id*="BuURfz"]');
        for (const n of nodes) {
            const t = (n.textContent || '').trim();
            if (/mã\s*[:=]|code\s*[:=]/i.test(t) && !/chờ|wait|kéo lên|đếm ngược|click vào link|bất kỳ/i.test(t)) return true;
        }
        return false;
    }

    // ====================== AUTO DÁN MÃ: thấy "Mã KM: xxx" → gửi về web đầu ======================
    function watchAndAutoPasteCode() {
        if (location.hostname.includes('google.') || isLink4mHost()) return;

        const tryOnce = () => {
            try {
                if (!autoDanMaEnabled || autoDanMaBusy || scrollLocked) return;
                if (GM_getValue('as_pending_code', '')) return; // đang chờ tab gốc dán

                const code = extractPromoCode();
                if (!code) return;
                if (code === lastAutoDanCode) return;

                // Tránh dán lại cùng mã trong 3 phút
                const usedKey = 'as_auto_dan_' + code;
                const usedAt = GM_getValue(usedKey, 0);
                if (usedAt && Date.now() - usedAt < 180000) return;

                lastAutoDanCode = code;
                autoDanMaBusy = true;
                GM_setValue(usedKey, Date.now());
                lockScroll('auto dán mã');
                try { stopScroll(); } catch (e) {}

                // Hiện mã lên ô tool (nếu có)
                try {
                    const el = document.getElementById('as-code');
                    if (el) el.value = code;
                } catch (e) {}

                console.log('[Auto Tools] ✅ Thấy mã KM:', code, '→ tự gửi về web đầu');
                // Chờ 0.8s cho user kịp thấy, rồi submit
                setTimeout(() => {
                    try {
                        submitCode(code);
                    } catch (e) {
                        console.log('[Auto Tools] Auto dán lỗi:', e);
                    } finally {
                        setTimeout(() => { autoDanMaBusy = false; }, 5000);
                    }
                }, 800);
            } catch (e) {}
        };

        setTimeout(tryOnce, 2000);
        setInterval(tryOnce, 2000);
        try {
            const roots = [
                document.getElementById('BuURfz'),
                ...document.querySelectorAll('.whatoncode, .whatoncode-wrapper, [id*="BuURfz"], [class*="whaton"]')
            ].filter(Boolean);
            const obs = new MutationObserver(() => tryOnce());
            if (roots.length) {
                roots.forEach(r => obs.observe(r, { childList: true, subtree: true, characterData: true }));
            } else if (document.body) {
                obs.observe(document.body, { childList: true, subtree: true });
            }
        } catch (e) {}
    }
    // Chạy sau khi các hàm phụ thuộc đã khai báo (submitCode ở dưới) — delay khởi động
    setTimeout(() => {
        try { watchAndAutoPasteCode(); } catch (e) {}
    }, 2500);

    // Bước 2 what-on: "Vui lòng click vào link bất kỳ để lấy MÃ"
    function isNeedClickInternalLink() {
        // Dạng A: .whatoncode popup
        // Dạng B: ô đỏ inline style rgb(237,28,36) — không popup, không kéo chậm
        try {
            const all = document.querySelectorAll('div, span, p');
            for (const n of all) {
                try { if (n.closest && n.closest('#as-panel, #as-btn')) continue; } catch (e) {}
                const styleAttr = (n.getAttribute('style') || '');
                const isRed = /237\s*,\s*28\s*,\s*36|#ed1c24/i.test(styleAttr);
                let bg = '';
                try { bg = getComputedStyle(n).backgroundColor || ''; } catch (e) {}
                const isRedBg = /237\s*,\s*28\s*,\s*36/i.test(bg);
                if (!isRed && !isRedBg) continue;
                const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
                if (t.length < 10 || t.length > 220) continue;
                // Đã có mã → không cần click link
                if (/Mã\s*KM\s*[:：]/i.test(t)) continue;
                if (/click\s*vào\s*link|click\s*vao\s*link|link\s*bất\s*kỳ|kéo\s*xuống\s*vị\s*trí/i.test(t)) {
                    return true;
                }
            }
        } catch (e) {}
        // Popup whatoncode
        try {
            for (const n of document.querySelectorAll('.whatoncode, .whatoncode-wrapper')) {
                const t = (n.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
                if (t.length < 10 || t.length > 280) continue;
                if (/click\s*vào\s*link|click\s*vao\s*link|click\s*any\s*link/.test(t) &&
                    /lấy\s*mã|lay\s*ma|mã|code/.test(t)) return true;
            }
        } catch (e) {}
        return false;
    }

    function findInternalLink() {
        const host = location.hostname.replace(/^www\./, '');
        const links = Array.from(document.querySelectorAll('a[href]'));
        const scored = [];

        for (const a of links) {
            let href = a.href || '';
            if (!href || href.startsWith('javascript:') || href === '#' || href.endsWith('#')) continue;
            if (href.includes('google.') || href.includes('what-on') || href.includes('facebook') ||
                href.includes('youtube') || href.includes('twitter') || href.includes('t.me')) continue;

            let url;
            try { url = new URL(href, location.href); } catch { continue; }

            // Chỉ link nội bộ (cùng domain)
            const h = url.hostname.replace(/^www\./, '');
            if (h !== host) continue;

            // Bỏ link trùng trang hiện tại (không đổi gì)
            if (url.pathname === location.pathname && url.search === location.search) continue;

            // Bỏ link ẩn / quá nhỏ
            const r = a.getBoundingClientRect();
            if (r.width < 5 && r.height < 5 && a.offsetParent === null) continue;

            // Ưu tiên: trong nội dung chính, có text, không phải menu footer
            let score = 10;
            const txt = (a.textContent || '').trim();
            if (txt.length > 3 && txt.length < 80) score += 5;
            if (a.closest('article, .entry-content, .post-content, main, .col-inner, .box-text')) score += 8;
            if (a.closest('footer, nav, header, .menu')) score -= 5;
            if (url.pathname.length > 1) score += 3;

            scored.push({ a, score, href: url.href });
        }

        scored.sort((x, y) => y.score - x.score);
        return scored.length ? scored[0].a : null;
    }

    let step2Busy = false;
    let step2LastTry = 0;

    function doStep2ClickInternalThenLayMa() {
        if (step2Busy) return;
        if (!isNeedClickInternalLink()) return;
        // Tránh spam click liên tục
        if (Date.now() - step2LastTry < 4000) return;
        step2LastTry = Date.now();
        step2Busy = true;
        console.log('[Auto Tools] Bước 2 (popup hoặc ô đỏ) → tìm + click link nội bộ');

        if (countdownScrollMode) stopScroll();

        let link = findInternalLink();
        // Nới lỏng: mọi <a> cùng host, kể cả nhỏ
        if (!link) {
            try {
                const host = location.hostname.replace(/^www\./, '');
                for (const a of document.querySelectorAll('a[href]')) {
                    if (a.closest && a.closest('#as-panel, #as-btn')) continue;
                    let href = a.href || '';
                    if (!href || href.startsWith('javascript:') || href === '#') continue;
                    if (/google\.|what-on|facebook|youtube|twitter|t\.me/i.test(href)) continue;
                    try {
                        const u = new URL(href, location.href);
                        if (u.hostname.replace(/^www\./, '') !== host) continue;
                        if (u.pathname === location.pathname && u.search === location.search) continue;
                        link = a;
                        break;
                    } catch (e) {}
                }
            } catch (e) {}
        }
        if (!link) {
            console.log('[Auto Tools] Không tìm thấy link nội bộ');
            step2Busy = false;
            return;
        }

        console.log('[Auto Tools] Click link nội bộ:', link.href, (link.textContent || '').trim().slice(0, 40));

        try {
            GM_setValue('as_force_layma', true);
            GM_setValue('as_step2_pending', true);
            GM_setValue('as_step2_time', Date.now());
            const pageKey = 'as_layma_' + location.hostname + location.pathname;
            GM_deleteValue(pageKey);
        } catch (e) {}

        try {
            link.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (e) {}

        setTimeout(() => {
            try {
                // Click vật lý hơn
                const r = link.getBoundingClientRect();
                const x = r.left + r.width / 2;
                const y = r.top + r.height / 2;
                ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach(type => {
                    try {
                        link.dispatchEvent(new MouseEvent(type, {
                            bubbles: true, cancelable: true, view: window,
                            clientX: x, clientY: y, button: 0
                        }));
                    } catch (e) {}
                });
                try { link.click(); } catch (e) {}
            } catch (e) {
                try { location.assign(link.href); } catch (e2) {}
            }
            // Fallback điều hướng
            setTimeout(() => {
                if (isNeedClickInternalLink()) {
                    try { location.assign(link.href); } catch (e) {}
                }
            }, 1800);
            // Ô đỏ: kéo xuống vị trí ô đỏ
            setTimeout(() => {
                try {
                    for (const el of document.querySelectorAll('div, span, p')) {
                        const st = el.getAttribute('style') || '';
                        if (!/237\s*,\s*28\s*,\s*36|#ed1c24/i.test(st)) continue;
                        const tx = (el.textContent || '').replace(/\s+/g, ' ');
                        if (/kéo xuống|click vào link|Mã\s*KM/i.test(tx)) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            window.scrollBy(0, 60);
                            break;
                        }
                    }
                } catch (e) {}
            }, 700);
            setTimeout(() => { step2Busy = false; }, 3500);
        }, 400);
    }

    function isLink4mHost() {
        return /link4m\./i.test(location.hostname || '');
    }

    function watchCountdownAndScroll() {
        // Không tự cuộn trên Google / link4m
        if (location.hostname.includes('google.') || isLink4mHost()) {
            try { stopScroll(); } catch (e) {}
            return;
        }
        let missCount = 0;

        const tick = () => {
            try {
                if (scrollLocked || GM_getValue('as_scroll_lock', false) || GM_getValue('as_pending_code', '')) {
                    if (isScrolling) stopScroll();
                    return;
                }
                if (isLink4mHost()) {
                    if (isScrolling) stopScroll();
                    return;
                }
                if (isCodeReady()) {
                    if (isScrolling || countdownScrollMode) {
                        console.log('[Auto Tools] Đã có mã — dừng kéo');
                        stopScroll();
                    }
                    missCount = 0;
                    return;
                }

                if (isNeedClickInternalLink()) {
                    if (countdownScrollMode) stopScroll();
                    doStep2ClickInternalThenLayMa();
                    return;
                }

                if (isCountdownVisible()) {
                    missCount = 0;
                    if (!isScrolling || !countdownScrollMode) {
                        console.log('[Auto Tools] Thấy đếm ngược what-on → tự kéo lên chậm');
                        if (window.__asStartKeepAlive) window.__asStartKeepAlive();
                        startScroll({ countdown: true });
                    }
                } else {
                    // Không còn UI đếm ngược → tắt cuộn auto (giữ nếu user tự bật mode thường)
                    if (countdownScrollMode) {
                        missCount++;
                        if (missCount >= 2) {
                            console.log('[Auto Tools] Hết đếm ngược → tắt tự cuộn');
                            stopScroll();
                            missCount = 0;
                        }
                    }
                }
            } catch (e) {}
        };
        setTimeout(tick, 1200);
        setInterval(tick, 2000);
        try {
            const obs = new MutationObserver(() => tick());
            // Luôn quan sát body — ô đỏ KHÔNG nằm trong .whatoncode
            obs.observe(document.body || document.documentElement, {
                childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'class']
            });
        } catch (e) {}
        // Interval dày hơn cho ô đỏ không popup
        setInterval(() => {
            try {
                if (isNeedClickInternalLink()) doStep2ClickInternalThenLayMa();
            } catch (e) {}
        }, 2500);
    }
    watchCountdownAndScroll();

    // Sau khi load trang: nếu đang ở bước 2 (vừa click link nội bộ) → ép tìm LẤY MÃ lại
    (function resumeStep2() {
        try {
            const pending = GM_getValue('as_step2_pending', false);
            const t = GM_getValue('as_step2_time', 0);
            if (pending && Date.now() - t < 120000) {
                GM_deleteValue('as_step2_pending');
                GM_setValue('as_force_layma', true);
                const pageKey = 'as_layma_' + location.hostname + location.pathname;
                GM_deleteValue(pageKey);
                console.log('[Auto Tools] Bước 2: trang mới — sẽ tìm lại nút LẤY MÃ');
            }
        } catch (e) {}
    })();

    // ====================== KEEP ALIVE — tab nền vẫn chạy đếm ngược ======================
    // Chrome/Firefox tạm dừng timer khi tab ẩn → what-on dừng đếm.
    // Cách giảm: giả visibility + phát audio gần im lặng (hạn chế throttle).
    (function keepAliveBackground() {
        try {
            Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
            Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
            Object.defineProperty(document, 'webkitHidden', { get: () => false, configurable: true });
        } catch (e) {}

        try {
            const noop = () => {};
            window.addEventListener('blur', (e) => { e.stopImmediatePropagation(); }, true);
            document.addEventListener('visibilitychange', (e) => {
                e.stopImmediatePropagation();
            }, true);
            window.addEventListener('pagehide', (e) => { e.stopImmediatePropagation(); }, true);
        } catch (e) {}

        // Audio gần im lặng — giúp Chrome ít throttle tab nền hơn
        let audioCtx = null;
        let keepAudioOn = false;

        function startSilentAudio() {
            if (keepAudioOn) return;
            keepAudioOn = true;
            try {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return;
                audioCtx = new AC();
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                gain.gain.value = 0.00001; // gần như không nghe
                osc.frequency.value = 440;
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start();
                // Resume nếu browser suspend
                const resume = () => {
                    if (audioCtx && audioCtx.state === 'suspended') {
                        audioCtx.resume().catch(() => {});
                    }
                };
                resume();
                setInterval(resume, 5000);
                document.addEventListener('click', resume, { once: true });
                console.log('[Auto Tools] Keep-alive audio đã bật (tab nền ít bị dừng hơn)');
            } catch (e) {
                console.log('[Auto Tools] Không tạo được audio keep-alive:', e.message);
            }
        }

        // Bật khi bắt đầu đếm ngược / user tương tác
        window.__asStartKeepAlive = startSilentAudio;

        // Tự bật sớm nếu đã thấy countdown
        setTimeout(() => {
            if (typeof isCountdownVisible === 'function' && isCountdownVisible()) {
                startSilentAudio();
            }
        }, 2000);

        // Web Worker nhịp — vẫn tick khi tab nền (hạn chế hơn main thread)
        try {
            const workerCode = `
                let id = setInterval(() => postMessage(Date.now()), 1000);
                onmessage = (e) => { if (e.data === 'stop') clearInterval(id); };
            `;
            const blob = new Blob([workerCode], { type: 'application/javascript' });
            const worker = new Worker(URL.createObjectURL(blob));
            worker.onmessage = () => {
                // Ép scroll nhẹ nếu đang countdown mode (what-on cần scroll) — bỏ qua khi khóa
                try {
                    if (scrollLocked || GM_getValue('as_scroll_lock', false)) return;
                    if (typeof countdownScrollMode !== 'undefined' && countdownScrollMode && isScrolling) {
                        const y = window.scrollY || 0;
                        window.scrollBy(0, y <= 8 ? 30 : -25);
                    }
                } catch (e) {}
            };
            window.addEventListener('beforeunload', () => {
                try { worker.postMessage('stop'); worker.terminate(); } catch (e) {}
            });
        } catch (e) {}
    })();

    // Kích hoạt widget 1 lần nhẹ
    function wakePageOnce() {
        try {
            window.focus();
            if (window.__asStartKeepAlive) window.__asStartKeepAlive();
            const box = document.getElementById('BuURfz') ||
                document.querySelector('[id*="BuURfz"], [id*="what-on"]');
            if (box) {
                box.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } catch (e) {}
    }

    // ====================== GOOGLE SEARCH ======================
    function similarity(a, b) {
        a = (a || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        b = (b || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!a || !b) return 0;
        if (a.includes(b) || b.includes(a)) return 0.92;
        let longer = a.length > b.length ? a : b;
        let shorter = a.length > b.length ? b : a;
        let m = 0;
        for (let c of shorter) if (longer.includes(c)) m++;
        return m / longer.length;
    }

    function getDomain(url) {
        try {
            return new URL(url.startsWith('http') ? url : 'https://' + url).hostname.replace(/^www\./, '');
        } catch {
            return (url || '').replace(/^www\./, '').split('/')[0];
        }
    }

    // ====================== AI PATEWAY (Claude vision): đọc ảnh từ khóa + domain ======================
    // Docs: https://pateway.ai/docs — Base https://api.pateway.ai/v1
    const DEFAULT_PATEWAY_KEY = 'sk-ptw-12HRGLsVqdzLdfnJ1UagmAfcz9G8eMBbwN6KS';

    function getPatewayKey() {
        try {
            return (GM_getValue('as_pateway_key', DEFAULT_PATEWAY_KEY) || DEFAULT_PATEWAY_KEY).trim();
        } catch (e) {
            return DEFAULT_PATEWAY_KEY;
        }
    }

    function assertPatewayKey() {
        const key = getPatewayKey();
        if (!key) throw new Error('Chưa có Pateway API key. Lấy tại pateway.ai console/keys');
        return key;
    }

    function gmFetchBinary(url) {
        return new Promise((resolve, reject) => {
            if (!url) return reject(new Error('no url'));
            if (url.startsWith('data:')) {
                try {
                    const m = url.match(/^data:([^;]+);base64,(.+)$/);
                    if (m) return resolve({ mime: m[1], b64: m[2] });
                } catch (e) {}
                return reject(new Error('bad data uri'));
            }
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                responseType: 'blob',
                onload: function (res) {
                    if (res.status < 200 || res.status >= 300) {
                        return reject(new Error('HTTP ' + res.status));
                    }
                    const blob = res.response;
                    const reader = new FileReader();
                    reader.onloadend = function () {
                        const dataUrl = reader.result || '';
                        const m = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
                        if (m) resolve({ mime: m[1], b64: m[2] });
                        else reject(new Error('read blob fail'));
                    };
                    reader.onerror = () => reject(new Error('FileReader error'));
                    reader.readAsDataURL(blob);
                },
                onerror: () => reject(new Error('GM_xmlhttpRequest error'))
            });
        });
    }

    function canvasFromImg(img) {
        return new Promise((resolve, reject) => {
            try {
                const w = img.naturalWidth || img.width;
                const h = img.naturalHeight || img.height;
                if (!w || !h) return reject(new Error('no size'));
                const c = document.createElement('canvas');
                c.width = w;
                c.height = h;
                const ctx = c.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const dataUrl = c.toDataURL('image/png');
                const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
                if (m) resolve({ mime: m[1], b64: m[2] });
                else reject(new Error('canvas fail'));
            } catch (e) {
                reject(e);
            }
        });
    }

    async function imgToInlineData(img) {
        const src = img.currentSrc || img.src || '';
        if (src.startsWith('data:')) return gmFetchBinary(src);
        try {
            return await canvasFromImg(img);
        } catch (e) {
            if (src.startsWith('http')) return gmFetchBinary(src);
            throw e;
        }
    }

    function pickInstructionImages() {
        const imgs = Array.from(document.querySelectorAll('img'));
        const scored = [];
        for (const img of imgs) {
            const w = img.naturalWidth || img.width || 0;
            const h = img.naturalHeight || img.height || 0;
            if (w < 80 || h < 30) continue;
            if (w > 2000 && h > 2000) continue;
            let score = 0;
            // Ảnh banner từ khóa / domain trên link4m thường ngang, vừa
            if (w > h * 1.5) score += 5;
            if (w >= 200 && w <= 900) score += 3;
            if (h >= 40 && h <= 200) score += 4;
            const alt = ((img.alt || '') + ' ' + (img.title || '') + ' ' + (img.src || '')).toLowerCase();
            if (/keyword|t[uừ]r?\s*kh[oó]a|domain|g[oợ]i\s*y[eế]/i.test(alt)) score += 8;
            // Gần chữ hướng dẫn
            try {
                const parentTxt = (img.closest('div,section,article,p') || img.parentElement || {}).textContent || '';
                if (/từ khoá|tu khoa|domain|gợi ý|goi y|tìm kiếm/i.test(parentTxt.slice(0, 400))) score += 6;
            } catch (e) {}
            if (score >= 5) scored.push({ img, score, w, h });
        }
        scored.sort((a, b) => b.score - a.score);
        // Lấy tối đa 4 ảnh tốt nhất
        return scored.slice(0, 4).map(x => x.img);
    }

    function callPatewayVision(partsInline, promptText) {
        return new Promise((resolve, reject) => {
            let key;
            try { key = assertPatewayKey(); } catch (e) { return reject(e); }

            // Anthropic Messages format (Claude vision) qua Pateway
            const content = [];
            for (const p of partsInline) {
                content.push({
                    type: 'image',
                    source: {
                        type: 'base64',
                        media_type: p.mime || 'image/png',
                        data: p.b64
                    }
                });
            }
            content.push({ type: 'text', text: promptText });

            const models = [
                'claude-sonnet-4-6',
                'claude-haiku-4-5',
                'claude-opus-4-6'
            ];

            const tryModel = (idx) => {
                if (idx >= models.length) {
                    return reject(new Error('Pateway/Claude lỗi hết các model vision'));
                }
                const body = JSON.stringify({
                    model: models[idx],
                    max_tokens: 512,
                    messages: [{ role: 'user', content: content }]
                });
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: 'https://api.pateway.ai/v1/messages',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': key,
                        'Authorization': 'Bearer ' + key,
                        'anthropic-version': '2023-06-01'
                    },
                    data: body,
                    onload: function (res) {
                        try {
                            const j = JSON.parse(res.responseText || '{}');
                            if (res.status < 200 || res.status >= 300) {
                                const msg = (j.error && (j.error.message || JSON.stringify(j.error))) || res.responseText || ('HTTP ' + res.status);
                                console.log('[Auto Tools] Pateway model', models[idx], 'lỗi:', String(msg).slice(0, 150));
                                return tryModel(idx + 1);
                            }
                            // Anthropic: content[].text
                            let t = '';
                            if (Array.isArray(j.content)) {
                                t = j.content.map(c => c.text || '').join('\n').trim();
                            } else if (j.choices) {
                                t = ((((j.choices || [])[0] || {}).message || {}).content || '').trim();
                            }
                            if (!t) return tryModel(idx + 1);
                            resolve(t);
                        } catch (e) {
                            tryModel(idx + 1);
                        }
                    },
                    onerror: function () {
                        tryModel(idx + 1);
                    }
                });
            };
            tryModel(0);
        });
    }

    function normalizeDomainHint(domain) {
        // healt***.co → healt | qq8***.agency → qq8
        // Chỉ lấy phần trước dấu * đầu tiên, bỏ * và phần sau *
        domain = String(domain || '').trim().replace(/^["']|["']$/g, '');
        if (!domain) return '';
        const star = domain.indexOf('*');
        if (star >= 0) domain = domain.slice(0, star);
        domain = domain.replace(/\.+$/, '').trim();
        return domain;
    }

    function parseAiKeywordDomain(text) {
        let keyword = '';
        let domain = '';
        const lines = String(text).split(/\n/).map(s => s.trim()).filter(Boolean);
        for (const line of lines) {
            const k = line.match(/^(?:keyword|t[uừ]r?\s*kh[oó]a)\s*[:=]\s*(.+)$/i);
            if (k) keyword = k[1].trim().replace(/^["']|["']$/g, '');
            const d = line.match(/^(?:domain|g[oợ]i\s*y[eế]|domain\s*g[oợ]i\s*y[eế])\s*[:=]\s*(.+)$/i);
            if (d) domain = d[1].trim().replace(/^["']|["']$/g, '');
        }
        try {
            const m = text.match(/\{[\s\S]*\}/);
            if (m) {
                const o = JSON.parse(m[0]);
                if (o.keyword) keyword = String(o.keyword).trim();
                if (o.domain) domain = String(o.domain).trim();
            }
        } catch (e) {}
        domain = normalizeDomainHint(domain);
        return { keyword, domain, raw: text };
    }

    // Bổ sung đọc chữ trên trang (không chỉ ảnh) — link4m hay ghi sẵn keyword + URL
    function scrapeKeywordDomainFromPage() {
        const body = (document.body && document.body.innerText) || '';
        let keyword = '';
        let domain = '';

        // "Gõ tìm từ khóa sv388" + dòng URL kế bên
        const mKw = body.match(/(?:gõ\s*tìm\s*)?từ\s*khóa\s*[:\s]+([^\n]{2,80})/i);
        if (mKw) keyword = mKw[1].trim();

        // URL đầy đủ trên trang
        const urls = body.match(/https?:\/\/[^\s<>"']+/gi) || [];
        const goodUrl = urls.find(u => !/google\.|facebook\.|link4m\.|what-on|gstatic/i.test(u));
        if (goodUrl) {
            const u = goodUrl.replace(/[.,;)\]]+$/, '');
            if (keyword && !keyword.includes(u) && !keyword.includes('http')) {
                keyword = (keyword + ' ' + u).trim();
            } else if (!keyword) {
                keyword = u;
            }
        }

        // Domain dạng healt***.co / qq8***.agency
        const mDom = body.match(/\b([a-z0-9][a-z0-9.-]*\*+[a-z0-9.*-]*)\b/i);
        if (mDom) domain = normalizeDomainHint(mDom[1]);

        // "Bấm vào website healt***.co"
        const mDom2 = body.match(/website\s+([a-z0-9.*-]+\.[a-z]{2,})/i);
        if (mDom2 && !domain) domain = normalizeDomainHint(mDom2[1]);

        return { keyword, domain };
    }

    async function aiFillKeywordFromImages(autoSearch) {
        const statusEl = document.getElementById('as-ai-status');
        const setSt = (t) => { if (statusEl) statusEl.textContent = t; console.log('[Auto Tools]', t); };

        setSt('Đang tìm ảnh hướng dẫn trên trang…');
        let imgs = pickInstructionImages();
        if (!imgs.length) {
            // Fallback: vài ảnh lớn nhất trên trang
            imgs = Array.from(document.querySelectorAll('img'))
                .filter(i => (i.naturalWidth || i.width) > 120)
                .sort((a, b) => ((b.naturalWidth || 0) * (b.naturalHeight || 0)) - ((a.naturalWidth || 0) * (a.naturalHeight || 0)))
                .slice(0, 3);
        }
        if (!imgs.length) {
            setSt('Không thấy ảnh để đọc');
            alert('Không tìm thấy ảnh từ khóa/domain trên trang này.');
            return;
        }

        setSt('Đang đọc ' + imgs.length + ' ảnh bằng Pateway/Claude…');
        const inlines = [];
        for (const img of imgs) {
            try {
                inlines.push(await imgToInlineData(img));
            } catch (e) {
                console.log('[Auto Tools] Bỏ ảnh:', e.message);
            }
        }
        if (!inlines.length) {
            setSt('Không đọc được dữ liệu ảnh');
            alert('Không chuyển được ảnh sang base64 (có thể bị chặn CORS).');
            return;
        }

        const prompt =
            'Bạn đang xem ảnh/hướng dẫn trên trang link rút gọn (link4m).\n' +
            'Trích đúng 2 mục, không giải thích:\n\n' +
            '1) keyword = TOÀN BỘ phần cần gõ vào ô tìm Google.\n' +
            '   - Gồm từ khóa (vd: sv388) VÀ URL nếu có cạnh đó (vd: https://healthli.co/vi-vn/).\n' +
            '   - Ví dụ đúng: keyword: sv388 https://healthli.co/vi-vn/\n' +
            '   - Không bỏ URL nếu ảnh/chữ có URL.\n\n' +
            '2) domain = phần gợi ý website, CHỈ lấy chữ TRƯỚC dấu * đầu tiên.\n' +
            '   - Ví dụ: healt***.co → domain: healt\n' +
            '   - Ví dụ: qq8***.agency → domain: qq8\n' +
            '   - Không ghi dấu *, không ghi phần sau *.\n\n' +
            'Trả về đúng 2 dòng:\n' +
            'keyword: ...\n' +
            'domain: ...';

        try {
            // 1) Đọc chữ trên trang trước (nhanh, chính xác với URL)
            const pageScrape = scrapeKeywordDomainFromPage();
            console.log('[Auto Tools] Scrape trang:', pageScrape);

            // 2) AI đọc ảnh
            const raw = await callPatewayVision(inlines, prompt);
            let { keyword, domain } = parseAiKeywordDomain(raw);

            // Ưu tiên ghép: AI + scrape trang
            if (pageScrape.keyword) {
                // Nếu AI thiếu URL mà trang có URL → thêm vào
                if (keyword && pageScrape.keyword.includes('http') && !keyword.includes('http')) {
                    keyword = pageScrape.keyword;
                } else if (!keyword) {
                    keyword = pageScrape.keyword;
                } else if (pageScrape.keyword.length > keyword.length && pageScrape.keyword.includes(keyword.split(/\s+/)[0])) {
                    keyword = pageScrape.keyword;
                }
            }
            if (!domain && pageScrape.domain) domain = pageScrape.domain;
            domain = normalizeDomainHint(domain);

            setSt('AI: ' + (keyword || '(trống)') + ' | ' + (domain || '(trống)'));

            const kEl = document.getElementById('as-keyword');
            const dEl = document.getElementById('as-domain');
            if (kEl && keyword) kEl.value = keyword;
            if (dEl && domain) dEl.value = domain;

            if (!keyword) {
                alert('AI chưa đọc được từ khóa. Thử cuộn tới phần hướng dẫn rồi bấm lại.\n\nRaw:\n' + raw.slice(0, 300));
                return;
            }

            if (autoSearch) {
                startSmartSearch(keyword, domain);
            }
        } catch (e) {
            // Fallback: chỉ scrape trang nếu AI lỗi
            try {
                const pageScrape = scrapeKeywordDomainFromPage();
                if (pageScrape.keyword) {
                    const kEl = document.getElementById('as-keyword');
                    const dEl = document.getElementById('as-domain');
                    if (kEl) kEl.value = pageScrape.keyword;
                    if (dEl && pageScrape.domain) dEl.value = pageScrape.domain;
                    setSt('Scrape trang: ' + pageScrape.keyword + ' | ' + (pageScrape.domain || ''));
                    if (autoSearch) startSmartSearch(pageScrape.keyword, pageScrape.domain);
                    return;
                }
            } catch (e2) {}
            setSt('Lỗi Pateway: ' + e.message);
            alert('Lỗi Pateway: ' + e.message);
        }
    }

    function startSmartSearch(keyword, domain, newTab) {
        if (!keyword) return alert('Nhập từ khóa trước!');
        try { stopScroll(); } catch (e) {}
        GM_setValue('as_original_url', location.href);
        GM_setValue('as_smart_keyword', keyword);
        GM_setValue('as_smart_domain', domain || '');
        GM_setValue('as_smart_target_url', '');
        GM_setValue('as_smart_time', Date.now());
        GM_setValue('as_force_layma', true);
        const url = 'https://www.google.com/search?q=' + encodeURIComponent(keyword) + '&hl=vi';
        if (newTab) {
            // Giữ tab hiện tại (link4m) — đặt tên cửa sổ để sau có thể focus lại
            try {
                if (!window.name || window.name.indexOf('as_origin_') !== 0) {
                    window.name = 'as_origin_' + Date.now();
                }
                GM_setValue('as_origin_window_name', window.name);
                GM_setValue('as_keep_origin_tab', true);
                GM_setValue('as_origin_tab_alive', Date.now());
            } catch (e) {}
            const w = window.open(url, '_blank');
            if (!w) {
                alert('Trình duyệt chặn popup. Cho phép popup hoặc dùng “Tìm Google (cùng tab)”.');
                try {
                    GM_deleteValue('as_keep_origin_tab');
                } catch (e) {}
            } else {
                try { w.focus(); } catch (e) {}
                console.log('[Auto Tools] Đã mở Google tab mới — tab link4m vẫn giữ nguyên');
            }
        } else {
            try {
                GM_deleteValue('as_keep_origin_tab');
                GM_deleteValue('as_origin_window_name');
            } catch (e) {}
            location.href = url;
        }
    }

    // Mở link qua Google để có referrer (what-on hay bắt buộc)
    function openViaGoogle(targetUrl) {
        targetUrl = (targetUrl || '').trim();
        if (!targetUrl) return alert('Dán link trước!');
        if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl;

        let domain = '';
        try { domain = new URL(targetUrl).hostname.replace(/^www\./, ''); } catch (e) {}

        try { stopScroll(); } catch (e) {}
        GM_setValue('as_original_url', location.href);
        GM_setValue('as_smart_keyword', targetUrl);
        GM_setValue('as_smart_domain', domain);
        GM_setValue('as_smart_target_url', targetUrl);
        GM_setValue('as_smart_time', Date.now());
        GM_setValue('as_force_layma', true);
        GM_setValue('as_natural_visit', true); // trang đích: warm-up như người

        // Search URL → click kết quả Google (referrer chuẩn cho what-on)
        location.href = 'https://www.google.com/search?q=' + encodeURIComponent(targetUrl) + '&hl=vi';
    }

    // Mở tab mới → gõ URL từng chữ (như gõ mã) → Enter vào web
    // (Không điều khiển được thanh địa chỉ Chrome; dùng trang giả lập ô URL)
    function openDirectTypeUrl(targetUrl, sameTab) {
        targetUrl = (targetUrl || '').trim();
        if (!targetUrl) return alert('Dán link trước!');
        if (!/^https?:\/\//i.test(targetUrl)) targetUrl = 'https://' + targetUrl;

        try { stopScroll(); } catch (e) {}
        GM_setValue('as_original_url', location.href);
        GM_setValue('as_force_layma', true);
        GM_setValue('as_natural_visit', true);

        const safeUrl = JSON.stringify(targetUrl);
        const page = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Đang mở…</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
.box{width:100%;max-width:520px;background:#1e293b;border-radius:16px;padding:20px;box-shadow:0 10px 40px rgba(0,0,0,.4)}
h1{font-size:15px;color:#94a3b8;margin-bottom:12px;font-weight:600}
.bar{display:flex;gap:8px;align-items:center;background:#0f172a;border:1px solid #334155;border-radius:12px;padding:10px 12px}
.bar span{color:#64748b;font-size:13px}
#u{flex:1;background:transparent;border:0;outline:0;color:#f8fafc;font-size:15px;font-family:ui-monospace,monospace}
#go{background:#3b82f6;color:#fff;border:0;border-radius:10px;padding:10px 16px;font-weight:700;cursor:pointer}
#st{margin-top:12px;font-size:12px;color:#94a3b8;min-height:18px}
.cur{display:inline-block;width:2px;height:1em;background:#3b82f6;margin-left:1px;animation:b 1s step-end infinite;vertical-align:text-bottom}
@keyframes b{50%{opacity:0}}
</style></head><body>
<div class="box">
  <h1>🔒 Nhập địa chỉ (tự gõ từng chữ)</h1>
  <div class="bar">
    <span>🌐</span>
    <input id="u" readonly value="" autocomplete="off">
    <button id="go" type="button">Đi</button>
  </div>
  <div id="st">Đang mở bàn phím…</div>
</div>
<script>
(function(){
  var url = ${safeUrl};
  var input = document.getElementById('u');
  var st = document.getElementById('st');
  var go = document.getElementById('go');
  var i = 0;
  function navigate(){
    st.textContent = 'Đang vào trang…';
    location.replace(url);
  }
  go.onclick = navigate;
  input.addEventListener('keydown', function(e){
    if (e.key === 'Enter') navigate();
  });
  setTimeout(function typeNext(){
    if (i >= url.length) {
      st.textContent = 'Xong — nhấn Đi / Enter…';
      setTimeout(navigate, 450);
      return;
    }
    input.value += url.charAt(i);
    i++;
    st.textContent = 'Đang gõ… ' + i + '/' + url.length;
    setTimeout(typeNext, 35 + Math.floor(Math.random() * 55));
  }, 500);
})();
</script>
</body></html>`;

        if (sameTab) {
            document.open();
            document.write(page);
            document.close();
            return;
        }

        const w = window.open('about:blank', '_blank');
        if (!w) {
            alert('Trình duyệt chặn popup. Cho phép popup hoặc dùng “Cùng tab (gõ URL)”.');
            return;
        }
        try {
            w.document.open();
            w.document.write(page);
            w.document.close();
            w.focus();
        } catch (e) {
            // Fallback: blob URL
            try {
                const blob = new Blob([page], { type: 'text/html' });
                const blobUrl = URL.createObjectURL(blob);
                w.location.href = blobUrl;
            } catch (e2) {
                w.location.href = targetUrl;
            }
        }
    }

    // Sau khi vào site đích: hành vi giống người (chờ → cuộn nhẹ 1–2 cái → tìm LẤY MÃ)
    async function naturalVisitWarmup() {
        if (!GM_getValue('as_natural_visit', false)) return;
        if (location.hostname.includes('google.') || isLink4mHost()) return;
        GM_deleteValue('as_natural_visit');
        try { stopScroll(); } catch (e) {}

        console.log('[Auto Tools] Natural visit: chờ trang load…');
        await new Promise(r => setTimeout(r, 1800 + Math.random() * 800));

        // Cuộn nhẹ vài đoạn (không bật loop)
        try {
            const h = Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0);
            const steps = [0.25, 0.5, 0.75, 0.95];
            for (const p of steps) {
                window.scrollTo({ top: h * p, behavior: 'smooth' });
                await new Promise(r => setTimeout(r, 700 + Math.random() * 400));
            }
            // Lên lại giữa trang một chút
            window.scrollTo({ top: h * 0.6, behavior: 'smooth' });
            await new Promise(r => setTimeout(r, 600));
        } catch (e) {}

        // Fake focus / mousemove nhẹ
        try {
            window.focus();
            document.dispatchEvent(new MouseEvent('mousemove', {
                bubbles: true, clientX: 120 + Math.random() * 80, clientY: 200 + Math.random() * 100
            }));
        } catch (e) {}

        console.log('[Auto Tools] Natural visit xong — chờ widget LẤY MÃ');
    }
    // Chạy warm-up sớm trên trang đích
    if (typeof GM_getValue === 'function') {
        try {
            if (GM_getValue('as_natural_visit', false) && !location.hostname.includes('google.')) {
                if (document.body) naturalVisitWarmup();
                else document.addEventListener('DOMContentLoaded', () => naturalVisitWarmup());
            }
        } catch (e) {}
    }

    if (location.hostname.includes('google.') && location.pathname.includes('/search')) {
        const keyword = GM_getValue('as_smart_keyword', '');
        const suggested = GM_getValue('as_smart_domain', '');
        const targetUrl = GM_getValue('as_smart_target_url', '');
        const time = GM_getValue('as_smart_time', 0);

        if (keyword && Date.now() - time < 180000) {
            let tried = 0;
            const tryClick = () => {
                tried++;
                let best = null, bestScore = -1;

                document.querySelectorAll('a').forEach(a => {
                    let href = a.href;
                    if (!href || href.includes('google.') || href.includes('webcache') || href.includes('accounts.google') || href.includes('maps.google')) return;
                    let real = href;
                    try {
                        const u = new URL(href);
                        if (u.pathname === '/url' && u.searchParams.get('q')) real = u.searchParams.get('q');
                    } catch {}
                    const domain = getDomain(real);
                    if (!domain || domain.length < 4) return;

                    let score = 0;
                    // Ưu tiên khớp đúng URL đích
                    if (targetUrl) {
                        const norm = (s) => (s || '').toLowerCase().replace(/\/$/, '').replace(/^https?:\/\//, '').replace(/^www\./, '');
                        const nt = norm(targetUrl);
                        const nr = norm(real);
                        if (nr === nt || nr.startsWith(nt) || nt.startsWith(nr)) score = 1;
                        else if (domain === suggested) score = 0.85;
                        else score = similarity(domain, suggested || '');
                    } else {
                        score = suggested ? similarity(domain, suggested) : 0.5;
                    }

                    if (score > bestScore) {
                        bestScore = score;
                        best = a;
                    }
                });

                if (best && bestScore > 0.28) {
                    GM_deleteValue('as_smart_keyword');
                    GM_deleteValue('as_smart_domain');
                    GM_deleteValue('as_smart_target_url');
                    GM_deleteValue('as_smart_time');
                    console.log('[Auto Tools] Click kết quả Google, score:', bestScore, best.href);
                    best.click();
                } else if (tried < 12) {
                    setTimeout(tryClick, 1000);
                } else {
                    console.log('[Auto Tools] Không tìm thấy kết quả phù hợp trên Google');
                }
            };
            setTimeout(tryClick, 2200 + Math.floor(Math.random()*800));
        }
    }

    // ====================== CLICK LẤY MÃ — mọi phương án khả thi ======================
    // what-on: clickHandler = ontouchstart ? "touchstart" : "click"
    const preferTouch = ('ontouchstart' in document.documentElement);

    function fireTouch(el, type, x, y) {
        try {
            const touchObj = new Touch({
                identifier: Date.now() % 100000,
                target: el,
                clientX: x,
                clientY: y,
                pageX: x + (window.scrollX || 0),
                pageY: y + (window.scrollY || 0),
                screenX: (window.screenX || 0) + x,
                screenY: (window.screenY || 0) + y,
                radiusX: 10,
                radiusY: 10,
                rotationAngle: 0,
                force: 1
            });
            return el.dispatchEvent(new TouchEvent(type, {
                bubbles: true,
                cancelable: true,
                composed: true,
                view: window,
                touches: type === 'touchend' || type === 'touchcancel' ? [] : [touchObj],
                targetTouches: type === 'touchend' || type === 'touchcancel' ? [] : [touchObj],
                changedTouches: [touchObj]
            }));
        } catch (e) {
            return false;
        }
    }

    function fireMouse(el, type, x, y) {
        const opts = {
            view: window,
            bubbles: true,
            cancelable: true,
            composed: true,
            clientX: x,
            clientY: y,
            screenX: (window.screenX || 0) + x,
            screenY: (window.screenY || 0) + y,
            button: 0,
            buttons: (type === 'mouseup' || type === 'click') ? 0 : 1,
            which: 1,
            detail: type === 'click' ? 1 : 0
        };
        try {
            if (type.startsWith('pointer')) {
                el.dispatchEvent(new PointerEvent(type, Object.assign({}, opts, {
                    pointerId: 1,
                    pointerType: preferTouch ? 'touch' : 'mouse',
                    isPrimary: true,
                    pressure: type.indexOf('up') >= 0 ? 0 : 0.5
                })));
            } else {
                el.dispatchEvent(new MouseEvent(type, opts));
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    function sequenceOn(el, x, y) {
        if (!el) return;
        // Touch (what-on mobile/laptop touch)
        fireTouch(el, 'touchstart', x, y);
        fireMouse(el, 'pointerover', x, y);
        fireMouse(el, 'pointerenter', x, y);
        fireMouse(el, 'mouseover', x, y);
        fireMouse(el, 'mouseenter', x, y);
        fireMouse(el, 'pointerdown', x, y);
        fireMouse(el, 'mousedown', x, y);
        fireTouch(el, 'touchend', x, y);
        fireMouse(el, 'pointerup', x, y);
        fireMouse(el, 'mouseup', x, y);
        fireMouse(el, 'click', x, y);
        try { el.click(); } catch (e) {}
        try { el.focus(); } catch (e) {}
    }

    // Gọi handler đã bắt trong page context (quan trọng nhất)
    function pageWin() {
        try {
            return (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
        } catch (e) {
            return window;
        }
    }

    function invokeCapturedHandlers(el) {
        try {
            const w = pageWin();
            const fn = w.__asInvokeHandlers;
            if (typeof fn === 'function') {
                const ok = fn(el);
                console.log('[Auto Tools] Invoke handler page-context:', ok);
                return !!ok;
            }
            console.log('[Auto Tools] Chưa có __asInvokeHandlers (hook chưa gắn / widget chưa load)');
        } catch (e) {
            console.log('[Auto Tools] Invoke handler lỗi:', e.message);
        }
        return false;
    }

    function forcePhysicalClick(el) {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;

        const x = Math.max(2, Math.min(window.innerWidth - 2, rect.left + rect.width / 2));
        const y = Math.max(2, Math.min(window.innerHeight - 2, rect.top + rect.height / 2));

        console.log('[Auto Tools] forcePhysicalClick →', el.tagName, (el.textContent || '').trim().slice(0, 24));

        // A) Gọi thẳng listener what-on (bypass isTrusted)
        invokeCapturedHandlers(el);

        // B) Full sequence trên chính nút
        sequenceOn(el, x, y);

        // C) Trên phần tử con (span LẤY MÃ / img)
        try {
            el.querySelectorAll('span, img, div, b, strong').forEach(function (inner) {
                const ir = inner.getBoundingClientRect();
                if (ir.width < 3 || ir.height < 3) return;
                const ix = ir.left + ir.width / 2;
                const iy = ir.top + ir.height / 2;
                invokeCapturedHandlers(inner);
                sequenceOn(inner, ix, iy);
            });
        } catch (e) {}

        // D) elementFromPoint tại tâm + vài offset
        const offsets = [[0, 0], [0, -5], [0, 5], [-8, 0], [8, 0], [-6, -6], [6, 6]];
        offsets.forEach(function (d) {
            const px = Math.round(x + d[0]);
            const py = Math.round(y + d[1]);
            if (px < 0 || py < 0 || px >= window.innerWidth || py >= window.innerHeight) return;
            const hit = document.elementFromPoint(px, py);
            if (!hit) return;
            invokeCapturedHandlers(hit);
            sequenceOn(hit, px, py);
        });

        // E) jQuery trigger nếu trang có jQuery (what-on hay load jQ)
        try {
            const w = pageWin();
            const jq = w.jQuery || w.$;
            if (jq && jq(el).length) {
                jq(el).trigger('touchstart').trigger('mousedown').trigger('click');
                console.log('[Auto Tools] jQuery trigger');
            }
        } catch (e) {}

        // F) Parent #BuURfz / button gần nhất
        try {
            const btn = el.closest('button') || el;
            if (btn !== el) {
                invokeCapturedHandlers(btn);
                sequenceOn(btn, x, y);
            }
        } catch (e) {}

        return true;
    }

    // ====================== TÌM NÚT LẤY MÃ ======================
    function findLayMaButton() {
        // Bỏ qua nút nằm trong ảnh hướng dẫn / ví dụ (thường không click được)
        const isInExampleImage = (el) => {
            if (!el) return true;
            if (el.closest('figure, picture, .wp-block-image')) return true;
            // Nút thật what-on thường trong #BuURfz hoặc có style đỏ inline
            return false;
        };

        const containers = [
            document.getElementById('BuURfz'),
            ...document.querySelectorAll('[id*="BuURfz"], [id*="what-on"], [class*="what-on"], .whatoncode-wrapper')
        ].filter(Boolean);

        for (const box of containers) {
            let btn = box.querySelector('button img[src*="what-on"], a img[src*="what-on"], img[src*="what-on"]');
            if (btn) {
                btn = btn.closest('button') || btn.closest('a') || btn.closest('[role="button"]') || btn.parentElement || btn;
                if (btn && (btn.offsetWidth > 10 || btn.offsetHeight > 10)) return btn;
            }

            const all = box.querySelectorAll('button, a, div, span, [role="button"]');
            for (const el of all) {
                const txt = (el.textContent || '').trim().toUpperCase();
                if (txt.includes('LẤY MÃ') || txt.includes('LAY MA') || txt.includes('L4M') || txt === 'LẤY MÃ') {
                    const target = el.closest('button') || el.closest('a') || el.closest('[role="button"]') || el;
                    if (target && (target.offsetWidth > 10 || target.offsetHeight > 10)) return target;
                }
            }

            const reds = box.querySelectorAll('button, a, [role="button"]');
            for (const b of reds) {
                let bg = '';
                try { bg = (getComputedStyle(b).backgroundColor || '').toLowerCase(); } catch (e) {}
                const styleAttr = (b.getAttribute('style') || '').toLowerCase();
                if (
                    bg.includes('237, 28, 36') || bg.includes('ed1c24') ||
                    styleAttr.includes('237, 28, 36') || styleAttr.includes('#ed1c24') ||
                    bg.includes('220, 53, 69') || bg.includes('255, 0') ||
                    styleAttr.includes('background') && styleAttr.includes('red')
                ) {
                    if (b.offsetWidth > 20 && b.offsetHeight > 15) return b;
                }
            }
        }

        let btn = document.querySelector('button img[src*="what-on.com"], a img[src*="what-on.com"], img[src*="what-on.com"]');
        if (btn) {
            btn = btn.closest('button') || btn.closest('a') || btn.closest('[role="button"]') || btn.parentElement;
            if (btn && (btn.offsetWidth > 10 || btn.offsetHeight > 10)) return btn;
        }

        // Nút đỏ "LẤY MÃ" / "L4M LẤY MÃ" trên toàn trang (ưu tiên cuối trang)
        const candidates = Array.from(document.querySelectorAll('button, a, div[role="button"], span'));
        let best = null;
        let bestTop = -1;
        for (const el of candidates) {
            const txt = (el.textContent || '').trim().toUpperCase().replace(/\s+/g, ' ');
            if (!(txt.includes('LẤY MÃ') || txt === 'LẤY MÃ' || (txt.includes('L4M') && txt.includes('MÃ')))) continue;
            if (txt.length > 50) continue;
            const target = el.closest('button') || el.closest('a') || el.closest('[role="button"]') || el;
            if (!target || target.offsetWidth < 10 || target.offsetHeight < 10) continue;
            // Bỏ nút chỉ là ảnh minh họa trong bài link4m (nằm trong img map hiếm)
            const top = target.getBoundingClientRect().top + (window.scrollY || 0);
            if (top >= bestTop) {
                bestTop = top;
                best = target;
            }
        }
        if (best) return best;

        return null;
    }

    // Trên trang link4m: đọc "Copy link xxx" → mở site đích qua Google (tab mới)
    function handleLink4mMission() {
        if (!location.hostname.includes('link4m')) return;

        // Tìm domain trong "Copy link vn88b.co.com" hoặc tương tự
        const bodyText = document.body ? document.body.innerText : '';
        let target = '';
        const m = bodyText.match(/Copy\s*link\s+([a-z0-9][a-z0-9.-]+\.[a-z]{2,})/i);
        if (m) target = m[1];
        if (!target) {
            const m2 = bodyText.match(/Bước\s*1:[^\n]*?([a-z0-9][a-z0-9.-]+\.[a-z]{2,})/i);
            if (m2) target = m2[1];
        }
        if (!target) return;

        // Hiện nút nhanh trên panel / auto gợi ý
        window.__asLink4mTarget = target.startsWith('http') ? target : ('https://' + target);
        console.log('[Auto Tools] Link4m nhiệm vụ — site đích:', window.__asLink4mTarget);

        // Thêm nút nổi "Mở site nhiệm vụ qua Google"
        if (document.getElementById('as-l4m-open')) return;
        const b = document.createElement('button');
        b.id = 'as-l4m-open';
        b.textContent = 'Mở ' + target + ' qua Google';
        b.style.cssText = 'position:fixed;bottom:80px;right:12px;z-index:2147483646;padding:10px 14px;background:#16a34a;color:#fff;border:none;border-radius:10px;font-weight:700;font-size:13px;box-shadow:0 4px 14px rgba(0,0,0,.35);max-width:70vw';
        b.onclick = () => {
            const url = window.__asLink4mTarget;
            GM_setValue('as_original_url', location.href);
            GM_setValue('as_force_layma', true);
            if (typeof openViaGoogle === 'function') {
                openViaGoogle(url);
            } else {
                GM_setValue('as_smart_keyword', url);
                GM_setValue('as_smart_domain', target.replace(/^www\./, ''));
                GM_setValue('as_smart_target_url', url);
                GM_setValue('as_smart_time', Date.now());
                location.href = 'https://www.google.com/search?q=' + encodeURIComponent(url) + '&hl=vi';
            }
        };
        (document.body || document.documentElement).appendChild(b);
    }
    setTimeout(handleLink4mMission, 1500);

    // ====================== AUTO CLICK LẤY MÃ (không spam, không đơ) ======================
    function autoClickLayMa() {
        if (location.hostname.includes('google.') && location.pathname.includes('/search')) return;
        // Trên link4m không auto click / không kéo trang (tránh vuốt liên tục)
        if (isLink4mHost()) {
            try { stopScroll(); } catch (e) {}
            return;
        }

        const pageKey = 'as_layma_' + location.hostname + location.pathname;

        if (GM_getValue('as_force_layma', false)) {
            GM_deleteValue(pageKey);
            GM_deleteValue('as_force_layma');
            console.log('[Auto Tools] Force tìm LẤY MÃ (auto=' + autoLayMaEnabled + ')');
        }

        if (GM_getValue(pageKey, false)) {
            return;
        }

        if (!autoLayMaEnabled) {
            console.log('[Auto Tools] Auto LẤY MÃ đang tắt (đã lưu config) — bỏ qua');
            return;
        }

        let clicked = false;
        let attempts = 0;
        const maxAttempts = 8;
        const startTime = Date.now();
        const maxWait = 90000;

        function scrollToBottomOnce(cb) {
            try {
                const h = Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0);
                window.scrollTo({ top: Math.max(0, h * 0.92), behavior: 'smooth' });
                setTimeout(() => { if (cb) cb(); }, 900);
            } catch (e) { if (cb) cb(); }
        }

        // Chờ natural warm-up (nếu có) rồi mới tìm nút — không loop cuộn
        setTimeout(() => {
            try { stopScroll(); } catch (e) {}
            wakePageOnce();
            scrollToBottomOnce(() => console.log('[Auto Tools] Đã kéo gần cuối trang (1 lần) tìm LẤY MÃ'));
        }, GM_getValue('as_natural_visit', false) ? 4500 : 2000);

        const doOneClick = (btn) => {
            if (!btn || clicked || autoLayMaBusy || !autoLayMaEnabled) return;
            autoLayMaBusy = true;
            attempts++;

            try {
                console.log('[Auto Tools] Lần thử', attempts, '— cuộn tới nút, chờ 3s rồi click');
                btn.scrollIntoView({ behavior: 'smooth', block: 'center' });

                setTimeout(() => {
                    if (clicked || !autoLayMaEnabled) {
                        autoLayMaBusy = false;
                        return;
                    }

                    const fresh = findLayMaButton() || btn;
                    const rect = fresh.getBoundingClientRect();
                    if (rect.width <= 0 || rect.top < -50 || rect.top > window.innerHeight + 50) {
                        fresh.scrollIntoView({ behavior: 'instant', block: 'center' });
                    }

                    setTimeout(() => {
                        if (clicked || !autoLayMaEnabled) {
                            autoLayMaBusy = false;
                            return;
                        }

                        const el = findLayMaButton() || fresh;
                        const r = el.getBoundingClientRect();
                        console.log('[Auto Tools] Click tọa độ', Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));

                        forcePhysicalClick(el);

                        // Chỉ bật cuộn khi isCountdownVisible() chắc chắn (tránh tự cuộn oan)
                        setTimeout(() => {
                            if (isCountdownVisible()) {
                                console.log('[Auto Tools] ✅ Đếm ngược đã bắt đầu — tự kéo lên chậm');
                                startScroll({ countdown: true });
                            } else {
                                console.log('[Auto Tools] ⚠️ Chưa thấy đếm ngược — không bật cuộn');
                            }
                        }, 800);

                        clicked = true;
                        GM_setValue(pageKey, true);
                        // Chỉ tắt auto trên phiên trang này — giữ preference đã lưu
                        autoLayMaBusy = false;
                        updateSwitch();
                        console.log('[Auto Tools] ✅ Đã gửi touch/click LẤY MÃ');
                    }, 250);
                }, 3000);
            } catch (err) {
                autoLayMaBusy = false;
                console.log('[Auto Tools] Lỗi:', err);
            }
        };

        const tryFind = () => {
            if (clicked || !autoLayMaEnabled) return;
            if (autoLayMaBusy) return;
            if (Date.now() - startTime > maxWait) {
                console.log('[Auto Tools] Hết thời gian chờ nút LẤY MÃ');
                autoLayMaEnabled = false;
                updateSwitch();
                return;
            }
            if (attempts >= maxAttempts) {
                console.log('[Auto Tools] Đã thử đủ', maxAttempts, 'lần — dừng');
                autoLayMaEnabled = false;
                updateSwitch();
                return;
            }

            const btn = findLayMaButton();
            if (btn) {
                doOneClick(btn);
            }
        };

        // Chờ widget load rồi mới tìm — interval thưa (4s), không 2s
        setTimeout(tryFind, 2500);
        const timer = setInterval(() => {
            if (clicked || !autoLayMaEnabled || Date.now() - startTime > maxWait) {
                clearInterval(timer);
                return;
            }
            tryFind();
        }, 4000);

        // Observer chỉ theo dõi #BuURfz (không observe cả document → đỡ lag)
        try {
            const box = document.getElementById('BuURfz');
            if (box) {
                const observer = new MutationObserver(() => {
                    if (!clicked && autoLayMaEnabled && !autoLayMaBusy) tryFind();
                });
                observer.observe(box, { childList: true, subtree: true });
                setTimeout(() => observer.disconnect(), maxWait);
            }
        } catch (e) {}

        // User focus lại tab → thử 1 lần (không spam)
        window.addEventListener('focus', () => {
            if (!clicked && autoLayMaEnabled && !autoLayMaBusy && attempts < maxAttempts) {
                setTimeout(tryFind, 600);
            }
        }, { once: false });
    }

    autoClickLayMa();

    // ====================== DÁN MÃ + TIẾP TỤC (chờ captcha, không mở popup) ======================
    // Không lấy ô trong panel tool (#as-code placeholder "Nhập mã..." hay dính selector)
    function isToolUiElement(el) {
        if (!el) return true;
        try {
            if (el.id === 'as-code' || el.id === 'as-keyword' || el.id === 'as-domain' ||
                el.id === 'as-direct-link' || el.id === 'as-pateway-key' ||
                el.id === 'as-amount' || el.id === 'as-delay') return true;
            if (el.closest && el.closest('#as-panel, #as-btn, #as-style')) return true;
        } catch (e) {}
        return false;
    }

    function findPasswordInput() {
        const selectors = [
            'input[name="password"].password',
            'input.password[placeholder*="Nhập mã"]',
            'input[name="password"][maxlength="6"]',
            'input[name="password"]',
            'input[type="text"][maxlength="6"]',
            'input[placeholder*="mã"]',
            'input[placeholder*="Mã"]',
            'input[placeholder*="code"]',
            'input.form-control.password',
            '#main-form input[name="password"]'
        ];
        for (const sel of selectors) {
            const list = document.querySelectorAll(sel);
            for (const input of list) {
                if (isToolUiElement(input)) continue;
                if (input && (input.offsetParent !== null || input.getClientRects().length)) return input;
            }
        }
        return null;
    }

    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    // Gõ mã tự nhiên: focus → xóa → từng ký tự như bàn phím
    async function fillCodeNatural(code) {
        code = String(code || '').trim();
        if (!code) return false;
        const input = findPasswordInput();
        if (!input) return false;

        try {
            input.scrollIntoView({ block: 'center', behavior: 'smooth' });
            await sleep(400);
            input.focus();
            input.click();
            await sleep(350);
            input.select();
            try { input.setSelectionRange(0, (input.value || '').length); } catch (e) {}
            await sleep(150);
            try { document.execCommand('selectAll', false, null); } catch (e) {}
            try { document.execCommand('delete', false, null); } catch (e) {}
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await sleep(200);

            for (let i = 0; i < code.length; i++) {
                const ch = code[i];
                try {
                    input.dispatchEvent(new KeyboardEvent('keydown', {
                        key: ch, keyCode: ch.charCodeAt(0), which: ch.charCodeAt(0), bubbles: true, cancelable: true
                    }));
                } catch (e) {}
                let inserted = false;
                try { inserted = document.execCommand('insertText', false, ch); } catch (e) {}
                if (!inserted) {
                    try {
                        const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                        nativeSet.call(input, (input.value || '') + ch);
                    } catch (e) {
                        input.value = (input.value || '') + ch;
                    }
                }
                try {
                    input.dispatchEvent(new InputEvent('input', {
                        bubbles: true, cancelable: true, data: ch, inputType: 'insertText'
                    }));
                } catch (e) {
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
                try {
                    input.dispatchEvent(new KeyboardEvent('keyup', {
                        key: ch, keyCode: ch.charCodeAt(0), which: ch.charCodeAt(0), bubbles: true
                    }));
                } catch (e) {}
                await sleep(70 + Math.floor(Math.random() * 90));
            }

            await sleep(200);
            input.dispatchEvent(new Event('change', { bubbles: true }));
            try {
                const w = pageWin();
                if (w.jQuery) w.jQuery(input).trigger('input').trigger('change');
            } catch (e) {}
            input.focus();
            console.log('[Auto Tools] Đã gõ mã tự nhiên:', code);
            return true;
        } catch (e) {
            console.log('[Auto Tools] fillCodeNatural lỗi:', e);
            try {
                input.value = code;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            } catch (e2) { return false; }
        }
    }

    function fillCode(code) {
        const input = findPasswordInput();
        if (!input) return false;
        try {
            input.focus();
            input.value = code;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        } catch (e) { return false; }
    }

    function findContinueLink() {
        // Ưu tiên link4m: a.get-link
        let el = document.querySelector('a.get-link, a.btn.get-link, #main-form a.btn-success');
        if (el) return el;
        const all = document.querySelectorAll('a, button, input[type="submit"], div[role="button"]');
        for (const btn of all) {
            const text = (btn.textContent || btn.value || '').trim().toLowerCase();
            if (text.includes('click vào đây để tiếp tục') || text === 'tiếp tục' || text.includes('để tiếp tục')) {
                return btn;
            }
        }
        return null;
    }

    function hasCaptchaToken() {
        try {
            const areas = document.querySelectorAll('textarea.g-recaptcha-response, #g-recaptcha-response, textarea[name="g-recaptcha-response"]');
            for (const a of areas) {
                if ((a.value || '').trim().length > 20) return true;
            }
            if (document.querySelector('.recaptcha-checkbox-checked, [aria-checked="true"]')) return true;
        } catch (e) {}
        return false;
    }

    // Click captcha từ trang cha (iframe + widget)
    function clickRecaptchaCheckbox() {
        try {
            GM_setValue('as_need_captcha_click', true);
        } catch (e) {}

        let clicked = false;

        // 1) Widget cùng trang (hiếm)
        const local = document.querySelector(
            '.recaptcha-checkbox-border, .recaptcha-checkbox, #recaptcha-anchor, span[role="checkbox"]'
        );
        if (local) {
            try {
                local.scrollIntoView({ block: 'center', behavior: 'smooth' });
                local.click();
                local.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                clicked = true;
                console.log('[Auto Tools] Click captcha local');
            } catch (e) {}
        }

        // 2) Click vào iframe reCAPTCHA (góc checkbox ~ trái trên)
        const iframes = document.querySelectorAll(
            'iframe[src*="recaptcha"], iframe[title*="reCAPTCHA"], iframe[title*="recaptcha"]'
        );
        iframes.forEach((iframe) => {
            try {
                iframe.scrollIntoView({ block: 'center', behavior: 'smooth' });
                const r = iframe.getBoundingClientRect();
                // Checkbox nằm gần góc trái của anchor iframe
                const x = Math.min(r.left + 28, r.right - 4);
                const y = Math.min(r.top + 28, r.bottom - 4);
                const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
                iframe.focus();
                iframe.click();
                iframe.dispatchEvent(new MouseEvent('mousedown', opts));
                iframe.dispatchEvent(new MouseEvent('mouseup', opts));
                iframe.dispatchEvent(new MouseEvent('click', opts));
                clicked = true;
                console.log('[Auto Tools] Click iframe reCAPTCHA');
            } catch (e) {}
        });

        // 3) Click container g-recaptcha
        const box = document.querySelector('#recaptcha, .g-recaptcha, .rc-anchor');
        if (box) {
            try {
                box.scrollIntoView({ block: 'center', behavior: 'smooth' });
                box.click();
                clicked = true;
            } catch (e) {}
        }

        // 4) Thử grecaptcha API
        try {
            const w = pageWin();
            if (w.grecaptcha && typeof w.grecaptcha.execute === 'function') {
                // Checkbox type thường không execute; bỏ qua nếu lỗi
            }
        } catch (e) {}

        return clicked;
    }

    function isContinueEnabled(el) {
        if (!el) return false;
        if (el.classList.contains('disabled')) return false;
        if (el.hasAttribute('disabled')) return false;
        if (el.getAttribute('aria-disabled') === 'true') return false;
        if (/\bdisabled\b/i.test((el.className || '').toString())) return false;
        return true;
    }

    function unlockContinue(el) {
        if (!el) return;
        try {
            el.classList.remove('disabled');
            el.removeAttribute('disabled');
            el.removeAttribute('aria-disabled');
            el.style.setProperty('pointer-events', 'auto', 'important');
            el.style.setProperty('opacity', '1', 'important');
            el.style.setProperty('cursor', 'pointer', 'important');
            el.style.setProperty('filter', 'none', 'important');
            if (el.tagName === 'A') {
                el.removeAttribute('target');
                el.setAttribute('target', '_self');
            }
        } catch (e) {}
    }

    function forceClickContinue(el) {
        if (!el) el = findContinueLink();
        if (!el) return false;
        try {
            unlockContinue(el);
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });

            try {
                const w = pageWin();
                if (typeof w.checkPassword === 'function') {
                    console.log('[Auto Tools] Gọi checkPassword()');
                    w.checkPassword();
                }
            } catch (e) {}

            try { el.focus(); } catch (e) {}
            try { el.click(); } catch (e) {}
            const opts = { bubbles: true, cancelable: true, view: window, composed: true };
            try {
                el.dispatchEvent(new MouseEvent('pointerdown', opts));
                el.dispatchEvent(new MouseEvent('mousedown', opts));
                el.dispatchEvent(new MouseEvent('pointerup', opts));
                el.dispatchEvent(new MouseEvent('mouseup', opts));
                el.dispatchEvent(new MouseEvent('click', opts));
            } catch (e) {}

            try {
                const form = el.closest('form') || document.querySelector('#main-form');
                if (form) {
                    const sub = form.querySelector('button[type="submit"], input[type="submit"]');
                    if (sub) { unlockContinue(sub); try { sub.click(); } catch (e) {} }
                }
            } catch (e) {}

            try {
                const href = el.getAttribute('href');
                if (href && href.length > 1 && href !== '#' && !href.startsWith('javascript:')) {
                    setTimeout(() => { try { location.href = href; } catch (e) {} }, 400);
                }
            } catch (e) {}

            console.log('[Auto Tools] ✅ Đã ép click Tiếp tục');
            return true;
        } catch (e) {
            console.log('[Auto Tools] Lỗi click tiếp tục:', e);
            return false;
        }
    }

    function waitCaptchaThenContinue(maxMs) {
        maxMs = maxMs || 180000;
        const start = Date.now();
        let done = false;
        let captchaTries = 0;

        const tryOnce = () => {
            if (done) return true;
            const el = findContinueLink();
            if (!el) return false;
            if (hasCaptchaToken() || isContinueEnabled(el)) {
                done = true;
                try { GM_setValue('as_need_captcha_click', false); } catch (e) {}
                unlockContinue(el);
                setTimeout(() => forceClickContinue(el), 300);
                return true;
            }
            return false;
        };

        // Sau khi dán mã → cố tick captcha ngay
        setTimeout(() => clickRecaptchaCheckbox(), 500);
        setTimeout(() => clickRecaptchaCheckbox(), 1500);
        setTimeout(() => clickRecaptchaCheckbox(), 3000);

        if (tryOnce()) return;
        console.log('[Auto Tools] Đã dán mã — tự tick reCAPTCHA, rồi bấm Tiếp tục…');

        const timer = setInterval(() => {
            if (done || Date.now() - start > maxMs) {
                clearInterval(timer);
                if (!done) {
                    const el = findContinueLink();
                    if (el) {
                        console.log('[Auto Tools] Timeout — vẫn ép click Tiếp tục');
                        forceClickContinue(el);
                    }
                }
                return;
            }
            captchaTries++;
            if (!hasCaptchaToken() && captchaTries % 3 === 0) {
                clickRecaptchaCheckbox();
            }
            tryOnce();
        }, 700);

        try {
            const form = document.querySelector('#main-form') || document.body;
            const obs = new MutationObserver(() => {
                if (tryOnce()) {
                    obs.disconnect();
                    clearInterval(timer);
                }
            });
            obs.observe(form, { attributes: true, childList: true, subtree: true, attributeFilter: ['class', 'disabled', 'href', 'style'] });
            setTimeout(() => obs.disconnect(), maxMs);
        } catch (e) {}
    }

    function manualContinueNow() {
        const el = findContinueLink();
        if (!el) return alert('Không thấy nút Tiếp tục trên trang!');
        unlockContinue(el);
        forceClickContinue(el);
    }

    function goBackLink4mOnly() {
        lockScroll('goBackLink4mOnly');
        const original = GM_getValue('as_original_url', '');
        const keepOrigin = !!GM_getValue('as_keep_origin_tab', false);
        if (!original || !/link4m\./i.test(original)) {
            alert('Chưa lưu link link4m ban đầu. Hãy mở nhiệm vụ từ link4m trước (tool tự nhớ).');
            return;
        }
        GM_deleteValue('as_pending_code');
        if (keepOrigin) {
            try {
                const name = GM_getValue('as_origin_window_name', '');
                if (name) {
                    const w = window.open('', name);
                    if (w && !w.closed) {
                        try { w.focus(); } catch (e) {}
                        alert('Đã chuyển về tab link4m cũ (không load lại).');
                        return;
                    }
                }
            } catch (e) {}
            alert('Không focus được tab cũ — chuyển sang tab link4m thủ công, hoặc để tool mở lại URL.');
        }
        location.href = original;
    }

    async function runPasteFlow(code) {
        code = (code || '').trim();
        if (!code) return false;
        if (window.__asPasteRunning) return false;
        window.__asPasteRunning = true;
        lockScroll('paste flow');
        try {
            console.log('[Auto Tools] Pending mã — chờ trang ổn định (không cuộn)…');
            await sleep(1200);
            if (!findPasswordInput()) await sleep(1500);
            if (!findPasswordInput()) await sleep(2000);
            let ok = await fillCodeNatural(code);
            if (!ok) {
                await sleep(1500);
                ok = await fillCodeNatural(code);
            }
            if (ok) {
                try { GM_deleteValue('as_pending_code'); } catch (e) {}
                await sleep(600);
                waitCaptchaThenContinue();
                // Giữ khóa cuộn tới khi xong captcha / tiếp tục
                setTimeout(() => { try { unlockScroll(); } catch (e) {} }, 20000);
                return true;
            }
            console.log('[Auto Tools] Chưa thấy ô nhập mã trên trang này');
            return false;
        } finally {
            window.__asPasteRunning = false;
        }
    }

    function submitCode(code) {
        code = (code || '').trim();
        if (!code) return alert('Chưa nhập mã!');
        lockScroll('submitCode');
        const original = GM_getValue('as_original_url', '');
        const keepOrigin = !!GM_getValue('as_keep_origin_tab', false);
        const realForm = findPasswordInput(); // đã loại ô trong panel tool
        const samePage = !!(original && (function () {
            try {
                const a = new URL(original);
                return a.hostname === location.hostname && a.pathname === location.pathname;
            } catch (e) {
                return original === location.href;
            }
        })());

        // Ưu tiên 1: tab mới flow → gửi mã về tab link4m cũ (không dán vào ô tool / không load lại)
        // Chỉ dán tại chỗ nếu ĐÚNG trang form gốc VÀ có ô password thật
        const shouldReturnToOrigin = original && !samePage;
        if (shouldReturnToOrigin && (keepOrigin || true)) {
            // Nếu đang giữ tab gốc → không navigate
            if (keepOrigin) {
                GM_setValue('as_pending_code', code);
                GM_setValue('as_pending_code_time', Date.now());
                GM_setValue('as_stop_scroll', true);
                GM_setValue('as_scroll_lock', true);

                let focused = false;
                try {
                    const name = GM_getValue('as_origin_window_name', '');
                    if (name) {
                        const w = window.open('', name);
                        if (w && !w.closed) {
                            try { w.focus(); focused = true; } catch (e) {}
                        }
                    }
                } catch (e) {}

                try {
                    const bc = new BroadcastChannel('as_tools_hub');
                    bc.postMessage({ type: 'paste_code', code: code, t: Date.now() });
                    setTimeout(() => { try { bc.close(); } catch (e) {} }, 2000);
                } catch (e) {}

                console.log('[Auto Tools] Đã gửi mã về tab gốc (không load lại). Focus:', focused);
                alert(
                    focused
                        ? 'Đã gửi mã về tab link4m cũ — tab đó sẽ tự dán (không load lại trang).'
                        : 'Đã gửi mã về tab link4m. Hãy chuyển sang tab nhiệm vụ cũ — tool sẽ tự dán, không cần mở lại web.'
                );
                return;
            }

            // Không giữ tab gốc → điều hướng về URL đã lưu
            GM_setValue('as_pending_code', code);
            GM_setValue('as_pending_code_time', Date.now());
            GM_setValue('as_stop_scroll', true);
            GM_setValue('as_scroll_lock', true);
            location.href = original;
            return;
        }

        // Đúng trang form (có ô password thật) → dán luôn
        if (realForm) {
            runPasteFlow(code);
            return;
        }

        // Fallback: có original khác URL hiện tại
        if (original && original !== location.href) {
            GM_setValue('as_pending_code', code);
            GM_setValue('as_pending_code_time', Date.now());
            GM_setValue('as_stop_scroll', true);
            GM_setValue('as_scroll_lock', true);
            location.href = original;
            return;
        }

        alert('Không tìm thấy ô nhập mã trên trang này. Hãy mở tab link4m (form nhập mã) rồi thử lại.');
    }

    // Lắng nghe mã từ tab khác (tab mới flow) — không cần reload
    (function listenPendingCodeFromOtherTab() {
        // Chỉ xử lý trên trang có form / link4m (tránh tab Google / site đích cũng paste)
        const maybeOrigin = () => {
            try {
                if (findPasswordInput()) return true;
                if (isLink4mHost()) return true;
                const original = GM_getValue('as_original_url', '');
                if (!original) return false;
                const a = new URL(original);
                return a.hostname === location.hostname && a.pathname === location.pathname;
            } catch (e) {
                return !!findPasswordInput();
            }
        };

        const tryConsume = () => {
            try {
                if (!maybeOrigin()) return;
                const code = GM_getValue('as_pending_code', '');
                if (!code || window.__asPasteRunning) return;
                const t = GM_getValue('as_pending_code_time', 0);
                if (t && Date.now() - t > 300000) return; // quá 5 phút bỏ
                console.log('[Auto Tools] Nhận mã từ tab khác → dán');
                lockScroll('consume pending');
                runPasteFlow(code);
            } catch (e) {}
        };

        // GM storage change
        try {
            if (typeof GM_addValueChangeListener === 'function') {
                GM_addValueChangeListener('as_pending_code', function (name, oldVal, newVal, remote) {
                    if (newVal && remote) setTimeout(tryConsume, 200);
                });
            }
        } catch (e) {}

        // BroadcastChannel
        try {
            const bc = new BroadcastChannel('as_tools_hub');
            bc.onmessage = (ev) => {
                try {
                    if (ev.data && ev.data.type === 'paste_code' && ev.data.code) {
                        GM_setValue('as_pending_code', ev.data.code);
                        GM_setValue('as_pending_code_time', Date.now());
                        setTimeout(tryConsume, 150);
                    }
                } catch (e) {}
            };
        } catch (e) {}

        // Poll dự phòng (tab gốc vẫn mở)
        setInterval(tryConsume, 1500);
        setTimeout(tryConsume, 800);
    })();

    // Về trang link4m: dừng cuộn + đợi → gõ mã → captcha → tiếp tục (khi vừa load lại trang)
    const pending = GM_getValue('as_pending_code', '');
    if (pending || GM_getValue('as_stop_scroll', false) || GM_getValue('as_scroll_lock', false)) {
        lockScroll('page load pending');
    }
    if (pending) {
        const bootPaste = () => setTimeout(() => runPasteFlow(pending), 500);
        if (document.body) bootPaste();
        else document.addEventListener('DOMContentLoaded', bootPaste);
    }

    // ====================== UI ======================
    // ====================== CỬA SỔ NỔI (Picture-in-Picture) ======================
    let pipWin = null;
    let popupWin = null;

    function getStatusText() {
        const parts = [];
        parts.push(isScrolling ? (countdownScrollMode ? '🟢 Đang kéo chậm' : '🟢 Đang cuộn') : '⚪ Cuộn tắt');
        parts.push(autoLayMaEnabled ? '🟢 Auto LẤY MÃ' : '⚪ Auto LẤY MÃ tắt');
        parts.push(autoDanMaEnabled ? '🟢 Tự dán mã' : '⚪ Tự dán mã tắt');
        try {
            if (typeof isCountdownVisible === 'function' && isCountdownVisible()) parts.push('⏱️ Đếm ngược');
            if (typeof isNeedClickInternalLink === 'function' && isNeedClickInternalLink()) parts.push('🔗 Cần click link');
            if (typeof extractPromoCode === 'function') {
                const c = extractPromoCode();
                if (c) parts.push('✅ Mã: ' + c);
            } else if (typeof isCodeReady === 'function' && isCodeReady()) parts.push('✅ Có mã');
        } catch (e) {}
        return parts.join('\n');
    }

    function buildFloatControls(doc, win) {
        doc.documentElement.lang = 'vi';
        doc.head.innerHTML = '<meta charset="utf-8"><title>Auto Tools</title>';
        doc.body.style.cssText = 'margin:0;font-family:system-ui,sans-serif;background:#111;color:#fff;padding:10px;font-size:13px;';
        doc.body.innerHTML = `
            <div style="font-weight:700;margin-bottom:8px;font-size:14px">⚙️ Auto Tools Hub</div>
            <pre id="st" style="background:#222;padding:8px;border-radius:8px;white-space:pre-wrap;font-size:12px;margin:0 0 10px;line-height:1.45;min-height:52px"></pre>
            <button id="b1" style="width:100%;padding:10px;margin:0 0 6px;border:0;border-radius:8px;font-weight:600;cursor:pointer;background:#1a73e8;color:#fff">🔄 Bật/Tắt cuộn</button>
            <button id="b2" style="width:100%;padding:10px;margin:0 0 6px;border:0;border-radius:8px;font-weight:600;cursor:pointer;background:#7c3aed;color:#fff">🎯 Bật/Tắt Auto LẤY MÃ</button>
            <button id="b3" style="width:100%;padding:10px;margin:0 0 6px;border:0;border-radius:8px;font-weight:600;cursor:pointer;background:#16a34a;color:#fff">👆 Click LẤY MÃ 1 lần</button>
            <button id="b4" style="width:100%;padding:10px;margin:0 0 6px;border:0;border-radius:8px;font-weight:600;cursor:pointer;background:#ea580c;color:#fff">⬇️ Kéo cuối trang</button>
            <button id="b5" style="width:100%;padding:10px;margin:0;border:0;border-radius:8px;font-weight:600;cursor:pointer;background:#333;color:#ccc">Đóng cửa sổ nổi</button>
        `;
        const st = doc.getElementById('st');
        const refresh = () => { try { st.textContent = getStatusText(); } catch (e) {} };
        refresh();
        const iv = setInterval(refresh, 1000);
        win.addEventListener('pagehide', () => clearInterval(iv));

        doc.getElementById('b1').onclick = () => {
            try {
                if (isScrolling) stopScroll();
                else startScroll({ countdown: true });
                refresh();
            } catch (e) {}
        };
        doc.getElementById('b2').onclick = () => {
            autoLayMaEnabled = !autoLayMaEnabled;
            try { saveUserConfig(); updateSwitch(); } catch (e) {}
            refresh();
        };
        doc.getElementById('b3').onclick = () => {
            try {
                const b = findLayMaButton();
                if (!b) { st.textContent = 'Không thấy nút LẤY MÃ'; return; }
                b.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => forcePhysicalClick(b), 2500);
                st.textContent = 'Đã gửi click LẤY MÃ (chờ 2.5s)…';
            } catch (e) {}
        };
        doc.getElementById('b4').onclick = () => {
            try {
                const h = Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0);
                window.scrollTo({ top: h, behavior: 'smooth' });
                st.textContent = 'Đã kéo xuống cuối trang';
            } catch (e) {}
        };
        doc.getElementById('b5').onclick = () => {
            try { win.close(); } catch (e) {}
            pipWin = null;
            popupWin = null;
        };
    }

    async function openFloatingPanel() {
        // 1) Document Picture-in-Picture (Chrome desktop — nổi trên cùng)
        if (window.documentPictureInPicture) {
            try {
                if (pipWin && !pipWin.closed) {
                    try { pipWin.focus(); } catch (e) {}
                    return;
                }
                pipWin = await documentPictureInPicture.requestWindow({
                    width: 280,
                    height: 360
                });
                buildFloatControls(pipWin.document, pipWin);
                if (window.__asStartKeepAlive) window.__asStartKeepAlive();
                console.log('[Auto Tools] Đã mở cửa sổ nổi PiP');
                return;
            } catch (e) {
                console.log('[Auto Tools] PiP lỗi:', e.message);
            }
        }

        // 2) Fallback: popup nhỏ
        try {
            if (popupWin && !popupWin.closed) {
                popupWin.focus();
                return;
            }
            popupWin = window.open('', 'as_float', 'width=300,height=380,resizable=yes,scrollbars=no');
            if (!popupWin) {
                alert('Trình duyệt chặn popup. Hãy cho phép popup hoặc dùng Chrome desktop (PiP).');
                return;
            }
            buildFloatControls(popupWin.document, popupWin);
            if (window.__asStartKeepAlive) window.__asStartKeepAlive();
            console.log('[Auto Tools] Đã mở cửa sổ popup điều khiển');
        } catch (e) {
            alert('Không mở được cửa sổ nổi: ' + e.message);
        }
    }

    function ensureUI() {
        if (document.getElementById('as-btn')) return;

        if (!document.getElementById('as-style')) {
            const style = document.createElement('style');
            style.id = 'as-style';
            style.textContent = `
                #as-btn {
                    position: fixed !important;
                    bottom: max(14px, env(safe-area-inset-bottom)) !important;
                    right: 12px !important;
                    width: 50px !important;
                    height: 50px !important;
                    background: rgba(255,255,255,.12) !important;
                    color: #fff !important;
                    border-radius: 16px !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    font-size: 22px !important;
                    z-index: 2147483647 !important;
                    box-shadow: 0 8px 32px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.25) !important;
                    cursor: pointer !important;
                    user-select: none !important;
                    pointer-events: auto !important;
                    transition: transform .15s ease, background .15s ease !important;
                    border: 1px solid rgba(255,255,255,.28) !important;
                    backdrop-filter: blur(18px) saturate(180%) !important;
                    -webkit-backdrop-filter: blur(18px) saturate(180%) !important;
                }
                #as-btn:active { transform: scale(0.94) !important; background: rgba(255,255,255,.2) !important; }
                #as-panel {
                    position: fixed !important;
                    left: 10px !important;
                    right: 10px !important;
                    bottom: max(70px, calc(54px + env(safe-area-inset-bottom))) !important;
                    width: auto !important;
                    max-width: 400px !important;
                    margin: 0 auto !important;
                    max-height: min(68vh, 500px) !important;
                    background: rgba(12,12,14,.72) !important;
                    color: #f5f5f7 !important;
                    border-radius: 20px !important;
                    z-index: 2147483647 !important;
                    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif !important;
                    font-size: 13px !important;
                    display: none;
                    box-shadow: 0 20px 60px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.18) !important;
                    overflow: hidden !important;
                    pointer-events: auto !important;
                    border: 1px solid rgba(255,255,255,.22) !important;
                    backdrop-filter: blur(28px) saturate(200%) !important;
                    -webkit-backdrop-filter: blur(28px) saturate(200%) !important;
                }
                #as-panel .as-body,
                #as-panel #panel-link4m,
                #as-panel #panel-main {
                    max-height: min(58vh, 420px) !important;
                    overflow-y: auto !important;
                    -webkit-overflow-scrolling: touch !important;
                }
                .as-header {
                    background: rgba(255,255,255,.06) !important;
                    padding: 11px 14px !important;
                    display: flex !important;
                    justify-content: space-between !important;
                    align-items: center !important;
                    font-weight: 700 !important;
                    cursor: move !important;
                    border-bottom: 1px solid rgba(255,255,255,.1) !important;
                    font-size: 14px !important;
                    letter-spacing: .2px !important;
                }
                .as-tabs {
                    display: flex !important;
                    background: rgba(0,0,0,.2) !important;
                    overflow-x: auto !important;
                    -webkit-overflow-scrolling: touch !important;
                    scrollbar-width: none !important;
                }
                .as-tabs::-webkit-scrollbar { display: none !important; }
                .as-tabs div {
                    flex: 1 0 auto !important;
                    text-align: center !important;
                    padding: 9px 11px !important;
                    font-size: 11.5px !important;
                    font-weight: 600 !important;
                    color: rgba(255,255,255,.45) !important;
                    cursor: pointer !important;
                    white-space: nowrap !important;
                }
                .as-tabs div.active {
                    color: #fff !important;
                    background: rgba(255,255,255,.08) !important;
                    border-bottom: 2px solid rgba(255,255,255,.85) !important;
                }
                .as-body { padding: 10px 12px 14px !important; }
                .as-tool-btn {
                    display: flex !important;
                    align-items: center !important;
                    gap: 10px !important;
                    padding: 12px 12px !important;
                    border-bottom: 1px solid rgba(255,255,255,.08) !important;
                    cursor: pointer !important;
                }
                .as-switch {
                    width: 42px !important;
                    height: 24px !important;
                    background: rgba(255,255,255,.15) !important;
                    border-radius: 12px !important;
                    position: relative !important;
                    cursor: pointer !important;
                    flex-shrink: 0 !important;
                }
                .as-switch::after {
                    content: '' !important;
                    position: absolute !important;
                    width: 20px !important;
                    height: 20px !important;
                    background: #fff !important;
                    border-radius: 50% !important;
                    top: 2px !important;
                    left: 2px !important;
                    transition: 0.2s !important;
                }
                .as-switch.on { background: rgba(255,255,255,.55) !important; }
                .as-switch.on::after { transform: translateX(18px) !important; }
                #as-panel input {
                    width: 100% !important;
                    box-sizing: border-box !important;
                    background: rgba(0,0,0,.35) !important;
                    border: 1px solid rgba(255,255,255,.14) !important;
                    color: #fff !important;
                    border-radius: 12px !important;
                    padding: 10px 12px !important;
                    margin: 4px 0 8px !important;
                    font-size: 14px !important;
                }
                #as-panel input:focus {
                    outline: none !important;
                    border-color: rgba(255,255,255,.45) !important;
                    box-shadow: 0 0 0 2px rgba(255,255,255,.12) !important;
                }
                .as-btn-main {
                    width: 100% !important;
                    background: rgba(255,255,255,.92) !important;
                    color: #0a0a0a !important;
                    border: none !important;
                    border-radius: 12px !important;
                    padding: 11px !important;
                    font-weight: 700 !important;
                    cursor: pointer !important;
                    margin-bottom: 6px !important;
                    font-size: 13.5px !important;
                }
                .as-btn-green {
                    background: rgba(52, 211, 153, .95) !important;
                    color: #042f1a !important;
                }
                .as-btn-orange {
                    background: rgba(251, 146, 60, .95) !important;
                    color: #431407 !important;
                }
                .back-btn {
                    background: none !important;
                    border: none !important;
                    color: rgba(255,255,255,.7) !important;
                    font-size: 13px !important;
                    cursor: pointer !important;
                    margin-bottom: 8px !important;
                    padding: 0 !important;
                }
            `;
            (document.head || document.documentElement).appendChild(style);
        }

        const btn = document.createElement('div');
        btn.id = 'as-btn';
        btn.innerHTML = '⚙️';
        btn.title = 'Mở menu';

        const panel = document.createElement('div');
        panel.id = 'as-panel';
        panel.innerHTML = `
            <div id="panel-main">
                <div class="as-header">
                    <span>Auto Tools Hub</span>
                    <span style="cursor:pointer;opacity:.7;font-size:17px" id="as-close">✕</span>
                </div>
                <div class="as-tool-btn" id="btn-link4m">
                    <div style="font-size:18px;width:26px;text-align:center">🔗</div>
                    <div>
                        <div style="font-weight:600">link4m</div>
                        <div style="font-size:12px;color:#888">Cuộn + Tìm link + Dán mã</div>
                    </div>
                </div>
                <div class="as-tool-btn" id="btn-magma">
                    <div style="font-size:18px;width:26px;text-align:center">🌋</div>
                    <div>
                        <div style="font-weight:600">magma</div>
                        <div style="font-size:12px;color:#888">Đang update</div>
                    </div>
                </div>
            </div>

            <div id="panel-link4m" style="display:none">
                <div class="as-header" id="drag-handle">
                    <span>link4m</span>
                    <span style="cursor:pointer;opacity:.7;font-size:17px" id="as-close2">✕</span>
                </div>
                <div class="as-tabs" id="link4m-tabs">
                    <div data-tab="config" class="active">Config</div>
                    <div data-tab="scroll">Cuộn</div>
                    <div data-tab="search">Tìm link</div>
                    <div data-tab="direct">Truy cập</div>
                    <div data-tab="code">Nhập mã</div>
                </div>
                <div class="as-body">
                    <button class="back-btn" id="btn-back">✕ Đóng</button>

                    <div id="tab-config">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                            <span>🔄 Tự động cuộn</span>
                            <div id="as-cfg-scroll-sw" class="as-switch"></div>
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                            <span>🎯 Tự lấy mã (LẤY MÃ)</span>
                            <div id="as-cfg-layma-sw" class="as-switch ${autoLayMaEnabled ? 'on' : ''}"></div>
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                            <span>📋 Tự dán mã (Mã KM)</span>
                            <div id="as-cfg-danma-sw" class="as-switch ${autoDanMaEnabled ? 'on' : ''}"></div>
                        </div>
                        <div style="font-size:11px;color:#aaa;line-height:1.45;margin-bottom:10px">
                            <b>Tự dán mã</b>: khi thấy khung đỏ <code>Mã KM: xxxxx</code> → copy → gửi về tab link4m đầu → gõ từng chữ + captcha.
                            Dùng kèm <b>Tìm Google (tab mới)</b> để giữ tab gốc.
                        </div>
                        <div id="as-cfg-danma-status" style="font-size:11px;color:#94a3b8;min-height:16px;margin-bottom:8px"></div>
                        <button class="as-btn-main" id="as-manual-layma" style="margin-top:4px">Click LẤY MÃ ngay (1 lần)</button>
                        <button class="as-btn-main as-btn-orange" id="as-manual-extract" style="margin-top:6px">📋 Đọc mã KM trên trang</button>
                        <button class="as-btn-main as-btn-green" id="as-float-btn" style="margin-top:6px">🪟 Cửa sổ nổi điều khiển</button>
                    </div>

                    <div id="tab-scroll" style="display:none">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                            <span>🔄 Tự cuộn trang</span>
                            <div id="as-sw" class="as-switch"></div>
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                            <span>🎯 Auto LẤY MÃ</span>
                            <div id="as-layma-sw" class="as-switch ${autoLayMaEnabled ? 'on' : ''}"></div>
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                            <span>📋 Tự dán mã</span>
                            <div id="as-danma-sw" class="as-switch ${autoDanMaEnabled ? 'on' : ''}"></div>
                        </div>
                        <div style="font-size:11px;color:#aaa;line-height:1.4;margin-bottom:10px">
                            Tắt <b>Auto LẤY MÃ</b> nếu trang bị đơ. Tắt <b>Tự dán mã</b> nếu muốn copy thủ công.
                        </div>
                        <div style="display:flex;gap:8px;align-items:center;font-size:12px;color:#aaa">
                            <span>Pixel</span>
                            <input id="as-amount" type="number" value="70" style="width:70px;margin:0">
                            <span>Delay</span>
                            <input id="as-delay" type="number" value="1100" style="width:75px;margin:0">
                        </div>
                    </div>

                    <div id="tab-search" style="display:none">
                        <div style="font-size:12px;color:#aaa">Từ khóa</div>
                        <input id="as-keyword" placeholder="Nhập từ khóa...">
                        <div style="font-size:12px;color:#aaa">Domain gợi ý</div>
                        <input id="as-domain" placeholder="exam****.com">
                        <div style="font-size:12px;color:#aaa;margin-top:8px">Pateway API key (sk-ptw-…)</div>
                        <input id="as-pateway-key" placeholder="sk-ptw-..." style="font-size:11px">
                        <button class="as-btn-main" id="as-save-key" style="margin-top:6px;background:#475569!important">💾 Lưu Pateway key</button>
                        <button class="as-btn-main as-btn-green" id="as-ai-fill" style="margin-top:8px">🤖 AI đọc ảnh → điền</button>
                        <button class="as-btn-main as-btn-orange" id="as-ai-fill-search" style="margin-top:6px">🤖 AI đọc ảnh + Tìm Google</button>
                        <div id="as-ai-status" style="font-size:11px;color:#94a3b8;margin-top:6px;line-height:1.35;min-height:16px"></div>
                        <button class="as-btn-main" id="as-search-btn" style="margin-top:8px">Tìm Google (cùng tab)</button>
                        <button class="as-btn-main as-btn-green" id="as-search-btn-new" style="margin-top:6px">🆕 Tìm Google (tab mới)</button>
                        <div style="font-size:11px;color:#aaa;margin-top:8px;line-height:1.35">
                            Tab mới: giữ tab link4m → lấy mã xong dán sẽ gửi về tab cũ (không load lại). Pateway.ai → Claude vision.
                        </div>
                    </div>

                    <div id="tab-direct" style="display:none">
                        <div style="font-size:12px;color:#aaa;margin-bottom:6px">Dán link trang có nút LẤY MÃ</div>
                        <input id="as-direct-link" placeholder="https://...">
                        <div style="font-size:11px;color:#94a3b8;margin:4px 0 10px;line-height:1.4">
                            Gõ URL từng chữ (như gõ mã) rồi vào web — <b>không qua Google</b>.
                        </div>
                        <button class="as-btn-main as-btn-green" id="as-direct-btn">🆕 Tab mới · gõ URL từng chữ</button>
                        <button class="as-btn-main" id="as-direct-same">Cùng tab · gõ URL từng chữ</button>
                        <button class="as-btn-main as-btn-orange" id="as-direct-google" style="margin-top:8px">Mở qua Google (dự phòng)</button>
                    </div>

                    <div id="tab-code" style="display:none">
                        <div style="font-size:12px;color:#aaa">Dán mã vừa lấy</div>
                        <input id="as-code" placeholder="Nhập mã..." maxlength="10">
                        <button class="as-btn-main as-btn-green" id="as-paste-btn">Quay lại + Dán mã</button>
                        <button class="as-btn-main" id="as-back-l4m" style="margin-top:8px;background:#334155!important">↩️ Chỉ quay lại link4m</button>
                        <button class="as-btn-main as-btn-orange" id="as-force-continue" style="margin-top:8px">👆 Ép click «Tiếp tục» ngay</button>
                        <div style="font-size:11px;color:#aaa;margin-top:8px;line-height:1.35">
                            Đã tick captcha mà nút vẫn xám → bấm <b>Ép click Tiếp tục</b>. Chỉ cần về form nhập mã → <b>Chỉ quay lại link4m</b>.
                        </div>
                    </div>
                </div>
            </div>
        `;

        const target = document.body || document.documentElement;
        target.appendChild(btn);
        target.appendChild(panel);

        btn.onclick = (e) => {
            e.stopPropagation();
            const open = panel.style.display === 'none' || !panel.style.display;
            if (open) {
                // Mở thẳng panel link4m (không qua menu chính)
                try {
                    const main = document.getElementById('panel-main');
                    const pl = document.getElementById('panel-link4m');
                    if (main) main.style.display = 'none';
                    if (pl) pl.style.display = 'block';
                } catch (err) {}
                panel.style.display = 'block';
            } else {
                panel.style.display = 'none';
            }
        };
        document.getElementById('as-close').onclick = () => { panel.style.display = 'none'; };
        document.getElementById('as-close2').onclick = () => { panel.style.display = 'none'; };

        document.getElementById('btn-link4m').onclick = () => {
            document.getElementById('panel-main').style.display = 'none';
            document.getElementById('panel-link4m').style.display = 'block';
        };
        const btnMagma = document.getElementById('btn-magma');
        if (btnMagma) btnMagma.onclick = () => { alert('magma — đang update 🚧'); };
        const btnBack = document.getElementById('btn-back');
        if (btnBack) {
            btnBack.textContent = '✕ Đóng';
            btnBack.onclick = () => { panel.style.display = 'none'; };
        }

        document.querySelectorAll('#link4m-tabs div').forEach(tab => {
            tab.onclick = () => {
                document.querySelectorAll('#link4m-tabs div').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                ['config', 'scroll', 'search', 'direct', 'code'].forEach(name => {
                    const el = document.getElementById('tab-' + name);
                    if (el) el.style.display = (tab.dataset.tab === name) ? 'block' : 'none';
                });
            };
        });

        document.getElementById('as-sw').onclick = toggleScroll;
        const cfgScroll = document.getElementById('as-cfg-scroll-sw');
        if (cfgScroll) cfgScroll.onclick = toggleScroll;

        const toggleLayMa = () => {
            autoLayMaEnabled = !autoLayMaEnabled;
            saveUserConfig();
            updateSwitch();
            console.log('[Auto Tools] Auto LẤY MÃ:', autoLayMaEnabled ? 'BẬT' : 'TẮT', '(đã lưu)');
            if (!autoLayMaEnabled) autoLayMaBusy = false;
        };
        document.getElementById('as-layma-sw').onclick = toggleLayMa;
        const cfgLayma = document.getElementById('as-cfg-layma-sw');
        if (cfgLayma) cfgLayma.onclick = toggleLayMa;

        const toggleDanMa = () => {
            autoDanMaEnabled = !autoDanMaEnabled;
            saveUserConfig();
            updateSwitch();
            console.log('[Auto Tools] Tự dán mã:', autoDanMaEnabled ? 'BẬT' : 'TẮT', '(đã lưu)');
            if (!autoDanMaEnabled) autoDanMaBusy = false;
            const st = document.getElementById('as-cfg-danma-status');
            if (st) st.textContent = autoDanMaEnabled ? 'Đang bật — chờ khung Mã KM…' : 'Đã tắt tự dán mã';
        };
        const danSw = document.getElementById('as-danma-sw');
        if (danSw) danSw.onclick = toggleDanMa;
        const cfgDan = document.getElementById('as-cfg-danma-sw');
        if (cfgDan) cfgDan.onclick = toggleDanMa;

        const manualExtract = document.getElementById('as-manual-extract');
        if (manualExtract) {
            manualExtract.onclick = () => {
                const code = extractPromoCode();
                const st = document.getElementById('as-cfg-danma-status');
                if (!code) {
                    if (st) st.textContent = 'Chưa thấy Mã KM trên trang';
                    return alert('Chưa thấy khung Mã KM trên trang này.');
                }
                try {
                    const el = document.getElementById('as-code');
                    if (el) el.value = code;
                } catch (e) {}
                if (st) st.textContent = 'Đã đọc: ' + code;
                if (confirm('Đã thấy mã: ' + code + '\n\nGửi về web đầu và dán luôn?')) {
                    submitCode(code);
                }
            };
        }

        document.getElementById('as-manual-layma').onclick = () => {
            const b = findLayMaButton();
            if (!b) {
                wakePageOnce();
                setTimeout(() => {
                    const b2 = findLayMaButton();
                    if (!b2) return alert('Không tìm thấy nút LẤY MÃ trên trang!');
                    b2.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setTimeout(() => forcePhysicalClick(b2), 3000);
                }, 800);
                return;
            }
            b.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => forcePhysicalClick(b), 3000);
            console.log('[Auto Tools] Manual click LẤY MÃ sau 3s');
        };

        document.getElementById('as-float-btn').onclick = () => {
            openFloatingPanel();
        };

        // Khôi phục giá trị input từ config đã lưu
        try {
            const amt = document.getElementById('as-amount');
            const del = document.getElementById('as-delay');
            if (amt) amt.value = config.scrollAmount;
            if (del) del.value = config.scrollDelay;
        } catch (e) {}

        document.getElementById('as-amount').onchange = e => {
            config.scrollAmount = +e.target.value || 70;
            saveUserConfig();
        };
        document.getElementById('as-delay').onchange = e => {
            config.scrollDelay = +e.target.value || 1100;
            saveUserConfig();
        };

        document.getElementById('as-search-btn').onclick = () => {
            startSmartSearch(
                document.getElementById('as-keyword').value.trim(),
                document.getElementById('as-domain').value.trim(),
                false
            );
        };
        document.getElementById('as-search-btn-new').onclick = () => {
            startSmartSearch(
                document.getElementById('as-keyword').value.trim(),
                document.getElementById('as-domain').value.trim(),
                true
            );
        };
        try {
            const keyInput = document.getElementById('as-pateway-key');
            if (keyInput) {
                const saved = getPatewayKey();
                if (saved) {
                    keyInput.value = saved.length > 12 ? (saved.slice(0, 8) + '…' + saved.slice(-4)) : saved;
                    keyInput.dataset.full = saved;
                }
                keyInput.addEventListener('focus', function () {
                    if (this.dataset.full) this.value = this.dataset.full;
                });
            }
        } catch (e) {}
        document.getElementById('as-save-key').onclick = () => {
            const v = (document.getElementById('as-pateway-key').value || '').trim();
            if (!v || v.includes('…')) {
                alert('Dán full key (không dán bản đã che).');
                return;
            }
            GM_setValue('as_pateway_key', v);
            document.getElementById('as-pateway-key').dataset.full = v;
            alert('Đã lưu Pateway API key!');
        };
        document.getElementById('as-ai-fill').onclick = () => {
            aiFillKeywordFromImages(false);
        };
        document.getElementById('as-ai-fill-search').onclick = () => {
            aiFillKeywordFromImages(true);
        };

        document.getElementById('as-direct-google').onclick = () => {
            openViaGoogle(document.getElementById('as-direct-link').value);
        };

        document.getElementById('as-direct-same').onclick = () => {
            openDirectTypeUrl(document.getElementById('as-direct-link').value, true);
        };

        document.getElementById('as-direct-btn').onclick = () => {
            openDirectTypeUrl(document.getElementById('as-direct-link').value, false);
        };

        document.getElementById('as-paste-btn').onclick = () => {
            submitCode(document.getElementById('as-code').value);
        };
        document.getElementById('as-back-l4m').onclick = () => goBackLink4mOnly();
        document.getElementById('as-force-continue').onclick = () => manualContinueNow();

        // Kéo thả — chỉ trên handle, không chặn click trang
        (function makeDrag(el, handle) {
            let ox, oy, dragging = false;
            handle = handle || el;
            handle.style.cursor = 'move';

            const onMove = (x, y) => {
                if (!dragging) return;
                el.style.left = (x - ox) + 'px';
                el.style.top = (y - oy) + 'px';
            };

            handle.addEventListener('mousedown', e => {
                if (e.target.closest('input,button,.as-switch')) return;
                e.preventDefault();
                dragging = true;
                const r = el.getBoundingClientRect();
                ox = e.clientX - r.left;
                oy = e.clientY - r.top;
                el.style.bottom = 'auto';
                el.style.right = 'auto';
            });
            document.addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
            document.addEventListener('mouseup', () => { dragging = false; });

            handle.addEventListener('touchstart', e => {
                if (e.target.closest('input,button,.as-switch')) return;
                const t = e.touches[0];
                dragging = true;
                const r = el.getBoundingClientRect();
                ox = t.clientX - r.left;
                oy = t.clientY - r.top;
                el.style.bottom = 'auto';
                el.style.right = 'auto';
            }, { passive: true });
            document.addEventListener('touchmove', e => {
                if (!dragging) return;
                const t = e.touches[0];
                onMove(t.clientX, t.clientY);
            }, { passive: true });
            document.addEventListener('touchend', () => { dragging = false; });
        })(panel, document.getElementById('drag-handle'));

        updateSwitch();
        console.log('[Auto Tools] UI v6.14 sẵn sàng');
    }

    // Chỉ tạo UI 1 lần + kiểm tra thưa (không observe cả document)
    if (document.body) {
        ensureUI();
    } else {
        document.addEventListener('DOMContentLoaded', ensureUI);
    }
    setTimeout(ensureUI, 1500);
    setInterval(() => {
        if (!document.getElementById('as-btn')) ensureUI();
    }, 5000);

})();