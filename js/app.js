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
// Users stay logged in after closing the app
// =============================================
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .then(() => {
        console.log('✅ Auth persistence enabled — you will stay logged in after closing the app');
    })
    .catch((error) => {
        console.warn('⚠️ Auth persistence failed:', error);
    });

// =============================================
// 🔥 FIREBASE OFFLINE PERSISTENCE — Writes queue when offline
// All Firebase writes cache locally and auto-sync when online
// =============================================
database.ref().keepSynced(true);
console.log('✅ Firebase offline persistence enabled — writes will queue when offline');

// =============================================
// 🔥 NETWORK STATUS LISTENER — Show online/offline indicator
// =============================================
window.addEventListener('online', () => {
    console.log('🌐 Back online — Firebase will sync pending writes');
    const badge = document.getElementById('offline-badge');
    if (badge) {
        badge.textContent = '🟢 Online';
        badge.className = 'offline-badge online';
    }
});

window.addEventListener('offline', () => {
    console.log('📴 Offline — Firebase will queue all writes');
    const badge = document.getElementById('offline-badge');
    if (badge) {
        badge.textContent = '📴 Offline';
        badge.className = 'offline-badge offline';
    }
});

// SIMPLE PAGE NAVIGATION ONLY - no auth handling
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
// 🔥 NETWORK STATUS BADGE — Injected on every page
// =============================================
function injectNetworkBadge() {
    if (document.getElementById('offline-badge')) return;
    
    const badge = document.createElement('div');
    badge.id = 'offline-badge';
    badge.className = navigator.onLine ? 'offline-badge online' : 'offline-badge offline';
    badge.textContent = navigator.onLine ? '🟢 Online' : '📴 Offline';
    document.body.appendChild(badge);
}

// Initialize the application
window.onload = function() {
    console.log("App initialized");
    injectNetworkBadge();
    // Just initialize basic page navigation
    // Auth handling is done in admin.js and customer.js
};