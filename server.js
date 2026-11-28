import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());

// Display the Terzex Chat website
app.use(express.static(path.join(__dirname, "public")));

// Firebase connection
const serviceAccountPath =
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
  "/etc/secrets/firebase-service-account.json";

if (!fs.existsSync(serviceAccountPath)) {
  console.error("Firebase service account file not found.");
  process.exit(1);
}

const serviceAccount = JSON.parse(
  fs.readFileSync(serviceAccountPath, "utf8")
);

initializeApp({
  credential: cert(serviceAccount),
  databaseURL: "https://terzex-chat-default-rtdb.firebaseio.com"
});

const db = getFirestore();
const adminAuth = getAuth();
const rtdb = getDatabase();
// Verify Firebase users before allowing protected actions
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";

  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authentication required."
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    req.user = await adminAuth.verifyIdToken(token);
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired login session."
    });
  }
}

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "healthy" });
});

// Firebase connection test
app.get("/api/firebase-test", async (req, res) => {
  try {
    await db.collection("system").doc("connection-test").set({
      status: "connected",
      updatedAt: new Date()
    });

    res.json({
      success: true,
      message: "Firebase connected successfully!"
    });
  } catch (error) {
    console.error("Firebase error:", error);

    res.status(500).json({
      success: false,
      message: "Firebase connection failed."
    });
  }
});

// Secure private message deletion
app.post("/api/messages/delete", requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { chatId, messageId, action } = req.body;

    if (!chatId || !messageId || !["forMe", "forEveryone"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Invalid deletion request."
      });
    }

    const chatRef = db.collection("private_chats").doc(chatId);
    const chatDoc = await chatRef.get();

    if (!chatDoc.exists || !chatDoc.data().participants?.includes(uid)) {
      return res.status(403).json({
        success: false,
        message: "You are not a participant in this chat."
      });
    }

    const messageRef = chatRef.collection("messages").doc(messageId);
    const messageDoc = await messageRef.get();

    if (!messageDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Message not found."
      });
    }

    const message = messageDoc.data();

    if (action === "forMe") {
      await messageRef.update({
        hiddenFor: FieldValue.arrayUnion(uid)
      });
    } else {
      if (message.senderId !== uid) {
        return res.status(403).json({
          success: false,
          message: "You can only delete your own message for everyone."
        });
      }

            if (message.mediaPath) {
        const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
        const apiKey = process.env.CLOUDINARY_API_KEY;
        const apiSecret = process.env.CLOUDINARY_API_SECRET;

        if (!cloudName || !apiKey || !apiSecret) {
          return res.status(500).json({
            success: false,
            message: "Cloudinary server settings are missing."
          });
        }

        message.mediaPath = String(message.mediaPath).replace(/^\/+/, "");

        const expectedPrefix = `terzex_chat/${chatId}/${uid}/`;

        if (!message.mediaPath.startsWith(expectedPrefix)) {
          console.error("Media path verification failed:", {
            chatId,
            uid,
            mediaPath: message.mediaPath
          });

          return res.status(403).json({
            success: false,
            message: "Media path does not belong to this chat."
          });
        }

const resourceType =
  message.mediaType?.startsWith("audio/") ||
  message.mediaType?.startsWith("video/")
    ? "video"
    : (
        message.mediaType === "application/pdf" ||
        message.mediaType?.includes("word") ||
        message.mediaType?.includes("spreadsheet") ||
        message.mediaType?.includes("presentation") ||
        message.mediaType === "text/plain" ||
        message.mediaType === "application/zip"
      )
      ? "raw"
      : "image";
        const timestamp = Math.floor(Date.now() / 1000);

        const signature = crypto
          .createHash("sha1")
          .update(`public_id=${message.mediaPath}&timestamp=${timestamp}${apiSecret}`)
          .digest("hex");

        const form = new URLSearchParams({
          public_id: message.mediaPath,
          timestamp: String(timestamp),
          api_key: apiKey,
          signature,
          invalidate: "true"
        });

        const cloudResponse = await fetch(
          `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded"
            },
            body: form
          }
        );

        const cloudResult = await cloudResponse.json();

        if (!cloudResponse.ok ||
            !["ok", "not found"].includes(cloudResult.result)) {
          return res.status(502).json({
            success: false,
            message: "Media could not be deleted. The message was kept."
          });
        }
      }

      await messageRef.delete();
    }

    return res.json({
      success: true,
      message: "Message deletion completed."
    });

  } catch (error) {
    console.error("Message deletion error:", error);

    return res.status(500).json({
      success: false,
      message: "Message deletion failed."
    });
  }
});
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Terzex Chat running on port ${PORT}`);
});
