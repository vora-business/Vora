import { supabase } from "./supabase.js";

let currentUser = null;
let selectedRating = 0;
let selectedBooking = null;

// ==========================
// INIT
// ==========================
document.addEventListener("DOMContentLoaded", async () => {

    const { data: sessionData } = await supabase.auth.getSession();

    if (!sessionData.session) {
        window.location.href = "login.html";
        return;
    }

    currentUser = sessionData.session.user;

    await loadBookings();
    setupReviewModal();
    setupLogout();
});

// ==========================
// LOGOUT
// ==========================
function setupLogout() {

    const logoutBtn = document.getElementById("logoutBtn");
    const logoutBtnSideMenu = document.getElementById("logoutBtnSideMenu");

    async function logout() {
        await supabase.auth.signOut();
        window.location.href = "login.html";
    }

    logoutBtn?.addEventListener("click", logout);
    logoutBtnSideMenu?.addEventListener("click", logout);
}

// ==========================
// LOAD BOOKINGS
// ==========================
async function loadBookings() {

    const container = document.getElementById("bookingsContainer");

    try {

        container.innerHTML = `
            <div class="bg-white rounded-xl p-10 text-center shadow">
                <div class="text-5xl mb-4">⏳</div>
                <p class="text-gray-600 text-lg">Loading bookings...</p>
            </div>
        `;

        const { data: bookings, error } = await supabase
            .from("bookings")
            .select("*")
            .eq("user_id", currentUser.id)
            .order("created_at", { ascending: false });

        if (error) throw error;

        if (!bookings || bookings.length === 0) {
            container.innerHTML = `
                <div class="bg-white rounded-xl p-10 text-center shadow">
                    <div class="text-6xl mb-4">📭</div>
                    <h2 class="text-2xl font-bold text-gray-800 mb-3">No Bookings Yet</h2>
                    <p class="text-gray-500">Your bookings will appear here.</p>
                </div>
            `;
            return;
        }

        const providerIds = [
            ...new Set(bookings.map(b => b.provider_id).filter(Boolean))
        ];

        let providersById = {};

        if (providerIds.length > 0) {
            const { data: providers } = await supabase
                .from("users")
                .select("id, full_name, email, location, profile_picture")
                .in("id", providerIds);

            providersById = Object.fromEntries(
                (providers || []).map(p => [p.id, p])
            );
        }

        // ==========================
        // FETCH SERVICES AND REQUESTS
        // ==========================
        const serviceIds = bookings.map(b => b.service_id).filter(Boolean);
        const requestIds = bookings.map(b => b.request_id).filter(Boolean);

        let servicesById = {};
        let requestsById = {};

        if (serviceIds.length > 0) {
            const { data: services } = await supabase
                .from("services")
                .select("id, title, description, location, price")
                .in("id", serviceIds);

            if (services) {
                servicesById = Object.fromEntries(
                    services.map(s => [s.id, s])
                );
            }
        }

        if (requestIds.length > 0) {
            const { data: requests } = await supabase
                .from("requests")
                .select("id, title, description, location, budget")
                .in("id", requestIds);

            if (requests) {
                requestsById = Object.fromEntries(
                    requests.map(r => [r.id, r])
                );
            }
        }

        container.innerHTML = "";

        bookings.forEach(booking => {

            // Get service or request details
            const serviceDetails = servicesById[booking.service_id];
            const requestDetails = requestsById[booking.request_id];
            const details = serviceDetails || requestDetails || {};

            const provider = normalizeProfile(providersById[booking.provider_id]);

            const providerName = provider?.full_name || "Service Provider";
            const providerEmail = provider?.email || "No email";
            const providerLocation = provider?.location || "Location not available";

            const providerPicture =
                provider?.profile_picture ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(providerName)}`;

            const card = document.createElement("div");

            card.className = `
                bg-white rounded-2xl shadow-md p-6 hover:shadow-xl transition
            `;

            card.innerHTML = `
                <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">

                    <!-- LEFT -->
                    <div class="flex-1">

                        <!-- PROVIDER -->
                        <div class="flex items-center gap-4 mb-5">

                            <img
                                src="${providerPicture}"
                                class="w-16 h-16 rounded-full object-cover border"
                            >

                            <div>
                                <p class="text-sm text-gray-500">Service Provider</p>
                                <h2 class="text-xl font-bold text-gray-900">${providerName}</h2>
                                <p class="text-blue-600 text-sm">${providerEmail}</p>
                            </div>

                        </div>

                        <!-- TITLE -->
                        <h3 class="text-2xl font-bold mb-3">
                            ${details.title || "Untitled Booking"}
                        </h3>

                        <!-- DESCRIPTION -->
                        <p class="text-gray-600 mb-5">
                            ${details.description || "No description"}
                        </p>

                        <!-- DETAILS -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">

                            <div class="bg-gray-50 rounded-xl p-4">
                                <p class="text-sm text-gray-500 mb-1">📍 Location</p>
                                <p class="font-semibold">${details.location || "No location"}</p>
                            </div>

                            <div class="bg-gray-50 rounded-xl p-4">
                                <p class="text-sm text-gray-500 mb-1">💰 Agreed Price</p>
                                <p class="font-bold text-green-600 text-xl">
                                    ₦${Number(booking.total_price || details.price || 0).toLocaleString()}
                                </p>
                            </div>

                            <div class="bg-gray-50 rounded-xl p-4">
                                <p class="text-sm text-gray-500 mb-1">🌍 Provider Location</p>
                                <p class="font-semibold">${providerLocation}</p>
                            </div>

                        </div>

                    </div>

                    <!-- RIGHT -->
                    <div class="flex flex-col gap-3 w-full lg:w-56">

                        <button
                            class="review-btn bg-yellow-500 hover:bg-yellow-600 text-white px-5 py-3 rounded-xl font-semibold transition"
                            data-booking="${booking.id}"
                            data-service="${booking.service_id || ''}"
                            data-provider="${booking.provider_id || ''}"
                        >
                            Leave Review
                        </button>

                    </div>

                </div>
            `;

            container.appendChild(card);
        });

        // REVIEW BUTTONS
        document.querySelectorAll(".review-btn").forEach(button => {

            button.addEventListener("click", () => {

                selectedBooking = button.dataset.booking;

                openReviewModal(
                    button.dataset.provider,
                    button.dataset.service
                );
            });
        });

    } catch (error) {

        container.innerHTML = `
            <div class="bg-white rounded-xl p-10 text-center shadow">
                <div class="text-6xl mb-4">❌</div>
                <h2 class="text-2xl font-bold text-red-600 mb-3">
                    Failed to load bookings
                </h2>
                <p class="text-gray-500">${error.message}</p>
            </div>
        `;
    }
}

// ==========================
// REVIEW MODAL
// ==========================
function setupReviewModal() {

    const modal = document.getElementById("reviewModal");
    const closeBtn = document.getElementById("closeReviewModal");
    const cancelBtn = document.getElementById("cancelReview");
    const submitBtn = document.getElementById("submitReview");
    const stars = document.querySelectorAll(".star");

    function closeModal() {
        modal.classList.add("hidden");
        selectedRating = 0;
        document.getElementById("reviewComment").value = "";
    }

    closeBtn?.addEventListener("click", closeModal);
    cancelBtn?.addEventListener("click", closeModal);

    stars.forEach(star => {
        star.addEventListener("click", () => {

            selectedRating = Number(star.dataset.rating);

            stars.forEach(s => {
                const rating = Number(s.dataset.rating);

                s.classList.toggle("text-yellow-400", rating <= selectedRating);
                s.classList.toggle("text-gray-300", rating > selectedRating);
            });
        });
    });

    submitBtn?.addEventListener("click", async () => {

        try {

            if (!selectedRating) {
                alert("Please select a rating");
                return;
            }

            const comment = document.getElementById("reviewComment").value;

            const providerId = modal.dataset.provider;
            const serviceId = modal.dataset.service;

            submitBtn.disabled = true;
            submitBtn.textContent = "Submitting...";

            const { error } = await supabase.from("reviews").insert({
                booking_id: selectedBooking,
                user_id: currentUser.id,
                provider_id: providerId,
                service_id: serviceId,
                rating: selectedRating,
                comment
            });

            if (error) throw error;

            alert("Review submitted successfully!");
            closeModal();

        } catch (error) {
            alert(error.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = "Submit Review";
        }
    });
}

// ==========================
// OPEN REVIEW MODAL
// ==========================
function openReviewModal(providerId, serviceId) {

    const modal = document.getElementById("reviewModal");

    modal.dataset.provider = providerId;
    modal.dataset.service = serviceId;

    modal.classList.remove("hidden");
}

// ==========================
// NORMALIZE PROFILE
// ==========================
function normalizeProfile(profile) {
    if (!profile) return null;
    return Array.isArray(profile) ? profile[0] : profile;
}