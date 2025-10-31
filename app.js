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

// Initialize the application
window.onload = function() {
    console.log("App initialized");
    // Just initialize basic page navigation
    // Auth handling is done in admin.js and customer.js
};