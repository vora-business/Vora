import { supabase } from "./supabase.js";
import { LoadingSpinner } from "./loading-utils.js";

let allServices = [];
let currentBuiltInMargin = 0;
let currentUser = null;

const CACHE_KEY = "browse_services_cache";
const CACHE_DURATION = 5 * 60 * 1000;
  
// =========================
// PLATFORM SETTINGS
// =========================
async function getPlatformSettings() {

    const { data } = await supabase
        .from("settings")
        .select("built_in_margin")
        .eq("id", "platform")
        .maybeSingle();

    return {
        builtInMargin: data?.built_in_margin ?? 0
    };
}

// =========================
// INIT
// =========================
document.addEventListener("DOMContentLoaded", async () => {

    const servicesContainer = document.getElementById("servicesGrid");
    const searchInput = document.getElementById("searchInput");
    const searchButton = document.getElementById("searchButton");
    const categorySelect = document.getElementById("categorySelect");
    const logoutBtn = document.getElementById("logoutBtn");

    const urlParams = new URLSearchParams(window.location.search);

    const queryCategory = urlParams.get("category");
    const querySearch = urlParams.get("search");

    // =========================
    // AUTH CHECK
    // =========================
    const { data: sessionData } = await supabase.auth.getSession();

    if (!sessionData.session) {
        window.location.href = "login.html";
        return;
    }

    currentUser = sessionData.session.user;

    servicesContainer.innerHTML = `
        <div class="text-center py-10 text-gray-500">
            Loading services...
        </div>
    `;

    await loadServices(servicesContainer);

    populateCategories(categorySelect, allServices);

    // =========================
    // URL FILTERS
    // =========================
    if (queryCategory) {

        categorySelect.value = queryCategory.toLowerCase();

        applyFilters(
            "",
            queryCategory.toLowerCase(),
            servicesContainer
        );

    } else if (querySearch) {

        searchInput.value = querySearch;

        applyFilters(
            querySearch,
            "all",
            servicesContainer
        );

    } else {

        applyFilters("", "all", servicesContainer);
    }

    // =========================
    // EVENTS
    // =========================
    searchButton.onclick = () => {
        applyFilters(
            searchInput.value,
            categorySelect.value,
            servicesContainer
        );
    };

    searchInput.addEventListener("keyup", (e) => {

        if (e.key === "Enter") {

            applyFilters(
                searchInput.value,
                categorySelect.value,
                servicesContainer
            );
        }
    });

    categorySelect.addEventListener("change", () => {

        applyFilters(
            searchInput.value,
            categorySelect.value,
            servicesContainer
        );
    });

    logoutBtn.onclick = async () => {

        await supabase.auth.signOut();

        window.location.href = "login.html";
    };
});

// =========================
// LOAD SERVICES
// =========================
async function loadServices(container) {

    try {

        // =========================
        // CACHE
        // =========================
        const cached = localStorage.getItem(CACHE_KEY);
        const cacheTime = localStorage.getItem(CACHE_KEY + "_time");

        if (
            cached &&
            cacheTime &&
            Date.now() - Number(cacheTime) < CACHE_DURATION
        ) {

            allServices = JSON.parse(cached);

            const settings = await getPlatformSettings();

            currentBuiltInMargin = settings.builtInMargin;

            await fetchReviews();

            render(allServices, container);

            return;
        }

        // =========================
        // FETCH SERVICES
        // =========================
        const { data, error } = await supabase
            .from("services")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) throw error;

        allServices = data || [];

        // =========================
        // FETCH REVIEWS
        // =========================
        await fetchReviews();

        // =========================
        // SETTINGS
        // =========================
        const settings = await getPlatformSettings();

        currentBuiltInMargin = settings.builtInMargin;

        // =========================
        // SAVE CACHE
        // =========================
        localStorage.setItem(
            CACHE_KEY,
            JSON.stringify(allServices)
        );

        localStorage.setItem(
            CACHE_KEY + "_time",
            Date.now().toString()
        );

        render(allServices, container);

    } catch (error) {

        console.error(error);

        container.innerHTML = `
            <div class="text-center py-10 text-red-500">
                Failed to load services
            </div>
        `;
    }
}

// =========================
// FILTERS
// =========================
function applyFilters(search, category, container) {

    let filtered = [...allServices];

    // CATEGORY
    if (category && category !== "all") {

        filtered = filtered.filter(service =>
            service.category?.toLowerCase() === category
        );
    }

    // SEARCH
    if (search) {

        const term = search.toLowerCase();

        filtered = filtered.filter(service =>
            service.title?.toLowerCase().includes(term) ||
            service.description?.toLowerCase().includes(term)
        );
    }

    render(filtered, container);
}

// =========================
// CATEGORIES
// =========================
function populateCategories(select, services) {

    const set = new Set();

    services.forEach(service => {

        if (service.category) {
            set.add(service.category);
        }
    });

    select.innerHTML = `
        <option value="all">All</option>
    `;

    set.forEach(category => {

        const option = document.createElement("option");

        option.value = category.toLowerCase();

        option.textContent = category;

        select.appendChild(option);
    });
}

// =========================
// RENDER
// =========================
function render(services, container) {

    container.innerHTML = "";

    if (!services.length) {

        container.innerHTML = `
            <div class="text-center py-10 text-gray-500 col-span-full">
                No services found
            </div>
        `;

        return;
    }

    services.forEach(service => {

        const price = Number(service.price) || 0;

        const buyerPrice =
            price + (price * currentBuiltInMargin / 100);

        const card = document.createElement("div");

        card.className = `
            bg-white
            rounded-xl
            shadow
            hover:shadow-lg
            transition
            cursor-pointer
            overflow-hidden
        `;

        card.innerHTML = `
            <img
                src="${service.image_url || 'https://placehold.co/600x400'}"
                class="w-full h-44 object-cover"
            />

            <div class="p-4">

                <h3 class="font-semibold text-lg">
                    ${service.title}
                </h3>

                <p class="text-gray-500 text-sm">
                    ${service.category || ""}
                </p>

                <!-- PRICE -->
                <p class="text-blue-600 font-bold text-lg mt-3">
                    ₦${buyerPrice.toLocaleString()}
                </p>

            </div>
        `;

        card.onclick = () => {

            window.location.href =
                `service.html?id=${service.id}`;
        };

        container.appendChild(card);
    });
}