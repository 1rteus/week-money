'use strict';

const STORAGE_KEY = 'week_money_v1';
const DAY_MS = 86400000;
const RING_C = 2 * Math.PI * 100;

const MONTHS = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
];
const MONTHS_SHORT = [
    'янв.', 'фев.', 'мар.', 'апр.', 'мая', 'июн.',
    'июл.', 'авг.', 'сен.', 'окт.', 'ноя.', 'дек.'
];

const CATEGORIES = {
    food: { name: 'Еда', icon: '🍔', color: '#ff6b6b' },
    transport: { name: 'Проезд', icon: '🚌', color: '#4ecdc4' },
    fun: { name: 'Развлечения', icon: '🎮', color: '#a855f7' },
    other: { name: 'Другое', icon: '📦', color: '#64748b' }
};

const state = {
    entries: [],
    selectedCategory: 'food'
};

let toastTimer = null;

function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function weekStart(date) {
    const d = startOfDay(date);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - (day - 1));
    return d;
}

function weekKey(date) {
    const d = weekStart(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatMoney(value) {
    const totalKop = Math.round(Math.abs(value) * 100);
    const whole = Math.floor(totalKop / 100);
    const kop = totalKop % 100;
    const sign = value < 0 ? '−' : '';
    const wholeStr = new Intl.NumberFormat('ru-RU').format(whole);
    if (kop === 0) return sign + wholeStr + ' ₽';
    return sign + wholeStr + '.' + String(kop).padStart(2, '0') + ' ₽';
}

function parseAmount(raw) {
    const normalized = String(raw == null ? '' : raw)
        .trim()
        .replace(/[\s\u00a0]/g, '')
        .replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
    const value = parseFloat(normalized);
    if (!Number.isFinite(value) || value <= 0) return null;
    return Math.round(value * 100) / 100;
}

function formatWeekRange(start) {
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    if (start.getMonth() === end.getMonth()) {
        return `${start.getDate()} – ${end.getDate()} ${MONTHS[start.getMonth()]}`;
    }
    return `${start.getDate()} ${MONTHS_SHORT[start.getMonth()]} – ${end.getDate()} ${MONTHS_SHORT[end.getMonth()]}`;
}

function formatWhen(iso) {
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.floor((startOfDay(now) - startOfDay(d)) / DAY_MS);
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (diff === 0) return `сегодня, ${time}`;
    if (diff === 1) return `вчера, ${time}`;
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}, ${time}`;
}

function isValidEntry(entry) {
    return entry
        && typeof entry.id === 'string'
        && (entry.type === 'topup' || entry.type === 'expense')
        && Number.isFinite(entry.amount)
        && entry.amount > 0
        && !Number.isNaN(new Date(entry.date).getTime());
}

function normalizeEntry(entry) {
    return {
        id: entry.id,
        type: entry.type,
        amount: Math.round(entry.amount * 100) / 100,
        note: typeof entry.note === 'string' ? entry.note.slice(0, 80) : '',
        category: entry.type === 'expense' && CATEGORIES[entry.category] ? entry.category : 'other',
        date: entry.date
    };
}

function load() {
    try {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        const entries = Array.isArray(data.entries) ? data.entries : [];
        state.entries = entries.filter(isValidEntry).map(normalizeEntry);
    } catch (e) {
        state.entries = [];
    }
}

function save() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, entries: state.entries }));
    } catch (e) {
        toast('Не удалось сохранить данные');
    }
}

function entriesOfWeek(key) {
    return state.entries.filter((entry) => weekKey(new Date(entry.date)) === key);
}

function sumByType(entries, type) {
    return entries
        .filter((entry) => entry.type === type)
        .reduce((sum, entry) => sum + entry.amount, 0);
}

function currentWeekEntries() {
    return entriesOfWeek(weekKey(new Date()));
}

function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
}

function renderRing(entries) {
    const budget = sumByType(entries, 'topup');
    const spent = sumByType(entries, 'expense');
    const remaining = Math.round((budget - spent) * 100) / 100;
    const hasBudget = budget > 0;
    const over = remaining < 0 || (!hasBudget && spent > 0);

    const ringCard = document.getElementById('ringCard');
    const progress = document.getElementById('ringProgress');
    const label = document.getElementById('ringLabel');
    const amount = document.getElementById('remaining');
    const sub = document.getElementById('ringSub');

    let ratio = 0;
    if (hasBudget) {
        ratio = Math.min(spent / budget, 1);
    } else if (spent > 0) {
        ratio = 1;
    }
    progress.style.strokeDashoffset = String(RING_C * (1 - ratio));

    ringCard.classList.toggle('over', over);
    const amountText = formatMoney(remaining);
    amount.textContent = amountText;
    amount.classList.toggle('small', amountText.length > 10);
    amount.classList.toggle('tiny', amountText.length > 13);

    if (over) {
        label.textContent = 'Перерасход';
        sub.textContent = hasBudget
            ? `Потрачено ${formatMoney(spent)} из ${formatMoney(budget)}`
            : 'Сначала добавь деньги на неделю';
    } else if (hasBudget) {
        label.textContent = 'Осталось';
        sub.textContent = remaining === 0
            ? 'Бюджет закончился'
            : `Потрачено ${formatMoney(spent)} из ${formatMoney(budget)}`;
    } else {
        label.textContent = 'Осталось';
        sub.textContent = 'Добавь деньги на неделю';
    }

    document.getElementById('budget').textContent = formatMoney(budget);
    document.getElementById('spent').textContent = formatMoney(spent);

    const day = new Date().getDay() || 7;
    const daysLeft = 8 - day;
    const perDayEl = document.getElementById('perDay');
    if (!hasBudget) {
        perDayEl.textContent = '—';
    } else if (remaining > 0) {
        perDayEl.textContent = formatMoney(Math.round((remaining / daysLeft) * 100) / 100);
    } else {
        perDayEl.textContent = '0 ₽';
    }
}

function renderOps(entries) {
    const container = document.getElementById('opsList');
    const count = document.getElementById('opsCount');
    const items = entries.slice().sort((a, b) => new Date(b.date) - new Date(a.date));

    count.textContent = items.length ? `${items.length} шт.` : '';
    container.innerHTML = '';

    if (items.length === 0) {
        container.innerHTML = '<div class="empty">Пока нет операций. Добавь деньги на неделю и записывай траты.</div>';
        return;
    }

    items.forEach((entry) => {
        const isTopup = entry.type === 'topup';
        const cat = isTopup
            ? { name: 'Пополнение', icon: '💰', color: '#4ecdc4' }
            : (CATEGORIES[entry.category] || CATEGORIES.other);
        const note = entry.note ? escapeHtml(entry.note) : '';
        const detail = note ? `${note} · ${formatWhen(entry.date)}` : formatWhen(entry.date);

        const item = document.createElement('div');
        item.className = 'op';
        item.innerHTML = `
            <div class="op-icon" style="background:${cat.color}22">${cat.icon}</div>
            <div class="op-info">
                <div class="op-title">${cat.name}</div>
                <div class="op-note">${detail}</div>
            </div>
            <div class="op-right">
                <div class="op-amount${isTopup ? ' plus' : ''}">${isTopup ? '+' : '−'}${formatMoney(entry.amount)}</div>
                <div class="op-date">${isTopup ? 'пополнение' : 'трата'}</div>
            </div>
            <button class="op-delete" type="button" data-id="${entry.id}" aria-label="Удалить">✕</button>
        `;
        container.appendChild(item);
    });
}

function renderHistory() {
    const container = document.getElementById('historyList');
    const currentKey = weekKey(new Date());
    const groups = new Map();

    state.entries.forEach((entry) => {
        const key = weekKey(new Date(entry.date));
        if (key === currentKey) return;
        if (!groups.has(key)) {
            groups.set(key, { key, start: weekStart(new Date(entry.date)), entries: [] });
        }
        groups.get(key).entries.push(entry);
    });

    const rows = [...groups.values()]
        .sort((a, b) => b.start - a.start)
        .slice(0, 8);

    container.innerHTML = '';

    if (rows.length === 0) {
        container.innerHTML = '<div class="empty">Здесь появятся прошлые недели.</div>';
        return;
    }

    rows.forEach((row) => {
        const budget = sumByType(row.entries, 'topup');
        const spent = sumByType(row.entries, 'expense');
        const remaining = Math.round((budget - spent) * 100) / 100;
        const positive = remaining >= 0;

        const item = document.createElement('div');
        item.className = 'history-row';
        item.innerHTML = `
            <div>
                <div class="history-date">${formatWeekRange(row.start)}</div>
                <div class="history-sub">Потрачено ${formatMoney(spent)} из ${formatMoney(budget)}</div>
            </div>
            <div class="history-amount ${positive ? 'plus' : 'minus'}">
                ${positive ? 'Осталось ' : 'Перерасход '}${formatMoney(Math.abs(remaining))}
            </div>
        `;
        container.appendChild(item);
    });
}

function render() {
    const entries = currentWeekEntries();
    document.getElementById('weekRange').textContent = formatWeekRange(weekStart(new Date()));
    renderRing(entries);
    renderOps(entries);
    renderHistory();
}

function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function closeAllModals() {
    document.querySelectorAll('.modal-overlay.active').forEach((overlay) => {
        overlay.classList.remove('active');
    });
}

function toast(message) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

function markInvalid(input) {
    input.classList.add('invalid');
    input.focus();
    setTimeout(() => input.classList.remove('invalid'), 1200);
}

function addEntry(entry) {
    state.entries.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        ...entry,
        date: new Date().toISOString()
    });
    save();
    render();
}

function selectCategory(key) {
    if (!CATEGORIES[key]) return;
    state.selectedCategory = key;
    document.querySelectorAll('.cat-btn').forEach((btn) => {
        btn.classList.toggle('selected', btn.dataset.cat === key);
    });
}

function initModals() {
    document.getElementById('topupBtn').addEventListener('click', () => {
        openModal('topupOverlay');
        setTimeout(() => document.getElementById('topupAmount').focus(), 120);
    });

    document.getElementById('expenseBtn').addEventListener('click', () => {
        openModal('expenseOverlay');
        setTimeout(() => document.getElementById('expenseAmount').focus(), 120);
    });

    document.querySelectorAll('[data-close]').forEach((btn) => {
        btn.addEventListener('click', () => closeModal(btn.dataset.close));
    });

    document.querySelectorAll('.modal-overlay').forEach((overlay) => {
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) overlay.classList.remove('active');
        });
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeAllModals();
    });
}

function initQuickAmounts() {
    document.querySelectorAll('.quick').forEach((group) => {
        group.addEventListener('click', (event) => {
            const btn = event.target.closest('button[data-amount]');
            if (!btn) return;
            const input = btn.closest('form').querySelector('.amount-input');
            input.value = btn.dataset.amount;
            input.classList.remove('invalid');
            input.focus();
        });
    });
}

function initCategories() {
    document.getElementById('categories').addEventListener('click', (event) => {
        const btn = event.target.closest('.cat-btn');
        if (btn) selectCategory(btn.dataset.cat);
    });
}

function initForms() {
    const topupForm = document.getElementById('topupForm');
    const topupAmount = document.getElementById('topupAmount');
    const topupNote = document.getElementById('topupNote');

    topupForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const amount = parseAmount(topupAmount.value);
        if (!amount) {
            markInvalid(topupAmount);
            return;
        }
        addEntry({ type: 'topup', amount, note: topupNote.value.trim() });
        topupForm.reset();
        closeModal('topupOverlay');
        toast(`Добавлено ${formatMoney(amount)}`);
    });

    const expenseForm = document.getElementById('expenseForm');
    const expenseAmount = document.getElementById('expenseAmount');
    const expenseNote = document.getElementById('expenseNote');

    expenseForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const amount = parseAmount(expenseAmount.value);
        if (!amount) {
            markInvalid(expenseAmount);
            return;
        }
        addEntry({
            type: 'expense',
            amount,
            note: expenseNote.value.trim(),
            category: state.selectedCategory
        });
        expenseForm.reset();
        selectCategory('food');
        closeModal('expenseOverlay');
        toast(`Записано ${formatMoney(amount)}`);
    });
}

function initDelete() {
    document.getElementById('opsList').addEventListener('click', (event) => {
        const btn = event.target.closest('.op-delete');
        if (!btn) return;
        const id = btn.dataset.id;
        state.entries = state.entries.filter((entry) => entry.id !== id);
        save();
        render();
        toast('Удалено');
    });
}

function initInstallPrompt() {
    const installBtn = document.getElementById('installBtn');
    let deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        deferredPrompt = event;
        installBtn.classList.remove('hidden');
    });

    installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        try {
            await deferredPrompt.userChoice;
        } catch (e) {
            // ignore
        }
        deferredPrompt = null;
        installBtn.classList.add('hidden');
    });

    window.addEventListener('appinstalled', () => {
        installBtn.classList.add('hidden');
    });
}

function initServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('sw.js').catch(() => {});
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hadController) window.location.reload();
        hadController = true;
    });
}

function scheduleDayRefresh() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    setTimeout(() => {
        render();
        scheduleDayRefresh();
    }, next - now);
}

function init() {
    load();

    if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().catch(() => {});
    }

    initModals();
    initQuickAmounts();
    initCategories();
    initForms();
    initDelete();
    initInstallPrompt();
    initServiceWorker();
    selectCategory('food');
    render();
    scheduleDayRefresh();

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) render();
    });

    window.addEventListener('storage', (event) => {
        if (event.key === STORAGE_KEY) {
            load();
            render();
        }
    });
}

document.addEventListener('DOMContentLoaded', init);
