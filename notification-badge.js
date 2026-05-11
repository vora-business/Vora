import { db, auth } from "./firebase-config.js";
import {
  collection,
  query,
  where,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const badge = document.getElementById("notificationBadge");

let currentUser = null;

// ========== AUTH ==========
onAuthStateChanged(auth, (user) => {
  if (!user) return;

  currentUser = user;
  listenNotifications();
});

// ========== REAL-TIME LISTENER ==========
function listenNotifications() {
  const q = query(
    collection(db, "notifications"),
    where("userId", "==", currentUser.uid),
    where("read", "==", false)
  );

  onSnapshot(q, (snapshot) => {

    const unreadCount = snapshot.size;

    updateBadge(unreadCount);
  });
}

// ========== UPDATE BADGE UI ==========
function updateBadge(count) {

  if (!badge) return;

  if (count <= 0) {
    badge.classList.add("hidden");
    return;
  }

  badge.classList.remove("hidden");
  badge.textContent = count > 99 ? "99+" : count;
  
  // Add pulse animation for new notifications
  badge.classList.add("animate-pulse");
  setTimeout(() => {
    badge.classList.remove("animate-pulse");
  }, 3000);
}