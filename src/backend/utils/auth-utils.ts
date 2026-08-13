
import fs from "fs";
import path from "path";
import { UnauthorizedError } from "./errors.ts";

const configPath = path.join(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
const API_KEY = firebaseConfig.apiKey;

export async function verifyTokenViaRest(idToken: string) {
  console.log("verifyTokenViaRest: Starting lookup for token prefix:", idToken.substring(0, 10));
  
  if (!API_KEY) {
    console.error("verifyTokenViaRest: API_KEY is missing from config!");
    throw new Error("Server configuration error: Firebase API Key missing");
  }

  const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ idToken }),
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data: any = await response.json();
    
    if (!response.ok) {
      console.log("verifyTokenViaRest: API Error response status:", response.status);
      console.log("verifyTokenViaRest: Error details:", JSON.stringify(data));
      
      if (data.error?.message === "INVALID_ID_TOKEN" || data.error?.message === "TOKEN_EXPIRED") {
        throw new UnauthorizedError(`Firebase Token Error: ${data.error.message}`);
      }
      
      throw new Error(data.error?.message || `Invalid token via REST API (${response.status})`);
    }

    if (!data.users || data.users.length === 0) {
      console.log("verifyTokenViaRest: No user found in response, despite 200 OK");
      throw new UnauthorizedError("No user found for this token");
    }
    
    const user = data.users[0];
    console.log("verifyTokenViaRest: Success! Found user UID:", user.localId, "Email:", user.email);
    return {
      uid: user.localId,
      email: user.email,
      email_verified: user.emailVerified,
      name: user.displayName || "",
      auth_time: Math.floor(Date.now() / 1000)
    };
  } catch (error: any) {
    if (error instanceof UnauthorizedError) {
      console.log("verifyTokenViaRest Exception (Unauthorized):", error.message);
    } else {
      console.error("verifyTokenViaRest Exception:", error.message);
    }
    throw error;
  }
}

export function getEquivalentBackendRoles(userRole: string): string[] {
  const role = userRole ? userRole.trim() : "";
  const normalized = role.toUpperCase().replace(/_/g, " ");
  
  if (normalized.includes("ADMIN") || normalized.includes("SYSTEM") || normalized.includes("IT")) {
    return ["ADMIN", "QA", "PRODUCTION_MANAGER", "OPERATOR"];
  }
  
  if (normalized.includes("QA") || normalized.includes("QC") || normalized.includes("QUALITY") || normalized.includes("CONTROL") || normalized.includes("AUDIT")) {
    return ["QA", "OPERATOR"];
  }
  
  if (normalized.includes("PRODUCTION") || normalized.includes("MANAGER") || normalized.includes("HEAD") || normalized.includes("SUPERVISOR") || normalized.includes("INCHARGE") || normalized.includes("CHIEF") || normalized.includes("DIRECTOR") || normalized.includes("LEAD")) {
    return ["PRODUCTION_MANAGER", "OPERATOR"];
  }
  
  return ["OPERATOR"];
}

export function hasRoleAccess(userRole: string, allowedRoles: string[]): boolean {
  if (!userRole) return false;
  
  const equivalentBackendRoles = getEquivalentBackendRoles(userRole);
  
  return allowedRoles.some(allowedRole => {
    const allowedUpper = allowedRole.toUpperCase();
    return (
      userRole === allowedRole ||
      userRole.toUpperCase() === allowedUpper ||
      equivalentBackendRoles.includes(allowedUpper)
    );
  });
}

