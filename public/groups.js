/* =========================================================
   TERZEX CHAT — COMPLETE GROUP SYSTEM
   Firebase Firestore + Cloudinary
   ========================================================= */

(() => {
  "use strict";

  const COLLECTION = "groups";
  const MAX_MEMBERS = 100;
  const MAX_FILE_SIZE = 25 * 1024 * 1024;

  let groupListUnsubscribe = null;
  let groupMessagesUnsubscribe = null;
  let activeGroupId = null;
  let activeGroupData = null;
  let selectedMembers = new Map();
  let searchTimer = null;
  let originalConversationRenderer = null;

  const groupRows = {};

  const $ = id => document.getElementById(id);

  function alertUser(message) {
    window.alert(message);
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function timestamp() {
    return firebase.firestore.FieldValue.serverTimestamp();
  }

  function groupsRef() {
    return db.collection(COLLECTION);
  }

  function messagesRef(groupId = activeGroupId) {
    return groupsRef().doc(groupId).collection("messages");
  }

  function isMember(group) {
    return !!(
      currentUser &&
      group &&
      Array.isArray(group.members) &&
      group.members.includes(currentUser.uid)
    );
  }

  function isAdmin(group) {
    return !!(
      currentUser &&
      group &&
      Array.isArray(group.admins) &&
      group.admins.includes(currentUser.uid)
    );
  }

  function ensureStyles() {
    if ($("terzexGroupStyles")) return;

    const style = document.createElement("style");
    style.id = "terzexGroupStyles";

    style.textContent = `
      .tg-overlay {
        position:fixed;
        inset:0;
        z-index:10020;
        display:none;
        align-items:center;
        justify-content:center;
        padding:12px;
        background:rgba(0,0,0,.88);
      }

      .tg-overlay.show {
        display:flex;
      }

      .tg-panel {
        width:min(100%,540px);
        max-height:92vh;
        overflow:auto;
        padding:18px;
        color:#fff;
        background:#101010;
        border:1px solid #b58a32;
        border-radius:18px;
        box-shadow:0 0 28px #b58a3240;
      }

      .tg-head {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        margin-bottom:16px;
      }

      .tg-head h2,
      .tg-gold {
        color:#e5bd62;
      }

      .tg-button,
      .tg-close {
        padding:10px 14px;
        color:#f5d27a;
        background:#171717;
        border:1px solid #b58a32;
        border-radius:10px;
        cursor:pointer;
      }

      .tg-button.primary {
        color:#080808;
        background:#b58a32;
        font-weight:bold;
      }

      .tg-button:disabled {
        opacity:.5;
        cursor:not-allowed;
      }

      .tg-input {
        box-sizing:border-box;
        width:100%;
        margin:7px 0 12px;
        padding:12px;
        color:white;
        background:#191919;
        border:1px solid #55431f;
        border-radius:10px;
      }

      .tg-user,
      .tg-member {
        display:flex;
        align-items:center;
        gap:10px;
        padding:10px;
        border-bottom:1px solid #292929;
      }

      .tg-avatar {
        display:flex;
        flex-shrink:0;
        align-items:center;
        justify-content:center;
        width:42px;
        height:42px;
        overflow:hidden;
        color:#f5d27a;
        background:#302514;
        border:1px solid #b58a32;
        border-radius:50%;
      }

      .tg-avatar img {
        width:100%;
        height:100%;
        object-fit:cover;
      }

      .tg-user-info {
        flex:1;
        min-width:0;
      }

      .tg-user-info small {
        display:block;
        color:#aaa;
      }

      .tg-chat {
        display:flex;
        flex-direction:column;
        height:min(75vh,700px);
      }

      .tg-chat-head {
        display:flex;
        align-items:center;
        gap:10px;
        padding-bottom:12px;
        border-bottom:1px solid #4b3919;
      }

      .tg-chat-head .tg-user-info {
        flex:1;
      }

      .tg-chat-messages {
        display:flex;
        flex:1;
        flex-direction:column;
        gap:9px;
        overflow:auto;
        padding:12px 0;
      }

      .tg-bubble {
        align-self:flex-start;
        max-width:85%;
        padding:10px 12px;
        overflow-wrap:anywhere;
        background:#222;
        border-radius:13px;
      }

      .tg-bubble.mine {
        align-self:flex-end;
        background:#493719;
      }

      .tg-bubble small {
        display:block;
        margin-top:5px;
        color:#d6b66b;
      }

      .tg-composer {
        display:flex;
        gap:7px;
        padding-top:12px;
        border-top:1px solid #4b3919;
      }

      .tg-composer input[type="text"] {
        flex:1;
        min-width:0;
        padding:12px;
        color:white;
        background:#1c1c1c;
        border:1px solid #55431f;
        border-radius:20px;
      }

      .tg-empty {
        padding:24px;
        color:#aaa;
        text-align:center;
      }

      .tg-list {
        max-height:280px;
        overflow:auto;
      }

      .tg-media {
        display:block;
        max-width:100%;
        max-height:260px;
        margin-top:8px;
        border-radius:10px;
      }

      .tg-member-name {
        color:#f5d27a;
        cursor:pointer;
      }

      .tg-actions {
        display:flex;
        flex-wrap:wrap;
        gap:8px;
        margin:12px 0;
      }

      .tg-check {
        width:18px;
        height:18px;
        accent-color:#d6ad55;
      }

      .tg-system {
        align-self:center;
        max-width:90%;
        padding:7px 12px;
        color:#d6b66b;
        background:#191919;
        border-radius:12px;
        font-size:12px;
        text-align:center;
      }

      [data-group-row] {
        cursor:pointer;
      }
    `;

    document.head.appendChild(style);
  }

  function ensureOverlays() {
    if ($("groupCreateOverlay")) return;

    document.body.insertAdjacentHTML("beforeend", `
      <div class="tg-overlay" id="groupCreateOverlay">
        <div class="tg-panel">
          <div class="tg-head">
            <h2>Create a Group</h2>
            <button class="tg-close" onclick="closeGroupCreator()">✕</button>
          </div>

          <label>Group name</label>
          <input class="tg-input" id="groupNameInput"
            maxlength="60" placeholder="Enter group name">

          <label>Group photo URL (optional)</label>
          <input class="tg-input" id="groupPhotoInput"
            placeholder="Paste group photo URL">

          <label>Search Terzex members</label>
          <input class="tg-input" id="groupMemberSearch"
            placeholder="Search by username">

          <div id="groupMemberResults" class="tg-list">
            <p class="tg-empty">Search for members to add.</p>
          </div>

          <p id="groupSelectedCount" class="tg-gold">
            0 members selected
          </p>

          <button class="tg-button primary"
            id="createGroupButton"
            onclick="createTerzexGroup()">
            Create Group
          </button>
        </div>
      </div>

      <div class="tg-overlay" id="groupChatOverlay">
        <div class="tg-panel tg-chat">
          <div class="tg-chat-head">
            <button class="tg-close"
              onclick="closeTerzexGroup()">←</button>

            <div class="tg-avatar" id="groupChatAvatar">♧</div>

            <div class="tg-user-info">
              <strong id="groupChatName" class="tg-gold">
                Group
              </strong>
              <small id="groupChatMembers"></small>
            </div>

            <button class="tg-close"
              onclick="openTerzexGroupSettings()">⋮</button>
          </div>

          <div id="groupMessages" class="tg-chat-messages">
            <p class="tg-empty">Loading messages...</p>
          </div>

          <div class="tg-composer">
            <input type="text"
              id="groupMessageInput"
              maxlength="2000"
              placeholder="Write a group message..."
              onkeydown="
                if(event.key==='Enter'){
                  event.preventDefault();
                  sendTerzexGroupMessage();
                }
              ">

            <label class="tg-button" for="groupMediaInput">＋</label>

            <input id="groupMediaInput"
              type="file"
              hidden
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
              onchange="sendTerzexGroupMedia(event)">

            <button class="tg-button primary"
              onclick="sendTerzexGroupMessage()">Send</button>
          </div>
        </div>
      </div>

      <div class="tg-overlay" id="groupSettingsOverlay">
        <div class="tg-panel">
          <div class="tg-head">
            <h2>Group Settings</h2>
            <button class="tg-close"
              onclick="closeGroupSettings()">✕</button>
          </div>
          <div id="groupSettingsContent"></div>
        </div>
      </div>
    `);

    $("groupMemberSearch").addEventListener(
      "input",
      searchGroupMembers
    );
  }

  /* =====================================================
     CREATE GROUP
     ===================================================== */

  window.openGroupCreator = function() {
    if (!currentUser) {
      return alertUser("Please wait for your account to load.");
    }

    ensureStyles();
    ensureOverlays();

    selectedMembers.clear();

    $("groupNameInput").value = "";
    $("groupPhotoInput").value = "";
    $("groupMemberSearch").value = "";

    $("groupMemberResults").innerHTML =
      '<p class="tg-empty">Search for members to add.</p>';

    updateSelectedCount();

    $("groupCreateOverlay").classList.add("show");
  };

  window.closeGroupCreator = function() {
    $("groupCreateOverlay")?.classList.remove("show");
  };

  function updateSelectedCount() {
    const count = selectedMembers.size;

    if ($("groupSelectedCount")) {
      $("groupSelectedCount").textContent =
        count + " member" + (count === 1 ? "" : "s") + " selected";
    }
  }

  async function searchGroupMembers() {
    clearTimeout(searchTimer);

    searchTimer = setTimeout(async () => {
      const input = $("groupMemberSearch");
      const results = $("groupMemberResults");

      if (!input || !results) return;

      const term = input.value.trim()
        .replace(/^@/, "")
        .toLowerCase();

      if (term.length < 2) {
        results.innerHTML =
          '<p class="tg-empty">Enter at least 2 characters.</p>';
        return;
      }

      results.innerHTML =
        '<p class="tg-empty">Searching Terzex users...</p>';

      try {
        const snapshot = await db.collection("public_profiles")
          .orderBy("usernameLower")
          .startAt(term)
          .endAt(term + "\uf8ff")
          .limit(25)
          .get();

        results.innerHTML = "";

        if (snapshot.empty) {
          results.innerHTML =
            '<p class="tg-empty">No matching members found.</p>';
          return;
        }

        snapshot.forEach(doc => {
          const profile = doc.data();
          const uid = doc.id;

          if (!uid || uid === currentUser.uid) return;

          const row = document.createElement("div");
          row.className = "tg-user";

          const avatar = document.createElement("div");
          avatar.className = "tg-avatar";

          if (profile.photoURL) {
            const image = document.createElement("img");
            image.src = profile.photoURL;
            image.alt = "";
            avatar.appendChild(image);
          } else {
            avatar.textContent =
              (profile.displayName || profile.username || "T")
                .charAt(0).toUpperCase();
          }

          const info = document.createElement("div");
          info.className = "tg-user-info";

          const displayName = document.createElement("strong");
          displayName.textContent =
            profile.displayName || profile.username || "Terzex User";

          const username = document.createElement("small");
          username.textContent = "@" + (profile.username || "");

          info.append(displayName, username);

          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.className = "tg-check";
          checkbox.checked = selectedMembers.has(uid);

          checkbox.addEventListener("change", () => {
            if (checkbox.checked) {
              if (selectedMembers.size >= MAX_MEMBERS - 1) {
                checkbox.checked = false;
                return alertUser("A group can have up to 100 members.");
              }

              selectedMembers.set(uid, profile);
            } else {
              selectedMembers.delete(uid);
            }

            updateSelectedCount();
          });

          row.append(avatar, info, checkbox);
          results.appendChild(row);
        });

      } catch (error) {
        console.error("Group member search:", error);

        results.innerHTML =
          '<p class="tg-empty">Could not search members. Check your connection and Firestore permissions.</p>';
      }
    }, 300);
  }

  window.createTerzexGroup = async function() {
    if (!currentUser) return;

    const name = $("groupNameInput").value.trim();
    const photoURL = $("groupPhotoInput").value.trim();
    const button = $("createGroupButton");

    if (name.length < 2 || name.length > 60) {
      return alertUser("Group name must be between 2 and 60 characters.");
    }

    if (selectedMembers.size < 1) {
      return alertUser("Select at least one other member.");
    }

    const members = [
      currentUser.uid,
      ...selectedMembers.keys()
    ];

    if (members.length > MAX_MEMBERS) {
      return alertUser("A group can have up to 100 members.");
    }

    if (button) button.disabled = true;

    try {
      const groupRef = groupsRef().doc();

      await groupRef.set({
        name,
        photoURL,
        createdBy: currentUser.uid,
        admins: [currentUser.uid],
        members,
        createdAt: timestamp(),
        updatedAt: timestamp(),
        lastMessage: "Group created",
        lastMessageAt: timestamp()
      });

      await groupRef.collection("messages").add({
        senderId: currentUser.uid,
        senderName:
          currentUser.displayName ||
          currentUser.email ||
          "Terzex User",
        text: "Group created",
        type: "system",
        createdAt: timestamp()
      });

      selectedMembers.clear();
      closeGroupCreator();

      await window.openTerzexGroup(groupRef.id);

    } catch (error) {
      console.error("Create group:", error);

      alertUser(
        "Could not create the group. Check your Firestore group rules."
      );
    } finally {
      if (button) button.disabled = false;
    }
  };

  /* =====================================================
     GROUP LIST — MAIN CHATS PAGE
     ===================================================== */

  function startGroupListener() {
    if (!currentUser) return;

    if (groupListUnsubscribe) {
      groupListUnsubscribe();
      groupListUnsubscribe = null;
    }

    groupListUnsubscribe = groupsRef()
      .where("members", "array-contains", currentUser.uid)
      .onSnapshot(snapshot => {
        const found = new Set();

        snapshot.forEach(doc => {
          found.add(doc.id);

          const data = doc.data();

          groupRows[doc.id] = {
            id: doc.id,
            type: "group",
            name: data.name || "Terzex Group",
            photoURL: data.photoURL || "",
            preview: data.lastMessage || "Group conversation",
            time: data.lastMessageAt?.toMillis?.() || 0,
            members: data.members || [],
            admins: data.admins || []
          };
        });

        Object.keys(groupRows).forEach(id => {
          if (!found.has(id)) {
            delete groupRows[id];
          }
        });

        renderUnifiedGroupList();

      }, error => {
        console.error("Group list listener:", error);
      });
  }

    function renderUnifiedGroupList() {
    const list = $("conversationList");
    if (!list) return;

    // Read the active filter directly from the filter buttons.
    const activeFilter = document
      .querySelector("#filters .filter.active")
      ?.textContent.trim() || "All";

    // Remove old group rows before rendering again.
    list.querySelectorAll("[data-group-row]").forEach(row => {
      row.remove();
    });

    // Groups appear in All and Groups filters only.
    if (activeFilter !== "All" && activeFilter !== "Groups") {
      return;
    }

    const rows = Object.values(groupRows);
    rows.sort((a, b) => b.time - a.time);

    // Groups filter: show groups only.
    if (activeFilter === "Groups") {
      list.innerHTML = "";

      if (!rows.length) {
        list.innerHTML =
          '<div class="tg-empty">Your groups will appear here.</div>';
        return;
      }
    }

    // All filter: keep private chats and add groups.
    rows.forEach(row => {
      const item = document.createElement("div");
      item.className = "conversation-row";
      item.dataset.groupRow = row.id;
      item.onclick = () => window.openTerzexGroup(row.id);

      const avatar = document.createElement("div");
      avatar.className = "conversation-avatar";

      if (row.photoURL) {
        const image = document.createElement("img");
        image.src = row.photoURL;
        image.alt = "Group photo";
        image.onerror = () => {
          avatar.textContent = "♧";
        };
        avatar.appendChild(image);
      } else {
        avatar.textContent = "♧";
      }

      const main = document.createElement("div");
      main.className = "conversation-main";

      const top = document.createElement("div");
      top.className = "conversation-top";

      const title = document.createElement("strong");
      title.textContent = row.name;

      const time = document.createElement("span");
      time.className = "conversation-time";
      time.textContent = row.time
        ? new Date(row.time).toLocaleDateString([], {
            month: "short",
            day: "numeric"
          })
        : "";

      top.append(title, time);

      const preview = document.createElement("div");
      preview.className = "conversation-preview";
      preview.textContent = "♧ " + (row.preview || "Group created");

      main.append(top, preview);
      item.append(avatar, main);

      list.appendChild(item);
    });
  }

    
  /* =====================================================
     OPEN GROUP
     ===================================================== */

  window.openTerzexGroup = async function(groupId) {
    if (!currentUser || !groupId) return;

    ensureStyles();
    ensureOverlays();

    try {
      const snapshot = await groupsRef().doc(groupId).get();

      if (!snapshot.exists) {
        return alertUser("This group no longer exists.");
      }

      const group = snapshot.data();

      if (!isMember(group)) {
        return alertUser("You are not a member of this group.");
      }

      activeGroupId = groupId;
      activeGroupData = group;

      $("groupChatName").textContent =
        group.name || "Terzex Group";

      $("groupChatMembers").textContent =
        (group.members || []).length + " members";

      $("groupChatAvatar").innerHTML = "";

      if (group.photoURL) {
        const image = document.createElement("img");
        image.src = group.photoURL;
        image.alt = "";
        $("groupChatAvatar").appendChild(image);
      } else {
        $("groupChatAvatar").textContent = "♧";
      }

      $("groupMessages").innerHTML =
        '<p class="tg-empty">Loading messages...</p>';

      $("groupChatOverlay").classList.add("show");

      if (groupMessagesUnsubscribe) {
        groupMessagesUnsubscribe();
        groupMessagesUnsubscribe = null;
      }

      groupMessagesUnsubscribe = messagesRef(groupId)
        .orderBy("createdAt", "asc")
        .limit(150)
        .onSnapshot(snapshot => {
          renderGroupMessages(snapshot);
        }, error => {
          console.error("Group messages:", error);

          $("groupMessages").innerHTML =
            '<p class="tg-empty">Could not load group messages.</p>';
        });

    } catch (error) {
      console.error("Open group:", error);
      alertUser("Could not open this group.");
    }
  };

  /* =====================================================
     GROUP MESSAGE DISPLAY
     ===================================================== */

  function renderGroupMessages(snapshot) {
    const box = $("groupMessages");
    if (!box) return;

    box.innerHTML = "";

    if (snapshot.empty) {
      box.innerHTML =
        '<p class="tg-empty">Start the conversation.</p>';
      return;
    }

    snapshot.forEach(doc => {
      const data = doc.data();

      if (data.type === "system") {
        const system = document.createElement("div");
        system.className = "tg-system";
        system.textContent = data.text || "Group update";
        box.appendChild(system);
        return;
      }

      const bubble = document.createElement("div");

      bubble.className =
        "tg-bubble" +
        (data.senderId === currentUser.uid ? " mine" : "");

      const sender = document.createElement("strong");
      sender.className = "tg-member-name";
      sender.textContent = data.senderName || "Terzex member";

      sender.onclick = () => {
        if (data.senderId && typeof openOtherTerzexProfile === "function") {
          openOtherTerzexProfile(data.senderId);
        }
      };

      bubble.appendChild(sender);

      if (data.text) {
        const messageText = document.createElement("div");
        messageText.textContent = data.text;
        bubble.appendChild(messageText);
      }

      if (data.mediaURL) {
        const type = data.mediaType || "";

        if (type.startsWith("image/")) {
          const image = document.createElement("img");
          image.src = data.mediaURL;
          image.alt = data.mediaName || "Group image";
          image.className = "tg-media";
          bubble.appendChild(image);

        } else if (type.startsWith("video/")) {
          const video = document.createElement("video");
          video.src = data.mediaURL;
          video.controls = true;
          video.className = "tg-media";
          bubble.appendChild(video);

        } else if (type.startsWith("audio/")) {
          const audio = document.createElement("audio");
          audio.src = data.mediaURL;
          audio.controls = true;
          audio.className = "tg-media";
          bubble.appendChild(audio);

        } else {
          const link = document.createElement("a");
          link.href = data.mediaURL;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = data.mediaName || "Download attachment";
          link.style.color = "#f5d27a";
          bubble.appendChild(link);
        }
      }

      const time = document.createElement("small");

      time.textContent = data.createdAt?.toDate
        ? data.createdAt.toDate().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
          })
        : "Sending...";

      bubble.appendChild(time);
      box.appendChild(bubble);
    });

    box.scrollTop = box.scrollHeight;
  }

  /* =====================================================
     SEND GROUP TEXT
     ===================================================== */

  window.sendTerzexGroupMessage = async function() {
    const input = $("groupMessageInput");

    if (!input || !activeGroupId || !currentUser) return;

    const text = input.value.trim();

    if (!text) return;

    if (!activeGroupData || !isMember(activeGroupData)) {
      return alertUser("You are no longer a member of this group.");
    }

    input.disabled = true;

    try {
      await messagesRef().add({
        senderId: currentUser.uid,
        senderName:
          currentUser.displayName ||
          currentUser.email ||
          "Terzex User",
        text,
        createdAt: timestamp()
      });

      await groupsRef().doc(activeGroupId).update({
        lastMessage: text,
        lastMessageAt: timestamp(),
        updatedAt: timestamp()
      });

      input.value = "";

    } catch (error) {
      console.error("Group message:", error);
      alertUser("Message not sent. Check your group permissions.");
    } finally {
      input.disabled = false;
      input.focus();
    }
  };

  /* =====================================================
     SEND GROUP MEDIA
     ===================================================== */

  window.sendTerzexGroupMedia = async function(event) {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file || !activeGroupId || !currentUser) return;

    if (!activeGroupData || !isMember(activeGroupData)) {
      return alertUser("You are no longer a member of this group.");
    }

    const allowed =
      file.type.startsWith("image/") ||
      file.type.startsWith("video/") ||
      file.type.startsWith("audio/") ||
      /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|zip)$/i.test(file.name);

    if (!allowed) {
      return alertUser("This file type is not supported.");
    }

    if (file.size > MAX_FILE_SIZE) {
      return alertUser("Choose a file smaller than 25 MB.");
    }

    try {
      let resourceType = "raw";

      if (file.type.startsWith("image/")) {
        resourceType = "image";
      } else if (
        file.type.startsWith("video/") ||
        file.type.startsWith("audio/")
      ) {
        resourceType = "video";
      }

      const endpoint =
        "https://api.cloudinary.com/v1_1/aqdwrxha/" +
        resourceType +
        "/upload";

      const form = new FormData();

      form.append("file", file);
      form.append("upload_preset", "terzex_upload");

      form.append(
        "folder",
        "terzex_chat/groups/" +
        activeGroupId +
        "/" +
        currentUser.uid
      );

      const response = await fetch(endpoint, {
        method: "POST",
        body: form
      });

      const result = await response.json();

      if (!response.ok || !result.secure_url) {
        throw new Error(
          result.error?.message || "Cloudinary upload failed."
        );
      }

      await messagesRef().add({
        senderId: currentUser.uid,
        senderName:
          currentUser.displayName ||
          currentUser.email ||
          "Terzex User",
        text: "",
        mediaURL: result.secure_url,
        mediaPath: result.public_id || "",
        mediaType: file.type || "application/octet-stream",
        mediaName: file.name,
        createdAt: timestamp()
      });

      await groupsRef().doc(activeGroupId).update({
        lastMessage: "Attachment: " + file.name,
        lastMessageAt: timestamp(),
        updatedAt: timestamp()
      });

    } catch (error) {
      console.error("Group media upload:", error);

      alertUser(
        "Upload failed: " +
        (error.message || "Check your connection.")
      );
    }
  };

  /* =====================================================
     CLOSE GROUP
     ===================================================== */

  window.closeTerzexGroup = function() {
    if (groupMessagesUnsubscribe) {
      groupMessagesUnsubscribe();
      groupMessagesUnsubscribe = null;
    }

    activeGroupId = null;
    activeGroupData = null;

    $("groupChatOverlay")?.classList.remove("show");
  };

  /* =====================================================
     GROUP SETTINGS AND MEMBER PROFILES
     ===================================================== */

  window.openTerzexGroupSettings = function() {
    if (!activeGroupId || !activeGroupData) return;

    const group = activeGroupData;
    const admin = isAdmin(group);
    const content = $("groupSettingsContent");

    content.innerHTML = `
      <h3 class="tg-gold">${escapeHTML(group.name)}</h3>

      <p>${(group.members || []).length} members</p>

      ${admin ? `
        <label>Change group name</label>
        <input class="tg-input"
          id="editGroupName"
          maxlength="60"
          value="${escapeHTML(group.name)}">

        <label>Change group photo URL</label>
        <input class="tg-input"
          id="editGroupPhoto"
          value="${escapeHTML(group.photoURL || "")}">

        <button class="tg-button primary"
          onclick="saveTerzexGroupDetails()">
          Save Changes
        </button>
      ` : ""}

      <h3 class="tg-gold">Group Members</h3>

      <div id="groupSettingsMembers" class="tg-list"></div>

      ${admin ? `
        <div class="tg-actions">
          <button class="tg-button"
            onclick="addTerzexGroupMember()">
            ＋ Add Member
          </button>
        </div>
      ` : ""}

      <button class="tg-button"
        onclick="leaveTerzexGroup()">
        Leave Group
      </button>
    `;

    const memberBox = $("groupSettingsMembers");

    memberBox.innerHTML =
      '<p class="tg-empty">Loading members...</p>';

    Promise.all(
      (group.members || []).map(async uid => {
        try {
          const profileSnap = await db
            .collection("public_profiles")
            .doc(uid)
            .get();

          return {
            uid,
            profile: profileSnap.exists
              ? profileSnap.data()
              : {}
          };
        } catch (error) {
          console.warn("Member profile:", error);
          return { uid, profile: {} };
        }
      })
    ).then(members => {
      if (!memberBox.isConnected) return;

      memberBox.innerHTML = "";

      members.forEach(({ uid, profile }) => {
        const row = document.createElement("div");
        row.className = "tg-member";

        const avatar = document.createElement("div");
        avatar.className = "tg-avatar";

        if (profile.photoURL) {
          const image = document.createElement("img");
          image.src = profile.photoURL;
          image.alt = "";
          avatar.appendChild(image);
        } else {
          avatar.textContent =
            (profile.displayName || profile.username || "T")
              .charAt(0).toUpperCase();
        }

        const info = document.createElement("div");
        info.className = "tg-user-info";

        const name = document.createElement("strong");
        name.className = "tg-member-name";
        name.textContent =
          profile.displayName ||
          profile.username ||
          "Terzex member";

        name.onclick = () => {
          if (typeof openOtherTerzexProfile === "function") {
            openOtherTerzexProfile(uid);
          }
        };

        const username = document.createElement("small");
        username.textContent = profile.username
          ? "@" + profile.username
          : "";

        info.append(name, username);

        row.append(avatar, info);

        if ((group.admins || []).includes(uid)) {
          const badge = document.createElement("small");
          badge.className = "tg-gold";
          badge.textContent = "Admin";
          row.appendChild(badge);
        }

        const messageButton = document.createElement("button");
        messageButton.className = "tg-button";
        messageButton.textContent = "Message";

        messageButton.onclick = () => {
          closeGroupSettings();
          closeTerzexGroup();

          if (typeof messageOtherTerzexUser === "function") {
            messageOtherTerzexUser(uid);
          } else if (typeof openPrivateChat === "function") {
            openPrivateChat(uid, profile);
          }
        };

        row.appendChild(messageButton);

        if (admin && uid !== currentUser.uid) {
          const removeButton = document.createElement("button");
          removeButton.className = "tg-button";
          removeButton.textContent = "Remove";

          removeButton.onclick = () => {
            window.removeTerzexGroupMember(uid);
          };

          row.appendChild(removeButton);
        }

        memberBox.appendChild(row);
      });
    });

    $("groupSettingsOverlay").classList.add("show");
  };

  window.closeGroupSettings = function() {
    $("groupSettingsOverlay")?.classList.remove("show");
  };

  /* =====================================================
     SAVE GROUP DETAILS
     ===================================================== */

  window.saveTerzexGroupDetails = async function() {
    if (!activeGroupId || !isAdmin(activeGroupData)) {
      return alertUser("Only group admins can change group details.");
    }

    const name = $("editGroupName").value.trim();
    const photoURL = $("editGroupPhoto").value.trim();

    if (name.length < 2 || name.length > 60) {
      return alertUser("Group name must be between 2 and 60 characters.");
    }

    try {
      await groupsRef().doc(activeGroupId).update({
        name,
        photoURL,
        updatedAt: timestamp()
      });

      activeGroupData.name = name;
      activeGroupData.photoURL = photoURL;

      $("groupChatName").textContent = name;
      $("groupChatAvatar").innerHTML = "";

      if (photoURL) {
        const image = document.createElement("img");
        image.src = photoURL;
        image.alt = "";
        $("groupChatAvatar").appendChild(image);
      } else {
        $("groupChatAvatar").textContent = "♧";
      }

      alertUser("Group details updated.");
      window.openTerzexGroupSettings();

    } catch (error) {
      console.error("Update group details:", error);
      alertUser("Could not update group details. Check Firestore rules.");
    }
  };

  /* =====================================================
     ADD GROUP MEMBER
     ===================================================== */

  window.addTerzexGroupMember = async function() {
    if (!activeGroupId || !isAdmin(activeGroupData)) {
      return alertUser("Only admins can add members.");
    }

    const username = prompt("Enter the Terzex username to add:");

    if (!username) return;

    try {
      const term = username.trim()
        .replace(/^@/, "")
        .toLowerCase();

      const snapshot = await db.collection("public_profiles")
        .where("usernameLower", "==", term)
        .limit(1)
        .get();

      if (snapshot.empty) {
        return alertUser("Terzex user not found.");
      }

      const userDoc = snapshot.docs[0];
      const uid = userDoc.id;

      if (activeGroupData.members.includes(uid)) {
        return alertUser("This user is already in the group.");
      }

      if (activeGroupData.members.length >= MAX_MEMBERS) {
        return alertUser("This group has reached its 100-member limit.");
      }

      const members = [
        ...activeGroupData.members,
        uid
      ];

      await groupsRef().doc(activeGroupId).update({
        members,
        updatedAt: timestamp()
      });

      activeGroupData.members = members;

      alertUser("Member added successfully.");
      window.openTerzexGroupSettings();

    } catch (error) {
      console.error("Add group member:", error);
      alertUser("Could not add this member. Check Firestore rules.");
    }
  };

  /* =====================================================
     REMOVE GROUP MEMBER
     ===================================================== */

  window.removeTerzexGroupMember = async function(uid) {
    if (!activeGroupId || !isAdmin(activeGroupData)) {
      return alertUser("Only admins can remove members.");
    }

    if (uid === currentUser.uid) {
      return alertUser("Use Leave Group to leave the group.");
    }

    if (!confirm("Remove this member from the group?")) return;

    try {
      const members = activeGroupData.members.filter(
        memberId => memberId !== uid
      );

      const admins = (activeGroupData.admins || []).filter(
        adminId => adminId !== uid
      );

      if (admins.length < 1) {
        return alertUser("A group must have at least one admin.");
      }

      await groupsRef().doc(activeGroupId).update({
        members,
        admins,
        updatedAt: timestamp()
      });

      activeGroupData.members = members;
      activeGroupData.admins = admins;

      alertUser("Member removed.");
      window.openTerzexGroupSettings();

    } catch (error) {
      console.error("Remove group member:", error);
      alertUser("Could not remove this member. Check Firestore rules.");
    }
  };

  /* =====================================================
     LEAVE GROUP
     ===================================================== */

  window.leaveTerzexGroup = async function() {
    if (!activeGroupId || !activeGroupData) return;

    if (!confirm("Are you sure you want to leave this group?")) return;

    try {
      const members = activeGroupData.members.filter(
        uid => uid !== currentUser.uid
      );

      const admins = (activeGroupData.admins || []).filter(
        uid => uid !== currentUser.uid
      );

      if (admins.length < 1) {
        return alertUser(
          "You are the only admin. Add another admin before leaving."
        );
      }

      await groupsRef().doc(activeGroupId).update({
        members,
        admins,
        updatedAt: timestamp()
      });

      closeGroupSettings();
      closeTerzexGroup();

      alertUser("You have left the group.");

    } catch (error) {
      console.error("Leave group:", error);
      alertUser("Could not leave this group. Check Firestore rules.");
    }
  };

  /* =====================================================
     INITIALIZE
     ===================================================== */

  function initializeGroups() {
    ensureStyles();
    ensureOverlays();

    if (
      typeof window.renderConversationList === "function" &&
      !originalConversationRenderer
    ) {
      originalConversationRenderer = window.renderConversationList;

      window.renderConversationList = function() {
        originalConversationRenderer();
        renderUnifiedGroupList();
      };
    }

    const newGroupButton = document.querySelector(
      '.menu-item[onclick*="New Group"]'
    );

    if (newGroupButton) {
      newGroupButton.setAttribute(
        "onclick",
        "closeModal('menuOverlay');openGroupCreator()"
      );
    }

    startGroupListener();
  }

  auth.onAuthStateChanged(user => {
    if (user) {
      setTimeout(initializeGroups, 500);
    } else {
      if (groupListUnsubscribe) {
        groupListUnsubscribe();
        groupListUnsubscribe = null;
      }

      if (groupMessagesUnsubscribe) {
        groupMessagesUnsubscribe();
        groupMessagesUnsubscribe = null;
      }

      Object.keys(groupRows).forEach(id => {
        delete groupRows[id];
      });
    }
  });

})();
