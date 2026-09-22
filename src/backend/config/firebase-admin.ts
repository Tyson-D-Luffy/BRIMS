import admin from "firebase-admin";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const configPath = path.join(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

let app: admin.app.App;

if (!admin.apps.length) {
  try {
    // Attempt to initialize with service account key if available, or ADC
    const adminConfig: any = {
      projectId: firebaseConfig.projectId,
    };
    
    if (firebaseConfig.storageBucket) {
      adminConfig.storageBucket = firebaseConfig.storageBucket;
    }
    
    app = admin.initializeApp(adminConfig);
    console.log("Firebase Admin: Initialized successfully with projectId:", firebaseConfig.projectId, "and bucket:", firebaseConfig.storageBucket);
  } catch (error) {
    console.warn("Firebase Admin: Failed to initialize normally, trying minimal config:", error);
    app = admin.initializeApp();
  }
} else {
  app = admin.app();
}

export const adminAuth = getAuth(app);

// Use the specified database ID if provided, otherwise fallback to default
let db: admin.firestore.Firestore;
try {
  if (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== "(default)") {
    db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    console.log(`Firebase Admin: Initialized with databaseId: ${firebaseConfig.firestoreDatabaseId}`);
  } else {
    db = getFirestore(app);
    console.log("Firebase Admin: Initialized with default database");
  }
} catch (error) {
  console.error("Failed to initialize Firestore with databaseId, falling back to default:", error);
  db = getFirestore(app);
}

// Note: We avoid an initial connectivity check here because the Admin SDK may face 
// PERMISSION_DENIED errors if the environment's default service account lacks 
// access to the provisioned Firebase project. The app falls back to the Client SDK 
// (firebase-client.ts) with anonymous auth for Firestore access.

let isAdminHealthy = true;
let probePromise: Promise<boolean> | null = null;

export const markAdminUnhealthy = () => {
  if (isAdminHealthy) {
    isAdminHealthy = false;
    console.log("Firebase Admin: Permission Denied. Switching all services to Client SDK mode.");
  }
};

export const checkAdminHealth = async (): Promise<boolean> => {
  if (!isAdminHealthy) return false;
  if (probePromise) return probePromise;

  probePromise = (async () => {
    try {
      // Quick probe
      await db.collection("_health").doc("probe").get();
      return true;
    } catch (err: any) {
      if (err.code === 7 || err.message?.includes("PERMISSION_DENIED") || err.message?.includes("insufficient permissions")) {
        isAdminHealthy = false;
        console.log("Firebase Admin: Permission Denied. Switching all services to Client SDK mode.");
        return false;
      }
      return true;
    } finally {
      probePromise = null;
    }
  })();

  return probePromise;
};

import { getStorage } from "firebase-admin/storage";

export const adminDb = db;
export const adminStorage = getStorage(app);

export default admin;
