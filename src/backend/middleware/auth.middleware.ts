import { Request, Response, NextFunction } from "express";
import { adminAuth } from "../config/firebase-admin.ts";
import { db, ensureAuth } from "../config/firebase-client.ts";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { UnauthorizedError } from "../utils/errors.ts";
import jwt from "jsonwebtoken";
import { verifyTokenViaRest, hasRoleAccess } from "../utils/auth-utils.ts";

const getJwtSecret = () => process.env.JWT_SECRET || "brims-super-secret-key-123";

export const ALL_ADMIN_PERMISSIONS = [
  "user:create", "user:view", "user:edit", "user:delete",
  "batch:create", "batch:view", "batch:edit", "batch:sign", "batch:approve", "batch:preview",
  "batch_sheet_master:create", "batch_sheet_master:edit", "batch_sheet_master:submit", "batch_sheet_master:review", "batch_sheet_master:approve", "batch_sheet_master:reject", "batch_sheet_master:return", "batch_sheet_master:deactivate",
  "create:product", "edit:product", "product:submit", "product:review", "product:approve", "product:reject", "product:return", "product:deactivate",
  "lookup:create", "lookup:edit", "lookup:submit", "lookup:approve", "lookup:activate", "lookup:deactivate",
  "op:issued", "op:ready_for_handover", "op:production_in_progress", "op:ready_for_qa_review", "op:completed", "op:return_for_correction",
  "department:create", "department:submit", "department:approve", "designation:create", "designation:submit", "designation:approve",
  "batch_number:create", "batch_number:submit", "batch_number:approve", "format:create", "format:edit", "format:submit", "format:approve",
  "audit:view"
];

// Simple in-memory cache for user roles to improve performance
const roleCache = new Map<string, { 
  role: string; 
  allowedBranches?: string[]; 
  defaultBranch?: string; 
  multiBranchAccess?: boolean; 
  forcePasswordReset?: boolean; 
  sessionTimeout?: number; 
  permissions?: string[]; 
  employeeId?: string; 
  displayName?: string; 
  firestoreEmail?: string; 
  department?: string;
  username?: string;
  designation?: string;
  passwordExpiry?: string;
  passwordSetAt?: string;
  createdAt?: string;
  expires: number 
}>();
const activityCache = new Map<string, number>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Cleanup expired activity sessions every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [uid, lastActivity] of activityCache.entries()) {
    if (now - lastActivity > 60 * 60 * 1000) {
      activityCache.delete(uid);
    }
  }
}, 30 * 60 * 1000);

export interface AuthRequest extends Request {
  user?: {
    uid: string;
    email: string;
    role: string;
    email_verified?: boolean;
  };
  signatureInfo?: any;
  metadata?: any;
}

export const authenticateToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return next(new UnauthorizedError("Access token required"));
  }

  try {
    let decodedToken: any;

    // 1. Try verifying as custom JWT first
    try {
      if (token.split('.').length === 3) {
        // We suspect it might be our custom JWT
        const decoded = jwt.verify(token, getJwtSecret()) as any;
        
        // Dynamically inject full multi-branch admin permissions for the system admin email
        const isSystemAdmin = decoded.email && decoded.email.toLowerCase() === 'shakshay04@gmail.com';
        if (isSystemAdmin) {
          decoded.role = "ADMIN";
          decoded.allowedBranches = ["Masulkhana", "Baddi"];
          decoded.defaultBranch = "Masulkhana";
          decoded.multiBranchAccess = true;
          decoded.permissions = ALL_ADMIN_PERMISSIONS;
        }

        // If it succeeds, set user and move on
        req.user = decoded;
        activityCache.set(decoded.uid, Date.now());
        return next();
      }
    } catch (jwtError: any) {
      // If it looks like our token but verification failed (e.g. expired), 
      // we log it and proceed to see if it might be a valid Firebase token instead
      if (jwtError.name === 'TokenExpiredError') {
        console.log(`JWT Expired for token prefix: ${token.substring(0, 10)}`);
      }
    }

    // 2. If it wasn't a valid custom JWT, try as Firebase ID Token
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error("Malformed token structure");
      }

      let payload: any;
      let header: any;
      
      const decodeBase64 = (str: string) => {
        // Handle base64url padding
        const padded = str.replace(/-/g, '+').replace(/_/g, '/');
        const buffer = Buffer.from(padded, 'base64');
        return JSON.parse(buffer.toString());
      };

      try {
        header = decodeBase64(parts[0]);
        payload = decodeBase64(parts[1]);
      } catch (e) {
        console.log("Token decode error:", e);
        throw new Error("Failed to decode token parts");
      }
      
      // Distinguish between Firebase and Custom JWT
      const isFirebaseToken = payload.iss && payload.iss.startsWith('https://securetoken.google.com/');
      
      if (isFirebaseToken) {
        // Use Admin SDK only if it has a kid claim
        if (header.kid) {
          try {
            decodedToken = await adminAuth.verifyIdToken(token);
          } catch (adminError: any) {
            console.log(`Admin SDK verification failed for ${payload.sub.substring(0, 5)}..., falling back to REST:`, adminError.message);
            decodedToken = await verifyTokenViaRest(token);
          }
        } else {
          // Fallback to REST directly if no kid
          console.log("No kid claim, using REST for Firebase token verification");
          decodedToken = await verifyTokenViaRest(token);
        }
      } else {
        // If not standard Firebase token, attempt custom decoded payload recovery
        const fallbackDecoded = jwt.decode(token) as any;
        if (fallbackDecoded && (fallbackDecoded.uid || fallbackDecoded.sub || fallbackDecoded.email)) {
          decodedToken = {
            ...fallbackDecoded,
            uid: fallbackDecoded.uid || fallbackDecoded.sub,
            email: fallbackDecoded.email || ''
          };
          const isSystemAdmin = decodedToken.email && decodedToken.email.toLowerCase() === 'shakshay04@gmail.com';
          if (isSystemAdmin) {
            decodedToken.role = "ADMIN";
            decodedToken.allowedBranches = ["Masulkhana", "Baddi"];
            decodedToken.defaultBranch = "Masulkhana";
            decodedToken.multiBranchAccess = true;
            decodedToken.permissions = ALL_ADMIN_PERMISSIONS;
          }
        } else {
          console.log("Token is not a Firebase token and failed custom JWT verification.");
          throw new UnauthorizedError("Invalid or expired session token");
        }
      }
    } catch (firebaseError: any) {
      if (firebaseError instanceof UnauthorizedError) throw firebaseError;
      console.log("Token validation failed across all methods:", firebaseError.message);
      throw new UnauthorizedError("Invalid or expired token");
    }
      
    // 3. Post-verification logic (role checks, activity tracking)
    let lastActivity = activityCache.get(decodedToken.uid);
    const now = Date.now();

    if (!lastActivity) {
      lastActivity = now;
      activityCache.set(decodedToken.uid, now);
    }

    // Retrieve from cache to get session timeout parameters
    const cached = roleCache.get(decodedToken.uid) as any;
    const currentSessionTimeout = cached?.sessionTimeout || 30; // minutes

    if ((now - lastActivity) > currentSessionTimeout * 60 * 1000) {
      activityCache.delete(decodedToken.uid);
      return next(new UnauthorizedError("Session expired due to inactivity. Please re-authenticate."));
    }

    activityCache.set(decodedToken.uid, now);

    let role = "PRODUCTION_INCHARGE";
    let allowedBranches: string[] = ["Masulkhana"];
    let defaultBranch = "Masulkhana";
    let multiBranchAccess = false;
    let forcePasswordReset = false;
    let sessionTimeoutValue = 30;
    let permissions: string[] = [];

    let employeeId = "";
    let displayName = "";
    let firestoreEmail = "";
    let department = "";
    let username = "";
    let designation = "";
    let passwordExpiry = "90 Days";
    let passwordSetAt = "";
    let createdAt = "";

    if (cached && cached.expires > Date.now()) {
      role = cached.role;
      allowedBranches = cached.allowedBranches || ["Masulkhana"];
      defaultBranch = cached.defaultBranch || "Masulkhana";
      multiBranchAccess = !!cached.multiBranchAccess;
      forcePasswordReset = !!cached.forcePasswordReset;
      sessionTimeoutValue = cached.sessionTimeout || 30;
      permissions = cached.permissions || [];
      employeeId = cached.employeeId || "";
      displayName = cached.displayName || "";
      firestoreEmail = cached.firestoreEmail || "";
      department = cached.department || "";
      username = cached.username || "";
      designation = cached.designation || "";
      passwordExpiry = cached.passwordExpiry || "90 Days";
      passwordSetAt = cached.passwordSetAt || "";
      createdAt = cached.createdAt || "";
    } else {
      try {
        const isSystemAdmin = decodedToken.email && decodedToken.email.toLowerCase() === 'shakshay04@gmail.com';
        await ensureAuth();
        const userDoc = await getDoc(doc(db, "users", decodedToken.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          role = data?.functionalRole || data?.role || (isSystemAdmin ? "ADMIN" : "PRODUCTION_INCHARGE");
          allowedBranches = data?.allowedBranches || (isSystemAdmin ? ["Masulkhana", "Baddi"] : ["Masulkhana"]);
          defaultBranch = data?.defaultBranch || "Masulkhana";
          multiBranchAccess = data?.multiBranchAccess !== undefined ? !!data?.multiBranchAccess : (isSystemAdmin ? true : false);
          sessionTimeoutValue = data?.sessionTimeout || 30;
          permissions = (data?.permissions && data.permissions.length > 0) ? data.permissions : (isSystemAdmin || role === "ADMIN" ? ALL_ADMIN_PERMISSIONS : []);
          employeeId = data?.employeeId || (isSystemAdmin ? "Admin" : "");
          displayName = data?.displayName || (isSystemAdmin ? "Akshay Sharma" : "");
          firestoreEmail = data?.email || "";
          department = data?.department || (isSystemAdmin ? "IT" : "");
          username = data?.username || (isSystemAdmin ? "admin" : "");
          designation = data?.designation || "";
          passwordExpiry = data?.passwordExpiry || "90 Days";
          passwordSetAt = data?.passwordSetAt || data?.createdAt || "";
          createdAt = data?.createdAt || "";
          
          // Dynamically evaluate password expiry
          let baseForce = !!data?.forcePasswordReset;
          if (!baseForce && passwordExpiry !== "No Expiry") {
            const passwordSetAtDate = data?.passwordSetAt || data?.createdAt;
            if (passwordSetAtDate) {
              const daysLimit = parseInt(passwordExpiry, 10);
              if (!isNaN(daysLimit)) {
                const setDate = new Date(passwordSetAtDate);
                const diffTime = Math.abs(Date.now() - setDate.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays > daysLimit) {
                  baseForce = true;
                  const userRef = doc(db, "users", decodedToken.uid);
                  await setDoc(userRef, { forcePasswordReset: true }, { merge: true });
                }
              }
            }
          }
          forcePasswordReset = baseForce;
        } else if (isSystemAdmin) {
          role = "ADMIN";
          allowedBranches = ["Masulkhana", "Baddi"];
          defaultBranch = "Masulkhana";
          multiBranchAccess = true;
          forcePasswordReset = false;
          sessionTimeoutValue = 30;
          permissions = ALL_ADMIN_PERMISSIONS;
          employeeId = "Admin";
          displayName = "Akshay Sharma";
          firestoreEmail = decodedToken.email || "";
          department = "IT";
          username = "admin";
          designation = "System Administrator";
          passwordExpiry = "No Expiry";
          passwordSetAt = "";
          createdAt = "";
        }
      } catch (error) {
        const isSystemAdmin = decodedToken.email && decodedToken.email.toLowerCase() === 'shakshay04@gmail.com';
        role = isSystemAdmin ? "ADMIN" : "PRODUCTION_INCHARGE";
        if (role === "ADMIN") {
          allowedBranches = ["Masulkhana", "Baddi"];
          defaultBranch = "Masulkhana";
          multiBranchAccess = true;
          forcePasswordReset = false;
          permissions = ALL_ADMIN_PERMISSIONS;
          employeeId = "Admin";
          displayName = "Akshay Sharma";
          firestoreEmail = decodedToken.email || "";
          department = "IT";
          username = "admin";
          designation = "System Administrator";
          passwordExpiry = "No Expiry";
          passwordSetAt = "";
          createdAt = "";
        }
      }
      
      roleCache.set(decodedToken.uid, {
        role,
        allowedBranches,
        defaultBranch,
        multiBranchAccess,
        forcePasswordReset,
        sessionTimeout: sessionTimeoutValue,
        permissions,
        employeeId,
        displayName,
        firestoreEmail,
        department,
        username,
        designation,
        passwordExpiry,
        passwordSetAt,
        createdAt,
        expires: Date.now() + CACHE_TTL
      });
    }
    
    req.user = {
      uid: decodedToken.uid,
      email: firestoreEmail || decodedToken.email || "",
      role,
      displayName: displayName || decodedToken.displayName || decodedToken.name || "",
      employeeId: employeeId || decodedToken.employeeId || "",
      email_verified: decodedToken.email_verified,
      allowedBranches: allowedBranches || [],
      defaultBranch: defaultBranch || "Masulkhana",
      multiBranchAccess: !!multiBranchAccess,
      forcePasswordReset: !!forcePasswordReset,
      permissions: permissions || [],
      department: department || "",
      username: username || "",
      designation: designation || "",
      passwordExpiry: passwordExpiry || "90 Days",
      passwordSetAt: passwordSetAt || "",
      createdAt: createdAt || ""
    } as any;

    next();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      console.log("Auth Middleware Unauthorized:", error.message);
    } else {
      console.error("Auth Middleware Global Error:", error);
    }
    return next(error instanceof UnauthorizedError ? error : new UnauthorizedError("Invalid or expired token"));
  }
};

export const authorizeRoles = (allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const userEmail = req.user.email?.toLowerCase();
    const userRole = (req.user.role || "").toUpperCase();
    const isSystemAdmin = 
      userEmail === "shakshay04@gmail.com" || 
      userRole === "ADMIN" || 
      userRole.includes("ADMIN") || 
      userRole.includes("SYSTEM") ||
      userRole.includes("IT");

    if (isSystemAdmin) {
      return next();
    }

    if (!hasRoleAccess(req.user.role, allowedRoles)) {
      return res.status(403).json({ 
        success: false, 
        message: `Access denied. Required roles: ${allowedRoles.join(", ")}. Your role: ${req.user.role}` 
      });
    }

    next();
  };
};

export const authorizePermissions = (requiredPermissions: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const userEmail = req.user.email?.toLowerCase();
    const userRole = (req.user.role || "").toUpperCase();
    const isSystemAdmin = 
      userEmail === "shakshay04@gmail.com" || 
      userRole === "ADMIN" || 
      userRole.includes("ADMIN") || 
      userRole.includes("SYSTEM") ||
      userRole.includes("IT");

    if (isSystemAdmin) {
      return next();
    }

    const userPermissions = (req.user as any).permissions || [];
    const hasPermission = requiredPermissions.some(perm => userPermissions.includes(perm));

    if (!hasPermission) {
      return res.status(403).json({ 
        success: false, 
        message: `Access denied. You do not have the required permissions: ${requiredPermissions.join(", ")}` 
      });
    }

    next();
  };
};
