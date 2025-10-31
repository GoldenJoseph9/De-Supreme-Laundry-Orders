// Admin login handler
document.getElementById('admin-login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const email = document.getElementById('admin-email').value;
    const password = document.getElementById('admin-password').value;
    const errorElement = document.getElementById('admin-error-message');
    
    errorElement.textContent = 'Logging in...';
    
    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            const userId = userCredential.user.uid;
            return database.ref('users/' + userId).once('value');
        })
        .then((snapshot) => {
            const userData = snapshot.val();
            
            if (!userData) {
                throw new Error("User data not found in database");
            }
            if (userData.role !== 'admin') {
                throw new Error("You don't have Don privileges");
            }
            
            errorElement.textContent = 'Login successful!';
            errorElement.className = 'success-message';
            
            setTimeout(() => {
                showAdminLanding();
                initAdminDashboard();
            }, 1000);
        })
        .catch((error) => {
            errorElement.textContent = error.message;
            errorElement.className = 'error-message';
            
            if (email === "desupremelaundry@gmail.com" && password === "Desupreme") {
                errorElement.textContent += " (Don account needs setup)";
                createAdminAccount();
            }
            
            auth.signOut();
        });
});

function createAdminAccount() {
    const adminEmail = "desupremelaundry@gmail.com";
    const adminPassword = "Desupreme";
    
    auth.createUserWithEmailAndPassword(adminEmail, adminPassword)
        .then((userCredential) => {
            const userId = userCredential.user.uid;
            return database.ref('users/' + userId).set({
                name: "Admin",
                email: adminEmail,
                role: "admin",
                createdAt: firebase.database.ServerValue.TIMESTAMP
            });
        })
        .then(() => {
            document.getElementById('admin-error-message').textContent = "Don account created! Please login again.";
            document.getElementById('admin-error-message').className = 'success-message';
        })
        .catch((error) => {
            if (error.code === 'auth/email-already-in-use') {
                document.getElementById('admin-error-message').textContent = "Don account exists but has incorrect permissions";
            } else {
                document.getElementById('admin-error-message').textContent = "Error creating Don account: " + error.message;
            }
        });
}

document.getElementById('admin-logout-btn').addEventListener('click', () => {
    auth.signOut().then(() => {
        showSelection();
    });
});

let allCustomers = [];
let allCustomerProfiles = [];
let currentHistoryCustomerId = null;

function initAdminDashboard() {
    setupEventListeners();
    loadCustomers();
    loadCustomerProfiles();
    document.getElementById('customer-date-input').valueAsDate = new Date();
}

function loadCustomers() {
    showLoading();
    
    // Load customers and user data together
    Promise.all([
        database.ref('customers').once('value'),
        database.ref('users').once('value')
    ]).then(([customersSnapshot, usersSnapshot]) => {
        allCustomers = [];
        
        if (!customersSnapshot.exists()) {
            document.getElementById('customers-list').innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem;">No laundry orders found</td></tr>';
            hideLoading();
            return;
        }
        
        // Create a map of users by email for quick lookup
        const usersMap = new Map();
        if (usersSnapshot.exists()) {
            usersSnapshot.forEach(userSnapshot => {
                const user = userSnapshot.val();
                if (user.email && user.role === 'customer') {
                    usersMap.set(user.email, user);
                }
            });
        }
        
        customersSnapshot.forEach(child => {
            const customer = child.val();
            customer.id = child.key;
            customer.points = customer.points || 0;
            
            // Add phone number from users data if available
            if (customer.email && usersMap.has(customer.email)) {
                const userData = usersMap.get(customer.email);
                customer.phoneFromUser = userData.phone || 'Not provided';
            } else {
                customer.phoneFromUser = 'Not provided';
            }
            
            allCustomers.push(customer);
        });
        
        allCustomers.sort((a, b) => {
            const dateA = a.date ? new Date(a.date) : new Date(0);
            const dateB = b.date ? new Date(b.date) : new Date(0);
            return dateB - dateA;
        });
        
        renderCustomers(allCustomers);
        hideLoading();
    }).catch(error => {
        hideLoading();
        alert('Error loading laundry orders');
    });
}

function renderCustomers(customers) {
    const customersList = document.getElementById('customers-list');
    customersList.innerHTML = '';
    
    if (customers.length === 0) {
        customersList.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem;">No laundry orders found</td></tr>';
        return;
    }
    
    customers.forEach(customer => {
        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td>${customer.name || ''}</td>
            <td>${customer.phoneFromUser || 'Not provided'}</td>
            <td>${customer.email || ''}</td>
            <td>${customer.items || ''}</td>
            <td>${customer.date || ''}</td>
            <td class="status-${getStatusClass(customer)}">${formatStatus(customer)}</td>
            <td><span class="points-badge">${customer.points || 0}</span></td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-primary edit-btn" data-id="${customer.id}">Edit</button>
                    <button class="btn btn-danger delete-btn" data-id="${customer.id}">Whack</button>
                    <button class="btn btn-warning quick-add-btn" data-id="${customer.id}">Quick Add</button>
                </div>
            </td>
        `;
        
        customersList.appendChild(row);
    });
    
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', () => editCustomer(btn.dataset.id));
    });
    
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteCustomer(btn.dataset.id));
    });
    
    document.querySelectorAll('.quick-add-btn').forEach(btn => {
        btn.addEventListener('click', () => quickAddCustomer(btn.dataset.id));
    });
}

function loadCustomerProfiles() {
    showLoading();
    
    database.ref('users').once('value')
        .then(usersSnapshot => {
            allCustomerProfiles = [];
            
            if (!usersSnapshot.exists()) {
                document.getElementById('customer-history-list').innerHTML = '<p>No family members found.</p>';
                hideLoading();
                return;
            }
            
            const userPromises = [];
            
            usersSnapshot.forEach(userSnapshot => {
                const user = userSnapshot.val();
                user.id = userSnapshot.key;
                
                if (user.role === 'admin') {
                    return;
                }
                
                const promise = database.ref('customers').orderByChild('email').equalTo(user.email).once('value')
                    .then(ordersSnapshot => {
                        let totalOrders = 0;
                        let totalPointsFromClothes = 0;
                        
                        if (ordersSnapshot.exists()) {
                            ordersSnapshot.forEach(orderSnapshot => {
                                totalOrders++;
                                totalPointsFromClothes += parseInt(orderSnapshot.val().points) || 0;
                            });
                        }
                        
                        return calculateCustomerActualBalance(user.email)
                            .then(currentBalance => {
                                const customerProfile = {
                                    id: user.id,
                                    name: user.name || 'Unknown',
                                    email: user.email || 'No email',
                                    phone: user.phone || 'No phone',
                                    totalOrders: totalOrders,
                                    totalPointsFromClothes: totalPointsFromClothes,
                                    currentBalance: currentBalance
                                };
                                
                                allCustomerProfiles.push(customerProfile);
                            });
                    })
                    .catch(error => {
                        const customerProfile = {
                            id: user.id,
                            name: user.name || 'Unknown',
                            email: user.email || 'No email',
                            phone: user.phone || 'No phone',
                            totalOrders: 0,
                            totalPointsFromClothes: 0,
                            currentBalance: 0
                        };
                        allCustomerProfiles.push(customerProfile);
                    });
                
                userPromises.push(promise);
            });
            
            return Promise.all(userPromises);
        })
        .then(() => {
            allCustomerProfiles.sort((a, b) => a.name.localeCompare(b.name));
            renderCustomerProfiles(allCustomerProfiles);
            hideLoading();
        })
        .catch(error => {
            document.getElementById('customer-history-list').innerHTML = '<p>Error loading family members.</p>';
            hideLoading();
        });
}

function renderCustomerProfiles(customers) {
    const customerHistoryList = document.getElementById('customer-history-list');
    customerHistoryList.innerHTML = '';
    
    if (customers.length === 0) {
        customerHistoryList.innerHTML = '<p>No family members found.</p>';
        return;
    }
    
    customers.forEach(customer => {
        const customerCard = document.createElement('div');
        customerCard.className = 'customer-history-card';
        
        customerCard.innerHTML = `
            <div class="customer-history-header">
                <h3>${customer.name}</h3>
                <div>
                    <span class="points-earned-badge">${customer.currentBalance} respect</span>
                </div>
            </div>
            <div class="customer-history-content">
                <div class="customer-history-details">
                    <div><strong>Email:</strong> ${customer.email}</div>
                    <div><strong>Phone:</strong> ${customer.phone}</div>
                    <div><strong>Total Operations:</strong> ${customer.totalOrders}</div>
                    <div><strong>Current Balance:</strong> <span class="points-earned-badge">${customer.currentBalance}</span></div>
                </div>
                <div class="action-buttons">
                    <button class="btn history-btn view-history-btn" data-id="${customer.id}" data-email="${customer.email}">View Full History</button>
                    <button class="btn add-points-btn" data-id="${customer.id}" data-email="${customer.email}">Grant Respect</button>
                    <button class="btn redeem-btn" data-id="${customer.id}" data-email="${customer.email}">Spend Respect</button>
                </div>
            </div>
        `;
        
        customerHistoryList.appendChild(customerCard);
        
        customerCard.querySelector('.view-history-btn').addEventListener('click', (e) => {
            const email = e.target.getAttribute('data-email');
            openHistoryModal(customer.id, email);
        });
        
        customerCard.querySelector('.add-points-btn').addEventListener('click', (e) => {
            const email = e.target.getAttribute('data-email');
            openAddPointsModal(customer.id, email);
        });
        
        customerCard.querySelector('.redeem-btn').addEventListener('click', (e) => {
            const email = e.target.getAttribute('data-email');
            openRedeemModal(customer.id, email);
        });
    });
}

function calculateCustomerActualBalance(customerEmail) {
    return new Promise((resolve) => {
        let totalEarned = 0;
        let totalRedeemed = 0;
        
        database.ref('customers').orderByChild('email').equalTo(customerEmail).once('value')
            .then(ordersSnapshot => {
                if (ordersSnapshot.exists()) {
                    ordersSnapshot.forEach(orderSnapshot => {
                        const order = orderSnapshot.val();
                        totalEarned += parseInt(order.points) || 0;
                    });
                }
                
                return database.ref('pointsHistory').once('value');
            })
            .then(pointsHistorySnapshot => {
                if (pointsHistorySnapshot.exists()) {
                    pointsHistorySnapshot.forEach(pointSnapshot => {
                        const point = pointSnapshot.val();
                        if (point.customerEmail === customerEmail || point.email === customerEmail) {
                            totalEarned += parseInt(point.pointsAdded) || 0;
                        }
                    });
                }
                
                return database.ref('redemptions').orderByChild('customerEmail').equalTo(customerEmail).once('value');
            })
            .then(redemptionsSnapshot => {
                if (redemptionsSnapshot.exists()) {
                    redemptionsSnapshot.forEach(redemptionSnapshot => {
                        const redemption = redemptionSnapshot.val();
                        totalRedeemed += parseInt(redemption.pointsUsed) || 0;
                    });
                }
                
                const finalBalance = totalEarned - totalRedeemed;
                resolve(finalBalance);
            })
            .catch(error => {
                resolve(0);
            });
    });
}

function formatStatus(customer) {
    if (customer.collected) return 'Completed';
    if (customer.ready) return 'Ready';
    return 'In Progress';
}

function getStatusClass(customer) {
    if (customer.collected) return 'collected';
    if (customer.ready) return 'ready';
    return 'pending';
}

function openAddCustomerModal() {
    document.getElementById('modal-title').textContent = 'Initiate New Member';
    document.getElementById('customer-form').reset();
    document.getElementById('customer-id').value = '';
    document.getElementById('customer-points-input').value = '0';
    document.getElementById('customer-date-input').valueAsDate = new Date();
    
    document.getElementById('phone-field-group').style.display = 'block';
    document.getElementById('customer-phone-input').required = true;
    
    document.getElementById('customer-modal').removeAttribute('data-quick-add');
    document.getElementById('customer-modal').style.display = 'flex';
}

function quickAddCustomer(customerId) {
    showLoading();
    const customer = allCustomers.find(c => c.id === customerId);
    
    if (!customer) {
        hideLoading();
        alert('Family member not found');
        return;
    }
    
    document.getElementById('modal-title').textContent = 'Quick Add (Duplicate)';
    document.getElementById('customer-form').reset();
    document.getElementById('customer-id').value = '';
    
    document.getElementById('customer-name-input').value = customer.name || '';
    document.getElementById('customer-email-input').value = customer.email || '';
    document.getElementById('customer-date-input').valueAsDate = new Date();
    document.getElementById('customer-points-input').value = '0';
    document.getElementById('customer-status-input').value = 'pending';
    
    // Hide phone field for quick add to prevent sending to customers path
    document.getElementById('phone-field-group').style.display = 'none';
    document.getElementById('customer-phone-input').required = false;
    document.getElementById('customer-phone-input').value = '';
    
    document.getElementById('customer-modal').setAttribute('data-quick-add', 'true');
    document.getElementById('customer-modal').style.display = 'flex';
    
    setTimeout(() => {
        document.getElementById('customer-items-input').focus();
    }, 100);
    
    hideLoading();
}

function editCustomer(customerId) {
    showLoading();
    const customer = allCustomers.find(c => c.id === customerId);
    
    if (!customer) {
        hideLoading();
        alert('Family member not found');
        return;
    }
    
    document.getElementById('modal-title').textContent = 'Edit Family Member';
    document.getElementById('customer-id').value = customerId;
    document.getElementById('customer-name-input').value = customer.name || '';
    document.getElementById('customer-email-input').value = customer.email || '';
    document.getElementById('customer-items-input').value = customer.items || '';
    document.getElementById('customer-date-input').value = customer.date || '';
    document.getElementById('customer-points-input').value = customer.points || 0;
    
    // Show phone field but don't pre-fill it (phone comes from users path)
    document.getElementById('phone-field-group').style.display = 'block';
    document.getElementById('customer-phone-input').required = false;
    document.getElementById('customer-phone-input').value = '';
    
    if (customer.collected) {
        document.getElementById('customer-status-input').value = 'collected';
    } else if (customer.ready) {
        document.getElementById('customer-status-input').value = 'ready';
    } else {
        document.getElementById('customer-status-input').value = 'pending';
    }
    
    document.getElementById('customer-modal').removeAttribute('data-quick-add');
    document.getElementById('customer-modal').style.display = 'flex';
    hideLoading();
}

function handleFormSubmit(e) {
    e.preventDefault();
    
    const isQuickAdd = document.getElementById('customer-modal').getAttribute('data-quick-add') === 'true';
    
    const formData = {
        name: document.getElementById('customer-name-input').value.trim(),
        email: document.getElementById('customer-email-input').value.trim(),
        items: document.getElementById('customer-items-input').value.trim(),
        date: document.getElementById('customer-date-input').value,
        points: parseInt(document.getElementById('customer-points-input').value) || 0,
        ready: document.getElementById('customer-status-input').value === 'ready',
        collected: document.getElementById('customer-status-input').value === 'collected'
    };
    
    // Only include phone if it's not a quick add and phone field is visible
    if (!isQuickAdd && document.getElementById('phone-field-group').style.display !== 'none') {
        const phone = document.getElementById('customer-phone-input').value.trim();
        if (phone) {
            formData.phone = phone;
        }
    }
    
    if (!formData.name || !formData.items || !formData.date) {
        alert('Please fill in all required fields');
        return;
    }
    
    showLoading();
    
    const customerId = document.getElementById('customer-id').value;
    
    if (customerId) {
        database.ref('customers/' + customerId).update({
            ...formData,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        })
        .then(() => {
            document.getElementById('customer-modal').style.display = 'none';
            document.getElementById('customer-form').reset();
            document.getElementById('customer-id').value = '';
            document.getElementById('customer-date-input').valueAsDate = new Date();
            document.getElementById('customer-modal').removeAttribute('data-quick-add');
        })
        .catch(error => {
            alert('Error updating family member');
        })
        .finally(() => {
            hideLoading();
        });
    } else {
        if (isQuickAdd) {
            const laundryOrder = {
                name: formData.name,
                email: formData.email,
                items: formData.items,
                date: formData.date,
                points: formData.points,
                ready: formData.ready,
                collected: formData.collected,
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                updatedAt: firebase.database.ServerValue.TIMESTAMP
            };
            
            database.ref('customers').push(laundryOrder)
                .then(() => {
                    document.getElementById('customer-modal').style.display = 'none';
                    document.getElementById('customer-form').reset();
                    document.getElementById('customer-date-input').valueAsDate = new Date();
                    document.getElementById('customer-modal').removeAttribute('data-quick-add');
                    
                    loadCustomers();
                    loadCustomerProfiles();
                })
                .catch(error => {
                    alert('Error adding laundry order: ' + error.message);
                })
                .finally(() => {
                    hideLoading();
                });
        } else {
            // For new member creation, check if we need to create user account
            const phone = document.getElementById('customer-phone-input').value.trim();
            
            if (phone) {
                // Check if user already exists with this phone
                database.ref('users').orderByChild('phone').equalTo(phone).once('value')
                    .then(phoneSnapshot => {
                        let existingUserId = null;
                        
                        if (phoneSnapshot.exists()) {
                            phoneSnapshot.forEach(userSnapshot => {
                                const user = userSnapshot.val();
                                if (user.email === formData.email) {
                                    existingUserId = userSnapshot.key;
                                }
                            });
                        }
                        
                        if (existingUserId) {
                            // User exists, just create customer order
                            const laundryOrder = {
                                name: formData.name,
                                email: formData.email,
                                items: formData.items,
                                date: formData.date,
                                points: formData.points,
                                ready: formData.ready,
                                collected: formData.collected,
                                createdAt: firebase.database.ServerValue.TIMESTAMP,
                                updatedAt: firebase.database.ServerValue.TIMESTAMP
                            };
                            
                            return database.ref('customers').push(laundryOrder);
                        } else {
                            // Create new user account
                            const userId = database.ref('users').push().key;
                            const userData = {
                                name: formData.name,
                                email: formData.email,
                                phone: phone,
                                role: 'customer',
                                createdAt: firebase.database.ServerValue.TIMESTAMP
                            };
                            
                            return database.ref('users/' + userId).set(userData)
                                .then(() => {
                                    const laundryOrder = {
                                        name: formData.name,
                                        email: formData.email,
                                        items: formData.items,
                                        date: formData.date,
                                        points: formData.points,
                                        ready: formData.ready,
                                        collected: formData.collected,
                                        createdAt: firebase.database.ServerValue.TIMESTAMP,
                                        updatedAt: firebase.database.ServerValue.TIMESTAMP
                                    };
                                    return database.ref('customers').push(laundryOrder);
                                });
                        }
                    })
                    .then(() => {
                        document.getElementById('customer-modal').style.display = 'none';
                        document.getElementById('customer-form').reset();
                        document.getElementById('customer-date-input').valueAsDate = new Date();
                        document.getElementById('customer-modal').removeAttribute('data-quick-add');
                        
                        loadCustomers();
                        loadCustomerProfiles();
                    })
                    .catch(error => {
                        alert('Error adding family member: ' + error.message);
                    })
                    .finally(() => {
                        hideLoading();
                    });
            } else {
                // No phone provided, just create customer order
                const laundryOrder = {
                    name: formData.name,
                    email: formData.email,
                    items: formData.items,
                    date: formData.date,
                    points: formData.points,
                    ready: formData.ready,
                    collected: formData.collected,
                    createdAt: firebase.database.ServerValue.TIMESTAMP,
                    updatedAt: firebase.database.ServerValue.TIMESTAMP
                };
                
                database.ref('customers').push(laundryOrder)
                    .then(() => {
                        document.getElementById('customer-modal').style.display = 'none';
                        document.getElementById('customer-form').reset();
                        document.getElementById('customer-date-input').valueAsDate = new Date();
                        document.getElementById('customer-modal').removeAttribute('data-quick-add');
                        
                        loadCustomers();
                        loadCustomerProfiles();
                    })
                    .catch(error => {
                        alert('Error adding family member: ' + error.message);
                    })
                    .finally(() => {
                        hideLoading();
                    });
            }
        }
    }
}

function deleteCustomer(customerId) {
    if (!confirm('Are you sure you want to whack this family member?')) return;
    
    showLoading();
    database.ref('customers/' + customerId).remove()
        .then(() => {
            hideLoading();
        })
        .catch(error => {
            hideLoading();
            alert('Error deleting family member');
        });
}

function openAddPointsModal(customerId, customerEmail) {
    document.getElementById('points-customer-id').value = customerId;
    document.getElementById('points-customer-email').value = customerEmail;
    document.getElementById('points-modal').style.display = 'flex';
    document.getElementById('points-amount').focus();
}

function handlePointsSubmit(e) {
    e.preventDefault();
    
    const customerId = document.getElementById('points-customer-id').value;
    const customerEmail = document.getElementById('points-customer-email').value;
    const pointsToAdd = parseInt(document.getElementById('points-amount').value);
    const reason = document.getElementById('points-reason').value.trim();
    
    if (!customerId || isNaN(pointsToAdd) || pointsToAdd <= 0) {
        alert('Please enter a valid respect amount');
        return;
    }
    
    showLoading();
    
    const timestamp = Date.now();
    const pointsData = {
        customerId: customerId,
        customerEmail: customerEmail,
        pointsAdded: pointsToAdd,
        reason: reason || 'No reason provided',
        addedBy: auth.currentUser.email || 'Don',
        timestamp: timestamp
    };
    
    database.ref('pointsHistory/' + timestamp).set(pointsData)
        .then(() => {
            document.getElementById('points-modal').style.display = 'none';
            document.getElementById('points-form').reset();
            alert(`Successfully granted ${pointsToAdd} respect`);
            
            loadCustomerProfiles();
        })
        .catch(error => {
            alert('Error granting respect: ' + error.message);
        })
        .finally(() => {
            hideLoading();
        });
}

function openRedeemModal(customerId, customerEmail) {
    document.getElementById('redeem-customer-id').value = customerId;
    document.getElementById('redeem-customer-email').value = customerEmail;
    
    calculateCustomerActualBalance(customerEmail)
        .then(currentBalance => {
            document.getElementById('points-balance-display').textContent = currentBalance;
            document.getElementById('redeem-amount').max = currentBalance;
            document.getElementById('redeem-modal').style.display = 'flex';
            document.getElementById('redeem-amount').focus();
        })
        .catch(error => {
            alert('Error calculating respect balance');
        });
}

function handleRedeemSubmit(e) {
    e.preventDefault();
    
    const customerId = document.getElementById('redeem-customer-id').value;
    const customerEmail = document.getElementById('redeem-customer-email').value;
    const pointsToRedeem = parseInt(document.getElementById('redeem-amount').value);
    const reason = document.getElementById('redeem-reason').value.trim();
    
    if (!customerId || isNaN(pointsToRedeem) || pointsToRedeem <= 0 || !reason) {
        alert('Please fill all fields correctly');
        return;
    }
    
    showLoading();
    
    calculateCustomerActualBalance(customerEmail)
        .then(currentBalance => {
            if (pointsToRedeem > currentBalance) {
                throw new Error('Not enough respect points');
            }
            
            const redemptionData = {
                customerId: customerId,
                customerEmail: customerEmail,
                pointsUsed: pointsToRedeem,
                reward: reason,
                redeemedBy: auth.currentUser.email || 'Don',
                timestamp: firebase.database.ServerValue.TIMESTAMP
            };
            
            return database.ref('redemptions/' + Date.now()).set(redemptionData);
        })
        .then(() => {
            document.getElementById('redeem-modal').style.display = 'none';
            document.getElementById('redeem-form').reset();
            alert(`Successfully spent ${pointsToRedeem} respect for: ${reason}`);
            loadCustomerProfiles();
        })
        .catch(error => {
            alert('Error spending respect: ' + error.message);
        })
        .finally(() => {
            hideLoading();
        });
}

function openHistoryModal(customerId, customerEmail) {
    const customer = allCustomerProfiles.find(c => c.id === customerId);
    if (!customer) {
        alert('Family member not found');
        return;
    }
    
    currentHistoryCustomerId = customerId;
    
    document.getElementById('history-title').textContent = `History: ${customer.name}`;
    document.getElementById('history-customer-name').textContent = customer.name;
    document.getElementById('history-customer-phone').textContent = customer.phone;
    document.getElementById('history-customer-email').textContent = customer.email;
    
    document.getElementById('history-modal').style.display = 'flex';
    
    loadCustomerHistory(customerId, customer.email);
}

function loadCustomerHistory(customerId, customerEmail) {
    let totalVisits = 0;
    let totalOrders = 0;
    let totalPointsEarnedFromClothes = 0;
    let totalPointsEarnedFromManual = 0;
    let totalPointsRedeemed = 0;
    
    const pointsHistoryList = document.getElementById('admin-points-history-list');
    const orderHistoryList = document.getElementById('order-history-list');
    const redemptionHistoryList = document.getElementById('redemption-history-list');
    
    // Load orders history
    database.ref('customers').orderByChild('email').equalTo(customerEmail).once('value')
        .then(ordersSnapshot => {
            orderHistoryList.innerHTML = '';
            
            if (!ordersSnapshot.exists()) {
                orderHistoryList.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">No operation history found.</div>';
            } else {
                let orders = [];
                ordersSnapshot.forEach(orderSnapshot => {
                    const order = orderSnapshot.val();
                    order.id = orderSnapshot.key;
                    orders.push(order);
                    
                    totalOrders++;
                    totalVisits++;
                    totalPointsEarnedFromClothes += parseInt(order.points) || 0;
                });
                
                document.getElementById('order-count').textContent = `${totalOrders} operations`;
                
                orders.sort((a, b) => {
                    const dateA = a.date || a.createdAt || 0;
                    const dateB = b.date || b.createdAt || 0;
                    return new Date(dateB) - new Date(dateA);
                });
                
                orders.forEach(order => {
                    const orderDate = order.date ? new Date(order.date).toLocaleDateString() : 
                                   (order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'N/A');
                    
                    const historyItem = document.createElement('div');
                    historyItem.className = 'history-item';
                    historyItem.innerHTML = `
                        <div class="history-date">${orderDate}</div>
                        <div class="history-action">Operation: ${order.items || 'N/A'}</div>
                        <div class="history-details">
                            Status: ${getStatusText(order)} | 
                            Respect Points: ${order.points || 0}
                        </div>
                    `;
                    orderHistoryList.appendChild(historyItem);
                });
            }
        })
        .catch(error => {
            document.getElementById('order-history-list').innerHTML = '<div style="padding: 20px; text-align: center; color: #ff6b6b;">Error loading operation history</div>';
        });

    // Load points history
    database.ref('pointsHistory').once('value')
        .then(pointsHistorySnapshot => {
            pointsHistoryList.innerHTML = '';
            
            if (!pointsHistorySnapshot.exists()) {
                pointsHistoryList.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">No respect history found.</div>';
                return;
            }
            
            let pointsHistory = [];
            let customerPointsFound = 0;
            
            pointsHistorySnapshot.forEach(pointSnapshot => {
                const point = pointSnapshot.val();
                const pointKey = pointSnapshot.key;
                
                const matchesCustomer = 
                    (point.customerEmail && point.customerEmail === customerEmail) || 
                    (point.email && point.email === customerEmail);
                
                if (matchesCustomer) {
                    pointsHistory.push({
                        ...point,
                        id: pointKey
                    });
                    customerPointsFound++;
                    totalPointsEarnedFromManual += parseInt(point.pointsAdded) || 0;
                }
            });
            
            document.getElementById('admin-points-count').textContent = `${customerPointsFound} events`;
            
            if (customerPointsFound === 0) {
                pointsHistoryList.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">No respect history found for this member.</div>';
                return;
            }
            
            pointsHistory.sort((a, b) => {
                const timeA = a.timestamp || a.id || 0;
                const timeB = b.timestamp || b.id || 0;
                return timeB - timeA;
            });
            
            pointsHistory.forEach(point => {
                const pointDate = point.timestamp ? 
                    new Date(point.timestamp).toLocaleDateString() : 'Date not available';
                
                const points = point.pointsAdded || 0;
                const reason = point.reason || 'No reason provided';
                const addedBy = point.addedBy || 'Don';
                
                const historyItem = document.createElement('div');
                historyItem.className = 'history-item';
                historyItem.innerHTML = `
                    <div class="history-date">${pointDate}</div>
                    <div class="history-action">
                        <span class="points-added">+${points} respect</span>
                    </div>
                    <div class="history-details">
                        Reason: ${reason} | Granted by: ${addedBy}
                    </div>
                `;
                pointsHistoryList.appendChild(historyItem);
            });
        })
        .catch(error => {
            pointsHistoryList.innerHTML = '<div style="padding: 20px; text-align: center; color: #ff6b6b;">Error loading respect history</div>';
        });

    // Load redemption history
    database.ref('redemptions').orderByChild('customerEmail').equalTo(customerEmail).once('value')
        .then(redemptionsSnapshot => {
            redemptionHistoryList.innerHTML = '';
            
            if (!redemptionsSnapshot.exists()) {
                redemptionHistoryList.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">No spending history found.</div>';
            } else {
                let redemptions = [];
                redemptionsSnapshot.forEach(redemptionSnapshot => {
                    const redemption = redemptionSnapshot.val();
                    redemption.id = redemptionSnapshot.key;
                    redemptions.push(redemption);
                    
                    totalPointsRedeemed += parseInt(redemption.pointsUsed) || 0;
                });
                
                document.getElementById('redemption-count').textContent = `${redemptions.length} spendings`;
                
                redemptions.sort((a, b) => b.timestamp - a.timestamp);
                
                redemptions.forEach(redemption => {
                    const redemptionDate = redemption.timestamp ? new Date(redemption.timestamp).toLocaleDateString() : 'N/A';
                    
                    const historyItem = document.createElement('div');
                    historyItem.className = 'history-item';
                    historyItem.innerHTML = `
                        <div class="history-date">${redemptionDate}</div>
                        <div class="history-action">
                            <span class="points-redeemed">-${redemption.pointsUsed || 0} respect</span>
                        </div>
                        <div class="history-details">
                            Reward: ${redemption.reward || 'N/A'} | 
                            Spent with: ${redemption.redeemedBy || 'Don'}
                        </div>
                    `;
                    redemptionHistoryList.appendChild(historyItem);
                });
            }
            
            const totalPointsEarned = totalPointsEarnedFromClothes + totalPointsEarnedFromManual;
            const pointsBalance = totalPointsEarned - totalPointsRedeemed;
            
            document.getElementById('total-visits').textContent = totalVisits;
            document.getElementById('total-orders').textContent = totalOrders;
            document.getElementById('total-points-earned').textContent = totalPointsEarned;
            document.getElementById('total-points-redeemed').textContent = totalPointsRedeemed;
            
            document.getElementById('history-customer-points-earned').textContent = totalPointsEarned;
            document.getElementById('history-customer-points-balance').textContent = pointsBalance;
        })
        .catch(error => {
            document.getElementById('redemption-history-list').innerHTML = '<div style="padding: 20px; text-align: center; color: #ff6b6b;">Error loading spending history</div>';
        });
}

function getStatusText(order) {
    if (order.collected) return 'Completed';
    if (order.ready) return 'Ready for pickup';
    return 'In progress';
}

function filterCustomers() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase().trim();
    
    if (!searchTerm) {
        renderCustomers(allCustomers);
        return;
    }
    
    const filtered = allCustomers.filter(customer => {
        const nameMatch = customer.name && customer.name.toLowerCase().includes(searchTerm);
        const emailMatch = customer.email && customer.email.toLowerCase().includes(searchTerm);
        const itemsMatch = customer.items && customer.items.toLowerCase().includes(searchTerm);
        const statusMatch = formatStatus(customer).toLowerCase().includes(searchTerm);
        const pointsMatch = customer.points && customer.points.toString().includes(searchTerm);
        const phoneMatch = customer.phoneFromUser && customer.phoneFromUser.toLowerCase().includes(searchTerm);
        
        return nameMatch || emailMatch || itemsMatch || statusMatch || pointsMatch || phoneMatch;
    });
    
    renderCustomers(filtered);
}

function filterCustomerProfiles() {
    const searchTerm = document.getElementById('customer-search-input').value.toLowerCase().trim();
    
    if (!searchTerm) {
        renderCustomerProfiles(allCustomerProfiles);
        return;
    }
    
    const filtered = allCustomerProfiles.filter(customer => {
        const nameMatch = customer.name && customer.name.toLowerCase().includes(searchTerm);
        const phoneMatch = customer.phone && customer.phone.toLowerCase().includes(searchTerm);
        const emailMatch = customer.email && customer.email.toLowerCase().includes(searchTerm);
        
        return nameMatch || phoneMatch || emailMatch;
    });
    
    renderCustomerProfiles(filtered);
}

function setupEventListeners() {
    document.getElementById('add-customer-btn').addEventListener('click', openAddCustomerModal);
    document.getElementById('close-modal').addEventListener('click', () => {
        document.getElementById('customer-modal').style.display = 'none';
    });
    document.getElementById('close-points-modal').addEventListener('click', () => {
        document.getElementById('points-modal').style.display = 'none';
    });
    document.getElementById('close-redeem-modal').addEventListener('click', () => {
        document.getElementById('redeem-modal').style.display = 'none';
    });
    document.getElementById('close-history-modal').addEventListener('click', () => {
        document.getElementById('history-modal').style.display = 'none';
    });
    
    document.getElementById('mobile-back-btn').addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.querySelector('.tab[data-tab="orders"]').classList.add('active');
        document.getElementById('orders-tab').classList.add('active');
    });
    
    document.getElementById('customer-form').addEventListener('submit', handleFormSubmit);
    document.getElementById('points-form').addEventListener('submit', handlePointsSubmit);
    document.getElementById('redeem-form').addEventListener('submit', handleRedeemSubmit);
    
    document.getElementById('search-input').addEventListener('input', filterCustomers);
    document.getElementById('clear-search-btn').addEventListener('click', () => {
        document.getElementById('search-input').value = '';
        filterCustomers();
    });
    document.getElementById('customer-search-input').addEventListener('input', filterCustomerProfiles);
    document.getElementById('clear-customer-search-btn').addEventListener('click', () => {
        document.getElementById('customer-search-input').value = '';
        filterCustomerProfiles();
    });
    
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.getAttribute('data-tab');
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            document.getElementById(`${tabName}-tab`).classList.add('active');
        });
    });
    
    window.addEventListener('click', (e) => {
        if (e.target === document.getElementById('customer-modal')) {
            document.getElementById('customer-modal').style.display = 'none';
        }
        if (e.target === document.getElementById('points-modal')) {
            document.getElementById('points-modal').style.display = 'none';
        }
        if (e.target === document.getElementById('redeem-modal')) {
            document.getElementById('redeem-modal').style.display = 'none';
        }
        if (e.target === document.getElementById('history-modal')) {
            document.getElementById('history-modal').style.display = 'none';
        }
    });
}

function showLoading() {
    document.getElementById('loading-indicator').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loading-indicator').style.display = 'none';
}

auth.onAuthStateChanged((user) => {
    if (user) {
        database.ref('users/' + user.uid).once('value')
            .then((snapshot) => {
                const userData = snapshot.val();
                if (userData && userData.role === 'admin') {
                    showAdminLanding();
                    initAdminDashboard();
                } else {
                    showCustomerLanding();
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
    setupEventListeners();
};