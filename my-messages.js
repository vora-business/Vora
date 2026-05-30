import { supabase } from "./supabase.js";

const messagesContainer = document.getElementById("messagesContainer");
const emptyState = document.getElementById("emptyState");

let currentUser = null;

document.addEventListener("DOMContentLoaded", async () => {
  await initialize();
});

async function initialize() {
  try {
    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session) {
      window.location.href = "login.html";
      return;
    }

    currentUser = session.user;

    await loadConversations();
    setupRealtime();

  } catch (error) {
    console.error(error);
  }
}

async function loadConversations() {
  messagesContainer.innerHTML = `
    <div class="bg-white rounded-xl p-6 text-center shadow">
      <p>Loading conversations...</p>
    </div>
  `;

  const { data: chats, error } = await supabase
    .from("chats")
    .select("*")
    .or(
      `customer_id.eq.${currentUser.id},provider_id.eq.${currentUser.id}`
    )
    .order("updated_at", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  if (!chats || chats.length === 0) {
    messagesContainer.innerHTML = "";
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  messagesContainer.innerHTML = "";

  for (const chat of chats) {
    await renderConversation(chat);
  }
}

async function renderConversation(chat) {

  const otherUserId =
    chat.customer_id === currentUser.id
      ? chat.provider_id
      : chat.customer_id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", otherUserId)
    .single();

  const { data: lastMessage } = await supabase
    .from("messages")
    .select("*")
    .eq("chat_id", chat.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const unreadCountResult = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("chat_id", chat.id)
    .neq("sender_id", currentUser.id)
    .eq("is_read", false);

  const unreadCount = unreadCountResult.count || 0;

  const card = document.createElement("div");

  card.className =
    "bg-white rounded-xl shadow hover:shadow-lg transition cursor-pointer";

  card.innerHTML = `
    <div class="p-4 flex items-center gap-4">

      <div class="w-14 h-14 rounded-full bg-gray-200 overflow-hidden flex items-center justify-center">

        ${
          profile?.avatar_url
            ? `<img src="${profile.avatar_url}" class="w-full h-full object-cover">`
            : "👤"
        }

      </div>

      <div class="flex-1 min-w-0">

        <div class="flex justify-between items-start">

          <h3 class="font-bold truncate">
            ${profile?.full_name || "User"}
          </h3>

          <span class="text-xs text-gray-500">
            ${formatTime(lastMessage?.created_at)}
          </span>

        </div>

        <p class="text-gray-600 text-sm truncate mt-1">
          ${lastMessage?.message || "No messages yet"}
        </p>

      </div>

      ${
        unreadCount > 0
          ? `
          <div class="bg-blue-600 text-white text-xs min-w-[24px] h-6 rounded-full flex items-center justify-center px-2">
            ${unreadCount}
          </div>
        `
          : ""
      }

    </div>
  `;

  card.addEventListener("click", () => {
    window.location.href =
      `chat.html?chat_id=${chat.id}`;
  });

  messagesContainer.appendChild(card);
}

function setupRealtime() {

  supabase
    .channel("messages-list")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "messages"
      },
      async () => {
        await loadConversations();
      }
    )
    .subscribe();
}

function formatTime(dateString) {

  if (!dateString) return "";

  const date = new Date(dateString);
  const now = new Date();

  const diff =
    now.getTime() - date.getTime();

  const hours =
    Math.floor(diff / (1000 * 60 * 60));

  const days =
    Math.floor(diff / (1000 * 60 * 60 * 24));

  if (hours < 24) {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  if (days < 7) {
    return `${days}d`;
  }

  return date.toLocaleDateString();
}