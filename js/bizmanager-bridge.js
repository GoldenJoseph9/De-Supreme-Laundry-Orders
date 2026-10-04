// ============================================================
// BIZ MANAGER BRIDGE
// Second Firebase instance + connection + real-time data
// ============================================================

// ---------- STATE ----------
let _bmApp = null;
let _bmAuth = null;
let _bmDb = null;
let _bmUser = null;
let _bmListeners = [];

// ---------- INIT ----------
function _initBizManager() {
    if (_bmApp) return true;
    if (!window.BIZ_MANAGER_CONFIG) {
        console.warn('⚠️ Biz Manager config not loaded');
        return false;
    }
    try {
        const existing = firebase.apps.find(a => a.name === 'bizManager');
        _bmApp = existing || firebase.initializeApp(window.BIZ_MANAGER_CONFIG, 'bizManager');
        _bmAuth = _bmApp.auth();
        _bmDb = _bmApp.database();

        _bmAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
            .catch(err => console.warn('⚠️ BM persistence failed:', err));

        _bmAuth.onAuthStateChanged(user => {
            _bmUser = user;
            console.log('🔗 Biz Manager auth state:', user ? user.email : '(none)');
            if (user) {
                _closeConnectModal();
                _showConnectionBadge();
            } else {
                _hideConnectionBadge();
            }
        });

        console.log('✅ Biz Manager Firebase instance ready');
        return true;
    } catch (err) {
        console.error('❌ Biz Manager init failed:', err);
        return false;
    }
}

// ---------- CONNECT PROMPT ----------
window.promptBizManagerConnect = function({ manual = false } = {}) {
    if (!_initBizManager()) return;
    if (_bmUser) {
        if (manual && typeof showOfflineToast === 'function') {
            showOfflineToast('✅ Already connected to Biz Manager', 'info');
        }
        return;
    }

    if (!manual) {
        const dismissedAt = parseInt(localStorage.getItem('bm_connect_dismissed_at') || '0', 10);
        if (Date.now() - dismissedAt < 60 * 60 * 1000) return;
    }

    _showConnectModal();
};

window.openBizManagerConnect = function() {
    window.promptBizManagerConnect({ manual: true });
};

function _showConnectModal() {
    if (document.getElementById('bm-connect-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'bm-connect-modal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.style.zIndex = '30000';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:420px; position:relative;">
            <button onclick="dismissBizManagerConnect()"
                    style="position:absolute; top:1rem; right:1rem; background:none; border:none; font-size:1.5rem; color:#d4af37; cursor:pointer;">×</button>

            <h2 style="color:#d4af37; margin-bottom:8px;">🔗 Connect Biz Manager</h2>
            <p style="color:#aaa; font-size:13px; margin-bottom:16px;">
                Sign in to your Biz Manager account to view customer payments here.
                Your credentials go directly to Biz Manager — we don't store them.
            </p>

            <div class="form-group">
                <label class="form-label">Biz Manager Email</label>
                <input type="email" id="bm-email" class="form-control" placeholder="you@business.com">
            </div>
            <div class="form-group">
                <label class="form-label">Biz Manager Password</label>
                <input type="password" id="bm-password" class="form-control" placeholder="Your password">
            </div>

            <div id="bm-connect-error" style="color:#e74c3c; font-size:12px; min-height:16px; margin-top:4px;"></div>

            <div style="display:flex; gap:10px; margin-top:12px;">
                <button onclick="submitBizManagerConnect()" class="btn btn-success" style="flex:1;">Connect</button>
                <button onclick="dismissBizManagerConnect()" class="btn btn-secondary">Later</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    setTimeout(() => document.getElementById('bm-email')?.focus(), 100);
}

function _closeConnectModal() {
    document.getElementById('bm-connect-modal')?.remove();
}

window.dismissBizManagerConnect = function() {
    localStorage.setItem('bm_connect_dismissed_at', String(Date.now()));
    _closeConnectModal();
};

window.submitBizManagerConnect = async function() {
    if (!_initBizManager()) return;
    const email = document.getElementById('bm-email').value.trim();
    const password = document.getElementById('bm-password').value;
    const errEl = document.getElementById('bm-connect-error');

    errEl.textContent = '';
    if (!email || !password) {
        errEl.textContent = 'Please enter both email and password';
        return;
    }

    try {
        errEl.textContent = 'Connecting...';
        await _bmAuth.signInWithEmailAndPassword(email, password);
        errEl.textContent = '';
        if (typeof showOfflineToast === 'function') {
            showOfflineToast('✅ Connected to Biz Manager', 'success');
        }
    } catch (err) {
        errEl.textContent = err.message || 'Connection failed';
    }
};

// ---------- CONNECTION BADGE (always visible) ----------
function _showConnectionBadge() {
    let badge = document.getElementById('bm-connection-badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'bm-connection-badge';
        badge.style.cssText = `
            position: fixed;
            top: 60px;
            right: 20px;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 600;
            z-index: 9998;
            cursor: pointer;
            transition: all 0.2s ease;
            user-select: none;
        `;
        document.body.appendChild(badge);
    }

    badge.textContent = `🔗 Biz Manager: ${_bmUser.email}`;
    badge.style.background = 'rgba(46, 204, 113, 0.15)';
    badge.style.color = '#2ecc71';
    badge.style.border = '1px solid #2ecc71';
    badge.onclick = () => {
        if (confirm('Disconnect from Biz Manager?')) {
            window.disconnectBizManager();
        }
    };
}

function _hideConnectionBadge() {
    let badge = document.getElementById('bm-connection-badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'bm-connection-badge';
        badge.style.cssText = `
            position: fixed;
            top: 60px;
            right: 20px;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 600;
            z-index: 9998;
            cursor: pointer;
            transition: all 0.2s ease;
            user-select: none;
        `;
        document.body.appendChild(badge);
    }

    badge.textContent = `🔗 Connect Biz Manager`;
    badge.style.background = 'rgba(243, 156, 18, 0.15)';
    badge.style.color = '#f39c12';
    badge.style.border = '1px solid #f39c12';
    badge.onclick = () => {
        window.openBizManagerConnect();
    };
}

window.disconnectBizManager = async function() {
    if (!_bmAuth) return;
    try {
        await _bmAuth.signOut();
        _bmUser = null;
        if (typeof showOfflineToast === 'function') {
            showOfflineToast('Disconnected from Biz Manager', 'info');
        }
    } catch (err) {
        console.error('Disconnect failed:', err);
    }
};

// ---------- DATA FETCHING (REAL-TIME) ----------
window.fetchBizManagerForCustomer = function(customer, onUpdate) {
    if (!_initBizManager() || !_bmUser) {
        return () => {};
    }

    const uid = _bmUser.uid;
    const customerEmail = (customer.email || '').toLowerCase().trim();
    const customerPhone = String(customer.phone || '').replace(/[^0-9]/g, '');

    let contactsData = {};
    let transactionsData = {};
    let unsubscribers = [];

    const recompute = () => {
        const matchedContacts = Object.entries(contactsData)
            .map(([id, c]) => ({ id, ...c }))
            .filter(c => {
                const cEmail = (c.email || '').toLowerCase().trim();
                const cPhone = String(c.phone || '').replace(/[^0-9]/g, '');
                if (customerEmail && cEmail && customerEmail === cEmail) return true;
                if (customerPhone && cPhone && customerPhone === cPhone) return true;
                return false;
            });

        const matchedNames = matchedContacts.map(c => (c.name || '').toLowerCase().trim()).filter(Boolean);

        const matchedTransactions = Object.entries(transactionsData)
            .map(([id, t]) => ({ id, ...t }))
            .filter(t => {
                if (!t.customer) return false;
                return matchedNames.includes(t.customer.toLowerCase().trim());
            })
            .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

        let totalRevenue = 0;
        let totalExpenses = 0;
        matchedTransactions.forEach(t => {
            const amt = parseFloat(t.amount) || 0;
            if (t.type === 'revenue') totalRevenue += amt;
            else if (t.type === 'expense') totalExpenses += amt;
        });

        onUpdate({
            connected: true,
            contacts: matchedContacts,
            transactions: matchedTransactions,
            totals: {
                revenue: totalRevenue,
                expenses: totalExpenses,
                net: totalRevenue - totalExpenses,
                count: matchedTransactions.length
            }
        });
    };

    const contactsRef = _bmDb.ref(`users/${uid}/contacts`);
    const transRef = _bmDb.ref(`users/${uid}/transactions`);

    const contactsHandler = contactsRef.on('value',
        snap => { contactsData = snap.val() || {}; recompute(); },
        err => console.warn('BM contacts read error:', err)
    );
    unsubscribers.push(() => contactsRef.off('value', contactsHandler));

    const transHandler = transRef.on('value',
        snap => { transactionsData = snap.val() || {}; recompute(); },
        err => console.warn('BM transactions read error:', err)
    );
    unsubscribers.push(() => transRef.off('value', transHandler));

    return () => {
        unsubscribers.forEach(u => { try { u(); } catch (e) {} });
    };
};

// ---------- INIT ON LOAD ----------
window.addEventListener('load', () => {
    setTimeout(() => { _initBizManager(); }, 800);
});

console.log('🌉 Biz Manager bridge loaded');
