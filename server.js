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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Terzex Chat running on port ${PORT}`);
});
