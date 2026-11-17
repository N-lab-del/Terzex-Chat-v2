import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

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
credential: cert(serviceAccount)
});

const db = getFirestore();

app.get("/", (req, res) => {
res.json({
app: "Terzex Chat",
status: "online",
database: "Firebase",
version: "3.0.0"
});
});

app.get("/health", (req, res) => {
res.json({ status: "healthy" });
});

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
console.log("Terzex Chat running on port ${PORT}");
});
