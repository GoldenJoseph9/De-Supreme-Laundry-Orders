// Firebase configuration - ONLY INITIALIZE HERE
const firebaseConfig = {
    apiKey: "AIzaSyC-UKRcGQ6k_UekiBigQLmU9WR20UGazWg",
    authDomain: "desupreme-laundromat-store-mgt.firebaseapp.com",
    databaseURL: "https://desupreme-laundromat-store-mgt-default-rtdb.firebaseio.com",
    projectId: "desupreme-laundromat-store-mgt",
    storageBucket: "desupreme-laundromat-store-mgt.appspot.com",
    messagingSenderId: "635010254043",
    appId: "1:635010254043:web:81addf7247e261c8a538fe",
    measurementId: "G-0YDT6GEWZS"
};

// Initialize Firebase ONLY ONCE
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Make these global so other files can use them
const auth = firebase.auth();
const database = firebase.database();

// =============================================
// 🔥 AUTH PERSISTENCE — Auto-login on return
// =============================================
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .then(() => {
        console.log('✅ Auth persistence enabled');
    })
    .catch((error) => {
        console.warn('⚠️ Auth persistence failed:', error);
    });

// =============================================
// 🔥 FIREBASE OFFLINE PERSISTENCE
// =============================================
database.ref().keepSynced(true);
console.log('✅ Firebase offline persistence enabled');

// =============================================
// 🔥 NETWORK STATUS LISTENER
// =============================================
window.addEventListener('online', () => {
    console.log('🌐 Back online');
    const badge = document.getElementById('offline-badge');
    if (badge) {
        badge.textContent = '🟢 Online';
        badge.className = 'offline-badge online';
    }
});

window.addEventListener('offline', () => {
    console.log('📴 Offline');
    const badge = document.getElementById('offline-badge');
    if (badge) {
        badge.textContent = '📴 Offline';
        badge.className = 'offline-badge offline';
    }
});

// =============================================
// SIMPLE PAGE NAVIGATION
// =============================================
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(pageId).classList.add('active');
}

function showSelection() {
    showPage('selection-page');
}

function showLogin(type) {
    showPage(`${type}-login`);
}

function showCustomerLanding() {
    showPage('customer-landing');
}

function showCustomerPointsPortal() {
    showPage('customer-points-portal');
}

function showAdminLanding() {
    showPage('admin-landing');
}

// Loading functions
function showLoading() {
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) {
        loadingIndicator.style.display = 'flex';
    }
}

function hideLoading() {
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
    }
}

// =============================================
// 🔥 NETWORK STATUS BADGE
// =============================================
function injectNetworkBadge() {
    if (document.getElementById('offline-badge')) return;

    const badge = document.createElement('div');
    badge.id = 'offline-badge';
    badge.className = navigator.onLine ? 'offline-badge online' : 'offline-badge offline';
    badge.textContent = navigator.onLine ? '🟢 Online' : '📴 Offline';
    document.body.appendChild(badge);
}

// =============================================
// 🔥 LOCAL CACHE HELPERS (used by admin.js / customer.js)
// Provides offline-first data access, no Firebase round-trips
// =============================================
window.dsCache = {
    // ---- user data ----
    getUser(uid) {
        if (!uid) return null;
        try {
            const raw = localStorage.getItem('cached_user_data_' + uid);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    },
    setUser(uid, data) {
        if (!uid || !data) return;
        try {
            localStorage.setItem('cached_user_data_' + uid, JSON.stringify(data));
        } catch (e) {}
    },
    clearUser(uid) {
        if (uid) localStorage.removeItem('cached_user_data_' + uid);
    },

    // ---- last role (for offline routing when token expired) ----
    setRole(role) {
        if (role) localStorage.setItem('ds_last_role', role);
    },
    getRole() {
        return localStorage.getItem('ds_last_role');
    },
    clearRole() {
        localStorage.removeItem('ds_last_role');
    },

    // ---- admin dashboard: customers list ----
    getCustomers() {
        try {
            const raw = localStorage.getItem('ds_cached_customers');
            return raw ? JSON.parse(raw) : [];
        } catch (e) { return []; }
    },
    setCustomers(list) {
        try {
            localStorage.setItem('ds_cached_customers', JSON.stringify(list || []));
        } catch (e) {}
    },

    // ---- admin dashboard: customer profiles ----
    getProfiles() {
        try {
            const raw = localStorage.getItem('ds_cached_profiles');
            return raw ? JSON.parse(raw) : [];
        } catch (e) { return []; }
    },
    setProfiles(list) {
        try {
            localStorage.setItem('ds_cached_profiles', JSON.stringify(list || []));
        } catch (e) {}
    },

    // ---- full logout cleanup ----
    clearAll() {
        Object.keys(localStorage)
            .filter(k => k.startsWith('cached_user_data_'))
            .forEach(k => localStorage.removeItem(k));
        localStorage.removeItem('ds_last_role');
    }
};

// Initialize the application
window.onload = function() {
    console.log("App initialized");
    injectNetworkBadge();
};