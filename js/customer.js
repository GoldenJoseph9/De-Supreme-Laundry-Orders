// =============================================
// GLOBAL VARIABLES & POINTS SYSTEM
// =============================================

let pointsHistory = [];
let currentFilter = 'all';

// Global points calculation system
let globalPointsData = {
    balance: 0,
    totalEarned: 0,
    totalRedeemed: 0,
    lastUpdated: null,
    isLoading: false
};

// Global function to calculate points for any customer
async function calculateGlobalPoints(customerEmail) {
    if (globalPointsData.isLoading) {
        console.log('🔄 Points calculation already in progress...');
        return globalPointsData;
    }
    
    globalPointsData.isLoading = true;
    console.log('🧮 Starting global points calculation for:', customerEmail);
    
    try {
        let totalEarned = 0;
        let totalRedeemed = 0;
        
        // Load all data sources in parallel
        const [ordersSnapshot, pointsSnapshot, redemptionsSnapshot] = await Promise.all([
            database.ref('customers').orderByChild('email').equalTo(customerEmail).once('value'),
            database.ref('pointsHistory').orderByChild('customerEmail').equalTo(customerEmail).once('value'),
            database.ref('redemptions').orderByChild('customerEmail').equalTo(customerEmail).once('value')
        ]);

        console.log('📊 Global calculation data counts:', {
            orders: ordersSnapshot.numChildren(),
            pointsHistory: pointsSnapshot.numChildren(),
            redemptions: redemptionsSnapshot.numChildren()
        });

        // Calculate from orders
        if (ordersSnapshot.exists()) {
            ordersSnapshot.forEach(orderSnapshot => {
                const order = orderSnapshot.val();
                totalEarned += parseInt(order.points) || 0;
            });
        }

        // Calculate from manual points
        if (pointsSnapshot.exists()) {
            pointsSnapshot.forEach(pointSnapshot => {
                const point = pointSnapshot.val();
                totalEarned += parseInt(point.pointsAdded) || 0;
            });
        }

        // Calculate redeemed points
        if (redemptionsSnapshot.exists()) {
            redemptionsSnapshot.forEach(redemptionSnapshot => {
                const redemption = redemptionSnapshot.val();
                totalRedeemed += parseInt(redemption.pointsUsed) || 0;
            });
        }

        const currentBalance = totalEarned - totalRedeemed;
        
        // Update global data
        globalPointsData = {
            balance: currentBalance,
            totalEarned: totalEarned,
            totalRedeemed: totalRedeemed,
            lastUpdated: new Date(),
            isLoading: false
        };

        console.log('✅ Global points calculation complete:', globalPointsData);
        return globalPointsData;

    } catch (error) {
        console.error('❌ Global points calculation failed:', error);
        globalPointsData.isLoading = false;
        return globalPointsData;
    }
}

// Function to update any points display elements
function updatePointsDisplay() {
    console.log('🔄 Updating points display with global data:', globalPointsData);
    
    // Update Points Portal elements
    const balanceElement = document.getElementById('points-balance');
    const earnedElement = document.getElementById('points-total-earned');
    const redeemedElement = document.getElementById('points-total-redeemed');
    
    if (balanceElement) {
        balanceElement.textContent = globalPointsData.balance;
        console.log('✅ Points Portal Balance updated:', globalPointsData.balance);
    }
    
    if (earnedElement) {
        earnedElement.textContent = globalPointsData.totalEarned;
        console.log('✅ Points Portal Earned updated:', globalPointsData.totalEarned);
    }
    
    if (redeemedElement) {
        redeemedElement.textContent = globalPointsData.totalRedeemed;
        console.log('✅ Points Portal Redeemed updated:', globalPointsData.totalRedeemed);
    }
    
    // Update Landing Page element
    const landingPointsElement = document.getElementById('total-points');
    if (landingPointsElement) {
        landingPointsElement.textContent = `${globalPointsData.balance} respect`;
        console.log('✅ Landing Page Points updated:', globalPointsData.balance);
    }
}

// =============================================
// PAYMENT SYSTEM FUNCTIONS
// =============================================

// Payment Functions
function setupPaymentCheckbox(orderId, checkbox, isCustomer = true) {
    checkbox.addEventListener('change', function() {
        const paymentData = {
            paymentSent: this.checked,
            paymentSentAt: this.checked ? firebase.database.ServerValue.TIMESTAMP : null,
            updatedBy: isCustomer ? 'customer' : 'admin'
        };
        
        showLoading();
        database.ref('customers/' + orderId).update(paymentData)
            .then(() => {
                hideLoading();
                if (isCustomer) {
                    loadCustomerData(); // Refresh to show admin confirmation
                }
            })
            .catch(error => {
                hideLoading();
                alert('Error updating payment status: ' + error.message);
                this.checked = !this.checked; // Revert on error
            });
    });
}

function getPaymentStatus(order) {
    if (order.paymentConfirmed) {
        return {
            text: 'Confirmed',
            class: 'payment-confirmed',
            customerChecked: true,
            adminChecked: true,
            customerDisabled: true
        };
    } else if (order.paymentSent) {
        return {
            text: 'Sent - Pending',
            class: 'payment-sent',
            customerChecked: true,
            adminChecked: false,
            customerDisabled: false
        };
    } else {
        return {
            text: 'Pending',
            class: 'payment-pending',
            customerChecked: false,
            adminChecked: false,
            customerDisabled: false
        };
    }
}

// =============================================
// ACCOUNT MODAL FUNCTIONS
// =============================================

function setupAccountModal() {
    const accountBtn = document.getElementById('show-account-btn');
    const accountModal = document.getElementById('account-modal');
    const closeAccountModal = document.getElementById('close-account-modal');
    
    console.log('🔍 Setting up account modal...');
    console.log('Account button found:', accountBtn);
    console.log('Account modal found:', accountModal);
    console.log('Close button found:', closeAccountModal);
    
    if (accountBtn) {
        accountBtn.addEventListener('click', () => {
            console.log('🎯 Account button clicked!');
            if (accountModal) {
                accountModal.style.display = 'flex';
                console.log('✅ Account modal displayed');
            } else {
                console.error('❌ Account modal not found when button clicked');
            }
        });
    } else {
        console.error('❌ Account button not found!');
        return;
    }
    
    if (closeAccountModal) {
        closeAccountModal.addEventListener('click', () => {
            console.log('🔒 Closing account modal');
            if (accountModal) {
                accountModal.style.display = 'none';
            }
        });
    } else {
        console.error('❌ Close account modal button not found!');
    }
    
    // Copy button functionality
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const textToCopy = this.getAttribute('data-text');
            console.log('📋 Copying text:', textToCopy);
            navigator.clipboard.writeText(textToCopy).then(() => {
                const originalText = this.textContent;
                this.textContent = 'Copied!';
                this.classList.add('copied');
                
                setTimeout(() => {
                    this.textContent = originalText;
                    this.classList.remove('copied');
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy text: ', err);
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = textToCopy;
                document.body.appendChild(textArea);
                textArea.select();
                try {
                    document.execCommand('copy');
                    const originalText = this.textContent;
                    this.textContent = 'Copied!';
                    this.classList.add('copied');
                    
                    setTimeout(() => {
                        this.textContent = originalText;
                        this.classList.remove('copied');
                    }, 2000);
                } catch (fallbackErr) {
                    console.error('Fallback copy failed: ', fallbackErr);
                    alert('Failed to copy text. Please copy manually.');
                }
                document.body.removeChild(textArea);
            });
        });
    });
    
    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        const accountModal = document.getElementById('account-modal');
        if (e.target === accountModal) {
            console.log('🔒 Closing account modal (outside click)');
            accountModal.style.display = 'none';
        }
    });
    
    console.log('✅ Account modal setup complete');
}

// =============================================
// PAGE NAVIGATION FUNCTIONS
// =============================================

function showSelection() {
    hideAllPages();
    document.getElementById('selection-page').classList.add('active');
}

function showLogin(type) {
    hideAllPages();
    if (type === 'customer') {
        document.getElementById('customer-login').classList.add('active');
    } else if (type === 'admin') {
        document.getElementById('admin-login').classList.add('active');
    }
}

function showCustomerLanding() {
    hideAllPages();
    document.getElementById('customer-landing').classList.add('active');
    console.log('🏠 Customer landing page shown - initializing account modal');
    // Initialize account modal AFTER the customer page is shown
    setTimeout(() => {
        setupAccountModal();
    }, 100);
    loadCustomerData();
}

function showCustomerPointsPortal() {
    hideAllPages();
    document.getElementById('customer-points-portal').classList.add('active');
    loadPointsPortalData();
}

function hideAllPages() {
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => {
        page.classList.remove('active');
    });
}

// =============================================
// EVENT LISTENERS
// =============================================

document.getElementById('customer-login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const email = document.getElementById('customer-email').value;
    const password = document.getElementById('customer-password').value;
    const errorElement = document.getElementById('customer-error-message');
    
    errorElement.textContent = 'Logging in...';
    
    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            return database.ref('users/' + userCredential.user.uid).once('value')
                .then((snapshot) => {
                    const userData = snapshot.val();
                    if (userData && userData.role === 'customer') {
                        showCustomerLanding();
                    } else {
                        auth.signOut();
                        throw new Error('This account is not registered as a made man');
                    }
                });
        })
        .catch((error) => {
            errorElement.textContent = error.message;
        });
});

// Logout handlers
document.getElementById('customer-logout-btn').addEventListener('click', () => {
    auth.signOut().then(() => {
        showSelection();
    });
});

document.getElementById('points-portal-logout-btn').addEventListener('click', () => {
    auth.signOut().then(() => {
        showSelection();
    });
});

// Points portal navigation
document.getElementById('view-points-btn').addEventListener('click', () => {
    showCustomerPointsPortal();
});

document.getElementById('points-portal-back-btn').addEventListener('click', () => {
    showCustomerLanding();
});

document.getElementById('back-to-dashboard-btn').addEventListener('click', () => {
    showCustomerLanding();
});

// Debug button
document.addEventListener('click', function(e) {
    if (e.target && e.target.id === 'debug-btn') {
        debugDatabaseStructure();
    }
});

// =============================================
// CUSTOMER DATA MANAGEMENT
// =============================================

function loadCustomerData() {
    const user = auth.currentUser;
    if (!user) {
        showError('No user logged in');
        return;
    }
    
    showLoadingState();
    
    // Load user profile
    database.ref('users/' + user.uid).once('value')
        .then((userSnapshot) => {
            if (!userSnapshot.exists()) {
                throw new Error('User data not found');
            }
            
            const userData = userSnapshot.val();
            updateProfileInfo(userData, user.email);
            
            // Load customer orders
            return database.ref('customers').orderByChild('email').equalTo(user.email).once('value');
        })
        .then(ordersSnapshot => {
            const ordersArray = [];
            
            if (ordersSnapshot.exists()) {
                ordersSnapshot.forEach(orderSnapshot => {
                    const order = orderSnapshot.val();
                    order.id = orderSnapshot.key; // Ensure ID is included
                    ordersArray.push(order);
                });
            }
            
            displayCustomerOperations(ordersArray);
            
            // Use global points calculation for both pages
            return calculateGlobalPoints(user.email);
        })
        .then(pointsData => {
            // Update display with global data
            updatePointsDisplay();
        })
        .catch((error) => {
            console.error('Error loading customer data:', error);
            showError('Failed to load your data');
        });
}

function updateProfileInfo(userData, userEmail) {
    document.getElementById('customer-name').textContent = userData.name || 'Family Member';
    document.getElementById('customer-email-display').textContent = userData.email || userEmail;
    document.getElementById('customer-phone').textContent = userData.phone || 'Not provided';
    
    if (userData.createdAt) {
        const joinDate = new Date(userData.createdAt);
        document.getElementById('customer-since').textContent = joinDate.toLocaleDateString();
    }
}

function showLoadingState() {
    document.getElementById('total-points').textContent = 'Loading...';
    const operationsList = document.getElementById('customer-operations-list');
    if (operationsList) {
        operationsList.innerHTML = '<tr><td colspan="5" class="loading-message">Loading operations...</td></tr>';
    }
}

function showError(message) {
    document.getElementById('total-points').textContent = 'Error';
    const operationsList = document.getElementById('customer-operations-list');
    if (operationsList) {
        operationsList.innerHTML = `<tr><td colspan="5" class="error-message">${message}</td></tr>`;
    }
}

// =============================================
// OPERATIONS DISPLAY - UPDATED WITH PAYMENT
// =============================================

function displayCustomerOperations(orders) {
    const operationsList = document.getElementById('customer-operations-list');
    if (!operationsList) return;
    
    operationsList.innerHTML = '';
    
    if (!orders || orders.length === 0) {
        operationsList.innerHTML = '<tr><td colspan="5" class="no-data-message">No laundry operations found yet</td></tr>';
        return;
    }
    
    // Sort by date (newest first)
    orders.sort((a, b) => {
        const dateA = a.date || a.createdAt || 0;
        const dateB = b.date || b.createdAt || 0;
        return new Date(dateB) - new Date(dateA);
    });
    
    orders.forEach(order => {
        const row = document.createElement('tr');
        row.className = 'operation-row';
        
        const orderDate = formatOrderDate(order);
        const statusClass = getStatusClass(order);
        const statusText = getStatusText(order);
        const orderPoints = order.points || 0;
        const paymentStatus = getPaymentStatus(order);
        
        row.innerHTML = `
            <td class="operation-date">${orderDate}</td>
            <td class="operation-items">${order.items || 'Standard laundry service'}</td>
            <td class="operation-status ${statusClass}">${statusText}</td>
            <td class="operation-points">+${orderPoints}</td>
            <td class="payment-cell">
                <div class="payment-controls">
                    <label class="payment-checkbox-label">
                        <input type="checkbox" class="payment-checkbox" 
                               ${paymentStatus.customerChecked ? 'checked' : ''}
                               ${paymentStatus.customerDisabled ? 'disabled' : ''}
                               data-order="${order.id}">
                        <span class="payment-status ${paymentStatus.class}">
                            ${paymentStatus.text}
                        </span>
                    </label>
                </div>
            </td>
        `;
        
        operationsList.appendChild(row);
        
        // Setup checkbox event
        const checkbox = row.querySelector('.payment-checkbox');
        if (checkbox && !paymentStatus.customerDisabled) {
            setupPaymentCheckbox(order.id, checkbox, true);
        }
    });
}

function formatOrderDate(order) {
    if (order.date) {
        return new Date(order.date).toLocaleDateString();
    } else if (order.createdAt) {
        return new Date(order.createdAt).toLocaleDateString();
    }
    return 'Recent';
}

function getStatusClass(order) {
    if (order.collected) return 'status-completed';
    if (order.ready) return 'status-ready';
    return 'status-pending';
}

function getStatusText(order) {
    if (order.collected) return 'Completed';
    if (order.ready) return 'Ready for pickup';
    return 'In progress';
}

// =============================================
// POINTS PORTAL FUNCTIONS - USING GLOBAL SYSTEM
// =============================================

function loadPointsPortalData() {
    const user = auth.currentUser;
    if (!user) {
        console.error('❌ No user logged in');
        return;
    }
    
    showPointsLoading();
    
    console.log('🔄 Loading points portal data for:', user.email);
    
    // Load user profile info first
    database.ref('users/' + user.uid).once('value')
        .then((userSnapshot) => {
            const userData = userSnapshot.val();
            if (userData) {
                document.getElementById('points-customer-name').textContent = userData.name || 'Family Member';
                document.getElementById('points-customer-email').textContent = userData.email || user.email;
                document.getElementById('points-customer-phone').textContent = userData.phone || 'Not provided';
                
                if (userData.createdAt) {
                    const joinDate = new Date(userData.createdAt);
                    document.getElementById('points-member-since').textContent = joinDate.toLocaleDateString();
                }
            }
            
            // Use global points calculation (may be cached or recalculated)
            return calculateGlobalPoints(user.email);
        })
        .then(pointsData => {
            console.log('🎯 Points data loaded:', pointsData);
            
            // Update display with global data
            updatePointsDisplay();
            
            // Load detailed history
            return loadDetailedPointsHistory(user.email);
        })
        .then(() => {
            // Setup filters
            setupPointsPortalFilters();
            filterPointsHistory(currentFilter);
        })
        .catch((error) => {
            console.error('❌ Points portal error:', error);
            showPointsError();
        });
}

function loadDetailedPointsHistory(customerEmail) {
    return new Promise((resolve) => {
        pointsHistory = [];
        
        console.log('📊 Loading detailed points history for:', customerEmail);
        
        Promise.all([
            database.ref('customers').orderByChild('email').equalTo(customerEmail).once('value'),
            database.ref('pointsHistory').orderByChild('customerEmail').equalTo(customerEmail).once('value'),
            database.ref('redemptions').orderByChild('customerEmail').equalTo(customerEmail).once('value')
        ])
        .then(([customersSnapshot, pointsHistorySnapshot, redemptionsSnapshot]) => {
            
            // Process laundry orders
            if (customersSnapshot.exists()) {
                customersSnapshot.forEach(customerSnapshot => {
                    const customerData = customerSnapshot.val();
                    const orderPoints = parseInt(customerData.points) || 0;
                    
                    if (orderPoints > 0) {
                        pointsHistory.push({
                            type: 'earned',
                            date: customerData.date || customerData.createdAt,
                            description: 'Laundry Operation',
                            details: customerData.items || 'Laundry service',
                            points: orderPoints,
                            timestamp: new Date(customerData.date || customerData.createdAt).getTime(),
                            id: `order-${customerSnapshot.key}`
                        });
                    }
                });
            }

            // Process manual points
            if (pointsHistorySnapshot.exists()) {
                pointsHistorySnapshot.forEach(pointSnapshot => {
                    const point = pointSnapshot.val();
                    if (point.pointsAdded) {
                        const points = parseInt(point.pointsAdded) || 0;
                        
                        pointsHistory.push({
                            type: 'earned',
                            date: point.timestamp,
                            description: point.reason || 'Respect Added',
                            details: point.addedBy ? `Granted by: ${point.addedBy}` : 'System',
                            points: points,
                            timestamp: new Date(point.timestamp).getTime(),
                            id: `manual-${pointSnapshot.key}`
                        });
                    }
                });
            }

            // Process redemptions
            if (redemptionsSnapshot.exists()) {
                redemptionsSnapshot.forEach(redemptionSnapshot => {
                    const redemption = redemptionSnapshot.val();
                    
                    if (redemption.pointsUsed) {
                        const points = parseInt(redemption.pointsUsed) || 0;
                        if (points > 0) {
                            pointsHistory.push({
                                type: 'redeemed',
                                date: redemption.timestamp,
                                description: 'Respect Spent',
                                details: redemption.reward || 'Reward not specified',
                                points: points,
                                timestamp: new Date(redemption.timestamp).getTime(),
                                id: `redeemed-${redemptionSnapshot.key}`
                            });
                        }
                    }
                });
            }
            
            console.log('📊 History items loaded:', pointsHistory.length);
            
            // Sort by timestamp (newest first)
            pointsHistory.sort((a, b) => b.timestamp - a.timestamp);
            
            resolve();
        })
        .catch(error => {
            console.error('❌ Error loading history:', error);
            resolve();
        });
    });
}

function filterPointsHistory(filter) {
    const historyList = document.getElementById('points-history-list');
    if (!historyList) {
        console.error('❌ History list element not found');
        return;
    }
    
    currentFilter = filter;
    historyList.innerHTML = '';
    
    // Update active filter button
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.filter === filter) {
            btn.classList.add('active');
        }
    });
    
    if (pointsHistory.length === 0) {
        historyList.innerHTML = '<div class="empty-state"><div>📊</div><p>No respect history found</p></div>';
        return;
    }
    
    const filteredHistory = pointsHistory.filter(item => {
        if (filter === 'all') return true;
        return item.type === filter;
    });
    
    if (filteredHistory.length === 0) {
        historyList.innerHTML = '<div class="empty-state"><div>🔍</div><p>No matching records found</p></div>';
        return;
    }
    
    filteredHistory.forEach(item => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item-portal';
        
        let dateText = 'Recent';
        if (item.timestamp) {
            try {
                dateText = new Date(item.timestamp).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
            } catch (e) {
                console.warn('Date parsing error:', e);
            }
        }
        
        historyItem.innerHTML = `
            <div class="history-info">
                <div class="history-date-portal">${dateText}</div>
                <div class="history-desc">${item.description}</div>
                <div class="history-details-portal">${item.details}</div>
            </div>
            <div class="points-change ${item.type === 'earned' ? 'points-added' : 'points-redeemed'}">
                ${item.type === 'earned' ? '+' : '-'}${item.points}
            </div>
        `;
        
        historyList.appendChild(historyItem);
    });
}

function showPointsLoading() {
    const historyList = document.getElementById('points-history-list');
    if (historyList) {
        historyList.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading respect history...</p></div>';
    }
    
    // Set loading states for points display
    document.getElementById('points-balance').textContent = '...';
    document.getElementById('points-total-earned').textContent = '...';
    document.getElementById('points-total-redeemed').textContent = '...';
}

function showPointsError() {
    const historyList = document.getElementById('points-history-list');
    if (historyList) {
        historyList.innerHTML = '<div class="empty-state"><div>❌</div><p>Error loading your data</p></div>';
    }
    
    // Set error states for points display
    document.getElementById('points-balance').textContent = '0';
    document.getElementById('points-total-earned').textContent = '0';
    document.getElementById('points-total-redeemed').textContent = '0';
}

// =============================================
// FILTER SETUP
// =============================================

function setupPointsPortalFilters() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    
    filterButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const filterType = this.dataset.filter;
            filterPointsHistory(filterType);
        });
    });
    
    // Set 'all' as active by default
    const allFilterBtn = document.querySelector('.filter-btn[data-filter="all"]');
    if (allFilterBtn) {
        allFilterBtn.classList.add('active');
    }
}

// =============================================
// DEBUG FUNCTIONALITY
// =============================================

function debugDatabaseStructure() {
    const user = auth.currentUser;
    if (!user) {
        showDebugOutput('No user logged in');
        return;
    }

    const debugOutput = document.getElementById('debug-output');
    debugOutput.style.display = 'block';
    debugOutput.innerHTML = '<div style="color: #666; background: #f0f0f0; padding: 10px; border-radius: 5px;">Loading debug data...</div>';

    let debugData = {
        user: { email: user.email, uid: user.uid },
        userData: null,
        customerOrders: [],
        pointsHistory: [],
        redemptions: [],
        globalPoints: globalPointsData
    };

    database.ref('users/' + user.uid).once('value')
        .then(userSnapshot => {
            debugData.userData = userSnapshot.val();
            
            return database.ref('customers').orderByChild('email').equalTo(user.email).once('value');
        })
        .then(customersSnapshot => {
            if (customersSnapshot.exists()) {
                customersSnapshot.forEach(snap => {
                    debugData.customerOrders.push(snap.val());
                });
            }
            
            return database.ref('pointsHistory').orderByChild('customerEmail').equalTo(user.email).once('value');
        })
        .then(pointsSnapshot => {
            if (pointsSnapshot.exists()) {
                pointsSnapshot.forEach(snap => {
                    debugData.pointsHistory.push(snap.val());
                });
            }
            
            return database.ref('redemptions').orderByChild('customerEmail').equalTo(user.email).once('value');
        })
        .then(redemptionsSnapshot => {
            if (redemptionsSnapshot.exists()) {
                redemptionsSnapshot.forEach(snap => {
                    debugData.redemptions.push(snap.val());
                });
            }
            
            displayDebugData(debugData);
        })
        .catch(error => {
            showDebugOutput('Debug failed: ' + error.message);
        });
}

function displayDebugData(debugData) {
    const debugOutput = document.getElementById('debug-output');
    
    const ordersPoints = debugData.customerOrders.reduce((sum, order) => sum + (parseInt(order.points) || 0), 0);
    const manualPoints = debugData.pointsHistory.reduce((sum, point) => sum + (parseInt(point.pointsAdded) || 0), 0);
    const redeemedPoints = debugData.redemptions.reduce((sum, redemption) => sum + (parseInt(redemption.pointsUsed) || 0), 0);
    const totalBalance = ordersPoints + manualPoints - redeemedPoints;
    
    let html = `
        <div style="margin-bottom: 15px; font-weight: bold; color: #2c3e50; font-size: 18px; background: #e8f4fd; padding: 10px; border-radius: 5px; border-left: 4px solid #3498db;">
            🔍 Debug Results - Global Points System
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
            <div style="background: #e8f6f3; padding: 10px; border-radius: 5px; border-left: 4px solid #27ae60;">
                <strong style="color: #27ae60;">📧 User Info</strong><br>
                <span style="color: #2c3e50;">Email: ${debugData.user.email}</span><br>
                <span style="color: #2c3e50;">UID: ${debugData.user.uid}</span>
            </div>
            <div style="background: #fef9e7; padding: 10px; border-radius: 5px; border-left: 4px solid #f39c12;">
                <strong style="color: #f39c12;">📊 Data Counts</strong><br>
                <span style="color: #2c3e50;">Orders: ${debugData.customerOrders.length}</span><br>
                <span style="color: #2c3e50;">Points History: ${debugData.pointsHistory.length}</span><br>
                <span style="color: #2c3e50;">Redemptions: ${debugData.redemptions.length}</span>
            </div>
        </div>

        <div style="background: #fff; border: 2px solid #e74c3c; border-radius: 5px; padding: 15px; margin-bottom: 15px;">
            <strong style="color: #e74c3c; font-size: 16px;">🧮 Global Points System</strong>
            <div style="margin-top: 10px;">
                <div style="color: #27ae60; margin: 5px 0;">➕ Orders Points: ${ordersPoints}</div>
                <div style="color: #27ae60; margin: 5px 0;">➕ Manual Points: ${manualPoints}</div>
                <div style="color: #e74c3c; margin: 5px 0;">➖ Redeemed Points: ${redeemedPoints}</div>
                <div style="color: #2980b9; margin: 5px 0; font-weight: bold; font-size: 16px;">🎯 Calculated Balance: ${totalBalance}</div>
                <div style="color: #8e44ad; margin: 5px 0; font-weight: bold;">🔄 Global Data Balance: ${debugData.globalPoints.balance}</div>
                <div style="color: #8e44ad; margin: 5px 0;">🔄 Global Data Earned: ${debugData.globalPoints.totalEarned}</div>
                <div style="color: #8e44ad; margin: 5px 0;">🔄 Global Data Redeemed: ${debugData.globalPoints.totalRedeemed}</div>
            </div>
        </div>

        <div style="background: #f8f9fa; padding: 10px; border-radius: 5px; margin-bottom: 15px;">
            <strong style="color: #2c3e50;">👤 User Data:</strong>
            <div style="color: #7f8c8d; font-size: 12px; background: white; padding: 8px; border-radius: 3px; margin-top: 5px;">
                ${JSON.stringify(debugData.userData || 'No user data', null, 2)}
            </div>
        </div>
        
        <div style="background: #fff3cd; padding: 10px; border-radius: 5px; margin-bottom: 15px;">
            <strong style="color: #856404;">📦 Customer Orders (${debugData.customerOrders.length}):</strong>
            <div style="color: #856404; font-size: 12px; background: white; padding: 8px; border-radius: 3px; margin-top: 5px; max-height: 200px; overflow-y: auto;">
                ${JSON.stringify(debugData.customerOrders, null, 2)}
            </div>
        </div>
        
        <div style="background: #d1ecf1; padding: 10px; border-radius: 5px; margin-bottom: 15px;">
            <strong style="color: #0c5460;">💰 Points History (${debugData.pointsHistory.length}):</strong>
            <div style="color: #0c5460; font-size: 12px; background: white; padding: 8px; border-radius: 3px; margin-top: 5px; max-height: 200px; overflow-y: auto;">
                ${JSON.stringify(debugData.pointsHistory, null, 2)}
            </div>
        </div>
        
        <div style="background: #f8d7da; padding: 10px; border-radius: 5px; margin-bottom: 15px;">
            <strong style="color: #721c24;">🛍️ Redemptions (${debugData.redemptions.length}):</strong>
            <div style="color: #721c24; font-size: 12px; background: white; padding: 8px; border-radius: 3px; margin-top: 5px; max-height: 200px; overflow-y: auto;">
                ${JSON.stringify(debugData.redemptions, null, 2)}
            </div>
        </div>
    `;
    
    debugOutput.innerHTML = html;
}

function showDebugOutput(message) {
    const debugOutput = document.getElementById('debug-output');
    debugOutput.style.display = 'block';
    debugOutput.innerHTML = `<div style="color: white; background: #e74c3c; padding: 15px; border-radius: 5px; font-weight: bold;">${message}</div>`;
}

// =============================================
// LOADING FUNCTIONS
// =============================================

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
// INITIALIZATION
// =============================================

auth.onAuthStateChanged((user) => {
    if (user) {
        database.ref('users/' + user.uid).once('value')
            .then((snapshot) => {
                const userData = snapshot.val();
                if (userData && userData.role === 'customer') {
                    showCustomerLanding();
                } else {
                    showSelection();
                }
            })
            .catch((error) => {
                showSelection();
            });
    } else {
        showSelection();
    }
});

window.onload = function() {
    console.log('🚀 Customer.js initialized with Global Points System');
};
