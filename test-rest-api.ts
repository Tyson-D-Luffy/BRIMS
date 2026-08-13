
import fs from "fs";
import path from "path";

const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
const API_KEY = firebaseConfig.apiKey;

async function test() {
  try {
    console.log("Testing REST API with API Key...");
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({
        email: `test-${Date.now()}@example.com`,
        password: "password123",
        returnSecureToken: true
      }),
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();
    console.log("REST API Response (signUp):", JSON.stringify(data, null, 2));

    if (data.idToken) {
      console.log("Testing Token Verification via REST API...");
      const lookupUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`;
      const lookupResponse = await fetch(lookupUrl, {
        method: 'POST',
        body: JSON.stringify({
          idToken: data.idToken
        }),
        headers: { 'Content-Type': 'application/json' }
      });
      const lookupData = await lookupResponse.json();
      console.log("REST API Response (lookup):", JSON.stringify(lookupData, null, 2));
    }
  } catch (error) {
    console.error("REST API Test Failed:", error);
  }
}

test();
