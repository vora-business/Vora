import { supabase } from "./supabase.js";
import { LoadingSpinner } from "./loading-utils.js";

// ============================
// GET URL PARAMS
// ============================

const params = new URLSearchParams(window.location.search);
const serviceId = params.get("id");

// ============================
// DOM ELEMENTS
// ============================

const serviceContainer = document.getElementById("service-container");

// ============================
// AUTH CHECK
// ============================

// Try to get session but don't require it for viewing service details/reviews
const { data: sessionData } = await supabase.auth.getSession();
const currentUser = sessionData?.session?.user || null;



// ============================
// LOAD SERVICE
// ============================

async function loadService() {
  try {
    if (!serviceId) {
      serviceContainer.innerHTML = `<p class="text-red-600">Invalid service ID</p>`;
      return;
    }

    // FETCH SERVICE
    const { data: service, error: serviceError } = await supabase
      .from('services')
      .select('*')
      .eq('id', serviceId)
      .single();

    if (serviceError || !service) {
      serviceContainer.innerHTML = `
        <div class="text-center text-red-600">
          <p class="font-bold">Service not found</p>
        </div>
      `;
      return;
    }

    const providerId = service.provider_id;

    // IMAGE
    const serviceImage =
      service.image_url ||
      'https://placehold.co/800x500?text=Vora';

    // ============================
    // RENDER SERVICE
    // ============================

    serviceContainer.innerHTML = `
      <div class="space-y-6 pb-24">

        <img
          src="${serviceImage}"
          class="w-full h-80 object-cover rounded-xl"
        />

        <div>
          <h2 class="text-3xl font-bold text-gray-900">
            ${service.title}
          </h2>

          <p class="text-gray-500 mt-2">
            ${service.category || ''}
          </p>
        </div>

        <div class="text-right">
          <p class="text-sm text-gray-500">Price</p>
          <p class="text-2xl font-extrabold text-green-600">
            ₦${service.price || 0}
          </p>
        </div>

        <div>
          <h3 class="text-xl font-bold mb-2">Description</h3>
          <p class="text-gray-700 leading-relaxed">
            ${service.description || 'No description'}
          </p>
        </div>

        <div>
          <p class="text-sm text-gray-500">Location</p>
          <p class="text-gray-700">
            ${service.location || 'Not specified'}
          </p>
        </div>

        <div class="fixed bottom-0 left-0 w-full bg-white border-t p-4">
          <button id="bookNowBtn"
            class="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold">
            Book Now
          </button>
        </div>

      </div>
    `;

    const bookNowBtn = document.getElementById('bookNowBtn');
    if (bookNowBtn) {
      bookNowBtn.onclick = () => {
        LoadingSpinner.navigateTo(
          `payment.html?serviceId=${service.id}&providerId=${providerId}`
        );
      };
    }

  } catch (err) {
    console.error(err);
    serviceContainer.innerHTML =
      `<p class="text-red-600">Failed to load service</p>`;
  }
}

// ============================
// INIT
// ============================

loadService();