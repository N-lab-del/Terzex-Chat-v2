/* =====================================================
   TERZEX CHAT — GROUPS
   Firebase-backed group conversations
   ===================================================== */

(() => {
  "use strict";

  const GROUPS = "groups";
  const MAX_MEMBERS = 100;
  const MAX_FILE_SIZE = 25 * 1024 * 1024;

  let groupListUnsubscribe = null;
  let groupMessagesUnsubscribe = null;
  let activeGroupId = null;
  let activeGroupData = null;
  let selectedGroupMembers = new Map();
  let groupSearchTimer = null;

  const groupRows = {};
  const groupMessageRows = {};

  const $ = id => document.getElementById(id);

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function notify(message) {
    alert(message);
  }

  function isGroupAdmin(group) {
    return !!(
      currentUser &&
      group &&
      Array.isArray(group.admins) &&
      group.admins.includes(currentUser.uid)
    );
  }

  function isGroupMember(group) {
    return !!(
      currentUser &&
      group &&
      Array.isArray(group.members) &&
      group.members.includes(currentUser.uid)
    );
  }

  function groupCollection() {
    return db.collection(GROUPS);
  }

  function messageCollection(groupId = activeGroupId) {
    return groupCollection().doc(groupId).collection("messages");
  }

  function ensureGroupStyles() {
    if ($("terzexGroupStyles")) return;

    const style = document.createElement("style");
    style.id = "terzexGroupStyles";

    style.textContent = `
      .tg-overlay {
        position:fixed;inset:0;z-index:10020;
        background:rgba(0,0,0,.88);
        display:none;align-items:center;justify-content:center;
        padding:12px;
      }
      .tg-overlay.show {display:flex}
      .tg-panel {
        width:min(100%,520px);max-height:92vh;
        overflow:auto;background:#101010;color:#fff;
        border:1px solid #b58a32;border-radius:18px;
        padding:18px;box-shadow:0 0 28px #b58a3240;
      }
      .tg-head {
        display:flex;align-items:center;justify-content:space-between;
        gap:10px;margin-bottom:16px;
      }
      .tg-head h2,.tg-gold {color:#e5bd62}
      .tg-close,.tg-button {
        border:1px solid #b58a32;background:#171717;
        color:#f5d27a;border-radius:10px;padding:10px 14px;
        cursor:pointer;
      }
      .tg-button.primary {
        background:#b58a32;color:#080808;font-weight:bold;
      }
      .tg-input {
        width:100%;box-sizing:border-box;padding:12px;
        margin:7px 0 12px;border:1px solid #55431f;
        border-radius:10px;background:#191919;color:white;
      }
      .tg-user,.tg-member,.tg-message {
        display:flex;align-items:center;gap:10px;
        padding:10px;border-bottom:1px solid #292929;
      }
      .tg-avatar {
        width:42px;height:42px;border-radius:50%;
        background:#302514;border:1px solid #b58a32;
        display:flex;align-items:center;justify-content:center;
        color:#f5d27a;overflow:hidden;flex-shrink:0;
      }
      .tg-avatar img {width:100%;height:100%;object-fit:cover}
      .tg-user-info {flex:1;min-width:0}
      .tg-user-info small {display:block;color:#aaa}
      .tg-chat {
        height:min(75vh,700px);display:flex;flex-direction:column;
      }
      .tg-chat-head {
        display:flex;align-items:center;gap:10px;
        padding-bottom:12px;border-bottom:1px solid #4b3919;
      }
      .tg-chat-head .tg-user-info {flex:1}
      .tg-chat-messages {
        flex:1;overflow:auto;padding:12px 0;
        display:flex;flex-direction:column;gap:9px;
      }
      .tg-bubble {
        max-width:85%;padding:10px 12px;
        border-radius:13px;background:#222;
        overflow-wrap:anywhere;align-self:flex-start;
      }
      .tg-bubble.mine {
        background:#493719;align-self:flex-end;
      }
      .tg-bubble small {display:block;color:#d6b66b;margin-top:5px}
      .tg-composer {
        display:flex;gap:7px;border-top:1px solid #4b3919;
        padding-top:12px;
      }
      .tg-composer input {
        flex:1;min-width:0;background:#1c1c1c;color:white;
        border:1px solid #55431f;border-radius:20px;padding:12px;
      }
      .tg-empty {text-align:center;color:#aaa;padding:24px}
      .tg-actions {display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
      .tg-check {accent-color:#d6ad55;width:18px;height:18px}
      .tg-list {max-height:280px;overflow:auto}
      .tg-media {max-width:100%;max-height:240px;border-radius:10px}
      .tg-member-name {cursor:pointer;color:#f5d27a}
    `;

    document.head.appendChild(style);
  }

  function ensureGroupOverlays() {
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
            placeholder="Paste a group photo URL">

          <label>Find Terzex members</label>
          <input class="tg-input" id="groupMemberSearch"
            placeholder="Search by username">

          <div id="groupMemberResults" class="tg-list">
            <p class="tg-empty">Search for members to add.</p>
          </div>

          <p id="groupSelectedCount" class="tg-gold">
            0 members selected
          </p>

          <button class="tg-button primary"
            onclick="createTerzexGroup()">Create Group</button>
        </div>
      </div>

      <div class="tg-overlay" id="groupChatOverlay">
        <div class="tg-panel tg-chat">
          <div class="tg-chat-head">
            <button class="tg-close" onclick="closeTerzexGroup()">←</button>
            <div class="tg-avatar" id="groupChatAvatar">♧</div>
            <div class="tg-user-info">
              <strong id="groupChatName" class="tg-gold">Group</strong>
              <small id="groupChatMembers"></small>
            </div>
            <button class="tg-close" onclick="openTerzexGroupSettings()">⋮</button>
          </div>

          <div id="groupMessages" class="tg-chat-messages">
            <p class="tg-empty">Loading messages...</p>
          </div>

          <div class="tg-composer">
            <input id="groupMessageInput"
              placeholder="Write a group message..."
              maxlength="2000"
              onkeydown="if(event.key==='Enter'){event.preventDefault();sendTerzexGroupMessage()}">

            <label class="tg-button" for="groupMediaInput">＋</label>
            <input id="groupMediaInput" type="file"
              hidden accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
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

    $("groupMemberSearch").addEventListener("input", searchGroupMembers);
  }

  window.openGroupCreator = function() {
    if (!currentUser) return notify("Please wait for your account to load.");

    ensureGroupStyles();
    ensureGroupOverlays();

    selectedGroupMembers.clear();
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
    const count = selectedGroupMembers.size;
    if ($("groupSelectedCount")) {
      $("groupSelectedCount").textContent =
        count + " member" + (count === 1 ? "" : "s") + " selected";
    }
  }

  async function searchGroupMembers() {
    clearTimeout(groupSearchTimer);

    groupSearchTimer = setTimeout(async () => {
      const term = $("groupMemberSearch").value.trim()
        .replace(/^@/, "").toLowerCase();

      const results = $("groupMemberResults");

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
          .limit(20)
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

          if (uid === currentUser.uid) return;

          const selected = selectedGroupMembers.has(uid);
          const row = document.createElement("div");
          row.className = "tg-user";

          const avatar = document.createElement("div");
          avatar.className = "tg-avatar";

          if (profile.photoURL) {
            const img = document.createElement("img");
            img.src = profile.photoURL;
            avatar.appendChild(img);
          } else {
            avatar.textContent =
              (profile.displayName || profile.username || "T")
                .charAt(0).toUpperCase();
          }

          const info = document.createElement("div");
          info.className = "tg-user-info";
          info.innerHTML =
            "<strong>" +
            escapeHTML(profile.displayName || profile.username) +
            "</strong><small>@" +
            escapeHTML(profile.username || "") +
            "</small>";

          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.className = "tg-check";
          checkbox.checked = selected;

          checkbox.onchange = () => {
            if (checkbox.checked) {
              if (selectedGroupMembers.size >= MAX_MEMBERS - 1) {
                checkbox.checked = false;
                return notify("A group can have up to 100 members.");
              }
              selectedGroupMembers.set(uid, profile);
            } else {
              selectedGroupMembers.delete(uid);
            }
            updateSelectedCount();
          };

          row.append(avatar, info, checkbox);
          results.appendChild(row);
        });

      } catch (error) {
        console.error("Group member search:", error);
        results.innerHTML =
          '<p class="tg-empty">Could not search members. Check your connection.</p>';
      }
    }, 300);
  }

  window.createTerzexGroup = async function() {
    if (!currentUser) return;

    const name = $("groupNameInput").value.trim();
    const photoURL = $("groupPhotoInput").value.trim();

    if (name.length < 2) {
      return notify("Please enter a group name.");
    }

    if (selectedGroupMembers.size < 1) {
      return notify("Select at least one other member.");
    }

    const members = [
      currentUser.uid,
      ...selectedGroupMembers.keys()
    ];

    if (members.length > MAX_MEMBERS) {
      return notify("A group can have up to 100 members.");
    }

    try {
      const ref = groupCollection().doc();

      await ref.set({
        name,
        photoURL,
        createdBy: currentUser.uid,
        admins: [currentUser.uid],
        members,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastMessage: "Group created",
        lastMessageAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      await ref.collection("messages").add({
        senderId: currentUser.uid,
        senderName: currentUser.displayName || "Terzex User",
        text: "Group created",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        type: "system"
      });

      closeGroupCreator();
      openTerzexGroup(ref.id);

    } catch (error) {
      console.error("Create group:", error);
      notify("Could not create the group. Check your Firestore rules.");
    }
  };

  function startGroupListener() {
    if (!currentUser) return;

    if (groupListUnsubscribe) groupListUnsubscribe();

    groupListUnsubscribe = groupCollection()
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
          if (!found.has(id)) delete groupRows[id];
        });

        renderUnifiedGroupList();
      }, error => {
        console.error("Group list:", error);
      });
  }

  function renderUnifiedGroupList() {
    const list = $("conversationList");
    if (!list) return;

    if (typeof window.__terzexOriginalRenderConversationList === "function") {
      window.__terzexOriginalRenderConversationList();
    }

    let existing = list.querySelectorAll("[data-group-row]");
    existing.forEach(row => row.remove());

    let rows = Object.values(groupRows);

    if (activeConversationFilter === "Groups") {
      list.innerHTML = "";
    }

    rows.sort((a, b) => b.time - a.time);

    if (activeConversationFilter === "Groups" && !rows.length) {
      list.innerHTML =
        '<div class="tg-empty">Your groups will appear here.</div>';
      return;
    }

    rows.forEach(row => {
      const item = document.createElement("div");
      item.className = "conversation-row";
      item.dataset.groupRow = row.id;
      item.onclick = () => openTerzexGroup(row.id);

      const avatar = document.createElement("div");
      avatar.className = "conversation-avatar";

      if (row.photoURL) {
        const img = document.createElement("img");
        img.src = row.photoURL;
        img.alt = "";
        avatar.appendChild(img);
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
      preview.textContent = "♧ " + row.preview;

      main.append(top, preview);
      item.append(avatar, main);

      list.appendChild(item);
    });
  }

  window.openTerzexGroup = async function(groupId) {
    if (!currentUser) return;

    ensureGroupStyles();
    ensureGroupOverlays();

    try {
      const snap = await groupCollection().doc(groupId).get();

      if (!snap.exists) return notify("This group no longer exists.");

      const group = snap.data();

      if (!isGroupMember(group)) {
        return notify("You are not a member of this group.");
      }

      activeGroupId = groupId;
      activeGroupData = group;

      $("groupChatName").textContent = group.name || "Terzex Group";
      $("groupChatMembers").textContent =
        (group.members || []).length + " members";

      $("groupChatAvatar").innerHTML = group.photoURL
        ? '<img src="' + escapeHTML(group.photoURL) + '" alt="">'
        : "♧";

      $("groupChatOverlay").classList.add("show");

      if (groupMessagesUnsubscribe) groupMessagesUnsubscribe();

      groupMessagesUnsubscribe = messageCollection(groupId)
        .orderBy("createdAt", "asc")
        .limit(150)
        .onSnapshot(messages => {
          renderGroupMessages(messages);
        }, error => {
          console.error("Group messages:", error);
          $("groupMessages").innerHTML =
            '<p class="tg-empty">Could not load group messages.</p>';
        });

    } catch (error) {
      console.error("Open group:", error);
      notify("Could not open this group.");
    }
  };

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

      const bubble = document.createElement("div");
      bubble.className = "tg-bubble" +
        (data.senderId === currentUser.uid ? " mine" : "");

      const sender = document.createElement("strong");
      sender.className = "tg-member-name";
      sender.textContent = data.senderName || "Terzex member";
      sender.onclick = () => openOtherTerzexProfile(data.senderId);

      bubble.appendChild(sender);

      if (data.text) {
        const text = document.createElement("div");
        text.textContent = data.text;
        bubble.appendChild(text);
      }

      if (data.mediaURL) {
        const type = data.mediaType || "";

        if (type.startsWith("image/")) {
          const img = document.createElement("img");
          img.src = data.mediaURL;
          img.className = "tg-media";
          bubble.appendChild(img);
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
          bubble.appendChild(audio);
        } else {
          const link = document.createElement("a");
          link.href = data.mediaURL;
          link.target = "_blank";
          link.rel = "noopener";
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

  window.sendTerzexGroupMessage = async function() {
    const input = $("groupMessageInput");
    const text = input.value.trim();

    if (!text || !activeGroupId || !currentUser) return;

    input.disabled = true;

    try {
      await messageCollection().add({
        senderId: currentUser.uid,
        senderName: currentUser.displayName ||
          currentUser.email || "Terzex User",
        text,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      await groupCollection().doc(activeGroupId).update({
        lastMessage: text,
        lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      input.value = "";

    } catch (error) {
      console.error("Group message:", error);
      notify("Message not sent. Check your group permissions.");
    } finally {
      input.disabled = false;
      input.focus();
    }
  };

  window.sendTerzexGroupMedia = async function(event) {
    const file = event.target.files[0];
    event.target.value = "";

    if (!file || !activeGroupId || !currentUser) return;

    const allowed =
      file.type.startsWith("image/") ||
      file.type.startsWith("video/") ||
      file.type.startsWith("audio/") ||
      /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|zip)$/i.test(file.name);

    if (!allowed) return notify("This file type is not supported.");

    if (file.size > MAX_FILE_SIZE) {
      return notify("Choose a file smaller than 25 MB.");
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
        resourceType + "/upload";

      const form = new FormData();
      form.append("file", file);
      form.append("upload_preset", "terzex_upload");
      form.append(
        "folder",
        "terzex_chat/groups/" + activeGroupId + "/" + currentUser.uid
      );

      const response = await fetch(endpoint, {
        method: "POST",
        body: form
      });

      const result = await response.json();

      if (!response.ok || !result.secure_url) {
        throw new Error(result.error?.message || "Upload failed.");
      }

      await messageCollection().add({
        senderId: currentUser.uid,
        senderName: currentUser.displayName ||
          currentUser.email || "Terzex User",
        text: "",
        mediaURL: result.secure_url,
        mediaPath: result.public_id || "",
        mediaType: file.type || "application/octet-stream",
        mediaName: file.name,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      await groupCollection().doc(activeGroupId).update({
        lastMessage: "Attachment: " + file.name,
        lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

    } catch (error) {
      console.error("Group media upload:", error);
      notify("Upload failed: " + (error.message || "Check your connection."));
    }
  };

  window.closeTerzexGroup = function() {
    if (groupMessagesUnsubscribe) {
      groupMessagesUnsubscribe();
      groupMessagesUnsubscribe = null;
    }

    activeGroupId = null;
    activeGroupData = null;
    $("groupChatOverlay")?.classList.remove("show");
  };

  window.openTerzexGroupSettings = function() {
    if (!activeGroupData || !activeGroupId) return;

    const group = activeGroupData;
    const admin = isGroupAdmin(group);
    const content = $("groupSettingsContent");

    content.innerHTML = `
      <h3 class="tg-gold">${escapeHTML(group.name)}</h3>
      <p>${(group.members || []).length} members</p>

      ${admin ? `
        <label>Change group name</label>
        <input class="tg-input" id="editGroupName"
          maxlength="60" value="${escapeHTML(group.name)}">

        <label>Change group photo URL</label>
        <input class="tg-input" id="editGroupPhoto"
          value="${escapeHTML(group.photoURL || "")}">

        <button class="tg-button primary"
          onclick="saveTerzexGroupDetails()">Save Changes</button>
      ` : ""}

      <h3 class="tg-gold">Members</h3>
      <div id="groupSettingsMembers" class="tg-list"></div>

      ${admin ? `
        <div class="tg-actions">
          <button class="tg-button"
            onclick="addTerzexGroupMember()">＋ Add Member</button>
        </div>
      ` : ""}

      <button class="tg-button"
        onclick="leaveTerzexGroup()">Leave Group</button>
    `;

    const memberBox = $("groupSettingsMembers");

    (group.members || []).forEach(uid => {
      db.collection("public_profiles").doc(uid).get().then(profileSnap => {
        const profile = profileSnap.exists ? profileSnap.data() : {};
        const row = document.createElement("div");
        row.className = "tg-member";

        const name = document.createElement("strong");
        name.className = "tg-member-name";
        name.textContent =
          profile.displayName || profile.username || "Terzex member";
        name.onclick = () => openOtherTerzexProfile(uid);

        const message = document.createElement("button");
        message.className = "tg-button";
        message.textContent = "Message";
        message.onclick = () => {
          closeGroupSettings();
          closeTerzexGroup();
          messageOtherTerzexUser(uid);
        };

        row.append(name);

        if ((group.admins || []).includes(uid)) {
          const badge = document.createElement("small");
          badge.textContent = "Admin";
          badge.className = "tg-gold";
          row.appendChild(badge);
        }

        row.appendChild(message);

        if (admin && uid !== currentUser.uid) {
          const remove = document.createElement("button");
          remove.className = "tg-button";
          remove.textContent = "Remove";
          remove.onclick = () => removeTerzexGroupMember(uid);
          row.appendChild(remove);
        }

        memberBox.appendChild(row);
      });
    });

    $("groupSettingsOverlay").classList.add("show");
  };

  window.closeGroupSettings = function() {
    $("groupSettingsOverlay")?.classList.remove("show");
  };

  window.saveTerzexGroupDetails = async function() {
    if (!isGroupAdmin(activeGroupData)) {
      return notify("Only group admins can change group details.");
    }

    const name = $("editGroupName").value.trim();
    const photoURL = $("editGroupPhoto").value.trim();

    if (name.length < 2) return notify("Enter a valid group name.");

    try {
      await groupCollection().doc(activeGroupId).update({
        name,
        photoURL,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      activeGroupData.name = name;
      activeGroupData.photoURL = photoURL;

      $("groupChatName").textContent = name;
      $("groupChatAvatar").innerHTML = photoURL
        ? '<img src="' + escapeHTML(photoURL) + '" alt="">'
        : "♧";

      notify("Group details updated.");
      openTerzexGroupSettings();

    } catch (error) {
      console.error(error);
      notify("Could not update group details.");
    }
  };

  window.removeTerzexGroupMember = async function(uid) {
    if (!isGroupAdmin(activeGroupData)) {
      return notify("Only admins can remove members.");
    }

    if (!confirm("Remove this member from the group?")) return;

    try {
      const members = activeGroupData.members.filter(id => id !== uid);
      const admins = (activeGroupData.admins || []).filter(id => id !== uid);

      await groupCollection().doc(activeGroupId).update({
        members,
        admins,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      activeGroupData.members = members;
      activeGroupData.admins = admins;

      notify("Member removed.");
      openTerzexGroupSettings();

    } catch (error) {
      console.error(error);
      notify("Could not remove this member.");
    }
  };

  window.addTerzexGroupMember = async function() {
    if (!isGroupAdmin(activeGroupData)) {
      return notify("Only admins can add members.");
    }

    const username = prompt("Enter the Terzex username to add:");
    if (!username) return;

    try {
      const term = username.trim().replace(/^@/, "").toLowerCase();

      const snapshot = await db.collection("public_profiles")
        .where("usernameLower", "==", term)
        .limit(1)
        .get();

      if (snapshot.empty) return notify("Terzex user not found.");

      const doc = snapshot.docs[0];
      const uid = doc.id;

      if (activeGroupData.members.includes(uid)) {
        return notify("This user is already a group member.");
      }

      if (activeGroupData.members.length >= MAX_MEMBERS) {
        return notify("This group has reached its member limit.");
      }

      const members = [...activeGroupData.members, uid];

      await groupCollection().doc(activeGroupId).update({
        members,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      activeGroupData.members = members;

      notify("Member added successfully.");
      openTerzexGroupSettings();

    } catch (error) {
      console.error(error);
      notify("Could not add this member.");
    }
  };

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

      await groupCollection().doc(activeGroupId).update({
        members,
        admins,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      closeGroupSettings();
      closeTerzexGroup();

    } catch (error) {
      console.error(error);
      notify("Could not leave this group.");
    }
  };

  function initializeGroups() {
    ensureGroupStyles();
    ensureGroupOverlays();

    if (typeof window.renderConversationList === "function") {
      window.__terzexOriginalRenderConversationList =
        window.renderConversationList;

      window.renderConversationList = function() {
        window.__terzexOriginalRenderConversationList();
        renderUnifiedGroupList();
      };
    }

    const newGroupButton = document.querySelector(
      '.menu-item[onclick*="New Group"]'
    );

    if (newGroupButton) {
      newGroupButton.setAttribute("onclick", "closeModal('menuOverlay');openGroupCreator()");
    }

    startGroupListener();
  }

  auth.onAuthStateChanged(user => {
    if (user) {
      setTimeout(initializeGroups, 500);
    } else {
      if (groupListUnsubscribe) groupListUnsubscribe();
      groupListUnsubscribe = null;
      Object.keys(groupRows).forEach(id => delete groupRows[id]);
    }
  });

})();
