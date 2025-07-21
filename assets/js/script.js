// Firebase Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, setDoc, serverTimestamp, query } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// --- CONFIG & INITIALIZATION ---
// This part checks for special variables provided by the environment, with fallbacks.
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : { apiKey: "your-fallback-key", authDomain: "", projectId: "" };
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-grocery-mvp';

// Initialize Firebase services
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- COLLECTIONS ---
// Define paths to your data collections in Firestore
const productsCol = collection(db, `artifacts/${appId}/public/data/products`);
const ordersCol = collection(db, `artifacts/${appId}/public/data/orders`);

// --- STATE MANAGEMENT ---
// These variables hold the application's data and state
let products = [];
let cart = {}; // Example: { productId: { name, price, image, quantity } }
let currentView = 'products-view';
let authReady = false;
let userId = null;
let initialFetchesDone = false;

// --- DOM ELEMENTS ---
// Get references to elements on the page we need to interact with
const productListEl = document.getElementById('product-list');
const productsLoadingEl = document.getElementById('products-loading');
const cartBtn = document.getElementById('cart-btn');
const cartItemCountEl = document.getElementById('cart-item-count');

const views = {
    'products-view': document.getElementById('products-view'),
    'cart-view': document.getElementById('cart-view'),
    'checkout-view': document.getElementById('checkout-view'),
    'confirmation-view': document.getElementById('confirmation-view'),
    'admin-view': document.getElementById('admin-view'),
};

// --- AUTHENTICATION ---
// This function runs whenever the user's login state changes
onAuthStateChanged(auth, (user) => {
    if (user) {
        userId = user.uid;
        authReady = true;
        console.log("Authenticated user:", userId);
        // Ensure initial data is fetched only once after authentication is ready
        if (!initialFetchesDone) {
            fetchProducts();
            fetchOrders();
            initialFetchesDone = true;
        }
    }
});

// This immediately-invoked function handles the initial sign-in process
(async () => {
    try {
        if (!auth.currentUser) {
            // Use a special token if provided, otherwise sign in anonymously
            const token = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
            if (token) {
                await signInWithCustomToken(auth, token);
            } else {
                await signInAnonymously(auth);
            }
        }
    } catch (error) {
        console.error("Authentication failed:", error);
        // Display a user-friendly error message if authentication fails
        document.getElementById('app').innerHTML = `<div class="text-center p-8 text-red-600 bg-red-50 rounded-lg">
            <h2 class="text-2xl font-bold">Application Error</h2>
            <p>Could not authenticate with the service. Please refresh the page.</p>
            <p class="text-sm mt-2 font-mono">${error.message}</p>
        </div>`;
    }
})();

// --- VIEW MANAGEMENT ---
// Function to switch between different views (pages) of the application
function switchView(viewName) {
    Object.values(views).forEach(view => view.classList.add('hidden'));
    if (views[viewName]) {
        views[viewName].classList.remove('hidden');
        currentView = viewName;
    }
    window.scrollTo(0, 0); // Scroll to the top on view change
}

// --- RENDERING FUNCTIONS ---
// These functions take data and build the HTML to display it

function renderProducts() {
    if (!authReady) return; // Don't run if not authenticated
    productsLoadingEl.classList.add('hidden');
    productListEl.innerHTML = '';
    if (products.length === 0) {
         productListEl.innerHTML = `<p class="col-span-full text-center text-gray-500">No products have been added yet. Visit the Admin panel to add some.</p>`;
         return;
    }

    products.forEach(product => {
        const card = document.createElement('div');
        card.className = 'bg-white rounded-lg shadow-md overflow-hidden transform hover:-translate-y-1 transition-transform duration-300';
        card.innerHTML = `
            <img src="${product.image}" alt="${product.name}" class="w-full h-48 object-cover" onerror="this.onerror=null;this.src='https://placehold.co/400x300/e2e8f0/64748b?text=Image+Not+Found';">
            <div class="p-4">
                <h3 class="text-lg font-semibold text-gray-800">${product.name}</h3>
                <p class="text-sm text-gray-500 mt-1 h-10">${product.description}</p>
                <div class="flex justify-between items-center mt-4">
                    <span class="text-xl font-bold text-gray-900">$${product.price.toFixed(2)}</span>
                    <button data-product-id="${product.id}" class="add-to-cart-btn bg-green-100 text-green-800 font-semibold py-2 px-4 rounded-lg hover:bg-green-200 transition-colors duration-300 flex items-center">
                        <i data-lucide="plus" class="w-4 h-4 mr-1"></i> Add
                    </button>
                </div>
            </div>
        `;
        productListEl.appendChild(card);
    });
    lucide.createIcons(); // Redraw icons
}

function renderCart() {
    const cartItemsContainer = document.getElementById('cart-items-container');
    const cartEmptyEl = document.getElementById('cart-empty');
    const cartItemIds = Object.keys(cart);

    if (cartItemIds.length === 0) {
        cartItemsContainer.innerHTML = '';
        cartItemsContainer.classList.add('hidden');
        cartEmptyEl.classList.remove('hidden');
        return;
    }
    
    cartItemsContainer.classList.remove('hidden');
    cartEmptyEl.classList.add('hidden');

    let cartTotal = 0;
    let itemsHtml = cartItemIds.map(id => {
        const item = cart[id];
        const itemTotal = item.price * item.quantity;
        cartTotal += itemTotal;
        return `
            <div class="flex items-center justify-between py-4 border-b last:border-b-0">
                <div class="flex items-center">
                    <img src="${item.image}" alt="${item.name}" class="w-16 h-16 object-cover rounded-md mr-4" onerror="this.onerror=null;this.src='https://placehold.co/100x100/e2e8f0/64748b?text=N/A';">
                    <div>
                        <h4 class="font-medium text-gray-800">${item.name}</h4>
                        <p class="text-sm text-gray-500">$${item.price.toFixed(2)}</p>
                    </div>
                </div>
                <div class="flex items-center space-x-4">
                    <div class="flex items-center border rounded-md">
                        <button data-product-id="${id}" class="cart-quantity-change p-1 text-gray-600 hover:bg-gray-100" data-change="-1">-</button>
                        <span class="px-3 text-sm">${item.quantity}</span>
                        <button data-product-id="${id}" class="cart-quantity-change p-1 text-gray-600 hover:bg-gray-100" data-change="1">+</button>
                    </div>
                    <span class="font-semibold w-20 text-right">$${itemTotal.toFixed(2)}</span>
                    <button data-product-id="${id}" class="remove-from-cart-btn text-red-500 hover:text-red-700">
                        <i data-lucide="trash-2" class="w-5 h-5"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    cartItemsContainer.innerHTML = `
        ${itemsHtml}
        <div class="pt-6 text-right">
            <p class="text-lg font-semibold">Total: <span class="text-2xl text-gray-900">$${cartTotal.toFixed(2)}</span></p>
            <button id="checkout-btn" class="mt-4 w-full sm:w-auto bg-green-600 text-white py-2 px-8 border border-transparent rounded-md shadow-sm text-sm font-medium hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500">
                Proceed to Checkout
            </button>
        </div>
    `;
    lucide.createIcons();
}

function renderOrderSummary() {
    const orderSummaryEl = document.getElementById('order-summary');
    const cartItemIds = Object.keys(cart);
    if(cartItemIds.length === 0) {
        switchView('products-view'); // Redirect if cart is empty
        return;
    }

    let cartTotal = 0;
    const itemsHtml = cartItemIds.map(id => {
        const item = cart[id];
        const itemTotal = item.price * item.quantity;
        cartTotal += itemTotal;
        return `
            <div class="flex justify-between items-center py-2 text-sm">
                <p class="text-gray-600">${item.name} <span class="text-gray-400">x ${item.quantity}</span></p>
                <p class="font-medium text-gray-800">$${itemTotal.toFixed(2)}</p>
            </div>
        `;
    }).join('');

    orderSummaryEl.innerHTML = `
        <h3 class="text-lg font-medium mb-4">Order Summary</h3>
        <div class="space-y-2 border-b pb-4">${itemsHtml}</div>
        <div class="flex justify-between items-center font-semibold pt-4 text-lg">
            <p>Total</p>
            <p>$${cartTotal.toFixed(2)}</p>
        </div>
         <button id="place-order-btn" type="submit" form="checkout-form" class="mt-6 w-full bg-green-600 text-white py-2 px-4 border border-transparent rounded-md shadow-sm text-base font-medium hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500">
            Place Order
        </button>
    `;
}

function renderOrders(orders) {
    const ordersListEl = document.getElementById('orders-list');
    const ordersLoadingEl = document.getElementById('orders-loading');
    const noOrdersMessageEl = document.getElementById('no-orders-message');

    ordersLoadingEl.classList.add('hidden');
    
    if (orders.length === 0) {
        noOrdersMessageEl.classList.remove('hidden');
        ordersListEl.innerHTML = '';
        ordersListEl.appendChild(noOrdersMessageEl);
        return;
    }
    
    noOrdersMessageEl.classList.add('hidden');
    ordersListEl.innerHTML = '';

    orders.forEach(order => {
        const orderCard = document.createElement('div');
        orderCard.className = 'border rounded-lg p-4';
        const orderDate = order.timestamp?.toDate ? order.timestamp.toDate().toLocaleString() : 'Just now';
        const total = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        
        const itemsHtml = order.items.map(item => `
            <li class="flex justify-between text-sm">
                <span class="text-gray-600">${item.name} (x${item.quantity})</span>
                <span class="text-gray-800">$${(item.price * item.quantity).toFixed(2)}</span>
            </li>
        `).join('');

        orderCard.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <p class="font-semibold">${order.customer.name}</p>
                    <p class="text-sm text-gray-500">${order.customer.address}</p>
                    <p class="text-sm text-gray-500">${order.customer.phone}</p>
                    <p class="text-xs text-gray-400 mt-1">Order ID: ${order.id}</p>
                </div>
                <div class="text-right">
                    <p class="font-bold text-lg text-green-600">$${total.toFixed(2)}</p>
                    <p class="text-xs text-gray-500">${orderDate}</p>
                </div>
            </div>
            <div class="mt-4 border-t pt-2">
                <h5 class="text-sm font-medium mb-2">Items:</h5>
                <ul class="space-y-1">${itemsHtml}</ul>
            </div>
        `;
        ordersListEl.appendChild(orderCard);
    });
}

function updateCartCount() {
    const count = Object.values(cart).reduce((sum, item) => sum + item.quantity, 0);
    if (count > 0) {
        cartItemCountEl.textContent = count;
        cartItemCountEl.classList.remove('hidden');
    } else {
        cartItemCountEl.classList.add('hidden');
    }
}


// --- DATA FETCHING & MANIPULATION ---
// Functions to get data from and send data to Firestore

function fetchProducts() {
    if (!authReady) return;
    onSnapshot(productsCol, (snapshot) => {
        products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderProducts();
    }, (error) => {
        console.error("Error fetching products:", error);
        productsLoadingEl.innerHTML = `<p class="col-span-full text-center text-red-500">Could not load products.</p>`;
    });
}

function fetchOrders() {
    if (!authReady) return;
    // We query without ordering to avoid needing a composite index in Firestore
    const q = query(ordersCol);
    onSnapshot(q, (snapshot) => {
        const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Sort the orders here in the browser (newest first)
        orders.sort((a, b) => {
            const timeA = a.timestamp?.toMillis() || 0;
            const timeB = b.timestamp?.toMillis() || 0;
            return timeB - timeA;
        });
        renderOrders(orders);
    }, (error) => {
        console.error("Error fetching orders:", error);
         document.getElementById('orders-loading').innerHTML = `<p class="text-center text-red-500">Could not load orders.</p>`;
    });
}

async function handleAddProduct(e) {
    e.preventDefault();
    const form = e.target;
    const newProduct = {
        name: form['product-name'].value,
        price: parseFloat(form['product-price'].value),
        image: form['product-image'].value,
        description: form['product-description'].value,
    };

    try {
        await addDoc(productsCol, newProduct);
        form.reset();
    } catch (error) {
        console.error("Error adding product: ", error);
        alert("Failed to add product. Please try again.");
    }
}

function handleAddToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    if (cart[productId]) {
        cart[productId].quantity++;
    } else {
        cart[productId] = {
            name: product.name,
            price: product.price,
            image: product.image,
            quantity: 1
        };
    }
    updateCartCount();
}

function handleCartQuantityChange(productId, change) {
    if (cart[productId]) {
        cart[productId].quantity += change;
        if (cart[productId].quantity <= 0) {
            delete cart[productId];
        }
    }
    renderCart();
    updateCartCount();
}

function handleRemoveFromCart(productId) {
    if(cart[productId]) {
        delete cart[productId];
    }
    renderCart();
    updateCartCount();
}

async function handlePlaceOrder(e) {
    e.preventDefault();
    if (Object.keys(cart).length === 0) {
        alert("Your cart is empty!");
        return;
    }

    const customerInfo = {
        name: document.getElementById('customer-name').value,
        address: document.getElementById('customer-address').value,
        phone: document.getElementById('customer-phone').value,
    };

    const orderData = {
        customer: customerInfo,
        items: Object.values(cart),
        status: 'Placed',
        paymentMethod: 'Cash on Delivery',
        timestamp: serverTimestamp()
    };

    try {
        const docRef = await addDoc(ordersCol, orderData);
        document.getElementById('order-id-span').textContent = docRef.id;
        cart = {};
        updateCartCount();
        document.getElementById('checkout-form').reset();
        switchView('confirmation-view');
    } catch (error) {
        console.error("Error placing order: ", error);
        alert("Could not place order. Please try again.");
    }
}


// --- EVENT LISTENERS ---
// This section connects user actions (like clicks) to the functions above

// Navigation
document.getElementById('cart-btn').addEventListener('click', () => {
    switchView('cart-view');
    renderCart();
});
document.getElementById('admin-view-btn').addEventListener('click', () => switchView('admin-view'));
document.getElementById('back-to-products-btn').addEventListener('click', () => switchView('products-view'));
document.getElementById('back-to-shop-btn').addEventListener('click', () => switchView('products-view'));
document.getElementById('back-to-cart-btn').addEventListener('click', () => {
    switchView('cart-view');
    renderCart();
});
document.getElementById('new-order-btn').addEventListener('click', () => switchView('products-view'));

// Product & Cart Actions
productListEl.addEventListener('click', (e) => {
    const button = e.target.closest('.add-to-cart-btn');
    if (button) {
        handleAddToCart(button.dataset.productId);
    }
});

document.getElementById('cart-view').addEventListener('click', (e) => {
    if (e.target.closest('#checkout-btn')) {
        switchView('checkout-view');
        renderOrderSummary();
    }
    const quantityBtn = e.target.closest('.cart-quantity-change');
    if(quantityBtn) {
        handleCartQuantityChange(quantityBtn.dataset.productId, parseInt(quantityBtn.dataset.change));
    }
    const removeBtn = e.target.closest('.remove-from-cart-btn');
    if(removeBtn) {
        handleRemoveFromCart(removeBtn.dataset.productId);
    }
});

// Forms
document.getElementById('add-product-form').addEventListener('submit', handleAddProduct);
document.getElementById('checkout-form').addEventListener('submit', handlePlaceOrder);

// --- INITIAL LOAD ---
// Functions that run once when the page first loads
lucide.createIcons();
switchView('products-view');
