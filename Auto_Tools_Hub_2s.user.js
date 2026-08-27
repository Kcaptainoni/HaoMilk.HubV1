// ==UserScript==
// @name         Auto Tools Hub — 2s
// @namespace    http://tampermonkey.net/
// @version      1.3.2-2s
// @description  2s: tìm web + Continue + tab SITE2S tìm nút Lấy link (sau captcha)
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
// @connect      i.imgur.com
// @connect      *
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/USER/REPO/main/Auto_Tools_Hub_2s.user.js
// @updateURL    https://raw.githubusercontent.com/USER/REPO/main/Auto_Tools_Hub_2s.user.js
// ==/UserScript==

(function () {
    'use strict';

    try {
        if (window !== window.top && /recaptcha|google\./i.test(location.hostname + location.href)) return;
    } catch (e) {}

    const CFG_KEY = 'as2s_cfg';
    const STORE = {
        origin: 'as2s_origin_url',
        pending: 'as2s_pending_value',
        pendingTime: 'as2s_pending_time',
        keyword: 'as2s_keyword',
        domain: 'as2s_domain',
        title: 'as2s_title',
        mission: 'as2s_mission', // website | copy_field
        fieldLabel: 'as2s_field_label',
        pateway: 'as2s_pateway_key',
        flowArmed: 'as2s_flow_armed',
        flowTime: 'as2s_flow_time',
        contEnabled: 'as2s_cont_enabled',
        contStep: 'as2s_cont_step',
        contLastClick: 'as2s_cont_last_click',
        s2sEnabled: 'as2s_s2s_enabled',
        s2sStep: 'as2s_s2s_step',
        s2sFound: 'as2s_s2s_found'
    };

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

    function loadCfg() {
        try {
            const o = GM_getValue(CFG_KEY, null);
            return o && typeof o === 'object' ? o : {};
        } catch (e) { return {}; }
    }
    function saveCfg(patch) {
        try {
            GM_setValue(CFG_KEY, Object.assign(loadCfg(), patch || {}, { savedAt: Date.now() }));
        } catch (e) {}
    }
    function getPatewayKey() {
        const cfg = loadCfg();
        return (cfg.patewayKey || GM_getValue(STORE.pateway, '') || '').trim();
    }
    function setPatewayKey(k) {
        k = String(k || '').trim();
        saveCfg({ patewayKey: k });
        try { GM_setValue(STORE.pateway, k); } catch (e) {}
    }

    function isGoogleHost() {
        return /google\./i.test(location.hostname || '');
    }
    function is2sFormPage() {
        return !!(document.querySelector('.keyword-container, #copyKeyword, span.keyword-highlight, img.guide-image'));
    }
    function isTraffic2sHost() {
        const h = (location.hostname || '').toLowerCase();
        return /traffic2s\.com|site2s\.com|2s\.com/i.test(h) || !!document.querySelector('.keyword-container, img.guide-image, #copyKeyword');
    }
    function markOriginIf2s() {
        try {
            if (!is2sFormPage() || isGoogleHost()) return;
            GM_setValue(STORE.origin, location.href);
            console.log('[2s] Origin:', location.href.slice(0, 90));
        } catch (e) {}
    }

    // ========== 1) Từ khóa (DOM) ==========
    function scrapeKeyword() {
        const btn = document.getElementById('copyKeyword') ||
            document.querySelector('button.copy-btn[data-keyword]');
        if (btn) {
            const dk = (btn.getAttribute('data-keyword') || '').trim();
            if (dk.length >= 2) return dk;
        }
        const span = document.querySelector('.keyword-container span.keyword-highlight, span.keyword-highlight');
        if (span) {
            const t = (span.textContent || '').replace(/\s+/g, ' ').trim();
            if (t.length >= 2) return t;
        }
        return '';
    }

    // ========== 2) Ảnh guide ==========
    function findGuideImages() {
        const imgs = $all('img.guide-image, img[alt*="Hướng dẫn"], img[src*="imgur.com"]');
        const websiteGuide = [];
        const copyFieldGuide = [];
        for (const img of imgs) {
            const alt = ((img.alt || '') + ' ' + (img.title || '')).toLowerCase();
            const src = (img.currentSrc || img.src || '').toLowerCase();
            if (/hướng dẫn truy cập website|truy cập website/i.test(alt) || /rJJ9omw/i.test(src)) {
                websiteGuide.push(img);
            } else if (/rUXcBGq/i.test(src) || /id bài|mã khuyến|hotline|sao chép/i.test(alt)) {
                copyFieldGuide.push(img);
            }
        }
        return { websiteGuide, copyFieldGuide, all: imgs };
    }

    function detectMissionType() {
        const body = (document.body && document.body.innerText) || '';
        const { websiteGuide, copyFieldGuide } = findGuideImages();
        if (/Tìm và sao chép\s*(ID|Mã|Hotline)|sao chép ID bài viết|Mã khuyến mãi|Hotline/i.test(body) || copyFieldGuide.length) {
            return 'copy_field';
        }
        if (websiteGuide.length || scrapeKeyword()) return 'website';
        return 'unknown';
    }

    // ========== Vision helpers ==========
    function fetchViaGM(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                responseType: 'blob',
                onload(res) {
                    try {
                        const reader = new FileReader();
                        reader.onload = () => {
                            const data = String(reader.result || '');
                            resolve({
                                b64: data.split(',')[1] || '',
                                mime: (data.match(/^data:(image\/[a-z0-9+.-]+)/i) || [])[1] || 'image/png'
                            });
                        };
                        reader.onerror = () => reject(new Error('FileReader'));
                        reader.readAsDataURL(res.response);
                    } catch (e) { reject(e); }
                },
                onerror: () => reject(new Error('GM fetch fail'))
            });
        });
    }

    function imgToBase64(img) {
        return new Promise((resolve, reject) => {
            const src = img.currentSrc || img.src || '';
            if (!src) return reject(new Error('no src'));
            if (/^data:image\//i.test(src)) {
                return resolve({
                    b64: src.split(',')[1] || '',
                    mime: (src.match(/^data:(image\/[a-z0-9+.-]+)/i) || [])[1] || 'image/png'
                });
            }
            const draw = () => {
                try {
                    const w = img.naturalWidth || img.width || 0;
                    const h = img.naturalHeight || img.height || 0;
                    if (w < 10 || h < 10) return fetchViaGM(src).then(resolve).catch(reject);
                    const c = document.createElement('canvas');
                    c.width = w; c.height = h;
                    c.getContext('2d').drawImage(img, 0, 0);
                    const data = c.toDataURL('image/png');
                    resolve({ b64: data.split(',')[1], mime: 'image/png' });
                } catch (e) {
                    fetchViaGM(src).then(resolve).catch(reject);
                }
            };
            if (img.complete && (img.naturalWidth || 0) > 0) draw();
            else {
                img.onload = () => draw();
                img.onerror = () => fetchViaGM(src).then(resolve).catch(reject);
                setTimeout(() => fetchViaGM(src).then(resolve).catch(reject), 2500);
            }
        });
    }

    function callPatewayVision(parts, promptText) {
        return new Promise((resolve, reject) => {
            const key = getPatewayKey();
            if (!key) return reject(new Error('Chưa nhập Pateway API key'));
            const content = parts.map(p => ({
                type: 'image',
                source: { type: 'base64', media_type: p.mime || 'image/png', data: p.b64 }
            }));
            content.push({ type: 'text', text: promptText });
            const models = ['claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-opus-4-6'];
            const tryModel = (idx) => {
                if (idx >= models.length) return reject(new Error('Pateway vision lỗi hết model'));
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: 'https://api.pateway.ai/v1/messages',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': key,
                        'Authorization': 'Bearer ' + key,
                        'anthropic-version': '2023-06-01'
                    },
                    data: JSON.stringify({
                        model: models[idx],
                        max_tokens: 600,
                        messages: [{ role: 'user', content }]
                    }),
                    onload(res) {
                        try {
                            const j = JSON.parse(res.responseText || '{}');
                            if (res.status < 200 || res.status >= 300) return tryModel(idx + 1);
                            let t = '';
                            if (Array.isArray(j.content)) t = j.content.map(c => c.text || '').join('\n').trim();
                            else if (j.choices) t = ((((j.choices || [])[0] || {}).message || {}).content || '').trim();
                            if (!t) return tryModel(idx + 1);
                            resolve(t);
                        } catch (e) { tryModel(idx + 1); }
                    },
                    onerror: () => tryModel(idx + 1)
                });
            };
            tryModel(0);
        });
    }

    function parseDomainFromText(raw) {
        const t = String(raw || '');
        const m = t.match(/\b([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)\b/i);
        if (m) {
            const d = m[1].toLowerCase().replace(/^www\./, '');
            if (!/imgur|google|facebook|gstatic|pateway/i.test(d)) return d;
        }
        const m2 = t.match(/\b([a-z0-9.*-]+\.[a-z*]{2,})\b/i);
        return m2 ? m2[1].toLowerCase() : '';
    }

    function parseFieldLabelFromText(raw) {
        const t = String(raw || '');
        const patterns = [
            /(?:sau\s*chữ|nhãn|label)\s*[:：]?\s*[「"']?([^「"'\n]{2,40})/i,
            /(ID\s*bài\s*viết|Mã\s*khuyến\s*mãi|Mã\s*KM|Hotline|Số\s*điện\s*thoại)/i
        ];
        for (const re of patterns) {
            const m = t.match(re);
            if (m) return (m[1] || m[0]).replace(/\s+/g, ' ').trim();
        }
        return '';
    }

    /** AI đọc ảnh guide: domain + title (bắt buộc title để match Google) */
    async function aiReadDomainAndTitleFromGuide() {
        const { websiteGuide, all } = findGuideImages();
        const targets = websiteGuide.length ? websiteGuide : all.slice(0, 2);
        if (!targets.length) throw new Error('Không thấy ảnh guide-image');
        const parts = [];
        for (const img of targets.slice(0, 2)) {
            try { parts.push(await imgToBase64(img)); } catch (e) { console.log('[2s] img skip', e); }
        }
        if (!parts.length) throw new Error('Không đọc được ảnh');

        const raw = await callPatewayVision(parts,
            'Ảnh hướng dẫn truy cập website / kết quả Google.\n' +
            'QUAN TRỌNG NHẤT: đọc TITLE (tiêu đề bài / tiêu đề kết quả Google) nguyên văn, đầy đủ.\n' +
            'Domain nếu có thì ghi thêm.\n' +
            'Trả về đúng 2 dòng:\nDOMAIN: ...\nTITLE: ...\nKhông giải thích thêm.'
        );

        let domain = '';
        let title = '';
        const md = raw.match(/DOMAIN\s*[:：]\s*(.+)/i);
        const mt = raw.match(/TITLE\s*[:：]\s*(.+)/i);
        if (md) domain = parseDomainFromText(md[1]) || md[1].trim();
        if (mt) title = mt[1].replace(/\s+/g, ' ').trim();
        if (!domain) domain = parseDomainFromText(raw);
        if (!title) {
            // fallback: dòng dài nhất không phải domain
            const lines = raw.split(/\n/).map(l => l.replace(/^DOMAIN\s*[:：]\s*/i, '').replace(/^TITLE\s*[:：]\s*/i, '').trim()).filter(Boolean);
            title = lines.sort((a, b) => b.length - a.length)[0] || '';
            if (title && parseDomainFromText(title) === title) title = lines[1] || title;
        }
        return { domain, title, raw };
    }

    async function aiReadCopyFieldMission() {
        const { copyFieldGuide, all } = findGuideImages();
        const targets = copyFieldGuide.length ? copyFieldGuide : all.slice(0, 2);
        if (!targets.length) throw new Error('Không thấy ảnh nhiệm vụ copy');
        const parts = [];
        for (const img of targets.slice(0, 2)) {
            try { parts.push(await imgToBase64(img)); } catch (e) {}
        }
        if (!parts.length) throw new Error('Không đọc được ảnh');
        const raw = await callPatewayVision(parts,
            'Ảnh nhiệm vụ tìm & sao chép (ID / Mã KM / Hotline...). Cho biết NHÃN đứng trước giá trị cần copy. 1 dòng thôi.'
        );
        return parseFieldLabelFromText(raw) || raw.trim().split('\n')[0].trim();
    }

    // ========== Title similarity ==========
    function normalizeTitle(s) {
        return String(s || '')
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    function titleSimilarity(a, b) {
        const na = normalizeTitle(a);
        const nb = normalizeTitle(b);
        if (!na || !nb) return 0;
        if (na === nb) return 100;
        if (na.includes(nb) || nb.includes(na)) return 85;
        const wa = new Set(na.split(' ').filter(w => w.length > 1));
        const wb = nb.split(' ').filter(w => w.length > 1);
        if (!wa.size || !wb.length) return 0;
        let hit = 0;
        for (const w of wb) if (wa.has(w)) hit++;
        return Math.round((hit / Math.max(wa.size, wb.length)) * 100);
    }

    // ========== Google: keyword search, match domain + best title ==========
    function getDomain(url) {
        try {
            let u = String(url || '');
            if (!/^https?:/i.test(u)) u = 'https://' + u;
            return new URL(u).hostname.replace(/^www\./, '').toLowerCase();
        } catch (e) { return ''; }
    }

    function similarity(a, b) {
        a = String(a || '').toLowerCase();
        b = String(b || '').toLowerCase();
        if (!a || !b) return 0;
        if (a === b) return 1;
        if (a.includes(b) || b.includes(a)) return 0.85;
        const wa = a.split(/[^a-z0-9]+/).filter(Boolean);
        const wb = new Set(b.split(/[^a-z0-9]+/).filter(Boolean));
        if (!wa.length) return 0;
        let hit = 0;
        for (const w of wa) if (wb.has(w)) hit++;
        return hit / Math.max(wa.length, wb.size || 1);
    }

    function openGoogleSearch(keyword, domainHint, titleHint, newTab) {
        if (!keyword) return alert('Chưa có từ khóa');
        const url = 'https://www.google.com/search?q=' + encodeURIComponent(String(keyword).trim()) + '&hl=vi';
        GM_setValue(STORE.keyword, keyword || '');
        GM_setValue(STORE.domain, domainHint || '');
        GM_setValue(STORE.title, titleHint || '');
        GM_setValue(STORE.flowArmed, true);
        GM_setValue(STORE.flowTime, Date.now());
        // Key giống link4m để dễ debug
        GM_setValue('as2s_smart_keyword', keyword || '');
        GM_setValue('as2s_smart_domain', domainHint || '');
        GM_setValue('as2s_smart_title', titleHint || '');
        GM_setValue('as2s_smart_time', Date.now());
        console.log('[2s] Google search:', keyword, '| title=', (titleHint || '').slice(0, 50), '| domain=', domainHint);
        if (newTab) {
            const w = window.open(url, '_blank');
            if (!w) location.href = url;
        } else {
            location.href = url;
        }
    }

    // ===== Google SERP: cơ chế giống link4m — ƯU TIÊN TITLE =====
    function runOnGoogle() {
        if (!/google\./i.test(location.hostname || '')) return;
        if (!/\/search/.test(location.pathname || '')) return;

        const keyword = GM_getValue(STORE.keyword, '') || GM_getValue('as2s_smart_keyword', '');
        const suggested = (GM_getValue(STORE.domain, '') || GM_getValue('as2s_smart_domain', '') || '').toLowerCase().replace(/^www\./, '');
        const titleHint = (GM_getValue(STORE.title, '') || GM_getValue('as2s_smart_title', '') || '').trim();
        const time = GM_getValue(STORE.flowTime, 0) || GM_getValue('as2s_smart_time', 0);
        const armed = GM_getValue(STORE.flowArmed, false);

        if (!armed || !keyword || !time || Date.now() - time > 300000) {
            console.log('[2s] Google: chưa armed');
            return;
        }
        console.log('[2s] Google auto-click (link4m-style). TITLE=', titleHint.slice(0, 60), 'domain=', suggested);

        const resolveHref = (a) => {
            let href = a.href || a.getAttribute('href') || '';
            if (!href) return '';
            try {
                const u = new URL(href, location.href);
                if (u.pathname === '/url') {
                    const q = u.searchParams.get('q') || u.searchParams.get('url');
                    if (q) return q;
                }
                return u.href;
            } catch (e) { return href; }
        };

        const isJunk = (href) => {
            if (!href || !/^https?:/i.test(href)) return true;
            return /google\.|webcache|accounts\.google|maps\.google|youtube\.com\/results|policies\.google|support\.google/i.test(href);
        };

        const collectCandidates = () => {
            const out = [];
            const seen = new Set();
            const consider = (a, root) => {
                if (!a || a.tagName !== 'A') return;
                const real = resolveHref(a);
                if (isJunk(real) || seen.has(real)) return;
                seen.add(real);
                const domain = getDomain(real);
                if (!domain || domain.length < 3) return;
                let title = '';
                try {
                    const h3 = (root && root.querySelector('h3')) || a.querySelector('h3') ||
                        (a.closest('div') && a.closest('div').querySelector('h3'));
                    title = (h3 && h3.textContent) || a.textContent || '';
                } catch (e) {}
                title = String(title).replace(/\s+/g, ' ').trim();
                if (title.length < 2) return;
                out.push({ a, real, domain: domain.replace(/^www\./, ''), title });
            };

            const roots = document.querySelectorAll('#search .g, #rso .g, #search [data-sokoban-container], #rso div[data-hveid], #search div[data-hveid]');
            roots.forEach(node => {
                const a = node.querySelector('a[href]');
                consider(a, node);
            });
            if (out.length < 2) {
                document.querySelectorAll('#search h3, #rso h3').forEach(h3 => {
                    const a = h3.closest('a') || (h3.parentElement && h3.parentElement.closest('a'));
                    consider(a, h3.closest('div') || a);
                });
            }
            if (out.length < 1) {
                document.querySelectorAll('#search a[href], #rso a[href]').forEach(a => consider(a, a));
            }
            return out;
        };

        const scoreOne = (c) => {
            // TITLE là chính (user yêu cầu đọc title)
            let score = 0;
            if (titleHint) {
                const tSim = typeof titleSimilarity === 'function'
                    ? titleSimilarity(c.title, titleHint) / 100
                    : similarity(c.title, titleHint);
                score += tSim * 100; // 0–100
                // bonus exact-ish
                const na = normalizeTitle(c.title);
                const nb = normalizeTitle(titleHint);
                if (na && nb && (na === nb || na.includes(nb) || nb.includes(na))) score += 40;
            } else {
                score += 15; // không có title → vẫn cho organic
            }
            // Domain phụ (nhẹ)
            if (suggested) {
                if (c.domain === suggested) score += 25;
                else if (c.domain.endsWith('.' + suggested) || suggested.includes(c.domain.split('.')[0])) score += 12;
                else score += similarity(c.domain, suggested) * 10;
            }
            // Keyword trong title
            try {
                const kw = String(keyword || '').toLowerCase();
                if (kw.length >= 3 && c.title.toLowerCase().includes(kw.slice(0, Math.min(16, kw.length)))) score += 12;
            } catch (e) {}
            return score;
        };

        const doNavigate = (c) => {
            console.log('[2s] VÀO link:', c.domain, '|', c.title.slice(0, 60), '|', c.real.slice(0, 80));
            try {
                // giữ flowArmed cho SITE2S trang đích
                GM_deleteValue('as2s_smart_keyword');
                GM_deleteValue('as2s_smart_time');
            } catch (e) {}
            try { c.a.scrollIntoView({ block: 'center' }); } catch (e) {}
            try {
                const r = c.a.getBoundingClientRect();
                const x = r.left + r.width / 2;
                const y = r.top + r.height / 2;
                ['mousedown', 'mouseup', 'click'].forEach(type => {
                    try {
                        c.a.dispatchEvent(new MouseEvent(type, {
                            bubbles: true, cancelable: true, view: window,
                            clientX: x, clientY: y, button: 0
                        }));
                    } catch (e) {}
                });
                c.a.click();
            } catch (e) {}
            setTimeout(() => {
                if (/google\./i.test(location.hostname)) {
                    try { location.href = c.real; } catch (e) {}
                }
            }, 1000);
        };

        let tried = 0;
        const tryClick = () => {
            tried++;
            try {
                const consent = document.querySelector('#L2AGLb, button[aria-label*="Accept"], button[aria-label*="Chấp nhận"]');
                if (consent) consent.click();
            } catch (e) {}

            const list = collectCandidates();
            let best = null, bestScore = -1;
            for (const c of list) {
                const sc = scoreOne(c);
                console.log('[2s] SERP score', Math.round(sc), c.domain, '|', c.title.slice(0, 45));
                if (sc > bestScore) { bestScore = sc; best = c; }
            }

            // Ưu tiên title: ngưỡng ~25 nếu có titleHint
            const minScore = titleHint ? 25 : 12;
            if (best && bestScore >= minScore) {
                doNavigate(best);
                return;
            }
            // Fallback: organic đầu sau vài lần thử
            if (tried >= 6 && list.length) {
                console.log('[2s] Fallback organic đầu');
                doNavigate(list[0]);
                return;
            }
            if (tried < 18) setTimeout(tryClick, 900);
            else console.log('[2s] Hết thử — không vào được link');
        };

        setTimeout(tryClick, 1400);
        setTimeout(tryClick, 3000);
        setTimeout(tryClick, 5200);
        try {
            let n = 0;
            const obs = new MutationObserver(() => {
                n++;
                if (n === 4 || n === 10) tryClick();
                if (n > 25) { try { obs.disconnect(); } catch (e) {} }
            });
            const root = document.querySelector('#search, #rso, body');
            if (root) obs.observe(root, { childList: true, subtree: true });
            setTimeout(() => { try { obs.disconnect(); } catch (e) {} }, 22000);
        } catch (e) {}
    }

    // ========== Extract value on target ==========
    function extractFieldValue(label) {
        label = String(label || '').trim();
        const body = document.body ? document.body.innerText : '';
        if (label) {
            const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp(esc + '\\s*[:：#]?\\s*([A-Za-z0-9][A-Za-z0-9._+\\-() /]{2,60})', 'i');
            const m = body.match(re);
            if (m) return m[1].trim();
        }
        if (/hotline|điện thoại|phone|tel/i.test(label)) {
            const phone = body.match(/(?:\+?84|0)\d{8,11}\b/);
            if (phone) return phone[0];
        }
        if (/mã|promo|code|khuyến/i.test(label)) {
            const codes = body.match(/\b([A-Z0-9]{5,16})\b/g) || [];
            const good = codes.find(c => /[A-Z]/.test(c) && /[0-9]/.test(c));
            if (good) return good;
        }
        if (/id/i.test(label)) {
            const ids = body.match(/\b(\d{4,12})\b/g);
            if (ids) return ids[0];
        }
        // Mã KM đỏ / generic
        const mKm = body.match(/Mã\s*KM\s*[:：]\s*([A-Za-z0-9]{3,16})/i);
        if (mKm) return mKm[1];
        return '';
    }

    function findFormInput() {
        const sels = [
            'input[name*="code" i]', 'input[id*="code" i]',
            'input[name*="answer" i]', 'input[id*="answer" i]',
            'input[name*="result" i]', 'input[type="text"]', 'textarea', 'input:not([type])'
        ];
        for (const s of sels) {
            for (const el of $all(s)) {
                if (el.closest && el.closest('#as2s-panel, #as2s-btn')) continue;
                const r = el.getBoundingClientRect();
                if (r.width > 40 && r.height > 10) return el;
            }
        }
        return null;
    }

    function pasteOnForm(value) {
        const inp = findFormInput();
        if (!inp) return false;
        inp.focus();
        const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') ||
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
        if (desc && desc.set) desc.set.call(inp, value);
        else inp.value = value;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        try { GM_deleteValue(STORE.pending); } catch (e) {}
        console.log('[2s] Đã dán form:', value);
        return true;
    }

    function submitValueToOrigin(value) {
        value = String(value || '').trim();
        if (!value) return;
        GM_setValue(STORE.pending, value);
        GM_setValue(STORE.pendingTime, Date.now());
        try { GM_deleteValue(STORE.flowArmed); } catch (e) {}
        const origin = GM_getValue(STORE.origin, '');
        if (origin && origin !== location.href) {
            console.log('[2s] → về 2s với:', value);
            location.href = origin;
            return;
        }
        pasteOnForm(value);
    }

    function consumePendingOnOrigin() {
        try {
            if (!is2sFormPage() && !findFormInput()) return;
            const v = GM_getValue(STORE.pending, '');
            if (!v) return;
            const t = GM_getValue(STORE.pendingTime, 0);
            if (t && Date.now() - t > 300000) return;
            setTimeout(() => pasteOnForm(v), 600);
            setTimeout(() => pasteOnForm(v), 1800);
        } catch (e) {}
    }

    // ========== Auto on Google ==========
    function runOnGoogle() {
        if (!isGoogleHost()) return;
        const armed = GM_getValue(STORE.flowArmed, false);
        const ft = GM_getValue(STORE.flowTime, 0);
        if (!armed || (ft && Date.now() - ft > 600000)) {
            console.log('[2s] Google: chưa armed hoặc hết hạn');
            return;
        }

        const domain = GM_getValue(STORE.domain, '');
        const title = GM_getValue(STORE.title, '');
        console.log('[2s] Google auto-nav domain=', domain, 'title=', (title || '').slice(0, 40));

        let tried = 0;
        const tryPick = () => {
            tried++;
            // Consent
            try {
                const consent = document.querySelector('#L2AGLb, button[aria-label*="Accept"], button[aria-label*="Chấp nhận"]');
                if (consent) consent.click();
            } catch (e) {}

            const best = pickGoogleResultBest(domain, title);
            if (!best) {
                console.log('[2s] Chưa có kết quả, thử lại', tried);
                if (tried < 16) setTimeout(tryPick, 1000);
                return false;
            }
            console.log('[2s] VÀO:', best.host, best.href.slice(0, 80));
            // Giữ armed để trang đích SITE2S tiếp tục; clear keyword time thôi không clear s2s
            try {
                // Không xóa flowArmed ngay — trang đích cần
            } catch (e) {}
            try {
                best.a.scrollIntoView({ block: 'center' });
            } catch (e) {}
            try {
                const r = best.a.getBoundingClientRect();
                const x = r.left + r.width / 2, y = r.top + r.height / 2;
                ['mousedown', 'mouseup', 'click'].forEach(type => {
                    try {
                        best.a.dispatchEvent(new MouseEvent(type, {
                            bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0
                        }));
                    } catch (e) {}
                });
                best.a.click();
            } catch (e) {}
            setTimeout(() => {
                if (/google\./i.test(location.hostname)) {
                    try { location.href = best.href; } catch (e) {}
                }
            }, 1100);
            return true;
        };

        setTimeout(tryPick, 1200);
        setTimeout(tryPick, 2800);
        setTimeout(tryPick, 5000);
    }

    // ========== Auto on target site ==========
    function runOnTargetPage() {
        if (isGoogleHost() || is2sFormPage()) return;
        const armed = GM_getValue(STORE.flowArmed, false);
        const ft = GM_getValue(STORE.flowTime, 0);
        if (!armed || (ft && Date.now() - ft > 600000)) return;

        const mission = GM_getValue(STORE.mission, 'website');
        const label = GM_getValue(STORE.fieldLabel, '');

        const tryExtract = () => {
            let val = '';
            if (mission === 'copy_field') {
                val = extractFieldValue(label);
            } else {
                // website mission: thử lấy mã KM / code chung
                val = extractFieldValue(label || 'Mã KM') || extractFieldValue('Hotline') || extractFieldValue('ID');
            }
            if (val) {
                console.log('[2s] Lấy được:', val);
                submitValueToOrigin(val);
                return true;
            }
            return false;
        };

        setTimeout(() => { if (!tryExtract()) setTimeout(tryExtract, 2500); }, 1800);
        setTimeout(tryExtract, 5000);
    }

    // ========== Full auto flow from 2s page ==========
    async function runFullFlow(newTab) {
        markOriginIf2s();
        const setSt = (t) => {
            const el = document.getElementById('as2s-status');
            if (el) el.textContent = t;
            console.log('[2s]', t);
        };

        let keyword = (document.getElementById('as2s-keyword') && document.getElementById('as2s-keyword').value) || scrapeKeyword();
        keyword = String(keyword || '').trim();
        if (!keyword) {
            keyword = scrapeKeyword();
            if (document.getElementById('as2s-keyword')) document.getElementById('as2s-keyword').value = keyword;
        }
        if (!keyword) return alert('Chưa có từ khóa (.keyword-highlight)');

        setSt('1/4 Đọc ảnh: domain + title…');
        let domain = (document.getElementById('as2s-domain') && document.getElementById('as2s-domain').value) || '';
        let title = (document.getElementById('as2s-title') && document.getElementById('as2s-title').value) || '';
        try {
            if (!domain || !title) {
                const r = await aiReadDomainAndTitleFromGuide();
                if (!domain) domain = r.domain;
                if (!title) title = r.title;
            }
        } catch (e) {
            setSt('AI ảnh: ' + e.message + ' — vẫn search bằng keyword');
        }

        if (document.getElementById('as2s-domain')) document.getElementById('as2s-domain').value = domain || '';
        if (document.getElementById('as2s-title')) document.getElementById('as2s-title').value = title || '';

        const field = (document.getElementById('as2s-field') && document.getElementById('as2s-field').value) || '';
        const mission = field ? 'copy_field' : detectMissionType();
        GM_setValue(STORE.mission, mission === 'unknown' ? 'website' : mission);
        if (field) GM_setValue(STORE.fieldLabel, field);

        setSt('2/4 Google: "' + keyword + '" | domain=' + (domain || '?') + ' | title=' + (title || '?').slice(0, 40));
        openGoogleSearch(keyword, domain, title, !!newTab);
        // 3/4 chọn SERP + 4/4 lấy mã chạy tự động trên trang sau
    }


    // ========== NHIỆM VỤ CONTINUE (rtg-button) ==========
    // Flow: đếm ngược xong → "Scroll down & click Continue"
    //   → Dual Tap Continue (#button1 .rtg-button)
    //   → please wait → OPEN - CONTINUE
    //   → lặp 1–2 lần
    //   → click ảnh ads → quay lại
    //   → "Nhận liên kết" (.get-link) → xong

    function isContinueMissionPage() {
        try {
            const t = (document.body && document.body.innerText) || '';
            if (/Scroll down.*Continue|Dual Tap|OPEN\s*-\s*CONTINUE|Nhận liên kết|rtglink/i.test(t)) return true;
            if (document.querySelector('.rtg-button, #button1, a.get-link, button.rtg-button')) return true;
            if (document.querySelector('img[alt="ads"][src*="vectorstock"], img[src*="click-here-button"]')) return true;
        } catch (e) {}
        return false;
    }

    function contEnabled() {
        try { return !!GM_getValue(STORE.contEnabled, false); } catch (e) { return false; }
    }

    function findDualTapContinue() {
        // <div id="button1" style="display:block"><button class="rtg-button" onclick="rtglink()">Dual Tap "Continue"</button>
        const box = document.getElementById('button1');
        if (box) {
            try {
                const st = getComputedStyle(box);
                if (st.display === 'none' || st.visibility === 'hidden') { /* skip hidden */ }
                else {
                    const b = box.querySelector('button.rtg-button, .rtg-button, button');
                    if (b) return b;
                }
            } catch (e) {
                const b = box.querySelector('button.rtg-button, button');
                if (b) return b;
            }
        }
        for (const b of $all('button.rtg-button, .rtg-button, button')) {
            const t = (b.textContent || '').replace(/\s+/g, ' ').trim();
            if (/Dual\s*Tap.*Continue|Continue/i.test(t) && /rtglink|Dual/i.test(t + (b.getAttribute('onclick') || ''))) {
                return b;
            }
            if (/Dual\s*Tap/i.test(t)) return b;
        }
        return null;
    }

    function findOpenContinue() {
        for (const b of $all('button.rtg-button, button[type="submit"], .rtg-button, button')) {
            const t = (b.textContent || '').replace(/\s+/g, ' ').trim();
            if (/OPEN\s*-\s*CONTINUE|OPEN\s*CONTINUE/i.test(t)) return b;
        }
        return null;
    }

    function findGetLink() {
        const a = document.querySelector('a.get-link, a.btn-success.get-link, a.btn.btn-success.btn-lg.get-link');
        if (a) return a;
        for (const el of $all('a.btn-success, a.btn-lg, a')) {
            const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
            if (/Nhận\s*liên\s*kết|Nhan\s*lien\s*ket|Get\s*link|Activate/i.test(t)) return el;
        }
        return null;
    }

    function findAdsImage() {
        let img = document.querySelector('img[alt="ads"][src*="vectorstock"], img[src*="click-here-button-label"], img[src*="38320331"]');
        if (img) return img;
        img = document.querySelector('img[alt="ads"], a img[alt="ads"]');
        return img || null;
    }

    function hasScrollContinueHint() {
        // Tránh đọc cả body mỗi lần — chỉ vài node ngắn
        try {
            for (const el of document.querySelectorAll('b, p, div, span, h1, h2, h3')) {
                const t = (el.textContent || '').trim();
                if (t.length < 20 || t.length > 180) continue;
                if (/Scroll\s*down.*Continue|Continue\s*button\s*for\s*your\s*destination/i.test(t)) return true;
            }
        } catch (e) {}
        return false;
    }

    function isPleaseWait() {
        if (findOpenContinue()) return false;
        try {
            for (const el of document.querySelectorAll('b, p, div, span, h3, h4')) {
                const t = (el.textContent || '').trim();
                if (t.length > 80) continue;
                if (/^please\s*wait|vui\s*lòng\s*chờ/i.test(t)) return true;
            }
        } catch (e) {}
        return false;
    }

    // Chống đơ: không MutationObserver, interval thưa, không spam scroll/click
    let __contBusy = false;
    let __contLastAction = '';
    let __contLastActionAt = 0;

    function safeClick(el, label) {
        if (!el || __contBusy) return false;
        const now = Date.now();
        if (now - __contLastActionAt < 2800) return false;
        const tag = label || 'click';
        // Cùng action trong 8s → bỏ
        if (__contLastAction === tag && now - __contLastActionAt < 8000) return false;

        __contBusy = true;
        __contLastAction = tag;
        __contLastActionAt = now;
        try { GM_setValue(STORE.contLastClick, now); } catch (e) {}

        try {
            const r = el.getBoundingClientRect();
            const inView = r.top >= 0 && r.bottom <= (window.innerHeight || 800);
            if (!inView) {
                try { el.scrollIntoView({ behavior: 'auto', block: 'center' }); } catch (e) {}
            }
        } catch (e) {}

        setTimeout(() => {
            try {
                try { el.click(); } catch (e) {}
                const oc = el.getAttribute('onclick') || '';
                if (/rtglink/i.test(oc)) {
                    try { if (typeof unsafeWindow !== 'undefined' && typeof unsafeWindow.rtglink === 'function') unsafeWindow.rtglink(); } catch (e) {}
                    try { if (typeof window.rtglink === 'function') window.rtglink(); } catch (e) {}
                }
                console.log('[2s-cont] Click:', tag);
            } catch (e) {
                console.log('[2s-cont] click err', e);
            }
            setTimeout(() => { __contBusy = false; }, 500);
        }, 350);
        return true;
    }

    function runContinueMissionTick() {
        if (!contEnabled()) return;
        if (isGoogleHost()) return;
        if (__contBusy) return;

        // 1) Nhận liên kết
        const getLink = findGetLink();
        if (getLink) {
            const st = document.getElementById('as2s-cont-status');
            if (st) st.textContent = 'Nhận liên kết → click';
            if (safeClick(getLink, 'get-link')) {
                try { GM_setValue(STORE.contStep, 'done'); } catch (e) {}
                setTimeout(() => {
                    try { GM_setValue(STORE.contEnabled, false); } catch (e) {}
                    updateContSwitchUI();
                }, 4000);
            }
            return;
        }

        // 2) OPEN - CONTINUE (ưu tiên hơn ads khi còn nút)
        const openBtn = findOpenContinue();
        if (openBtn) {
            let visible = true;
            try {
                const st = getComputedStyle(openBtn);
                if (st.display === 'none' || st.visibility === 'hidden') visible = false;
            } catch (e) {}
            if (visible) {
                const s2 = document.getElementById('as2s-cont-status');
                if (s2) s2.textContent = 'OPEN - CONTINUE → click';
                if (safeClick(openBtn, 'open-continue')) {
                    try { GM_setValue(STORE.contStep, 'open_continue'); } catch (e) {}
                }
                return;
            }
        }

        // 3) Please wait — không làm gì
        if (isPleaseWait()) {
            const st = document.getElementById('as2s-cont-status');
            if (st) st.textContent = 'Please wait…';
            return;
        }

        // 4) Dual Tap Continue
        const dual = findDualTapContinue();
        if (dual && (hasScrollContinueHint() || document.getElementById('button1'))) {
            let visible = true;
            try {
                const box = document.getElementById('button1');
                if (box && getComputedStyle(box).display === 'none') visible = false;
            } catch (e) {}
            if (visible) {
                const st = document.getElementById('as2s-cont-status');
                if (st) st.textContent = 'Dual Tap Continue → click';
                if (safeClick(dual, 'dual-tap')) {
                    try { GM_setValue(STORE.contStep, 'dual_tap'); } catch (e) {}
                }
                return;
            }
        }

        // 5) Ads — chỉ khi đã dual/open và chưa get-link
        const step = (() => { try { return GM_getValue(STORE.contStep, ''); } catch (e) { return ''; } })();
        const ads = findAdsImage();
        if (ads && (step === 'open_continue' || step === 'dual_tap' || step === 'ads_clicked')) {
            if (step !== 'ads_clicked' || Date.now() - __contLastActionAt > 10000) {
                const st = document.getElementById('as2s-cont-status');
                if (st) st.textContent = 'Click ads — xong thì quay lại tab này';
                const target = ads.closest('a') || ads;
                if (safeClick(target, 'ads')) {
                    try { GM_setValue(STORE.contStep, 'ads_clicked'); } catch (e) {}
                }
                return;
            }
        }

        const st = document.getElementById('as2s-cont-status');
        if (st && contEnabled()) {
            st.textContent = hasScrollContinueHint()
                ? 'Có hint Continue — chờ nút…'
                : 'Đang chờ đếm ngược / Continue…';
        }
    }

    function startContinueWatcher() {
        if (window.__as2sContWatch) return;
        window.__as2sContWatch = true;
        // CHỈ interval — KHÔNG MutationObserver (gây đơ trang)
        setInterval(() => {
            try {
                if (!contEnabled()) return;
                runContinueMissionTick();
            } catch (e) {}
        }, 2500);
        setTimeout(() => {
            try { if (contEnabled()) runContinueMissionTick(); } catch (e) {}
        }, 1200);
    }

    function updateContSwitchUI() {
        const sw = document.getElementById('as2s-cont-sw');
        if (!sw) return;
        const on = contEnabled();
        sw.className = 'as2s-switch' + (on ? ' on' : '');
        const st = document.getElementById('as2s-cont-status');
        if (st) st.textContent = on ? 'Đang bật — chờ Continue (không đơ trang)…' : 'Đã tắt';
    }


    // ========== NHIỆM VỤ SITE2S — tìm nút LẤY LINK (không click lúc captcha) ==========
    // 1) keyword + domain + title → Google → vào web
    // 2) Cuộn tìm nút SITE2S / "LẤY LINK NGAY" — CHỈ highlight, USER tự bấm + captcha
    // 3) Sau captcha: đếm ngược xong → nút thành "Lấy link" → tool tự bấm
    // 4) Thấy "Truy cập link tại đây" → tool tự bấm → xong

    function s2sEnabled() {
        try { return !!GM_getValue(STORE.s2sEnabled, false); } catch (e) { return false; }
    }

    function findSite2sButton() {
        // Không tìm trên trang hướng dẫn traffic2s / form 2s
        if (isGoogleHost()) return null;
        try {
            const h = (location.hostname || '').toLowerCase();
            if (/traffic2s\.com|site2s\.net/i.test(h)) return null;
        } catch (e) {}
        // Trang form nhiệm vụ (có keyword-highlight + guide-image) → đây là ví dụ, không phải nút thật
        if (document.querySelector('.keyword-container, span.keyword-highlight') &&
            document.querySelector('img.guide-image') &&
            /traffic2s|site2s|Cuộn xuống cuối|LẤY LINK NGAY như thế này/i.test(document.body.innerText || '')) {
            return null;
        }

        const candidates = $all('a, button');
        let best = null;
        let bestScore = 0;
        for (const el of candidates) {
            try {
                if (el.closest && el.closest('#as2s-panel, #as2s-btn')) continue;
            } catch (e) {}
            const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
            if (!t || t.length > 60) continue;
            // Bỏ L4M / LẤY MÃ đỏ
            if (/\bL4M\b|LẤY\s*MÃ|LAY\s*MA/i.test(t)) continue;
            let score = 0;
            if (/SITE\s*2\s*S|SITE2S/i.test(t)) score += 50;
            if (/LẤY\s*LINK\s*NGAY|LAY\s*LINK\s*NGAY/i.test(t)) score += 40;
            if (/LẤY\s*LINK|Lấy\s*link/i.test(t) && /SITE2S/i.test(t)) score += 20;
            // Phải có SITE2S hoặc đủ cụm LẤY LINK NGAY
            if (score < 40) continue;
            const r = el.getBoundingClientRect();
            if (r.width < 20 || r.height < 12) continue;
            // Ưu tiên có href / onclick
            if (el.tagName === 'A' && el.href) score += 10;
            if (score > bestScore) {
                bestScore = score;
                best = el;
            }
        }
        return best;
    }

    function findLayLinkAfterCountdown() {
        // Sau captcha/đếm ngược: nút đổi thành "Lấy link"
        for (const el of $all('a, button, div[role="button"]')) {
            try {
                if (el.closest && el.closest('#as2s-panel, #as2s-btn')) continue;
            } catch (e) {}
            const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
            if (!t || t.length > 60) continue;
            // Đúng "Lấy link" — không phải LẤY LINK NGAY ban đầu nếu vẫn còn captcha overlay
            if (/^Lấy\s*link$|^Lay\s*link$|Lấy\s*link\s*!/i.test(t) ||
                (/Lấy\s*link/i.test(t) && !/NGAY|LẤY\s*MÃ|L4M/i.test(t))) {
                const r = el.getBoundingClientRect();
                if (r.width > 10 && r.height > 10) return el.closest('a, button') || el;
            }
        }
        // SITE2S đã đổi text
        for (const el of $all('a, button')) {
            const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
            if (/SITE2S/i.test(t) && /Lấy\s*link/i.test(t) && !/NGAY/i.test(t)) {
                return el;
            }
        }
        return null;
    }

    function findTruyCapLink() {
        for (const el of $all('a, button, div[role="button"], span')) {
            try {
                if (el.closest && el.closest('#as2s-panel, #as2s-btn')) continue;
            } catch (e) {}
            const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
            if (/Truy\s*cập\s*link\s*tại\s*đây|Truy\s*cap\s*link|Access\s*link\s*here/i.test(t)) {
                return el.closest('a, button') || el;
            }
        }
        return null;
    }

    function highlightEl(el) {
        if (!el) return;
        try {
            el.style.outline = '3px solid #22c55e';
            el.style.outlineOffset = '3px';
            el.style.boxShadow = '0 0 0 4px rgba(34,197,153,.35)';
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (e) {}
    }

    function s2sLightClick(el, label) {
        if (!el) return false;
        const now = Date.now();
        const last = window.__as2sS2sClickAt || 0;
        if (now - last < 3000) return false;
        window.__as2sS2sClickAt = now;
        try { el.scrollIntoView({ behavior: 'auto', block: 'center' }); } catch (e) {}
        setTimeout(() => {
            try {
                el.click();
                console.log('[2s-s2s] Click:', label || (el.textContent || '').slice(0, 40));
            } catch (e) {}
        }, 300);
        return true;
    }

    function runSite2sTick() {
        if (!s2sEnabled()) return;
        if (isGoogleHost()) return;
        // Trang hướng dẫn 2s: không coi nút mẫu là đích
        try {
            if (/traffic2s\.com/i.test(location.hostname || '')) return;
        } catch (e) {}
        if (document.querySelector('.keyword-container') && document.querySelector('img.guide-image')) {
            // Vẫn cho phép nếu domain không phải traffic2s (hiếm)
            if (/Cuộn xuống cuối trang|LẤY LINK NGAY như thế này|Báo lỗi từ khóa/i.test(document.body.innerText || '')) return;
        }

        const st = document.getElementById('as2s-s2s-status');

        // 4) Truy cập link tại đây
        const truy = findTruyCapLink();
        if (truy) {
            if (st) st.textContent = 'Truy cập link tại đây → tự click';
            if (s2sLightClick(truy, 'truy-cap')) {
                try { GM_setValue(STORE.s2sStep, 'done'); } catch (e) {}
                setTimeout(() => {
                    try { GM_setValue(STORE.s2sEnabled, false); } catch (e) {}
                    updateS2sSwitchUI();
                }, 2500);
            }
            return;
        }

        // 3) Lấy link (sau countdown)
        const lay = findLayLinkAfterCountdown();
        if (lay) {
            if (st) st.textContent = 'Lấy link (sau đếm ngược) → tự click';
            if (s2sLightClick(lay, 'lay-link')) {
                try { GM_setValue(STORE.s2sStep, 'lay_link'); } catch (e) {}
            }
            return;
        }

        // 2) Tìm / highlight nút SITE2S — KHÔNG auto click (user + captcha)
        const btn = findSite2sButton();
        if (btn) {
            try { GM_setValue(STORE.s2sFound, true); } catch (e) {}
            highlightEl(btn);
            if (st) st.textContent = 'Đã tìm thấy SITE2S — BẠN tự bấm + captcha. Tool sẽ tự làm bước sau.';
            return;
        }

        // Cuộn nhẹ tìm nút (không đơ)
        try {
            const y = window.scrollY || 0;
            const max = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) - window.innerHeight;
            if (y < max - 50) {
                window.scrollBy(0, Math.min(400, max - y));
                if (st) st.textContent = 'Đang cuộn tìm nút SITE2S…';
            } else {
                if (st) st.textContent = 'Chưa thấy nút SITE2S — cuộn tay hoặc đợi trang load';
            }
        } catch (e) {}
    }

    function startSite2sWatcher() {
        if (window.__as2sS2sWatch) return;
        window.__as2sS2sWatch = true;
        setInterval(() => {
            try { if (s2sEnabled()) runSite2sTick(); } catch (e) {}
        }, 2800);
        setTimeout(() => { try { if (s2sEnabled()) runSite2sTick(); } catch (e) {} }, 1000);
    }

    function updateS2sSwitchUI() {
        const sw = document.getElementById('as2s-s2s-sw');
        if (!sw) return;
        const on = s2sEnabled();
        sw.className = 'as2s-switch' + (on ? ' on' : '');
        const st = document.getElementById('as2s-s2s-status');
        if (st && !on) st.textContent = 'Đã tắt';
        if (st && on) st.textContent = 'Đang bật — tìm SITE2S / chờ Lấy link / Truy cập link…';
    }

    async function runSite2sFullFlow(newTab) {
        markOriginIf2s();
        const setSt = (t) => {
            const el = document.getElementById('as2s-s2s-status');
            if (el) el.textContent = t;
            console.log('[2s-s2s]', t);
        };

        let keyword = scrapeKeyword();
        const kEl = document.getElementById('as2s-keyword');
        if (kEl && kEl.value.trim()) keyword = kEl.value.trim();
        else if (kEl) kEl.value = keyword;
        if (!keyword) return alert('Chưa có từ khóa (keyword-highlight)');

        setSt('AI domain + title…');
        let domain = (document.getElementById('as2s-domain') && document.getElementById('as2s-domain').value) || '';
        let title = (document.getElementById('as2s-title') && document.getElementById('as2s-title').value) || '';
        try {
            if (!domain || !title) {
                const r = await aiReadDomainAndTitleFromGuide();
                if (!domain) domain = r.domain;
                if (!title) title = r.title;
            }
        } catch (e) {
            setSt('AI: ' + e.message);
        }
        if (document.getElementById('as2s-domain')) document.getElementById('as2s-domain').value = domain || '';
        if (document.getElementById('as2s-title')) document.getElementById('as2s-title').value = title || '';

        GM_setValue(STORE.s2sEnabled, true);
        GM_setValue(STORE.s2sStep, 'search');
        GM_setValue(STORE.mission, 'site2s_button');
        GM_setValue(STORE.flowArmed, true);
        GM_setValue(STORE.flowTime, Date.now());
        updateS2sSwitchUI();
        startSite2sWatcher();

        setSt('Google → tự vào web: ' + keyword + ' | ' + (domain || '') + ' | ' + (title || '').slice(0, 30));
        openGoogleSearch(keyword, domain, title, !!newTab);
    }


    // ========== UI ==========
    function ensureUI() {
        if (document.getElementById('as2s-btn') || !document.body) return;

        const style = document.createElement('style');
        style.id = 'as2s-style';
        style.textContent = `
#as2s-btn{position:fixed!important;bottom:max(14px,env(safe-area-inset-bottom))!important;right:12px!important;width:50px!important;height:50px!important;border-radius:16px!important;background:rgba(255,255,255,.12)!important;color:#fff!important;display:flex!important;align-items:center!important;justify-content:center!important;font-size:22px!important;z-index:2147483647!important;cursor:pointer!important;border:1px solid rgba(255,255,255,.28)!important;box-shadow:0 8px 32px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.25)!important;backdrop-filter:blur(18px) saturate(180%)!important;-webkit-backdrop-filter:blur(18px) saturate(180%)!important;user-select:none!important}
#as2s-panel{position:fixed!important;left:10px!important;right:10px!important;bottom:max(70px,calc(54px + env(safe-area-inset-bottom)))!important;max-width:400px!important;margin:0 auto!important;max-height:min(72vh,540px)!important;background:rgba(12,12,14,.78)!important;color:#f5f5f7!important;border-radius:20px!important;z-index:2147483647!important;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif!important;font-size:13px!important;display:none;overflow:hidden!important;border:1px solid rgba(255,255,255,.22)!important;box-shadow:0 20px 60px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.18)!important;backdrop-filter:blur(28px) saturate(200%)!important;-webkit-backdrop-filter:blur(28px) saturate(200%)!important}
#as2s-panel .as2s-hd{padding:12px 14px!important;font-weight:700!important;display:flex!important;justify-content:space-between!important;align-items:center!important;border-bottom:1px solid rgba(255,255,255,.1)!important;background:rgba(255,255,255,.06)!important}
#as2s-panel .as2s-body{padding:12px!important;overflow-y:auto!important;max-height:min(60vh,460px)!important;-webkit-overflow-scrolling:touch!important}
#as2s-panel .as2s-tabs{display:flex!important;background:rgba(0,0,0,.25)!important;border-bottom:1px solid rgba(255,255,255,.1)!important}
#as2s-panel .as2s-tabs div{flex:1!important;text-align:center!important;padding:10px 6px!important;font-size:12px!important;font-weight:600!important;color:rgba(255,255,255,.45)!important;cursor:pointer!important}
#as2s-panel .as2s-tabs div.active{color:#fff!important;border-bottom:2px solid rgba(255,255,255,.85)!important;background:rgba(255,255,255,.06)!important}
.as2s-switch{width:42px!important;height:24px!important;background:rgba(255,255,255,.15)!important;border-radius:12px!important;position:relative!important;cursor:pointer!important;flex-shrink:0!important;display:inline-block!important}
.as2s-switch::after{content:''!important;position:absolute!important;width:20px!important;height:20px!important;background:#fff!important;border-radius:50%!important;top:2px!important;left:2px!important;transition:.2s!important}
.as2s-switch.on{background:rgba(52,211,153,.85)!important}
.as2s-switch.on::after{transform:translateX(18px)!important}
#as2s-panel input{width:100%!important;box-sizing:border-box!important;background:rgba(0,0,0,.35)!important;border:1px solid rgba(255,255,255,.14)!important;color:#fff!important;border-radius:12px!important;padding:10px 12px!important;margin:4px 0 10px!important;font-size:14px!important}
#as2s-panel label{font-size:12px!important;color:rgba(255,255,255,.55)!important;display:block!important}
.as2s-btn{width:100%!important;border:none!important;border-radius:12px!important;padding:11px!important;font-weight:700!important;cursor:pointer!important;margin-bottom:8px!important;font-size:13.5px!important;background:rgba(255,255,255,.92)!important;color:#0a0a0a!important}
.as2s-btn.green{background:rgba(52,211,153,.95)!important;color:#042f1a!important}
.as2s-btn.blue{background:rgba(129,140,248,.95)!important;color:#1e1b4b!important}
.as2s-status{font-size:11.5px!important;color:rgba(255,255,255,.6)!important;min-height:18px!important;line-height:1.4!important;margin-top:4px!important}
`;
        document.documentElement.appendChild(style);

        const btn = document.createElement('div');
        btn.id = 'as2s-btn';
        btn.innerHTML = '⚙️';
        btn.title = 'Auto Tools 2s';

        const panel = document.createElement('div');
        panel.id = 'as2s-panel';
        panel.innerHTML = `
<div class="as2s-hd"><span>Auto Tools · 2s</span><span id="as2s-close" style="cursor:pointer;opacity:.7">✕</span></div>
<div class="as2s-tabs">
  <div data-tab="search" class="active">Tìm web</div>
  <div data-tab="s2s">SITE2S</div>
  <div data-tab="cont">Continue</div>
  <div data-tab="cfg">Config</div>
</div>
<div class="as2s-body" id="as2s-tab-search">
  <div style="font-size:11px;color:rgba(255,255,255,.5);margin-bottom:10px;line-height:1.4">
    Flow: <b>từ khóa</b> → AI <b>domain + title</b> → Google → match → lấy mã → về 2s
  </div>
  <label>Từ khóa</label>
  <input id="as2s-keyword" placeholder="the westique residences">
  <label>Domain (từ ảnh)</label>
  <input id="as2s-domain" placeholder="example.com">
  <label>Title (từ ảnh — match Google)</label>
  <input id="as2s-title" placeholder="tiêu đề trong ảnh guide">
  <label>Nhãn copy (ID / Hotline / Mã…)</label>
  <input id="as2s-field" placeholder="tùy nhiệm vụ">
  <button class="as2s-btn green" id="as2s-scrape">📥 Đọc từ khóa trang</button>
  <button class="as2s-btn blue" id="as2s-ai-dt">🤖 AI đọc domain + title (ảnh)</button>
  <button class="as2s-btn blue" id="as2s-ai-field">🤖 AI đọc nhãn copy (ảnh)</button>
  <button class="as2s-btn green" id="as2s-flow">🚀 Chạy full flow (cùng tab)</button>
  <button class="as2s-btn" id="as2s-flow-new">🆕 Full flow (tab mới)</button>
  <button class="as2s-btn" id="as2s-extract">📋 Lấy giá trị trang này → 2s</button>
  <div class="as2s-status" id="as2s-status"></div>
</div>
<div class="as2s-body" id="as2s-tab-s2s" style="display:none">
  <div style="font-size:11px;color:rgba(255,255,255,.5);margin-bottom:10px;line-height:1.45">
    <b>Nút cần tìm: SITE2S LẤY LINK NGAY</b> (xanh) — <u>không</u> bấm L4M đỏ.<br>
    Tool: keyword → domain+title → Google → cuộn tìm nút → <b>bạn</b> bấm + captcha →
    đếm ngược xong tool tự <b>Lấy link</b> → <b>Truy cập link tại đây</b>.
  </div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
    <span style="font-weight:600">Auto sau captcha</span>
    <div id="as2s-s2s-sw" class="as2s-switch"></div>
  </div>
  <button class="as2s-btn green" id="as2s-s2s-flow">🚀 Full flow SITE2S (cùng tab)</button>
  <button class="as2s-btn" id="as2s-s2s-flow-new">🆕 Full flow (tab mới)</button>
  <button class="as2s-btn blue" id="as2s-s2s-find">🔍 Cuộn tìm nút SITE2S ngay</button>
  <div class="as2s-status" id="as2s-s2s-status">Đã tắt</div>
</div>
<div class="as2s-body" id="as2s-tab-cont" style="display:none">
  <div style="font-size:11px;color:rgba(255,255,255,.5);margin-bottom:10px;line-height:1.45">
    Sau khi <b>captcha xong</b>, bật auto. Tool đợi đếm ngược →
    <b>Dual Tap Continue</b> → <b>OPEN - CONTINUE</b> (1–2 lần) →
    click <b>ads</b> → quay lại → <b>Nhận liên kết</b>.
  </div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
    <span style="font-weight:600">Tự động nhiệm vụ Continue</span>
    <div id="as2s-cont-sw" class="as2s-switch"></div>
  </div>
  <button class="as2s-btn green" id="as2s-cont-once">▶ Chạy 1 bước ngay</button>
  <div class="as2s-status" id="as2s-cont-status">Đã tắt</div>
</div>
<div class="as2s-body" id="as2s-tab-cfg" style="display:none">
  <label>Pateway API key</label>
  <input id="as2s-key" type="password" placeholder="sk-...">
  <button class="as2s-btn" id="as2s-save-key">💾 Lưu key</button>
  <div class="as2s-status" id="as2s-cfg-status"></div>
</div>`;
        document.body.appendChild(btn);
        document.body.appendChild(panel);

        const setSt = (t) => { const el = document.getElementById('as2s-status'); if (el) el.textContent = t; };

        btn.onclick = (e) => {
            e.stopPropagation();
            panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
            const k = document.getElementById('as2s-keyword');
            if (k && !k.value) { const sk = scrapeKeyword(); if (sk) k.value = sk; }
            const keyEl = document.getElementById('as2s-key');
            if (keyEl) keyEl.value = getPatewayKey();
            const d = document.getElementById('as2s-domain');
            const t = document.getElementById('as2s-title');
            if (d && !d.value) d.value = GM_getValue(STORE.domain, '') || '';
            if (t && !t.value) t.value = GM_getValue(STORE.title, '') || '';
        };
        document.getElementById('as2s-close').onclick = () => { panel.style.display = 'none'; };

        // Tabs
        document.querySelectorAll('#as2s-panel .as2s-tabs div').forEach(tab => {
            tab.onclick = () => {
                document.querySelectorAll('#as2s-panel .as2s-tabs div').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const name = tab.getAttribute('data-tab');
                ['search', 's2s', 'cont', 'cfg'].forEach(n => {
                    const el = document.getElementById('as2s-tab-' + n);
                    if (el) el.style.display = (n === name) ? 'block' : 'none';
                });
            };
        });

        // Continue switch
        const contSw = document.getElementById('as2s-cont-sw');
        if (contSw) {
            updateContSwitchUI();
            contSw.onclick = () => {
                const next = !contEnabled();
                GM_setValue(STORE.contEnabled, next);
                if (next) {
                    GM_setValue(STORE.contStep, 'start');
                    startContinueWatcher();
                    runContinueMissionTick();
                }
                updateContSwitchUI();
            };
        }
        const contOnce = document.getElementById('as2s-cont-once');
        if (contOnce) {
            contOnce.onclick = () => {
                GM_setValue(STORE.contEnabled, true);
                updateContSwitchUI();
                startContinueWatcher();
                runContinueMissionTick();
            };
        }

        // SITE2S tab
        const s2sSw = document.getElementById('as2s-s2s-sw');
        if (s2sSw) {
            updateS2sSwitchUI();
            s2sSw.onclick = () => {
                const next = !s2sEnabled();
                GM_setValue(STORE.s2sEnabled, next);
                if (next) {
                    GM_setValue(STORE.s2sStep, 'watch');
                    startSite2sWatcher();
                    runSite2sTick();
                }
                updateS2sSwitchUI();
            };
        }
        const s2sFlow = document.getElementById('as2s-s2s-flow');
        if (s2sFlow) s2sFlow.onclick = () => runSite2sFullFlow(false);
        const s2sFlowNew = document.getElementById('as2s-s2s-flow-new');
        if (s2sFlowNew) s2sFlowNew.onclick = () => runSite2sFullFlow(true);
        const s2sFind = document.getElementById('as2s-s2s-find');
        if (s2sFind) {
            s2sFind.onclick = () => {
                GM_setValue(STORE.s2sEnabled, true);
                updateS2sSwitchUI();
                startSite2sWatcher();
                runSite2sTick();
            };
        }

        document.getElementById('as2s-scrape').onclick = () => {
            markOriginIf2s();
            const k = scrapeKeyword();
            document.getElementById('as2s-keyword').value = k || '';
            setSt(k ? ('Từ khóa: ' + k) : 'Không thấy keyword-highlight');
        };

        document.getElementById('as2s-ai-dt').onclick = async () => {
            markOriginIf2s();
            setSt('AI đọc domain + title…');
            try {
                const r = await aiReadDomainAndTitleFromGuide();
                document.getElementById('as2s-domain').value = r.domain || '';
                document.getElementById('as2s-title').value = r.title || '';
                GM_setValue(STORE.domain, r.domain || '');
                GM_setValue(STORE.title, r.title || '');
                setSt('Domain: ' + (r.domain || '?') + ' | Title: ' + (r.title || '?').slice(0, 50));
            } catch (e) { setSt('Lỗi: ' + e.message); }
        };

        document.getElementById('as2s-ai-field').onclick = async () => {
            markOriginIf2s();
            setSt('AI đọc nhãn copy…');
            try {
                const lab = await aiReadCopyFieldMission();
                document.getElementById('as2s-field').value = lab || '';
                GM_setValue(STORE.fieldLabel, lab || '');
                GM_setValue(STORE.mission, 'copy_field');
                setSt('Nhãn: ' + (lab || '?'));
            } catch (e) { setSt('Lỗi: ' + e.message); }
        };

        document.getElementById('as2s-flow').onclick = () => runFullFlow(false);
        document.getElementById('as2s-flow-new').onclick = () => runFullFlow(true);

        document.getElementById('as2s-extract').onclick = () => {
            const field = (document.getElementById('as2s-field').value || GM_getValue(STORE.fieldLabel, '') || '').trim();
            const val = extractFieldValue(field) || extractFieldValue('Mã KM');
            if (!val) return alert('Không thấy giá trị trên trang');
            setSt('Gửi: ' + val);
            submitValueToOrigin(val);
        };

        document.getElementById('as2s-save-key').onclick = () => {
            setPatewayKey(document.getElementById('as2s-key').value);
            const cfgSt = document.getElementById('as2s-cfg-status');
            if (cfgSt) cfgSt.textContent = 'Đã lưu key';
            setSt('Đã lưu key');
        };
    }

    function boot() {
        markOriginIf2s();
        ensureUI();
        consumePendingOnOrigin();
        runOnGoogle();
        runOnTargetPage();
        if (contEnabled()) {
            startContinueWatcher();
            setTimeout(() => { try { runContinueMissionTick(); } catch (e) {} }, 1500);
        }
        if (s2sEnabled()) {
            startSite2sWatcher();
            setTimeout(() => { try { runSite2sTick(); } catch (e) {} }, 1500);
        }
    }

    if (document.body) boot();
    else document.addEventListener('DOMContentLoaded', boot);
    setTimeout(boot, 1200);
})();
