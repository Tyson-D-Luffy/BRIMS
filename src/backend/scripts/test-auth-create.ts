import { adminAuth } from "../config/firebase-admin.ts";

async function testCreate() {
  try {
    console.log("Attempting to create test user in Firebase Auth...");
    const email = `test-auth-${Math.random().toString(36).substr(2, 5)}@example.com`;
    const userRecord = await adminAuth.createUser({
      email,
      password: "TestPassword123!",
      displayName: "Test User",
    });
    console.log("✅ Success! Created user:", userRecord.uid);
    
    // Clean up
    await adminAuth.deleteUser(userRecord.uid);
    console.log("Cleaned up test user.");
  } catch (error: any) {
    console.error("❌ Failed to create user via Admin SDK:");
    console.error("Code:", error.code);
    console.error("Message:", error.message);
  }
  process.exit(0);
}

testCreate();
