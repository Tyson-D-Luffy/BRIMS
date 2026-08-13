
import admin from "firebase-admin";
import fs from "fs";
import path from "path";

const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

// Force the project ID in the environment
process.env.GOOGLE_CLOUD_PROJECT = "850152913743";
process.env.GCLOUD_PROJECT = "850152913743";

console.log("--- Environment Check ---");
console.log("GOOGLE_CLOUD_PROJECT:", process.env.GOOGLE_CLOUD_PROJECT);
console.log("Config Project ID:", firebaseConfig.projectId);

const app = admin.initializeApp({
  projectId: "850152913743",
}, "test-app-850152913743");

console.log("Initialized App Project ID:", app.options.projectId);

async function test() {
  try {
    const auth = admin.auth(app);
    console.log("Attempting to list users (requires Identity Toolkit API)...");
    await auth.listUsers(1);
    console.log("Successfully listed users!");
  } catch (error) {
    console.error("Auth Test Failed:", error);
  }
}

test();
