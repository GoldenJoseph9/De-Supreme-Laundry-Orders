// ============================================================
// BIZ MANAGER BRIDGE
// Second Firebase instance + connection + real-time data
// ============================================================

// ---------- STATE ----------
let _bmApp = null;         // second Firebase app
let _bmAuth = null;
let _bmDb = null;
let _bmUser = null;        // signed-in Biz Manager user
let _bmListeners = [];     // active .on() listeners (for cleanup)

// ---------- INIT ----------
function _initBizManager() {
    if (_bmApp) return true;
    if (!window.BIZ_MANAGER_CONFIG) {
        console.warn('⚠️ Biz Manager config not loaded');
        return false;
    }
    try {
        // Ensure we don't double-initialize
        const existing = firebase.apps.find(a => a.name === 'bizManager');
        _bmApp = existing || firebase.initializeApp(window.BIZ_MANAGER_CONFIG, 'bizManager');
        _bmAuth = _bmApp.auth();
        _bmDb = _bmApp.database();

        // Same LOCAL persistence as the admin app
        _bmAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
            .catch(err => console.warn('⚠️ BM persistence failed:', err));

        // Track the signed-in user
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
// Called after admin logs in
window.promptBizManagerConnect = function() {
    if (!_initBizManager()) return;
    // Already signed in? do nothing
    if (_bmUser) return;

    // Don't spam: if dismissed in last hour, skip
    const dismissedAt = parseInt(localStorage.getItem('bm_connect_dismissed_at') || '0', 10);
    if (Date.now() - dismissedAt < 60 * 60 * 1000) return;

    _showConnectModal();
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
        // onAuthStateChanged handler will close the modal
        if (typeof showOfflineToast === 'function') {
            showOfflineToast('✅ Connected to Biz Manager', 'success');
        }
    } catch (err) {
        errEl.textContent = err.message || 'Connection failed';
    }
};

// ---------- CONNECTION BADGE ----------
function _showConnectionBadge() {
    let badge = document.getElementById('bm-connection-badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'bm-connection-badge';
        badge.style.cssText = `
            position: fixed;
            top: 60px;
            right: 20px;
            background: rgba(46, 204, 113, 0.15);
            color: #2ecc71;
            border: 1px solid #2ecc71;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 600;
            z-index: 9998;
            cursor: pointer;
        `;
        badge.onclick = () => {
            if (confirm('Disconnect from Biz Manager?')) {
                window.disconnectBizManager();
            }
        };
        document.body.appendChild(badge);
    }
    badge.textContent = `🔗 Biz Manager: ${_bmUser.email}`;
}

function _hideConnectionBadge() {
    document.getElementById('bm-connection-badge')?.remove();
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

/**
 * Fetch Biz Manager data for a given customer.
 * Matches Biz Manager contacts by email OR phone.
 * Then pulls transactions where transaction.customer === contact.name.
 *
 * @param {Object} customer  { email, phone, name }
 * @param {Function} onUpdate  Called with { contacts, transactions, totals } whenever data changes
 * @returns {Function}  unsubscribe function
 */
window.fetchBizManagerForCustomer = function(customer, onUpdate) {
    if (!_initBizManager() || !_bmUser) {
        // Return a no-op unsubscriber; caller will show "not connected" state
        return () => {};
    }

    const uid = _bmUser.uid;
    const customerEmail = (customer.email || '').toLowerCase().trim();
    const customerPhone = String(customer.phone || '').replace(/[^0-9]/g, '');

    let contactsData = {};
    let transactionsData = {};
    let unsubscribers = [];

    const recompute = () => {
        // Find matching contacts (by email OR phone)
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

        // Find transactions for those contacts
        const matchedTransactions = Object.entries(transactionsData)
            .map(([id, t]) => ({ id, ...t }))
            .filter(t => {
                if (!t.customer) return false;
                return matchedNames.includes(t.customer.toLowerCase().trim());
            })
            .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

        // Totals
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

    // Real-time listeners
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

    // Return unsubscribe
    return () => {
        unsubscribers.forEach(u => { try { u(); } catch (e) {} });
    };
};

// ---------- INIT ON LOAD ----------
window.addEventListener('load', () => {
    // Try to init eagerly so that returning users with a stored session
    // get auto-connected without any prompt
    setTimeout(() => { _initBizManager(); }, 800);
});

console.log('🌉 Biz Manager bridge loaded');

