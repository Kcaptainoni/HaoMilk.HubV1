// ==UserScript==
// @name         Auto Tools Hub — 2s
// @namespace    http://tampermonkey.net/
// @version      1.1.0-2s
// @description  2s full flow: từ khóa + domain + title (ảnh) → Google → đúng domain+title → lấy mã → về site 2s
// @author       You
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
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
        flowTime: 'as2s_flow_time'
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
            'Trích xuất:\n' +
            '1) DOMAIN của website cần vào (vd: example.com hoặc dạng che *** )\n' +
            '2) TITLE / tiêu đề bài hoặc tiêu đề kết quả Google hiển thị trong ảnh (nguyên văn, đầy đủ nhất có thể)\n' +
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
    function openGoogleSearch(keyword, domainHint, titleHint, newTab) {
        // Chỉ search ĐÚNG từ khóa (không nhét domain vào query — chọn kết quả bằng domain+title)
        const q = String(keyword || '').trim();
        const url = 'https://www.google.com/search?q=' + encodeURIComponent(q) + '&hl=vi';
        GM_setValue(STORE.keyword, keyword || '');
        GM_setValue(STORE.domain, domainHint || '');
        GM_setValue(STORE.title, titleHint || '');
        GM_setValue(STORE.flowArmed, true);
        GM_setValue(STORE.flowTime, Date.now());
        if (newTab) window.open(url, '_blank');
        else location.href = url;
    }

    function getGoogleResultCards() {
        // Mỗi kết quả: { a, href, host, title }
        const cards = [];
        const seen = new Set();

        // Cấu trúc SERP phổ biến
        const blocks = $all('#search .g, #rso .g, #search [data-sokoban-container], #rso div[data-hveid]');
        const pushFrom = (root) => {
            const a = root.querySelector('a[href^="http"]') || root.querySelector('a[href]');
            if (!a) return;
            let href = a.href || '';
            if (!href || /google\.|webcache|accounts\.google|youtube\.com\/results/i.test(href)) return;
            let host = '';
            try { host = new URL(href).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return; }
            if (seen.has(href)) return;
            seen.add(href);

            // Title: h3 ưu tiên
            let title = '';
            const h3 = root.querySelector('h3') || a.querySelector('h3');
            if (h3) title = (h3.textContent || '').trim();
            if (!title) title = (a.textContent || '').trim();
            if (!title || title.length < 3) return;
            cards.push({ a, href, host, title });
        };

        if (blocks.length) {
            blocks.forEach(pushFrom);
        } else {
            // fallback: mọi h3 > a
            $all('#search h3, #rso h3').forEach(h3 => {
                const a = h3.closest('a') || (h3.parentElement && h3.parentElement.closest('a'));
                if (!a) return;
                pushFrom(a.closest('div') || a);
            });
        }
        return cards;
    }

    function scoreDomain(host, domainHint) {
        if (!domainHint || !host) return 0;
        const hint = domainHint.toLowerCase().replace(/^www\./, '');
        const hostN = host.replace(/^www\./, '');
        if (hostN === hint) return 100;
        // wildcard healt***.co
        if (/\*/.test(hint)) {
            const parts = hint.split(/\*+/).filter(Boolean);
            if (parts.every(p => hostN.includes(p.replace(/\./g, '')))) return 70;
            // simpler: all non-* segments in host
            const segs = hint.split(/[^a-z0-9]+/).filter(s => s.length >= 2);
            let ok = 0;
            for (const s of segs) if (hostN.includes(s)) ok++;
            if (segs.length && ok === segs.length) return 65;
            return Math.round((ok / Math.max(1, segs.length)) * 50);
        }
        if (hostN.endsWith('.' + hint) || hint.endsWith('.' + hostN)) return 80;
        if (hostN.includes(hint) || hint.includes(hostN.split('.')[0])) return 40;
        return 0;
    }

    function pickGoogleResultBest(domainHint, titleHint) {
        const cards = getGoogleResultCards();
        if (!cards.length) return null;
        let best = null;
        let bestScore = -1;
        for (const c of cards) {
            const dScore = scoreDomain(c.host, domainHint);
            const tScore = titleHint ? titleSimilarity(c.title, titleHint) : 0;
            // Bắt buộc ưu tiên title giống nhất trong các kết quả cùng domain tốt
            // Tổng: domain quan trọng nhưng title quyết định khi domain tạm ổn
            let score = dScore * 1.2 + tScore;
            if (dScore >= 40 && tScore >= 50) score += 30; // bonus khớp cả hai
            if (dScore < 15 && domainHint) score *= 0.35; // domain lệch nặng → hạ
            console.log('[2s] SERP', dScore, tScore, '→', Math.round(score), c.host, '|', c.title.slice(0, 50));
            if (score > bestScore) {
                bestScore = score;
                best = c;
            }
        }
        // Ngưỡng tối thiểu
        if (bestScore < 25) return null;
        return best;
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
        if (!armed || (ft && Date.now() - ft > 600000)) return;

        const domain = GM_getValue(STORE.domain, '');
        const title = GM_getValue(STORE.title, '');
        console.log('[2s] Google match domain=', domain, 'title=', title);

        const tryPick = () => {
            const best = pickGoogleResultBest(domain, title);
            if (!best) {
                console.log('[2s] Chưa chọn được kết quả phù hợp');
                return false;
            }
            console.log('[2s] CHỌN:', best.host, '|', best.title);
            try { best.a.click(); } catch (e) {
                try { location.href = best.href; } catch (e2) {}
            }
            return true;
        };

        setTimeout(() => { if (!tryPick()) setTimeout(tryPick, 2000); }, 1200);
        setTimeout(tryPick, 3500);
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
<div class="as2s-body">
  <div style="font-size:11px;color:rgba(255,255,255,.5);margin-bottom:10px;line-height:1.4">
    Flow: <b>từ khóa</b> → AI <b>domain + title</b> (ảnh) → Google → chọn <b>domain + title giống nhất</b> → lấy mã → về 2s
  </div>
  <label>Từ khóa</label>
  <input id="as2s-keyword" placeholder="the westique residences">
  <label>Domain (từ ảnh)</label>
  <input id="as2s-domain" placeholder="example.com">
  <label>Title (từ ảnh — match Google)</label>
  <input id="as2s-title" placeholder="tiêu đề trong ảnh guide">
  <label>Nhãn copy (ID / Hotline / Mã…) — để trống nếu chỉ vào web</label>
  <input id="as2s-field" placeholder="tùy nhiệm vụ">
  <button class="as2s-btn green" id="as2s-scrape">📥 Đọc từ khóa trang</button>
  <button class="as2s-btn blue" id="as2s-ai-dt">🤖 AI đọc domain + title (ảnh)</button>
  <button class="as2s-btn blue" id="as2s-ai-field">🤖 AI đọc nhãn copy (ảnh)</button>
  <button class="as2s-btn green" id="as2s-flow">🚀 Chạy full flow (cùng tab)</button>
  <button class="as2s-btn" id="as2s-flow-new">🆕 Full flow (tab mới)</button>
  <button class="as2s-btn" id="as2s-extract">📋 Lấy giá trị trang này → 2s</button>
  <label style="margin-top:6px">Pateway API key</label>
  <input id="as2s-key" type="password" placeholder="sk-...">
  <button class="as2s-btn" id="as2s-save-key">💾 Lưu key</button>
  <div class="as2s-status" id="as2s-status"></div>
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
            setSt('Đã lưu key');
        };
    }

    function boot() {
        markOriginIf2s();
        ensureUI();
        consumePendingOnOrigin();
        runOnGoogle();
        runOnTargetPage();
    }

    if (document.body) boot();
    else document.addEventListener('DOMContentLoaded', boot);
    setTimeout(boot, 1200);
})();
