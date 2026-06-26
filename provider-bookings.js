import { supabase } from "./supabase.js";
import { updateProfilePictureInHeader } from './auth.js';

function normalizeProfile(profile) {
    if (!profile) return null;
    return Array.isArray(profile) ? profile[0] : profile;
}

const MAPTILER_KEY = window.MAPTILER_API_KEY || '';
const MAPTILER_STYLE_URL = MAPTILER_KEY
    ? `https://api.maptiler.com/maps/streets/style.json?key=${MAPTILER_KEY}`
    : '';

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatRouteDistance(distanceMeters) {
    return distanceMeters ? `${(distanceMeters / 1000).toFixed(1)} km` : 'Unknown distance';
}

function formatRouteDuration(durationSeconds) {
    return durationSeconds ? `${Math.round(durationSeconds / 60)} min` : 'Unknown ETA';
}

let activeMapWatchers = new Map();

async function watchUserLocation(mapContainer, callback) {
    if (!navigator.geolocation) {
        console.warn('Geolocation not available');
        return null;
    }

    const watchId = navigator.geolocation.watchPosition(
        (position) => {
            const coords = [
                Number(position.coords.longitude),
                Number(position.coords.latitude)
            ];
            callback(coords);
        },
        (error) => {
            console.error('Geolocation error:', error);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );

    activeMapWatchers.set(mapContainer, watchId);
    return watchId;
}

function stopWatchingLocation(mapContainer) {
    const watchId = activeMapWatchers.get(mapContainer);
    if (watchId !== undefined) {
        navigator.geolocation.clearWatch(watchId);
        activeMapWatchers.delete(mapContainer);
    }
}

async function geocodeAddress(address) {
    if (!MAPTILER_KEY || !address) {
        return null;
    }

    try {
        const response = await fetch(
            `https://api.maptiler.com/geocoding/${encodeURIComponent(address)}.json?key=${MAPTILER_KEY}&limit=1`
        );
        const data = await response.json();

        if (!data?.features?.length) {
            return null;
        }

        return data.features[0].geometry.coordinates;
    } catch (error) {
        console.error('MapTiler geocoding failed:', error);
        return null;
    }
}

async function getDirections(origin, destination) {
    if (!MAPTILER_KEY || !origin || !destination) {
        return null;
    }

    try {
        const response = await fetch(
            `https://api.maptiler.com/directions/driving/car.json?key=${MAPTILER_KEY}&start=${origin[0]},${origin[1]}&end=${destination[0]},${destination[1]}&geometries=geojson&overview=full`
        );
        const data = await response.json();

        if (!data?.routes?.length) {
            return null;
        }

        return data.routes[0];
    } catch (error) {
        console.error('MapTiler directions failed:', error);
        return null;
    }
}

function buildGoogleMapsUrl(origin, destination) {
    if (!destination) return 'https://www.google.com/maps';

    const originParam = Array.isArray(origin)
        ? `${origin[1]},${origin[0]}`
        : encodeURIComponent(origin || '');
    const destinationParam = Array.isArray(destination)
        ? `${destination[1]},${destination[0]}`
        : encodeURIComponent(destination);

    if (originParam && destinationParam) {
        return `https://www.google.com/maps/dir/?api=1&origin=${originParam}&destination=${destinationParam}&travelmode=driving`;
    }

    return `https://www.google.com/maps/search/?api=1&query=${destinationParam}`;
}

function removeRouteModal() {
    const existing = document.getElementById('customerRouteModal');
    if (existing) existing.remove();
}

function renderRouteSummary(distanceMeters, durationSeconds) {
    const existing = document.getElementById('routeSummary');
    if (existing) existing.remove();

    const mapElement = document.getElementById('customerRouteMap');
    if (!mapElement) return;

    const summary = document.createElement('div');
    summary.id = 'routeSummary';
    summary.className = 'absolute top-4 left-4 right-4 bg-white/95 border border-gray-200 rounded-3xl p-4 shadow-lg backdrop-blur-sm text-sm text-gray-800';
    summary.innerHTML = `
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="font-semibold text-gray-900">Route to customer</p>
            <p class="text-xs text-gray-600">${formatRouteDistance(distanceMeters)} · ${formatRouteDuration(durationSeconds)}</p>
          </div>
          <div class="inline-flex items-center rounded-full bg-blue-600 text-white px-3 py-1 text-xs font-semibold">Live route</div>
        </div>
    `;
    mapElement.appendChild(summary);
}

async function renderCustomerRouteMap(customerLocation, providerLocation) {
    const mapElement = document.getElementById('customerRouteMap');
    if (!mapElement) return;

    if (!MAPTILER_KEY) {
        mapElement.innerHTML = '<div class="h-full flex items-center justify-center text-gray-600">MapTiler API key not set.</div>';
        return;
    }

    mapElement.innerHTML = '<div class="h-full flex items-center justify-center text-gray-600">Loading map...</div>';

    const destination = await geocodeAddress(customerLocation);
    if (!destination) {
        mapElement.innerHTML = '<div class="h-full flex items-center justify-center text-red-600">Unable to locate customer address.</div>';
        return;
    }

    mapElement.innerHTML = '';

    try {
        let userMarker = null;
        let userLocation = null;

        const map = new maplibregl.Map({
            container: mapElement,
            style: MAPTILER_STYLE_URL,
            center: destination,
            zoom: 14,
        });

        map.on('load', () => {
            new maplibregl.Marker({ color: '#10b981' })
                .setLngLat(destination)
                .setPopup(new maplibregl.Popup({ offset: 25 }).setText('Customer location'))
                .addTo(map);

            watchUserLocation(mapElement, (coords) => {
                userLocation = coords;
                
                if (!userMarker) {
                    userMarker = new maplibregl.Marker({ color: '#ef4444', scale: 1.2 })
                        .setLngLat(coords)
                        .setPopup(new maplibregl.Popup({ offset: 25 }).setText('Your current location'))
                        .addTo(map);
                } else {
                    userMarker.setLngLat(coords);
                }

                const bounds = new maplibregl.LngLatBounds(destination, coords);
                map.fitBounds(bounds, { padding: 80 });
            });

            const navBtn = document.getElementById('googleMapsNavBtn');
            if (navBtn) {
                navBtn.href = buildGoogleMapsUrl(userLocation || providerLocation, destination);
                navBtn.classList.remove('opacity-50', 'pointer-events-none');
            }
        });
    } catch (error) {
        console.error('Map initialization failed:', error);
        mapElement.innerHTML = '<div class="h-full flex items-center justify-center text-red-600">Failed to initialize the map.</div>';
    }
}

async function openLocateCustomerModal(customerLocation, providerLocation) {
    removeRouteModal();

    const modal = document.createElement('div');
    modal.id = 'customerRouteModal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-3xl overflow-hidden shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
            <div class="flex items-center justify-between p-4 border-b">
                <div>
                    <h2 class="text-xl font-bold">Locate Customer</h2>
                    <p class="text-sm text-gray-500">Route from your position to the customer address.</p>
                </div>
                <button id="closeRouteModal" class="text-3xl leading-none text-gray-600">&times;</button>
            </div>
            <div id="customerRouteMap" class="h-[60vh] relative"></div>
            <div class="p-4 flex justify-between gap-3 bg-gray-50">
                <a id="googleMapsNavBtn" target="_blank" rel="noopener noreferrer" class="opacity-50 pointer-events-none bg-green-600 text-white px-5 py-3 rounded-lg font-semibold hover:bg-green-700 transition">
                    Open in Google Maps
                </a>
                <button id="closeRouteModalAction" class="px-4 py-2 rounded-lg bg-slate-600 text-white hover:bg-slate-700">Close</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('closeRouteModal').addEventListener('click', removeRouteModal);
    document.getElementById('closeRouteModalAction').addEventListener('click', removeRouteModal);

    await renderCustomerRouteMap(customerLocation, providerLocation);
}

function setupLocateButtons() {
    document.querySelectorAll('.locate-customer-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const customerLocation = btn.dataset.customerLocation;
            const providerLocation = btn.dataset.serviceLocation;
            await openLocateCustomerModal(customerLocation, providerLocation);
        });
    });
}

// ===============================
// ELEMENTS
// ===============================
const bookingsContainer = document.getElementById("bookingsContainer");
const logoutBtns = document.querySelectorAll("[data-logout], #logoutBtn");
let serviceReviewStats = {};

// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
    await updateProfilePictureInHeader();
    await checkAuth();
    setupLogout();
});

// ===============================
// CHECK AUTH
// ===============================
async function checkAuth() {
    try {
        const {
            data: { session },
            error
        } = await supabase.auth.getSession();

        if (error || !session) {
            window.location.href = "login.html";
            return;
        }

        const currentUser = session.user;

        await loadProviderBookings(currentUser.id);

    } catch (error) {
        console.error("Auth Error:", error);
        showError("Authentication failed.");
    }
}

// ===============================
// LOGOUT
// ===============================
function setupLogout() {
    logoutBtns.forEach((btn) => {
        btn.addEventListener("click", async () => {
            try {
                await supabase.auth.signOut();
                window.location.href = "index.html";
            } catch (error) {
                console.error("Logout Error:", error);
                alert("Failed to logout.");
            }
        });
    });
}

// ===============================
// LOAD BOOKINGS
// ===============================
async function loadProviderBookings(providerId) {

    bookingsContainer.innerHTML = `
        <div class="bg-white rounded-xl p-6 shadow text-center">
            <div class="animate-pulse text-lg font-semibold">
                Loading bookings...
            </div>
        </div>
    `;

    try {

        // ====================================
        // GET BOOKINGS
        // ====================================
        const { data: bookings, error } = await supabase
            .from("bookings")
            .select("*")
            .eq("provider_id", providerId)
            .order("created_at", { ascending: false });

        if (error) {
            throw error;
        }

        // ====================================
        // FETCH CUSTOMER PROFILES
        // ====================================
        let customerProfiles = {};
        if (bookings && bookings.length > 0) {
            const customerIds = [...new Set(bookings
                .map(b => b.user_id)
                .filter(Boolean)
            )];

            if (customerIds.length > 0) {
                const { data: profiles } = await supabase
                    .from("profiles")
                    .select("id, email, full_name, profile_picture")
                    .in("id", customerIds);

                if (profiles) {
                    profiles.forEach(profile => {
                        customerProfiles[profile.id] = profile;
                    });
                }
            }
        }

        // ====================================
        // EMPTY STATE
        // ====================================
        if (!bookings || bookings.length === 0) {

            bookingsContainer.innerHTML = `
                <div class="bg-white rounded-2xl p-10 shadow text-center">

                    <div class="text-6xl mb-4">
                        📭
                    </div>

                    <h2 class="text-2xl font-bold mb-2">
                        No bookings yet
                    </h2>

                    <p class="text-gray-500">
                        Customers have not booked your services yet.
                    </p>

                </div>
            `;

            return;
        }

        bookingsContainer.innerHTML = "";

        const providerServiceIds = [...new Set(bookings
            .map(b => b.service_id)
            .filter(Boolean)
        )];

        if (providerServiceIds.length) {
            const { data: reviews, error: reviewError } = await supabase
                .from('reviews')
                .select('service_id, rating')
                .in('service_id', providerServiceIds);

            if (!reviewError && reviews) {
                serviceReviewStats = reviews.reduce((map, review) => {
                    const id = review.service_id;
                    if (!map[id]) map[id] = { sum: 0, count: 0 };
                    map[id].sum += Number(review.rating || 0);
                    map[id].count += 1;
                    return map;
                }, {});

                Object.keys(serviceReviewStats).forEach(id => {
                    const stats = serviceReviewStats[id];
                    stats.avg = stats.count ? stats.sum / stats.count : 0;
                });
            }
        }

        // ====================================
        // LOOP BOOKINGS
        // ====================================
        for (const booking of bookings) {

            // ====================================
            // GET SERVICE
            // ====================================
            let service = null;

            if (booking.service_id) {

                const { data: serviceData } = await supabase
                    .from("services")
                    .select("*") 
                    .eq("id", booking.service_id)
                    .maybeSingle();

                service = serviceData; 
            }

            // ====================================
            // GET CUSTOMER PROFILE (from map)
            // ====================================
            let customer = customerProfiles[booking.user_id];

            // ====================================
            // GET CUSTOMER AUTH EMAIL
            // ====================================
            let customerEmail = customer?.email || "No email";

            let customerName = customer?.full_name || "Customer";

            let customerPicture = customer?.profile_picture || "https://ui-avatars.com/api/?name=User";

            // ====================================
            // VALUES 
            // ====================================
            const serviceTitle =
                service?.title || "Service";

            const serviceImage =
                service?.image_url ||
                "https://placehold.co/600x400?text=Vora";

            const category =
                service?.category || "General";

            const bookingDate =
                formatDate(booking.date || booking.scheduled_date);

            const servicePrice = Number(service?.price || 0);
            const groupThreshold = Number(service?.group_discount_threshold) || 0;
            const groupPercent = Number(service?.group_discount_percent) || 0;
            const hasGroupDeal = groupThreshold > 0 && groupPercent > 0;
            const peopleCount = Number(booking.number_of_people || 1);
            const meetsGroupDeal = hasGroupDeal && peopleCount >= groupThreshold;
            const discountedPerPerson = Number(booking.price_per_person || servicePrice || 0);
            const dealText = hasGroupDeal
                ? meetsGroupDeal
                    ? `Group deal applied: ${groupPercent}% off per person.`
                    : `Group deal available: Book ${groupThreshold}+ people to save ${groupPercent}% per person.`
                : '';

            const amount =
                formatMoney(booking.total_price || booking.amount || booking.price);

            const status =
                booking.status || booking.state || "pending";

            // ====================================
            // STATUS COLORS
            // ====================================
            let statusColor = "bg-yellow-100 text-yellow-700";

            if (status === "pending_payment") {
                statusColor = "bg-yellow-100 text-yellow-700";
            }

            if (status === "paid") {
                statusColor = "bg-blue-100 text-blue-700";
            }

            if (status === "accepted") {
                statusColor = "bg-green-100 text-green-700";
            }

            if (status === "in_progress") {
                statusColor = "bg-indigo-100 text-indigo-700";
            }

            if (status === "completed_by_provider") {
                statusColor = "bg-purple-100 text-purple-700";
            }

            if (status === "completed" || status === "paid_out") {
                statusColor = "bg-emerald-100 text-emerald-700";
            }

            if (status === "disputed") {
                statusColor = "bg-orange-100 text-orange-700";
            }

            if (status === "refunded" || status === "cancelled") {
                statusColor = "bg-red-100 text-red-700";
            }

            // ====================================
            // CREATE CARD
            // ====================================
            const card = document.createElement("div");

            card.className = `
                bg-white
                rounded-2xl
                shadow-sm
                overflow-hidden
                hover:shadow-lg
                transition
            `;

            card.innerHTML = `
                <div class="md:flex">

                    <!-- IMAGE -->
                    <div class="md:w-72 h-64">

                        <img
                            src="${serviceImage}"
                            alt="${serviceTitle}"
                            class="w-full h-full object-cover"
                        />

                    </div>

                    <!-- CONTENT -->
                    <div class="flex-1 p-6">

                        <div class="flex items-start justify-between gap-4">

                            <div>

                                <h3 class="text-2xl font-bold text-gray-900">
                                    ${serviceTitle}
                                </h3>

                                <p class="text-gray-500 mt-1">
                                    ${category}
                                </p>

                                ${(() => {
                                    const stats = serviceReviewStats[booking.service_id];
                                    if (stats && stats.count) {
                                        const avg = stats.avg.toFixed(1);
                                        return `
                                            <div class="flex items-center gap-2 mt-3 text-sm text-gray-600">
                                                <span class="text-yellow-500">${'★'.repeat(Math.round(avg))}${'☆'.repeat(5 - Math.round(avg))}</span>
                                                <span>${avg}/5 · ${stats.count} review${stats.count > 1 ? 's' : ''}</span>
                                            </div>
                                        `;
                                    }
                                    return `
                                        <div class="mt-3 text-sm text-gray-400">No reviews yet for this service</div>
                                    `;
                                })()}

                            </div>

                            <span class="px-4 py-2 rounded-full text-sm font-semibold ${statusColor}">
                                ${capitalize(status)}
                            </span>

                        </div>

                        <!-- DETAILS -->
                        <div class="mt-5 space-y-4 text-gray-700">

                            <div class="flex items-center gap-3">
                                <img
                                    src="${customerPicture}"
                                    alt="Customer avatar"
                                    class="w-12 h-12 rounded-full object-cover border border-gray-200"
                                />
                                <div>
                                    <p class="text-sm text-gray-500">Customer</p>
                                    <p class="font-semibold text-gray-900">
                                        ${customerName}
                                    </p>
                                    <p class="text-sm text-gray-500">
                                        ${customerEmail}
                                    </p>
                                </div>
                            </div>

                            <p>
                                📅 Scheduled:
                                <span class="font-semibold">
                                    ${bookingDate}
                                </span>
                            </p>

                            <p>
                                💰 Amount:
                                <span class="font-semibold text-green-600">
                                    ₦${amount}
                                </span>
                            </p>
                            <p class="text-sm text-gray-600 mt-1">
                                Per person: ₦${formatMoney(discountedPerPerson)}
                            </p>
                            ${hasGroupDeal ? `<p class="text-sm text-indigo-700 mt-2">${dealText}</p>` : ''}

                            <!-- BOOKING DETAILS -->
                            ${booking.scheduled_date || booking.number_of_people ? `
                            <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                              <p class="font-semibold text-gray-900 mb-3">Booking Details</p>
                              <div class="grid grid-cols-2 gap-3 text-sm">
                                ${booking.number_of_people ? `<div>
                                  <p class="text-gray-600">Number of People</p>
                                  <p class="font-semibold text-gray-900">${booking.number_of_people}</p>
                                </div>` : ''}
                                ${booking.scheduled_date ? `<div>
                                  <p class="text-gray-600">Scheduled Date & Time</p>
                                  <p class="font-semibold text-gray-900">${formatDate(booking.scheduled_date)}</p>
                                </div>` : ''}
                                ${booking.service_location ? `<div>
                                  <p class="text-gray-600">Location</p>
                                  <p class="font-semibold text-gray-900">${booking.service_location === 'provider' ? 'My Location' : (booking.customer_location || 'Customer Location')}</p>
                                </div>` : ''}
                                ${booking.travel_fee ? `<div>
                                  <p class="text-gray-600">Travel Fee</p>
                                  <p class="font-semibold text-gray-900">₦${booking.travel_fee.toLocaleString()}</p>
                                </div>` : ''}
                              </div>
                              ${booking.special_instructions ? `<p class="text-xs text-gray-600 mt-3"><strong>Special Instructions:</strong> ${booking.special_instructions}</p>` : ''}
                            </div>
                            ` : ''}

                        </div>

                        <!-- ACTIONS -->
                        <div class="mt-6 flex flex-wrap gap-3">

                            <button
                                class="chat-customer-btn bg-blue-600 text-white px-5 py-3 rounded-lg font-semibold hover:bg-blue-700 transition"
                                data-customer="${booking.user_id}"
                                data-service="${booking.service_id}">
                                💬 Chat Customer
                            </button>

                            ${booking.customer_location ? `
                                <button
                                    class="locate-customer-btn bg-slate-600 text-white px-5 py-3 rounded-lg font-semibold hover:bg-slate-700 transition"
                                    data-booking-id="${booking.id}"
                                    data-customer-location="${escapeHtml(booking.customer_location)}"
                                    data-service-location="${escapeHtml(service?.location || '')}">
                                    📍 Locate Customer
                                </button>
                            ` : ''}

                            ${status === "paid" ? `
                                <button
                                    class="accept-booking-btn bg-green-600 text-white px-5 py-3 rounded-lg font-semibold hover:bg-green-700 transition"
                                    data-id="${booking.id}">
                                    ✅ Accept Booking
                                </button>
                                <button
                                    class="decline-booking-btn bg-red-600 text-white px-5 py-3 rounded-lg font-semibold hover:bg-red-700 transition"
                                    data-id="${booking.id}">
                                    ❌ Decline Booking
                                </button>
                            ` : ""}

                            ${status === "accepted" ? `
                                <button
                                    class="start-work-btn bg-indigo-600 text-white px-5 py-3 rounded-lg font-semibold hover:bg-indigo-700 transition"
                                    data-id="${booking.id}">
                                    ▶️ Start Work
                                </button>
                                <button
                                    class="cancel-booking-btn bg-red-600 text-white px-5 py-3 rounded-lg font-semibold hover:bg-red-700 transition"
                                    data-id="${booking.id}">
                                    ❌ Cancel Booking
                                </button>
                            ` : ""}

                            ${status === "in_progress" ? `
                                <button
                                    class="mark-complete-btn bg-purple-600 text-white px-5 py-3 rounded-lg font-semibold hover:bg-purple-700 transition"
                                    data-id="${booking.id}">
                                    ✅ Mark Job Completed
                                </button>
                                <button
                                    class="cancel-booking-btn bg-red-600 text-white px-5 py-3 rounded-lg font-semibold hover:bg-red-700 transition"
                                    data-id="${booking.id}">
                                    ❌ Cancel Booking
                                </button>
                            ` : ""}

                            ${status === "completed_by_provider" ? `
                                <span class="px-4 py-3 rounded-lg bg-purple-50 text-purple-700 font-semibold">
                                    Awaiting customer confirmation
                                </span>
                            ` : ""}

                            ${status === "completed" ? `
                                <span class="px-4 py-3 rounded-lg bg-emerald-50 text-emerald-700 font-semibold">
                                    Completed — awaiting payout
                                </span>
                            ` : ""}

                            ${status === "cancelled" ? `
                                <span class="px-4 py-3 rounded-lg bg-red-50 text-red-700 font-semibold">
                                    Cancelled
                                </span>
                            ` : ""}

                            ${status === "disputed" ? `
                                <span class="px-4 py-3 rounded-lg bg-orange-50 text-orange-700 font-semibold">
                                    ⚠️ Reported
                                </span>
                            ` : ""}

                        </div>

                    </div>

                </div>
            `;

            bookingsContainer.appendChild(card);
        }

        // ====================================
        // ACTION BUTTONS
        // ====================================
        setupBookingActions();

        // ====================================
        // CHAT BUTTONS
        // ====================================
        setupChatButtons();

        // ====================================
        // LOCATE CUSTOMER BUTTONS
        // ====================================
        setupLocateButtons();

    } catch (error) {

        console.error("Load Bookings Error:", error);

        showError(error.message);
    }
}

// ===============================
// CHAT BUTTONS
// ===============================
function setupChatButtons() {

    document.querySelectorAll(".chat-customer-btn").forEach((btn) => {

        btn.addEventListener("click", async () => {

            const customerId = btn.dataset.customer;
            const serviceId = btn.dataset.service;
            const currentProviderId = (await supabase.auth.getSession()).data.session.user.id;

            await startChat(customerId, currentProviderId, serviceId);
        });
    });
}

// ===============================
// START CHAT
// ===============================
async function startChat(customerId, providerId, serviceId) {

    try {

        // We don't have service_id/customer_id/provider_id in chats.
        // Use `participants` + `sender_id` to locate the chat.
        const { data: existingChat } = await supabase
            .from("chats")
            .select("id")
            .eq("participants", customerId)
            .eq("sender_id", providerId)
            .maybeSingle();

        if (existingChat?.id) {
            const params = new URLSearchParams();
            params.append("chat_id", existingChat.id);
            if (serviceId) params.append("service_id", serviceId);
            window.location.href = `chat.html?${params.toString()}`;
            return;
        }

        // Create new chat
        const { data: newChat, error } = await supabase
            .from("chats")
            .insert([
                {
                    participants: customerId,
                    sender_id: providerId
                    // chat_id/last_message/last_timestamp will use defaults or nullable behavior
                }
            ])
            .select("id")
            .single();

        if (error) throw error;

        const params = new URLSearchParams();
        params.append("chat_id", newChat.id);
        if (serviceId) params.append("service_id", serviceId);
        window.location.href = `chat.html?${params.toString()}`;

    } catch (error) {

        console.error("Chat Error:", error);
        showError("Failed to start chat: " + error.message);
    }
}

// ===============================
// BOOKING ACTIONS
// ===============================
function setupBookingActions() {

    // ACCEPT
    document.querySelectorAll(".accept-booking-btn")
        .forEach((btn) => {

            btn.addEventListener("click", async () => {

                const bookingId = btn.dataset.id;

                await updateBookingStatus(
                    bookingId,
                    "accepted"
                );
            });
        });

    // DECLINE
    document.querySelectorAll(".decline-booking-btn")
        .forEach((btn) => {

            btn.addEventListener("click", async () => {

                const bookingId = btn.dataset.id;

                const confirmed = confirm(
                    "Are you sure you want to decline this booking? This will cancel the booking."
                );

                if (!confirmed) return;

                await updateBookingStatus(
                    bookingId,
                    "cancelled"
                );
            });
        });

    // START WORK
    document.querySelectorAll(".start-work-btn")
        .forEach((btn) => {

            btn.addEventListener("click", async () => {

                const bookingId = btn.dataset.id;

                await updateBookingStatus(
                    bookingId,
                    "in_progress"
                );
            });
        });

    // MARK COMPLETED
    document.querySelectorAll(".mark-complete-btn")
        .forEach((btn) => {

            btn.addEventListener("click", async () => {

                const bookingId = btn.dataset.id;

                const confirmed = confirm(
                    "Mark this job as completed? This will notify the customer."
                );

                if (!confirmed) return;

                await updateBookingStatus(
                    bookingId,
                    "completed_by_provider"
                );
            });
        });

    // CANCEL BOOKING
    document.querySelectorAll(".cancel-booking-btn")
        .forEach((btn) => {

            btn.addEventListener("click", async () => {

                const bookingId = btn.dataset.id;

                const confirmed = confirm(
                    "Are you sure you want to cancel this booking? This cannot be undone."
                );

                if (!confirmed) return;

                await updateBookingStatus(
                    bookingId,
                    "cancelled"
                );
            });
        });
}

// ===============================
// UPDATE STATUS
// ===============================
async function updateBookingStatus(
    bookingId,
    status
) {

    try {

        const { error } = await supabase
            .from("bookings")
            .update({
                status: status
            })
            .eq("id", bookingId);

        if (error) {
            throw error;
        }

        alert(`Booking ${status} successfully`);

        const {
            data: { session }
        } = await supabase.auth.getSession();

        await loadProviderBookings(session.user.id);

    } catch (error) {

        console.error("Update Status Error:", error);

        alert(error.message);
    }
}

// ===============================
// HELPERS
// ===============================
function formatDate(date) {

    if (!date) return "N/A";

    return new Date(date).toLocaleDateString(
        "en-NG",
        {
            year: "numeric",
            month: "long",
            day: "numeric"
        }
    );
}

function formatMoney(amount) {

    return Number(amount || 0)
        .toLocaleString("en-NG");
}

function capitalize(text) {

    if (!text) return "";

    return text.charAt(0).toUpperCase() +
        text.slice(1);
}

// ===============================
// SHOW ERROR
// ===============================
function showError(message) {

    bookingsContainer.innerHTML = `
        <div class="bg-white rounded-2xl p-10 shadow text-center">

            <div class="text-6xl mb-4">
                ❌
            </div>

            <h2 class="text-2xl font-bold text-red-600 mb-3">
                Failed to load bookings
            </h2>

            <p class="text-gray-600">
                ${message}
            </p>

        </div>
    `;
}