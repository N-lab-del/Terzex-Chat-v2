import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { AccessToken } from "livekit-server-sdk";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.json({
    app: "Terzex Chat",
    status: "online",
    version: "2.0.0"
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "healthy" });
});

app.post("/api/livekit/token", async (req, res) => {
  try {
    const { identity, room } = req.body;

    if (!identity || !room) {
      return res.status(400).json({
        error: "Identity and room are required"
      });
    }

    if (!process.env.LIVEKIT_API_KEY ||
        !process.env.LIVEKIT_API_SECRET ||
        !process.env.LIVEKIT_URL) {
      return res.status(500).json({
        error: "LiveKit configuration is missing"
      });
    }

    const token = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      { identity, ttl: "10m" }
    );

    token.addGrant({
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true
    });

    const jwt = await token.toJwt();

    res.json({
      token: jwt,
      serverUrl: process.env.LIVEKIT_URL
    });

  } catch (error) {
    console.error("Token error:", error);
    res.status(500).json({
      error: "Could not generate token"
    });
  }
});

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected successfully");

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Terzex Chat running on port ${PORT}`);
    });
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
}

startServer();
