import { db, auth } from "./firebase-config.js";

import {
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  doc,
  getDocs,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ================= DOM =================
const list = document.getElementById("list");
const markAllBtn = document.getElementById("markAll");

let currentUser = null;
let unsubscribe = null;

// ================= AUTH =================
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  listenNotifications();
});

// ================= NOTIFICATION TYPE STYLES =================
const notificationStyles = {
  offer_received: { icon: '💰', color: 'bg-blue-50 border-blue-200', category: 'Offers' },
  offer_accepted: { icon: '✅', color: 'bg-green-50 border-green-200', category: 'Offers' },
  offer_rejected: { icon: '❌', color: 'bg-red-50 border-red-200', category: 'Offers' },
  booking_confirmed: { icon: '📅', color: 'bg-purple-50 border-purple-200', category: 'Bookings' },
  booking_cancelled: { icon: '⛔', color: 'bg-orange-50 border-orange-200', category: 'Bookings' },
  booking_completed: { icon: '🎉', color: 'bg-green-50 border-green-200', category: 'Bookings' },
  new_message: { icon: '💬', color: 'bg-indigo-50 border-indigo-200', category: 'Messages' },
  payment_received: { icon: '💳', color: 'bg-green-50 border-green-200', category: 'Payments' },
  payment_failed: { icon: '⚠️', color: 'bg-red-50 border-red-200', category: 'Payments' },
  new_request: { icon: '📋', color: 'bg-yellow-50 border-yellow-200', category: 'Requests' },
  review_received: { icon: '⭐', color: 'bg-amber-50 border-amber-200', category: 'Reviews' },
  review_response: { icon: '📝', color: 'bg-amber-50 border-amber-200', category: 'Reviews' },
  profile_viewed: { icon: '👀', color: 'bg-gray-50 border-gray-200', category: 'Activity' },
  service_approved: { icon: '✅', color: 'bg-green-50 border-green-200', category: 'Services' },
  service_rejected: { icon: '❌', color: 'bg-red-50 border-red-200', category: 'Services' },
  verification_update: { icon: '🔐', color: 'bg-blue-50 border-blue-200', category: 'Account' },
  payout_processed: { icon: '💰', color: 'bg-green-50 border-green-200', category: 'Payouts' },
  // Fallback for unknown types
  update: { icon: '📢', color: 'bg-gray-50 border-gray-200', category: 'Updates' }
};

function getNotificationStyle(type) {
  return notificationStyles[type] || notificationStyles.update;
}
function listenNotifications() {

  if (unsubscribe) unsubscribe(); // prevent duplicate listeners

  const q = query(
    collection(db, "notifications"),
    where("userId", "==", currentUser.uid),
    orderBy("createdAt", "desc")
  );

  unsubscribe = onSnapshot(q, (snapshot) => {

    if (snapshot.empty) {
      list.innerHTML = emptyState();
      return;
    }

    list.innerHTML = "";

    snapshot.forEach((docSnap) => {

      const n = docSnap.data();
      const style = getNotificationStyle(n.type);

      const title = n.title || "Notification";
      const message = n.message || "No message provided";
      const type = n.type || "update";
      const read = n.read || false;
      const createdAt = n.createdAt?.toDate() || new Date();

      const item = document.createElement("div");

      // Format time
      const timeStr = formatTime(createdAt);

      item.className = `
        ${style.color} border-l-4 p-5 rounded-lg shadow
        flex justify-between items-start gap-4
        cursor-pointer transition hover:shadow-lg hover:translate-x-1
        ${read ? 'opacity-75' : 'opacity-100'}
      `;

      item.innerHTML = `
        <div class="flex gap-3 flex-1">
          <div class="text-3xl">${style.icon}</div>
          
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <p class="font-bold ${read ? 'text-gray-600' : 'text-black'}">
                ${title}
              </p>
              <span class="text-xs px-2 py-1 rounded-full ${read ? 'bg-gray-200 text-gray-600' : 'bg-blue-200 text-blue-700'} font-medium">
                ${style.category}
              </span>
            </div>

            <p class="text-sm text-gray-700 mb-2">
              ${message}
            </p>

            <p class="text-xs text-gray-500">
              ${timeStr}
            </p>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <span class="text-xs px-3 py-1 rounded-full ${read ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-600'} font-medium">
            ${read ? 'Read' : 'New'}
          </span>
        </div>
      `;

      // CLICK → mark as read
      item.addEventListener("click", async () => {

        const ref = doc(db, "notifications", docSnap.id);

        if (!read) {
          await updateDoc(ref, {
            read: true,
            updatedAt: serverTimestamp()
          });
        }

        // optional redirect support
        if (n.metadata?.link) {
          window.location.href = n.metadata.link;
        }
      });

      list.appendChild(item);
    });

  }, (error) => {

    console.error("Notification error:", error);

    list.innerHTML = `
      <div class="bg-red-50 border border-red-200 p-4 rounded-xl">
        <p class="text-red-600 font-semibold">
          Failed to load notifications
        </p>
      </div>
    `;
  });
}

// ================= MARK ALL AS READ =================
markAllBtn?.addEventListener("click", async () => {

  if (!currentUser) return;

  const q = query(
    collection(db, "notifications"),
    where("userId", "==", currentUser.uid)
  );

  const snap = await getDocs(q);

  snap.forEach(async (d) => {
    await updateDoc(doc(db, "notifications", d.id), {
      read: true,
      readAt: serverTimestamp()
    });
  });
});

// ================= EMPTY STATE =================
function emptyState() {
  return `
    <div class="bg-gradient-to-br from-gray-50 to-gray-100 p-12 rounded-xl shadow text-center border border-gray-200">
      <p class="text-5xl mb-3">📭</p>
      <p class="text-lg font-semibold text-gray-700">All caught up!</p>
      <p class="text-sm text-gray-500 mt-2">No notifications yet. Your activities will appear here.</p>
    </div>
  `;
}

// ================= TIME FORMATTER =================
function formatTime(date) {
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}