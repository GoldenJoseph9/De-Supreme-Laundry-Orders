// ============================================================
// CUSTOMER PROFILES — MERGED (Step 1 + 2 + 3 + 4)
// All-in-one. Standalone. No external dependencies for profile view.
// Floating buttons removed. Auto-profile-create on new orders.
// No auto-delete — profiles stay until manually removed.
// ============================================================

// ============================================================
// UTILITIES
// ============================================================
function _safeString(value) {
    if (value === null || value === undefined) return '';
    return String(value);
}

function _normalizeEmail(email) {
    return _safeString(email).toLowerCase().trim();
}

function _normalizePhone(phone) {
    return _safeString(phone).replace(/[^0-9]/g, '').trim();
}

function _escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function _hashString(str) {
    if (!str) return null;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36).padStart(8, '0');
}

function _makeProfileKey(email, phone) {
    const e = _normalizeEmail(email);
    const p = _normalizePhone(phone);
    if (e) return `cust_e_${_hashString(e)}`;
    if (p) return `cust_p_${_hashString(p)}`;
    return null;
}

function _toast(msg, type = 'info') {
    if (typeof showOfflineToast === 'function') {
        showOfflineToast(msg, type);
    } else {
        console.log('[toast]', type, msg);
    }
}


// ============================================================
// AUTO-CREATE PROFILE ON NEW ORDER (called from admin.js)
// ============================================================
async function ensureProfileForCustomer({ name, email, phone }) {
    try {
        const e = _normalizeEmail(email);
        const p = _normalizePhone(phone);
        if (!e && !p) return null;

        const key = _makeProfileKey(e, p);
        if (!key) return null;

        const snap = await database.ref(`customerProfiles/${key}`).once('value');

        if (snap.exists()) {
            // Patch missing fields only
            const existing = snap.val() || {};
            const patch = {};
            if (!existing.name && name) patch.name = name;
            if (!existing.email && email) patch.email = email;
            if (!existing.phone && phone) patch.phone = phone;
            if (Object.keys(patch).length > 0) {
                patch.updatedAt = Date.now();
                await database.ref(`customerProfiles/${key}`).update(patch);
                console.log('📇 Profile patched:', key, patch);
            }
            return key;
        }

        // Create new
        const now = Date.now();
        const user = auth.currentUser;
        await database.ref(`customerProfiles/${key}`).set({
            name: name || '(unnamed)',
            email: e,
            phone: p,
            notes: '',
            tags: [],
            createdAt: now,
            updatedAt: now,
            createdBy: user ? user.uid : 'unknown',
            emailKey: e,
            phoneKey: p
        });

        console.log(`📇 Profile auto-created for ${name} (${key})`);
        return key;

    } catch (err) {
        console.error('ensureProfileForCustomer failed:', err);
        return null;
    }
}


// ============================================================
// ORPHAN PROFILE CLEANUP — DISABLED (Option B)
// Kept for reference. Not called anywhere.
// ============================================================
async function cleanupOrphanProfile(email, phone) {
    console.log('📇 cleanupOrphanProfile called but DISABLED (Option B: manual delete only)');
    return;
    // eslint-disable-next-line no-unreachable
    try {
        // ... (previous logic omitted — profiles never auto-delete now)
    } catch (err) {
        console.error('cleanupOrphanProfile failed:', err);
    }
}


// ============================================================
// STEP 1 — SCAN (Two-pass grouping)
// ============================================================
async function scanForCustomerProfiles() {
    console.log('🔍 Scanning for customer profiles...');

    const report = {
        scannedOrders: 0, scannedUsers: 0, existingProfiles: 0,
        candidates: [], skipped: [], merges: [], timestamp: Date.now()
    };

    const [ordersSnap, usersSnap] = await Promise.all([
        database.ref('customers').once('value'),
        database.ref('users').once('value')
    ]);

    const orders = ordersSnap.val() || {};
    const users = usersSnap.val() || {};
    report.scannedOrders = Object.keys(orders).length;
    report.scannedUsers = Object.keys(users).length;

    // PASS 1 — by EMAIL
    const emailGroups = {};

    Object.values(orders).forEach(order => {
        const email = _normalizeEmail(order.email);
        const phone = _normalizePhone(order.phone || order.phoneFromUser);
        if (!email && !phone) {
            report.skipped.push({ source: 'order', name: order.name || '(no name)' });
            return;
        }
        if (!email) return;
        if (!emailGroups[email]) {
            emailGroups[email] = { name: '', email, phones: new Set(), orderCount: 0, sources: new Set() };
        }
        const g = emailGroups[email];
        if (!g.name && order.name) g.name = order.name;
        if (phone) g.phones.add(phone);
        g.orderCount++;
        g.sources.add('order');
    });

    Object.values(users).forEach(user => {
        if (!user.email) return;
        if (user.role === 'admin') return;
        const email = _normalizeEmail(user.email);
        const phone = _normalizePhone(user.phone);
        if (!email) return;
        if (!emailGroups[email]) {
            emailGroups[email] = { name: '', email, phones: new Set(), orderCount: 0, sources: new Set() };
        }
        const g = emailGroups[email];
        if (!g.name && user.name) g.name = user.name;
        if (phone) g.phones.add(phone);
        g.sources.add('user');
    });

    // PASS 2 — by PHONE (no email)
    const phoneGroups = {};
    Object.values(orders).forEach(order => {
        const email = _normalizeEmail(order.email);
        const phone = _normalizePhone(order.phone || order.phoneFromUser);
        if (email) return;
        if (!phone) return;
        if (!phoneGroups[phone]) {
            phoneGroups[phone] = { name: '', phone, orderCount: 0, sources: new Set() };
        }
        const g = phoneGroups[phone];
        if (!g.name && order.name) g.name = order.name;
        g.orderCount++;
        g.sources.add('order');
    });

    // PASS 3 — merge
    const phoneToEmailMap = {};
    Object.values(emailGroups).forEach(g => {
        g.phones.forEach(p => { if (!phoneToEmailMap[p]) phoneToEmailMap[p] = g.email; });
    });

    const orphanPhoneGroups = [];
    Object.entries(phoneGroups).forEach(([phone, g]) => {
        const matchedEmail = phoneToEmailMap[phone];
        if (matchedEmail && emailGroups[matchedEmail]) {
            emailGroups[matchedEmail].orderCount += g.orderCount;
            g.sources.forEach(s => emailGroups[matchedEmail].sources.add(s));
            if (!emailGroups[matchedEmail].name && g.name) emailGroups[matchedEmail].name = g.name;
            report.merges.push({ phone, mergedInto: matchedEmail, orderCount: g.orderCount });
        } else {
            orphanPhoneGroups.push(g);
        }
    });

    // Check existing
    let existing = {};
    try {
        const snap = await database.ref('customerProfiles').once('value');
        existing = snap.val() || {};
    } catch (e) {}
    report.existingProfiles = Object.keys(existing).length;

    // Candidates
    Object.values(emailGroups).forEach(g => {
        const key = _makeProfileKey(g.email, '');
        report.candidates.push({
            key, name: g.name || '(unnamed)', email: g.email,
            phone: Array.from(g.phones)[0] || '',
            phoneCount: g.phones.size, orderCount: g.orderCount,
            sources: Array.from(g.sources),
            alreadyExists: !!existing[key],
            action: existing[key] ? 'skip' : 'create'
        });
    });

    orphanPhoneGroups.forEach(g => {
        const key = _makeProfileKey('', g.phone);
        report.candidates.push({
            key, name: g.name || '(unnamed)', email: '', phone: g.phone,
            phoneCount: 1, orderCount: g.orderCount,
            sources: Array.from(g.sources),
            alreadyExists: !!existing[key],
            action: existing[key] ? 'skip' : 'create'
        });
    });

    report.candidates.sort((a, b) => {
        if (a.action !== b.action) return a.action === 'create' ? -1 : 1;
        return (a.name || '').localeCompare(b.name || '');
    });

    return report;
}

async function executeProfileBuild(report) {
    const toCreate = report.candidates.filter(c => c.action === 'create');
    if (toCreate.length === 0) {
        _toast('ℹ️ All customers already have profiles', 'info');
        return { created: 0, failed: 0 };
    }
    _toast(`⏳ Creating ${toCreate.length} profiles...`, 'info');

    const updates = {};
    const now = Date.now();
    const user = auth.currentUser;

    toCreate.forEach(c => {
        updates[`customerProfiles/${c.key}`] = {
            name: c.name, email: c.email, phone: c.phone,
            notes: '', tags: [], createdAt: now, updatedAt: now,
            createdBy: user ? user.uid : 'unknown',
            emailKey: _normalizeEmail(c.email),
            phoneKey: _normalizePhone(c.phone)
        };
    });

    try {
        await database.ref().update(updates);
        _toast(`✅ Created ${toCreate.length} profiles`, 'success');
        return { created: toCreate.length, failed: 0 };
    } catch (err) {
        _toast(`❌ Failed: ${err.message}`, 'error');
        return { created: 0, failed: toCreate.length };
    }
}

function showProfileScanReport(report) {
    document.getElementById('profile-scan-modal')?.remove();

    const newCount = report.candidates.filter(c => c.action === 'create').length;
    const skipCount = report.candidates.filter(c => c.action === 'skip').length;

    const modal = document.createElement('div');
    modal.id = 'profile-scan-modal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.style.zIndex = '20000';

    const rows = report.candidates.slice(0, 300).map(c => `
        <tr style="border-bottom:1px solid #333;">
            <td style="padding:6px 8px; font-size:12px;">${c.action === 'create' ? '🆕' : '✓'}</td>
            <td style="padding:6px 8px; font-size:12px;">${_escapeHtml(c.name)}</td>
            <td style="padding:6px 8px; font-size:12px; color:#aaa;">${c.email ? _escapeHtml(c.email) : '📞 phone only'}</td>
            <td style="padding:6px 8px; font-size:12px; color:#aaa;">${c.phone || '—'}</td>
            <td style="padding:6px 8px; font-size:12px; text-align:center;">${c.orderCount}</td>
        </tr>
    `).join('');

    modal.innerHTML = `
        <div class="modal-content" style="max-width:900px; max-height:90vh;">
            <button onclick="document.getElementById('profile-scan-modal').remove()"
                    style="position:absolute; top:1rem; right:1rem; background:none; border:none; font-size:1.5rem; color:#d4af37; cursor:pointer;">×</button>
            <h2 style="color:#d4af37;">🔍 Profile Scan Report</h2>
            <p style="color:#aaa; font-size:13px;">Dry run — nothing written yet.</p>
            <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin:16px 0;">
                <div style="background:#1a1a1a; padding:10px; border-radius:6px; text-align:center;">
                    <div style="font-size:11px; color:#888;">Orders</div>
                    <div style="font-size:18px; font-weight:700; color:#d4af37;">${report.scannedOrders}</div>
                </div>
                <div style="background:#1a1a1a; padding:10px; border-radius:6px; text-align:center;">
                    <div style="font-size:11px; color:#888;">🆕 New</div>
                    <div style="font-size:18px; font-weight:700; color:#f39c12;">${newCount}</div>
                </div>
                <div style="background:#1a1a1a; padding:10px; border-radius:6px; text-align:center;">
                    <div style="font-size:11px; color:#888;">✓ Exists</div>
                    <div style="font-size:18px; font-weight:700; color:#2ecc71;">${skipCount}</div>
                </div>
                <div style="background:#1a1a1a; padding:10px; border-radius:6px; text-align:center;">
                    <div style="font-size:11px; color:#888;">🔗 Merged</div>
                    <div style="font-size:18px; font-weight:700; color:#3498db;">${report.merges.length}</div>
                </div>
            </div>
            <div style="max-height:380px; overflow-y:auto; background:#1a1a1a; border-radius:6px; padding:8px;">
                <table style="width:100%; border-collapse:collapse;">
                    <thead style="position:sticky; top:0; background:#2c2c2c;">
                        <tr>
                            <th style="padding:6px 8px; text-align:left; font-size:11px; color:#888;"></th>
                            <th style="padding:6px 8px; text-align:left; font-size:11px; color:#888;">Name</th>
                            <th style="padding:6px 8px; text-align:left; font-size:11px; color:#888;">Email</th>
                            <th style="padding:6px 8px; text-align:left; font-size:11px; color:#888;">Phone</th>
                            <th style="padding:6px 8px; text-align:center; font-size:11px; color:#888;">Orders</th>
                        </tr>
                    </thead>
                    <tbody>${rows || '<tr><td colspan="5" style="padding:20px; text-align:center; color:#666;">No customers found</td></tr>'}</tbody>
                </table>
            </div>
            <div style="display:flex; gap:10px; margin-top:16px; justify-content:center;">
                <button onclick="document.getElementById('profile-scan-modal').remove()" class="btn btn-secondary">Cancel</button>
                <button onclick="window._confirmProfileBuild()" class="btn btn-success" ${newCount === 0 ? 'disabled' : ''}>
                    ✅ Create ${newCount} Profile${newCount === 1 ? '' : 's'}
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    window._pendingProfileReport = report;
}

window._confirmProfileBuild = async function() {
    const report = window._pendingProfileReport;
    if (!report) return;
    const newCount = report.candidates.filter(c => c.action === 'create').length;
    if (!confirm(`Create ${newCount} customer profiles?`)) return;
    document.getElementById('profile-scan-modal')?.remove();
    await executeProfileBuild(report);
    window._pendingProfileReport = null;
};

window.runProfileScan = async function() {
    try {
        const report = await scanForCustomerProfiles();
        showProfileScanReport(report);
    } catch (err) {
        console.error('Scan failed:', err);
        _toast('❌ Scan failed: ' + err.message, 'error');
    }
};


// ============================================================
// STEP 2 — HELPERS (used by admin.js)
// ============================================================
async function loadAllCustomerProfiles() {
    try {
        const snap = await database.ref('customerProfiles').once('value');
        const data = snap.val() || {};
        return Object.entries(data).map(([id, val]) => ({ id, ...val }));
    } catch (e) {
        return [];
    }
}

async function computeProfileStats(profile, cachedOrders, cachedPoints, cachedRedemptions) {
    const email = _normalizeEmail(profile.email);
    const phone = _normalizePhone(profile.phone);

    const matches = (record) => {
        if (!record) return false;
        const rEmail = _normalizeEmail(record.email || record.customerEmail);
        const rPhone = _normalizePhone(record.phone || record.customerPhone);
        if (email && rEmail && rEmail === email) return true;
        if (phone && rPhone && rPhone === phone) return true;
        if (record.customerId && record.customerId === profile.id) return true;
        return false;
    };

    const orders = (cachedOrders || []).filter(matches);
    const pointsEntries = (cachedPoints || []).filter(matches);
    const redemptions = (cachedRedemptions || []).filter(matches);

    const totalOrders = orders.length;
    const totalPointsFromOrders = orders.reduce((s, o) => s + (parseInt(o.points) || 0), 0);
    const totalPointsManual = pointsEntries.reduce((s, p) => s + (parseInt(p.pointsAdded) || 0), 0);
    const totalRedeemed = redemptions.reduce((s, r) => s + (parseInt(r.pointsUsed) || 0), 0);
    const totalEarned = totalPointsFromOrders + totalPointsManual;
    const balance = totalEarned - totalRedeemed;

    return {
        totalOrders, totalPointsFromOrders, totalPointsManual,
        totalEarned, totalRedeemed, balance,
        orderList: orders, pointsList: pointsEntries, redemptionList: redemptions
    };
}


// ============================================================
// STEP 3 — PROFILE VIEW
// ============================================================
let _currentProfile = null;
let _profileViewData = null;
let _notesSaveTimer = null;
let _bmUnsubscriber = null;   // Step 4: Biz Manager real-time listener cleanup

window.openCustomerProfile = async function(profileId, emailHint) {
    console.log('📂 openCustomerProfile:', profileId, emailHint);
    try {
        showLoading();

        let profile = null;
        const snap = await database.ref(`customerProfiles/${profileId}`).once('value');
        profile = snap.val();

        if (!profile && emailHint) {
            const allSnap = await database.ref('customerProfiles').once('value');
            const all = allSnap.val() || {};
            const match = Object.entries(all).find(([id, p]) =>
                _normalizeEmail(p.email) === _normalizeEmail(emailHint));
            if (match) { profile = match[1]; profileId = match[0]; }
        }

        if (!profile) {
            hideLoading();
            alert('Profile not found');
            return;
        }

        _currentProfile = { id: profileId, ...profile };
        await loadProfileViewData();
        renderProfileView();
        hideLoading();

    } catch (err) {
        hideLoading();
        console.error('❌ Failed to open profile:', err);
        alert('Error opening profile: ' + err.message);
    }
};

async function loadProfileViewData() {
    const [ordersSnap, pointsSnap, redemptionsSnap] = await Promise.all([
        database.ref('customers').once('value'),
        database.ref('pointsHistory').once('value'),
        database.ref('redemptions').once('value')
    ]);

    const allOrders = [];
    ordersSnap.forEach(child => { const o = child.val(); o.id = child.key; allOrders.push(o); });
    const allPoints = [];
    pointsSnap.forEach(child => { const p = child.val(); p.id = child.key; allPoints.push(p); });
    const allRedemptions = [];
    redemptionsSnap.forEach(child => { const r = child.val(); r.id = child.key; allRedemptions.push(r); });

    const matches = (record) => {
        if (!record) return false;
        if (record.customerId && record.customerId === _currentProfile.id) return true;
        const pEmail = _normalizeEmail(_currentProfile.email);
        const rEmail = _normalizeEmail(record.email || record.customerEmail);
        if (pEmail && rEmail && pEmail === rEmail) return true;
        const pPhone = _normalizePhone(_currentProfile.phone);
        const rPhone = _normalizePhone(record.phone || record.customerPhone);
        if (pPhone && rPhone && pPhone === rPhone) return true;
        return false;
    };

    const myOrders = allOrders.filter(matches).sort((a, b) =>
        new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
    const myPoints = allPoints.filter(matches).sort((a, b) =>
        (b.timestamp || 0) - (a.timestamp || 0));
    const myRedemptions = allRedemptions.filter(matches).sort((a, b) =>
        (b.timestamp || 0) - (a.timestamp || 0));

    const totalFromOrders = myOrders.reduce((s, o) => s + (parseInt(o.points) || 0), 0);
    const totalManual = myPoints.reduce((s, p) => s + (parseInt(p.pointsAdded) || 0), 0);
    const totalRedeemed = myRedemptions.reduce((s, r) => s + (parseInt(r.pointsUsed) || 0), 0);
    const totalEarned = totalFromOrders + totalManual;
    const balance = totalEarned - totalRedeemed;

    _profileViewData = {
        orders: myOrders, points: myPoints, redemptions: myRedemptions,
        stats: { orderCount: myOrders.length, totalEarned, totalRedeemed, balance }
    };
}

function renderProfileView() {
    if (!_currentProfile || !_profileViewData) return;

    document.getElementById('profile-view')?.remove();

    const view = document.createElement('div');
    view.id = 'profile-view';
    view.className = 'profile-view';

    const p = _currentProfile;
    const s = _profileViewData.stats;
    const balanceColor = s.balance > 0 ? '#2ecc71' : s.balance < 0 ? '#e74c3c' : '#888';
    const initials = (p.name || '?').split(' ').filter(Boolean).slice(0, 2)
        .map(x => x[0].toUpperCase()).join('');

    view.innerHTML = `
        <div class="profile-view-header">
            <button class="pv-back-btn" onclick="closeCustomerProfile()">← Back</button>
            <div class="pv-header-info">
                <div class="pv-avatar">${initials || '?'}</div>
                <div class="pv-header-text">
                    <h2>${_escapeHtml(p.name || '(unnamed)')}</h2>
                    <div class="pv-contact">
                        ${p.email ? `📧 ${_escapeHtml(p.email)}` : ''}
                        ${p.email && p.phone ? ' · ' : ''}
                        ${p.phone ? `📞 ${_escapeHtml(p.phone)}` : ''}
                    </div>
                </div>
            </div>
            <button class="pv-edit-btn" onclick="openProfileEditModal()">✏️ Edit</button>
            <button class="pv-edit-btn" onclick="deleteCustomerProfile()"
                    style="border-color:#8B0000; color:#e74c3c;"
                    title="Delete profile">🗑️</button>
        </div>

        <div class="pv-stats">
            <div class="pv-stat"><div class="pv-stat-label">📦 Orders</div><div class="pv-stat-value" style="color:#d4af37;">${s.orderCount}</div></div>
            <div class="pv-stat"><div class="pv-stat-label">⭐ Earned</div><div class="pv-stat-value" style="color:#2ecc71;">${s.totalEarned}</div></div>
            <div class="pv-stat"><div class="pv-stat-label">🎁 Redeemed</div><div class="pv-stat-value" style="color:#e74c3c;">${s.totalRedeemed}</div></div>
            <div class="pv-stat"><div class="pv-stat-label">💰 Balance</div><div class="pv-stat-value" style="color:${balanceColor};">${s.balance}</div></div>
        </div>

        <div class="pv-body">
            <div class="pv-section">
                <div class="pv-section-header">
                    <h3>📝 Notes</h3>
                    <span id="pv-notes-status" class="pv-notes-status"></span>
                </div>
                <textarea id="pv-notes" class="pv-notes-textarea"
                          placeholder="Add notes...">${_escapeHtml(p.notes || '')}</textarea>
            </div>

            <div class="pv-section">
                <div class="pv-section-header">
                    <h3>🧺 Orders (${_profileViewData.orders.length})</h3>
                    <button class="pv-action-btn" id="pv-add-order-btn">+ Add Order</button>
                </div>
                <div class="pv-list">
                    ${_profileViewData.orders.length === 0 ? '<div class="pv-empty">No orders yet</div>'
                        : _profileViewData.orders.map(o => renderOrderRow(o)).join('')}
                </div>
            </div>

            <div class="pv-section">
                <div class="pv-section-header">
                    <h3>⭐ Respect History (${_profileViewData.points.length})</h3>
                    <button class="pv-action-btn" id="pv-grant-btn">+ Grant</button>
                </div>
                <div class="pv-list">
                    ${_profileViewData.points.length === 0 ? '<div class="pv-empty">No manual respect yet</div>'
                        : _profileViewData.points.map(pt => renderPointRow(pt)).join('')}
                </div>
            </div>

            <div class="pv-section">
                <div class="pv-section-header">
                    <h3>🎁 Spending History (${_profileViewData.redemptions.length})</h3>
                    <button class="pv-action-btn" id="pv-spend-btn">+ Spend</button>
                </div>
                <div class="pv-list">
                    ${_profileViewData.redemptions.length === 0 ? '<div class="pv-empty">No redemptions yet</div>'
                        : _profileViewData.redemptions.map(r => renderRedemptionRow(r)).join('')}
                </div>
            </div>

            <!-- 🆕 Step 4: Biz Manager Payments -->
            <div class="pv-section" id="pv-bm-section">
                <div class="pv-section-header">
                    <h3>💰 Biz Manager Payments</h3>
                    <span id="pv-bm-status" class="pv-notes-status"></span>
                </div>
                <div id="pv-bm-body">
                    <div class="pv-empty">Loading…</div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(view);

    // Wire up notes
    document.getElementById('pv-notes').addEventListener('input', onNotesInput);

    // Wire up top-level actions
    document.getElementById('pv-add-order-btn').addEventListener('click', openProfileAddOrderModal);
    document.getElementById('pv-grant-btn').addEventListener('click', openProfileGrantModal);
    document.getElementById('pv-spend-btn').addEventListener('click', openProfileSpendModal);

    // Wire up row actions
    view.querySelectorAll('.pv-row-edit').forEach(btn => {
        btn.addEventListener('click', (e) =>
            handleRowEdit(e.currentTarget.dataset.type, e.currentTarget.dataset.id));
    });
    view.querySelectorAll('.pv-row-delete').forEach(btn => {
        btn.addEventListener('click', (e) =>
            handleRowDelete(e.currentTarget.dataset.type, e.currentTarget.dataset.id));
    });

    // 🆕 Step 4: hook Biz Manager section
    _wireBizManagerSection();

    console.log('✅ Profile view rendered for', p.name);
}

// ---------- ROW RENDERERS ----------
function renderOrderRow(order) {
    const date = order.date || order.createdAt;
    const dateStr = date ? new Date(date).toLocaleDateString() : '—';

    let statusClass = 'pv-status-in-progress';
    let statusText = 'In Progress';
    if (order.collected) { statusClass = 'pv-status-done'; statusText = 'Collected'; }
    else if (order.ready) { statusClass = 'pv-status-ready'; statusText = 'Ready'; }

    const items = _escapeHtml(order.items || 'Laundry service');
    const points = parseInt(order.points) || 0;

    return `
        <div class="pv-row">
            <div class="pv-row-main">
                <div class="pv-row-date">${dateStr}</div>
                <div class="pv-row-desc">${items}</div>
                <div class="pv-row-meta">
                    <span class="pv-status ${statusClass}">${statusText}</span>
                    <span class="pv-points-added">+${points} ⭐</span>
                </div>
            </div>
            <div class="pv-row-actions">
                <button class="pv-row-edit" data-type="order" data-id="${order.id}" title="Edit">✏️</button>
                <button class="pv-row-delete" data-type="order" data-id="${order.id}" title="Delete">🗑️</button>
            </div>
        </div>
    `;
}

function renderPointRow(point) {
    const date = point.timestamp ? new Date(point.timestamp).toLocaleDateString() : '—';
    const points = parseInt(point.pointsAdded) || 0;
    const reason = _escapeHtml(point.reason || 'No reason');
    const by = _escapeHtml(point.addedBy || 'Don');

    return `
        <div class="pv-row">
            <div class="pv-row-main">
                <div class="pv-row-date">${date}</div>
                <div class="pv-row-desc">${reason}</div>
                <div class="pv-row-meta">
                    <span class="pv-points-added">+${points} ⭐</span>
                    <span class="pv-by">by ${by}</span>
                </div>
            </div>
            <div class="pv-row-actions">
                <button class="pv-row-edit" data-type="point" data-id="${point.id}" title="Edit">✏️</button>
                <button class="pv-row-delete" data-type="point" data-id="${point.id}" title="Delete">🗑️</button>
            </div>
        </div>
    `;
}

function renderRedemptionRow(redemption) {
    const date = redemption.timestamp ? new Date(redemption.timestamp).toLocaleDateString() : '—';
    const points = parseInt(redemption.pointsUsed) || 0;
    const reward = _escapeHtml(redemption.reward || 'Reward');
    const by = _escapeHtml(redemption.redeemedBy || 'Don');

    return `
        <div class="pv-row">
            <div class="pv-row-main">
                <div class="pv-row-date">${date}</div>
                <div class="pv-row-desc">${reward}</div>
                <div class="pv-row-meta">
                    <span class="pv-points-redeemed">-${points} ⭐</span>
                    <span class="pv-by">by ${by}</span>
                </div>
            </div>
            <div class="pv-row-actions">
                <button class="pv-row-edit" data-type="redemption" data-id="${redemption.id}" title="Edit">✏️</button>
                <button class="pv-row-delete" data-type="redemption" data-id="${redemption.id}" title="Delete">🗑️</button>
            </div>
        </div>
    `;
}

// ---------- NOTES AUTOSAVE ----------
function onNotesInput(e) {
    const status = document.getElementById('pv-notes-status');
    if (status) status.textContent = 'saving...';

    if (_notesSaveTimer) clearTimeout(_notesSaveTimer);

    _notesSaveTimer = setTimeout(async () => {
        try {
            await database.ref(`customerProfiles/${_currentProfile.id}`).update({
                notes: e.target.value,
                updatedAt: Date.now()
            });
            _currentProfile.notes = e.target.value;
            if (status) {
                status.textContent = '✓ saved';
                setTimeout(() => { if (status) status.textContent = ''; }, 2000);
            }
        } catch (err) {
            console.error('Notes save failed:', err);
            if (status) status.textContent = '⚠️ save failed';
        }
    }, 800);
}

// ---------- CLOSE ----------
window.closeCustomerProfile = function() {
    // 🆕 Step 4: tear down Biz Manager listeners
    if (_bmUnsubscriber) {
        try { _bmUnsubscriber(); } catch (e) {}
        _bmUnsubscriber = null;
    }
    document.getElementById('profile-view')?.remove();
    _currentProfile = null;
    _profileViewData = null;
    if (typeof loadCustomerProfiles === 'function') loadCustomerProfiles();
};


// ============================================================
// 🗑️ DELETE CUSTOMER PROFILE (manual only)
// ============================================================
window.deleteCustomerProfile = async function() {
    if (!_currentProfile) return;

    const name = _currentProfile.name || '(unnamed)';
    const email = _currentProfile.email || '';
    const phone = _currentProfile.phone || '';

    // Confirm
    const msg =
        `Delete profile for "${name}"?\n\n` +
        `This removes only the profile record.\n` +
        `Orders, points, and redemptions stay in Firebase.\n\n` +
        `You can rebuild the profile later if needed.`;

    if (!confirm(msg)) return;

    // Extra caution if profile has notes/tags
    const hasNotes = _currentProfile.notes && _currentProfile.notes.trim();
    const hasTags = _currentProfile.tags && _currentProfile.tags.length > 0;

    if (hasNotes || hasTags) {
        const warn =
            `⚠️ This profile has ${hasNotes ? 'notes' : ''}` +
            `${hasNotes && hasTags ? ' and ' : ''}` +
            `${hasTags ? 'tags' : ''}.\n\n` +
            `Deleting will remove them permanently. Continue?`;
        if (!confirm(warn)) return;
    }

    showLoading();
    try {
        await database.ref(`customerProfiles/${_currentProfile.id}`).remove();

        // Close the profile view and refresh the list
        _currentProfile = null;
        _profileViewData = null;
        document.getElementById('profile-view')?.remove();

        hideLoading();
        _toast('🗑️ Profile deleted', 'success');

        if (typeof loadCustomerProfiles === 'function') loadCustomerProfiles();

    } catch (err) {
        hideLoading();
        console.error('Delete profile failed:', err);
        alert('Delete failed: ' + err.message);
    }
};


// ============================================================
// 🆕 STEP 4 — BIZ MANAGER SECTION WIRING
// ============================================================
function _wireBizManagerSection() {
    // Clean up any previous listener
    if (_bmUnsubscriber) {
        try { _bmUnsubscriber(); } catch (e) {}
        _bmUnsubscriber = null;
    }

    const bodyEl = document.getElementById('pv-bm-body');
    const statusEl = document.getElementById('pv-bm-status');
    if (!bodyEl) return;

    // Bridge not loaded?
    if (typeof fetchBizManagerForCustomer !== 'function') {
        bodyEl.innerHTML = '<div class="pv-empty">Biz Manager bridge not loaded</div>';
        return;
    }

    _bmUnsubscriber = fetchBizManagerForCustomer(
        {
            email: _currentProfile.email,
            phone: _currentProfile.phone,
            name: _currentProfile.name
        },
        (data) => {
            if (!data.connected) {
                bodyEl.innerHTML = `
                    <div class="pv-empty" style="text-align:center;">
                        <p>Not connected to Biz Manager.</p>
                        <button onclick="promptBizManagerConnect()" class="btn btn-primary" style="margin-top:8px;">
                            🔗 Connect
                        </button>
                    </div>
                `;
                if (statusEl) statusEl.textContent = '';
                return;
            }

            if (statusEl) {
                statusEl.textContent = `✓ live`;
            }

            if (data.contacts.length === 0) {
                bodyEl.innerHTML = `
                    <div class="pv-empty">
                        This customer isn't in your Biz Manager contacts yet.
                    </div>
                `;
                return;
            }

            if (data.transactions.length === 0) {
                bodyEl.innerHTML = `
                    <div class="pv-empty">
                        Matched Biz Manager contact, but no transactions yet.
                    </div>
                `;
                return;
            }

            // Render
            const totals = data.totals;
            const rows = data.transactions.slice(0, 10).map(t => {
                const date = t.date ? new Date(t.date).toLocaleDateString() : '—';
                const amount = (parseFloat(t.amount) || 0).toLocaleString();
                const isRev = t.type === 'revenue';
                const amtColor = isRev ? '#2ecc71' : '#e74c3c';
                const sign = isRev ? '+' : '−';
                return `
                    <div class="pv-row">
                        <div class="pv-row-main">
                            <div class="pv-row-date">${date}</div>
                            <div class="pv-row-desc">${_escapeHtml(t.description || t.category || 'Transaction')}</div>
                            <div class="pv-row-meta">
                                <span style="color:${amtColor}; font-weight:700;">${sign}₦${amount}</span>
                                <span class="pv-by">${_escapeHtml(t.category || '')}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            bodyEl.innerHTML = `
                <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; margin-bottom:10px;">
                    <div style="background:#1a1a1a; padding:8px 10px; border-radius:6px; text-align:center;">
                        <div style="font-size:10px; color:#888;">💰 Revenue</div>
                        <div style="font-weight:700; color:#2ecc71; font-size:14px;">₦${totals.revenue.toLocaleString()}</div>
                    </div>
                    <div style="background:#1a1a1a; padding:8px 10px; border-radius:6px; text-align:center;">
                        <div style="font-size:10px; color:#888;">📉 Expenses</div>
                        <div style="font-weight:700; color:#e74c3c; font-size:14px;">₦${totals.expenses.toLocaleString()}</div>
                    </div>
                    <div style="background:#1a1a1a; padding:8px 10px; border-radius:6px; text-align:center;">
                        <div style="font-size:10px; color:#888;">📊 Net</div>
                        <div style="font-weight:700; color:#d4af37; font-size:14px;">₦${totals.net.toLocaleString()}</div>
                    </div>
                </div>
                <div class="pv-list">${rows}</div>
                ${data.transactions.length > 10 ? `<div style="text-align:center; color:#888; font-size:11px; padding:6px;">+ ${data.transactions.length - 10} more</div>` : ''}
            `;
        }
    );
}


// ============================================================
// SELF-CONTAINED MODALS (don't rely on admin.js DOM)
// ============================================================

// Generic modal helper
function _createModal(id, html) {
    document.getElementById(id)?.remove();
    const modal = document.createElement('div');
    modal.id = id;
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.style.zIndex = '20001';
    modal.innerHTML = html;
    document.body.appendChild(modal);
    return modal;
}

// ---------- PROFILE EDIT ----------
window.openProfileEditModal = function() {
    if (!_currentProfile) return;
    const p = _currentProfile;

    _createModal('pv-edit-modal', `
        <div class="modal-content" style="max-width:500px; position:relative;">
            <button onclick="document.getElementById('pv-edit-modal').remove()"
                    style="position:absolute; top:1rem; right:1rem; background:none; border:none; font-size:1.5rem; color:#d4af37; cursor:pointer;">×</button>
            <h2 style="color:#d4af37; margin-bottom:16px;">✏️ Edit Profile</h2>

            <div class="form-group">
                <label class="form-label">Name</label>
                <input type="text" id="pv-edit-name" class="form-control" value="${_escapeHtml(p.name || '')}">
            </div>
            <div class="form-group">
                <label class="form-label">Email</label>
                <input type="email" id="pv-edit-email" class="form-control" value="${_escapeHtml(p.email || '')}">
            </div>
            <div class="form-group">
                <label class="form-label">Phone</label>
                <input type="tel" id="pv-edit-phone" class="form-control" value="${_escapeHtml(p.phone || '')}">
            </div>

            <div style="background:#1a1a1a; padding:10px; border-radius:6px; font-size:12px; color:#888; margin:12px 0;">
                💡 Changing email or phone will update <strong>all linked orders, points, and redemptions</strong>.
            </div>

            <div style="display:flex; gap:10px; margin-top:16px;">
                <button onclick="submitProfileEdit()" class="btn btn-success" style="flex:1;">💾 Save</button>
                <button onclick="document.getElementById('pv-edit-modal').remove()" class="btn btn-secondary">Cancel</button>
            </div>
        </div>
    `);
};

window.submitProfileEdit = async function() {
    const name = document.getElementById('pv-edit-name').value.trim();
    const email = document.getElementById('pv-edit-email').value.trim();
    const phone = document.getElementById('pv-edit-phone').value.trim();

    if (!name) { alert('Name is required'); return; }

    showLoading();
    try {
        const oldEmail = _normalizeEmail(_currentProfile.email);
        const oldPhone = _normalizePhone(_currentProfile.phone);
        const newEmail = _normalizeEmail(email);
        const newPhone = _normalizePhone(phone);

        await database.ref(`customerProfiles/${_currentProfile.id}`).update({
            name, email, phone,
            emailKey: newEmail, phoneKey: newPhone,
            updatedAt: Date.now()
        });

        const emailChanged = oldEmail && newEmail && oldEmail !== newEmail;
        const phoneChanged = oldPhone && newPhone && oldPhone !== newPhone;
        if (emailChanged || phoneChanged) {
            await _backfillLinkedRecords(_currentProfile.id, oldEmail, oldPhone, newEmail, newPhone);
        }

        _currentProfile.name = name;
        _currentProfile.email = email;
        _currentProfile.phone = phone;

        document.getElementById('pv-edit-modal')?.remove();
        await loadProfileViewData();
        renderProfileView();
        _toast('✅ Profile updated', 'success');

    } catch (err) {
        console.error(err);
        alert('Save failed: ' + err.message);
    } finally {
        hideLoading();
    }
};

async function _backfillLinkedRecords(profileId, oldEmail, oldPhone, newEmail, newPhone) {
    const updates = {};

    const [ordersSnap, pointsSnap, redemptionsSnap] = await Promise.all([
        database.ref('customers').once('value'),
        database.ref('pointsHistory').once('value'),
        database.ref('redemptions').once('value')
    ]);

    const matchOld = (record) => {
        if (!record) return false;
        if (record.customerId === profileId) return true;
        const rEmail = _normalizeEmail(record.email || record.customerEmail);
        const rPhone = _normalizePhone(record.phone || record.customerPhone);
        if (oldEmail && rEmail === oldEmail) return true;
        if (oldPhone && rPhone === oldPhone) return true;
        return false;
    };

    ordersSnap.forEach(child => {
        if (matchOld(child.val())) {
            updates[`customers/${child.key}/customerId`] = profileId;
            if (newEmail) updates[`customers/${child.key}/email`] = newEmail;
            if (newPhone) updates[`customers/${child.key}/phone`] = newPhone;
        }
    });

    pointsSnap.forEach(child => {
        if (matchOld(child.val())) {
            updates[`pointsHistory/${child.key}/customerId`] = profileId;
            if (newEmail) updates[`pointsHistory/${child.key}/customerEmail`] = newEmail;
        }
    });

    redemptionsSnap.forEach(child => {
        if (matchOld(child.val())) {
            updates[`redemptions/${child.key}/customerId`] = profileId;
            if (newEmail) updates[`redemptions/${child.key}/customerEmail`] = newEmail;
        }
    });

    if (Object.keys(updates).length > 0) {
        await database.ref().update(updates);
        console.log(`🔗 Backfilled ${Object.keys(updates).length} records`);
    }
}

// ---------- GRANT RESPECT ----------
window.openProfileGrantModal = function() {
    if (!_currentProfile) return;

    _createModal('pv-grant-modal', `
        <div class="modal-content" style="max-width:400px; position:relative;">
            <button onclick="document.getElementById('pv-grant-modal').remove()"
                    style="position:absolute; top:1rem; right:1rem; background:none; border:none; font-size:1.5rem; color:#d4af37; cursor:pointer;">×</button>
            <h2 style="color:#d4af37;">⭐ Grant Respect</h2>
            <p style="color:#aaa; font-size:13px; margin-bottom:12px;">To: ${_escapeHtml(_currentProfile.name)}</p>
            <div class="form-group">
                <label class="form-label">Amount</label>
                <input type="number" id="pv-grant-amount" class="form-control" value="10" min="1">
            </div>
            <div class="form-group">
                <label class="form-label">Reason</label>
                <input type="text" id="pv-grant-reason" class="form-control" placeholder="e.g. Loyalty bonus">
            </div>
            <button onclick="submitProfileGrant()" class="btn btn-success" style="width:100%;">Grant</button>
        </div>
    `);

    setTimeout(() => document.getElementById('pv-grant-amount')?.focus(), 100);
};

window.submitProfileGrant = async function() {
    const amount = parseInt(document.getElementById('pv-grant-amount').value) || 0;
    const reason = document.getElementById('pv-grant-reason').value.trim();
    if (amount <= 0) { alert('Amount must be positive'); return; }

    showLoading();
    try {
        const ts = Date.now();
        await database.ref('pointsHistory/' + ts).set({
            customerId: _currentProfile.id,
            customerEmail: _currentProfile.email || '',
            pointsAdded: amount,
            reason: reason || 'Manual grant',
            addedBy: auth.currentUser.email || 'Don',
            timestamp: ts
        });
        document.getElementById('pv-grant-modal')?.remove();
        hideLoading();
        _toast(`✅ +${amount} respect granted`, 'success');
        await loadProfileViewData();
        renderProfileView();
    } catch (err) {
        hideLoading();
        alert('Failed: ' + err.message);
    }
};

// ---------- SPEND RESPECT ----------
window.openProfileSpendModal = function() {
    if (!_currentProfile) return;

    const balance = _profileViewData.stats.balance;

    _createModal('pv-spend-modal', `
        <div class="modal-content" style="max-width:400px; position:relative;">
            <button onclick="document.getElementById('pv-spend-modal').remove()"
                    style="position:absolute; top:1rem; right:1rem; background:none; border:none; font-size:1.5rem; color:#d4af37; cursor:pointer;">×</button>
            <h2 style="color:#d4af37;">🎁 Spend Respect</h2>
            <p style="color:#aaa; font-size:13px;">${_escapeHtml(_currentProfile.name)} — balance: <strong style="color:#2ecc71;">${balance}</strong></p>
            <div class="form-group">
                <label class="form-label">Amount</label>
                <input type="number" id="pv-spend-amount" class="form-control" value="10" min="1" max="${balance}">
            </div>
            <div class="form-group">
                <label class="form-label">Reward</label>
                <input type="text" id="pv-spend-reason" class="form-control" placeholder="e.g. Free detergent">
            </div>
            <button onclick="submitProfileSpend()" class="btn btn-success" style="width:100%;">Spend</button>
        </div>
    `);

    setTimeout(() => document.getElementById('pv-spend-amount')?.focus(), 100);
};

window.submitProfileSpend = async function() {
    const amount = parseInt(document.getElementById('pv-spend-amount').value) || 0;
    const reason = document.getElementById('pv-spend-reason').value.trim();
    if (amount <= 0) { alert('Amount must be positive'); return; }
    if (amount > _profileViewData.stats.balance) { alert('Not enough respect'); return; }
    if (!reason) { alert('Reason required'); return; }

    showLoading();
    try {
        const ts = Date.now();
        await database.ref('redemptions/' + ts).set({
            customerId: _currentProfile.id,
            customerEmail: _currentProfile.email || '',
            pointsUsed: amount,
            reward: reason,
            redeemedBy: auth.currentUser.email || 'Don',
            timestamp: ts
        });
        document.getElementById('pv-spend-modal')?.remove();
        hideLoading();
        _toast(`✅ -${amount} respect spent`, 'success');
        await loadProfileViewData();
        renderProfileView();
    } catch (err) {
        hideLoading();
        alert('Failed: ' + err.message);
    }
};

// ---------- ADD ORDER (Quick Add) ----------
window.openProfileAddOrderModal = function() {
    if (!_currentProfile) return;

    _createModal('pv-add-order-modal', `
        <div class="modal-content" style="max-width:450px; position:relative;">
            <button onclick="document.getElementById('pv-add-order-modal').remove()"
                    style="position:absolute; top:1rem; right:1rem; background:none; border:none; font-size:1.5rem; color:#d4af37; cursor:pointer;">×</button>
            <h2 style="color:#d4af37;">🧺 Add Order</h2>
            <p style="color:#aaa; font-size:13px; margin-bottom:12px;">For: ${_escapeHtml(_currentProfile.name)}</p>

            <div class="form-group">
                <label class="form-label">Items</label>
                <input type="text" id="pv-add-items" class="form-control" placeholder="e.g. 5 shirts, 2 trousers">
            </div>
            <div class="form-group">
                <label class="form-label">Respect Points</label>
                <input type="number" id="pv-add-points" class="form-control" value="0" min="0">
            </div>
            <div class="form-group">
                <label class="form-label">Date</label>
                <input type="date" id="pv-add-date" class="form-control">
            </div>
            <div class="form-group">
                <label class="form-label">Status</label>
                <select id="pv-add-status" class="form-control">
                    <option value="pending">In Progress</option>
                    <option value="ready">Ready for Pickup</option>
                    <option value="collected">Collected</option>
                </select>
            </div>
            <button onclick="submitProfileAddOrder()" class="btn btn-success" style="width:100%;">Add Order</button>
        </div>
    `);

    setTimeout(() => {
        document.getElementById('pv-add-date').valueAsDate = new Date();
        document.getElementById('pv-add-items').focus();
    }, 100);
};

window.submitProfileAddOrder = async function() {
    const items = document.getElementById('pv-add-items').value.trim();
    const points = parseInt(document.getElementById('pv-add-points').value) || 0;
    const date = document.getElementById('pv-add-date').value;
    const status = document.getElementById('pv-add-status').value;

    if (!items) { alert('Items required'); return; }
    if (!date) { alert('Date required'); return; }

    showLoading();
    try {
        const order = {
            name: _currentProfile.name,
            email: _currentProfile.email || '',
            phone: _currentProfile.phone || '',
            items,
            points,
            date,
            ready: status === 'ready' || status === 'collected',
            collected: status === 'collected',
            customerId: _currentProfile.id,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        };

        await database.ref('customers').push(order);
        document.getElementById('pv-add-order-modal')?.remove();
        hideLoading();
        _toast(`✅ Order added`, 'success');
        await loadProfileViewData();
        renderProfileView();
    } catch (err) {
        hideLoading();
        alert('Failed: ' + err.message);
    }
};

// ============================================================
// ROW EDIT / DELETE
// ============================================================
async function handleRowEdit(type, id) {
    if (!id) return;

    if (type === 'order') {
        const order = _profileViewData.orders.find(o => o.id === id);
        if (!order) return;

        _createModal('pv-edit-order-modal', `
            <div class="modal-content" style="max-width:450px; position:relative;">
                <button onclick="document.getElementById('pv-edit-order-modal').remove()"
                        style="position:absolute; top:1rem; right:1rem; background:none; border:none; font-size:1.5rem; color:#d4af37; cursor:pointer;">×</button>
                <h2 style="color:#d4af37;">✏️ Edit Order</h2>

                <div class="form-group">
                    <label class="form-label">Items</label>
                    <input type="text" id="pv-eo-items" class="form-control" value="${_escapeHtml(order.items || '')}">
                </div>
                <div class="form-group">
                    <label class="form-label">Respect Points</label>
                    <input type="number" id="pv-eo-points" class="form-control" value="${order.points || 0}" min="0">
                </div>
                <div class="form-group">
                    <label class="form-label">Date</label>
                    <input type="date" id="pv-eo-date" class="form-control" value="${order.date || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">Status</label>
                    <select id="pv-eo-status" class="form-control">
                        <option value="pending" ${!order.ready && !order.collected ? 'selected' : ''}>In Progress</option>
                        <option value="ready" ${order.ready && !order.collected ? 'selected' : ''}>Ready for Pickup</option>
                        <option value="collected" ${order.collected ? 'selected' : ''}>Collected</option>
                    </select>
                </div>

                <div style="display:flex; gap:10px; margin-top:16px;">
                    <button onclick="submitEditOrder('${id}')" class="btn btn-success" style="flex:1;">💾 Save</button>
                    <button onclick="document.getElementById('pv-edit-order-modal').remove()" class="btn btn-secondary">Cancel</button>
                </div>
            </div>
        `);

    } else if (type === 'point') {
        const point = _profileViewData.points.find(p => p.id === id);
        if (!point) return;

        _createModal('pv-edit-point-modal', `
            <div class="modal-content" style="max-width:400px; position:relative;">
                <button onclick="document.getElementById('pv-edit-point-modal').remove()"
                        style="position:absolute; top:1rem; right:1rem; background:none; border:none; font-size:1.5rem; color:#d4af37; cursor:pointer;">×</button>
                <h2 style="color:#d4af37;">✏️ Edit Respect Entry</h2>

                <div class="form-group">
                    <label class="form-label">Amount</label>
                    <input type="number" id="pv-ep-amount" class="form-control" value="${point.pointsAdded || 0}" min="1">
                </div>
                <div class="form-group">
                    <label class="form-label">Reason</label>
                    <input type="text" id="pv-ep-reason" class="form-control" value="${_escapeHtml(point.reason || '')}">
                </div>

                <div style="display:flex; gap:10px; margin-top:16px;">
                    <button onclick="submitEditPoint('${id}')" class="btn btn-success" style="flex:1;">💾 Save</button>
                    <button onclick="document.getElementById('pv-edit-point-modal').remove()" class="btn btn-secondary">Cancel</button>
                </div>
            </div>
        `);

    } else if (type === 'redemption') {
        const red = _profileViewData.redemptions.find(r => r.id === id);
        if (!red) return;

        _createModal('pv-edit-redemption-modal', `
            <div class="modal-content" style="max-width:400px; position:relative;">
                <button onclick="document.getElementById('pv-edit-redemption-modal').remove()"
                        style="position:absolute; top:1rem; right:1rem; background:none; border:none; font-size:1.5rem; color:#d4af37; cursor:pointer;">×</button>
                <h2 style="color:#d4af37;">✏️ Edit Redemption</h2>

                <div class="form-group">
                    <label class="form-label">Points Spent</label>
                    <input type="number" id="pv-er-amount" class="form-control" value="${red.pointsUsed || 0}" min="1">
                </div>
                <div class="form-group">
                    <label class="form-label">Reward</label>
                    <input type="text" id="pv-er-reward" class="form-control" value="${_escapeHtml(red.reward || '')}">
                </div>

                <div style="display:flex; gap:10px; margin-top:16px;">
                    <button onclick="submitEditRedemption('${id}')" class="btn btn-success" style="flex:1;">💾 Save</button>
                    <button onclick="document.getElementById('pv-edit-redemption-modal').remove()" class="btn btn-secondary">Cancel</button>
                </div>
            </div>
        `);
    }
}

window.submitEditOrder = async function(id) {
    const items = document.getElementById('pv-eo-items').value.trim();
    const points = parseInt(document.getElementById('pv-eo-points').value) || 0;
    const date = document.getElementById('pv-eo-date').value;
    const status = document.getElementById('pv-eo-status').value;

    if (!items) { alert('Items required'); return; }

    showLoading();
    try {
        await database.ref('customers/' + id).update({
            items, points, date,
            ready: status === 'ready' || status === 'collected',
            collected: status === 'collected',
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
        document.getElementById('pv-edit-order-modal')?.remove();
        hideLoading();
        _toast('✅ Order updated', 'success');
        await loadProfileViewData();
        renderProfileView();
    } catch (err) {
        hideLoading();
        alert('Failed: ' + err.message);
    }
};

window.submitEditPoint = async function(id) {
    const amount = parseInt(document.getElementById('pv-ep-amount').value) || 0;
    const reason = document.getElementById('pv-ep-reason').value.trim();
    if (amount <= 0) { alert('Amount must be positive'); return; }

    showLoading();
    try {
        await database.ref('pointsHistory/' + id).update({
            pointsAdded: amount,
            reason: reason || 'No reason provided',
            updatedAt: Date.now()
        });
        document.getElementById('pv-edit-point-modal')?.remove();
        hideLoading();
        _toast('✅ Respect updated', 'success');
        await loadProfileViewData();
        renderProfileView();
    } catch (err) {
        hideLoading();
        alert('Failed: ' + err.message);
    }
};

window.submitEditRedemption = async function(id) {
    const amount = parseInt(document.getElementById('pv-er-amount').value) || 0;
    const reward = document.getElementById('pv-er-reward').value.trim();
    if (amount <= 0) { alert('Amount must be positive'); return; }
    if (!reward) { alert('Reward required'); return; }

    showLoading();
    try {
        await database.ref('redemptions/' + id).update({
            pointsUsed: amount,
            reward,
            updatedAt: Date.now()
        });
        document.getElementById('pv-edit-redemption-modal')?.remove();
        hideLoading();
        _toast('✅ Redemption updated', 'success');
        await loadProfileViewData();
        renderProfileView();
    } catch (err) {
        hideLoading();
        alert('Failed: ' + err.message);
    }
};

async function handleRowDelete(type, id) {
    if (!id) return;

    const msg = type === 'order' ? 'Delete this order?'
              : type === 'point' ? 'Delete this respect entry?'
              : 'Delete this redemption?';

    if (!confirm(msg)) return;

    showLoading();
    try {
        let path;
        if (type === 'order') path = 'customers/' + id;
        else if (type === 'point') path = 'pointsHistory/' + id;
        else path = 'redemptions/' + id;

        await database.ref(path).remove();
        hideLoading();
        _toast('🗑️ Deleted', 'success');
        await loadProfileViewData();
        renderProfileView();
    } catch (err) {
        hideLoading();
        alert('Delete failed: ' + err.message);
    }
}

// ============================================================
// LOAD LOG
// ============================================================
console.log('📇 Customer Profiles (merged Step 1+2+3+4) loaded');
window.__logLoad && window.__logLoad('customer-profiles.js', 'ok');