import { adminAuth } from "../config/firebase-admin.ts";
import { db, ensureAuth } from "../config/firebase-client.ts";
import crypto from "crypto";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, orderBy, limit } from "firebase/firestore";
import { AuditService } from "./audit.service.ts";
import { getDefaultPermissionsForDesignation } from "../../constants/designationProfiles.ts";
import firebaseConfig from "../../../firebase-applet-config.json" assert { type: "json" };

const API_KEY = firebaseConfig.apiKey;

export const mapFunctionalToBaseRole = (functionalRole: string): string => {
  return functionalRole;
};

export class UserService {
  private static identityDisabled = false;

  private static isIdentityToolkitDisabledError(message: string): boolean {
    const msg = String(message).toLowerCase();
    return (
      msg.includes("identitytoolkit") ||
      msg.includes("disabled") ||
      msg.includes("not been used") ||
      msg.includes("accessnotconfigured") ||
      msg.includes("permission_denied") ||
      msg.includes("not_found")
    );
  }

  private static async callIdentityApi(endpoint: string, body: any) {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=${API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();
    if (!response.ok) {
      const errMsg = data.error?.message || "";
      if (
        errMsg.includes("Identity Toolkit API has not been used") ||
        errMsg.includes("accessNotConfigured") ||
        errMsg.includes("disabled")
      ) {
        console.warn(`[USER_SERVICE] Identity API is unconfigured or disabled for this project: ${errMsg}`);
      } else {
        console.error(`Identity API Error (${endpoint}):`, data);
      }
      throw new Error(data.error?.message || `Identity API error: ${endpoint}`);
    }
    return data;
  }

  static async createUser(userData: any, adminUser: any, metadata?: any) {
    const { name, email, password, role } = userData;

    console.log(`[USER_SERVICE] Starting creation for: ${email}`);

    // 1. Check if user already exists in Firestore (with case-insensitive uniqueness checks for email, username, and employeeId)
    try {
      await ensureAuth();
      const allUsersSnap = await getDocs(collection(db, "users"));
      const targetEmail = (email || "").trim().toLowerCase();
      const targetUsername = (userData.username || "").trim().toLowerCase();
      const targetEmpId = (userData.employeeId || "").trim().toLowerCase();

      for (const uDoc of allUsersSnap.docs) {
        const u = uDoc.data();
        if (targetEmail && (u.email || "").trim().toLowerCase() === targetEmail) {
          throw new Error("User with this email already exists in Firestore database.");
        }
        if (targetUsername && (u.username || "").trim().toLowerCase() === targetUsername) {
          throw new Error(`User with username "${userData.username}" already exists in Firestore database.`);
        }
        if (targetEmpId && (u.employeeId || "").trim().toLowerCase() === targetEmpId) {
          throw new Error(`User with Employee ID "${userData.employeeId}" already exists in Firestore database.`);
        }
      }
    } catch (dbError: any) {
      console.error("[USER_SERVICE] Firestore check failed:", dbError.message);
      if (dbError.message.includes("exists")) throw dbError;
      throw new Error(`Database connection error during check: ${dbError.message}`);
    }

    let uid = "";
    let creationMethod = "";

    // If we already know the identity service is disabled or unconfigured, bypass to virtual user immediately
    if (UserService.identityDisabled) {
      console.log(`[USER_SERVICE] Identity Toolkit is unconfigured/disabled. Skipping Auth creation for ${email} and using virtual user.`);
      const cleanEmailHex = email.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10);
      uid = `virtual-${cleanEmailHex}-${Math.random().toString(36).substr(2, 9)}`;
      creationMethod = "Virtual DB Fallback (Platform Limit)";
    } else {
      // 2. Primary attempt: Use Firebase Admin SDK
      try {
        console.log("[USER_SERVICE] Attempting creation via Admin SDK...");
        const userRecord = await adminAuth.createUser({
          email,
          password,
          displayName: name,
        });
        uid = userRecord.uid;
        creationMethod = "Admin SDK";
        console.log(`[USER_SERVICE] User created via Admin SDK (UID: ${uid})`);
      } catch (adminError: any) {
        const adminMsg = adminError.message || "";
        if (UserService.isIdentityToolkitDisabledError(adminMsg)) {
          console.log(`[USER_SERVICE] Identity Toolkit is unconfigured/disabled. Switching to Virtual User fallback for ${email}.`);
          UserService.identityDisabled = true;
          const cleanEmailHex = email.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10);
          uid = `virtual-${cleanEmailHex}-${Math.random().toString(36).substr(2, 9)}`;
          creationMethod = "Virtual DB Fallback";
        } else {
          console.warn(`[USER_SERVICE] Admin SDK creation failed: ${adminError.code} - ${adminError.message}`);
          
          const isRegisteredAdmin = adminError.code === 'auth/email-already-exists' || adminMsg.includes("email-already-exists") || adminMsg.includes("EMAIL_EXISTS");
          
          if (isRegisteredAdmin) {
            console.warn("[USER_SERVICE] Email already registered. Attempting to retrieve existing user via Admin SDK...");
            try {
              const userRecord = await adminAuth.getUserByEmail(email);
              uid = userRecord.uid;
              creationMethod = "Admin SDK (Existing)";
              console.log(`[USER_SERVICE] Resolved existing user UID via Admin SDK (UID: ${uid})`);
            } catch (fetchError: any) {
              console.error("[USER_SERVICE] Failed to fetch existing user via Admin SDK:", fetchError.message);
              const cleanEmailHex = email.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10);
              uid = `virtual-${cleanEmailHex}-${Math.random().toString(36).substr(2, 9)}`;
              creationMethod = "Virtual DB Fallback (Auth Exist)";
            }
          } else {
            // 3. Fallback: Use REST API (Identity Toolkit)
            try {
              console.log("[USER_SERVICE] Attempting fallback via REST API...");
              const signUpData = await this.callIdentityApi('signUp', {
                email,
                password,
                displayName: name,
                returnSecureToken: false
              });
              uid = signUpData.localId;
              creationMethod = "REST API";
              console.log(`[USER_SERVICE] User created via REST API (UID: ${uid})`);
            } catch (restError: any) {
              const restMsg = restError.message || "";
              if (UserService.isIdentityToolkitDisabledError(restMsg)) {
                console.log(`[USER_SERVICE] Identity Toolkit is unconfigured/disabled (REST error). Switching to Virtual User fallback for ${email}.`);
                UserService.identityDisabled = true;
                const cleanEmailHex = email.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10);
                uid = `virtual-${cleanEmailHex}-${Math.random().toString(36).substr(2, 9)}`;
                creationMethod = "Virtual DB Fallback";
              } else {
                console.error("[USER_SERVICE] Both methods failed.", restError);
                const errorMsg = restError.message || "Unknown error";
                
                if (errorMsg.includes("EMAIL_EXISTS")) {
                  console.warn("[USER_SERVICE] Email already registered in REST signUp. Attempting to retrieve UID via sign-in...");
                  try {
                    const signInData = await this.callIdentityApi('signInWithPassword', {
                      email,
                      password,
                      returnSecureToken: true
                    });
                    uid = signInData.localId;
                    creationMethod = "REST API (Existing/Verified)";
                    console.log(`[USER_SERVICE] Resolved existing user UID via REST signIn (UID: ${uid})`);
                  } catch (signInError: any) {
                    console.warn("[USER_SERVICE] signInWithPassword failed. Using dynamic fallback UID:", signInError.message);
                    const cleanEmailHex = email.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10);
                    uid = `virtual-${cleanEmailHex}-${Math.random().toString(36).substr(2, 9)}`;
                    creationMethod = "Virtual DB Fallback (Auth Exist)";
                  }
                } else {
                  console.warn("[USER_SERVICE] General auth creation failure. Exercising sandbox virtual fallback for email:", email);
                  const cleanEmailHex = email.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10);
                  uid = `virtual-${cleanEmailHex}-${Math.random().toString(36).substr(2, 9)}`;
                  creationMethod = "Virtual DB Fallback (Auth Failure)";
                }
              }
            }
          }
        }
      }
    }

    const baseRole = mapFunctionalToBaseRole(role);
    const desigName = userData.designation || "";
    const defaultProfileInfo = getDefaultPermissionsForDesignation(desigName);
    
    // Determine effective permissions & source
    let effectivePermissions: string[] = userData.permissions;
    let permissionSource: 'DESIGNATION_DEFAULT' | 'USER_OVERRIDE' = 'DESIGNATION_DEFAULT';

    if (!effectivePermissions || effectivePermissions.length === 0) {
      effectivePermissions = defaultProfileInfo.permissions;
      permissionSource = 'DESIGNATION_DEFAULT';
    } else {
      // Check if matches default profile exactly
      const sortedDefault = [...defaultProfileInfo.permissions].sort().join(',');
      const sortedUser = [...effectivePermissions].sort().join(',');
      if (sortedDefault !== sortedUser) {
        permissionSource = 'USER_OVERRIDE';
      }
    }

    const newUser: any = {
      uid,
      employeeId: userData.employeeId,
      displayName: name,
      designation: desigName,
      designationName: desigName,
      designationId: userData.designationId || "",
      designationPermissionProfileId: defaultProfileInfo.profile?.profileId || "custom",
      designationPermissionProfileVersion: defaultProfileInfo.profile?.version || "1.0",
      permissionSource,
      permissionOverrides: userData.permissionOverrides || {},
      permissionOverrideReason: userData.permissionOverrideReason || "",
      department: userData.department,
      email,
      mobileNumber: userData.mobileNumber || "",
      status: userData.status || "active",
      
      username: userData.username,
      passwordExpiry: userData.passwordExpiry || "90 Days",
      forcePasswordReset: !!userData.forcePasswordReset,
      mfaEnabled: !!userData.mfaEnabled,
      
      role: baseRole,
      functionalRole: role,
      permissions: effectivePermissions,
      
      defaultBranch: userData.defaultBranch,
      allowedBranches: userData.allowedBranches || [],
      multiBranchAccess: !!userData.multiBranchAccess,
      
      esignatureRequiredApprovals: !!userData.esignatureRequiredApprovals,
      esignatureRequiredStatusChanges: !!userData.esignatureRequiredStatusChanges,
      
      sessionTimeout: userData.sessionTimeout || 30,
      maxLoginAttempts: userData.maxLoginAttempts || 5,
      accountLockAfterFailedAttempts: !!userData.accountLockAfterFailedAttempts,
      
      remarks: userData.remarks || "",
      effectiveFrom: userData.effectiveFrom || new Date().toISOString().split('T')[0],
      effectiveTo: userData.effectiveTo || null,
      
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      creationMethod
    };

    if (password) {
      newUser.hashedPassword = crypto.createHash("sha256").update(password).digest("hex");
    }

    try {
      await ensureAuth();
      await setDoc(doc(db, "users", uid), newUser);
      console.log(`[USER_SERVICE] Firestore document created for ${email}`);
    } catch (firestoreError: any) {
      console.error(`[USER_SERVICE] Firestore document creation failed for ${uid}:`, firestoreError.message);
      throw new Error(`User account was created (${creationMethod}), but saving data to Firestore failed: ${firestoreError.message}`);
    }

    // 4. Audit Log
    try {
      await AuditService.logAction(
        adminUser.uid,
        adminUser.email,
        "USER_CREATED",
        uid,
        "USER",
        null,
        newUser,
        `User ${email} created with designation '${desigName}' and role '${baseRole}'`,
        undefined,
        undefined,
        undefined,
        metadata?.ip,
        metadata?.userAgent
      );

      // Audit Designation Assignment
      if (desigName) {
        await AuditService.logAction(
          adminUser.uid,
          adminUser.email,
          "DESIGNATION_ASSIGNED",
          uid,
          "USER",
          null,
          {
            employeeId: userData.employeeId,
            designation: desigName,
            department: userData.department,
            branch: userData.defaultBranch,
            permissionProfile: defaultProfileInfo.profile?.profileId || "custom",
            profileVersion: defaultProfileInfo.profile?.version || "1.0",
            permissionsAssignedCount: effectivePermissions.length,
            permissionSource
          },
          `Designation '${desigName}' assigned to user ${email} with ${effectivePermissions.length} permissions (${permissionSource})`,
          undefined,
          undefined,
          undefined,
          metadata?.ip,
          metadata?.userAgent
        );
      }
    } catch (auditError) {
      console.error("[USER_SERVICE] Audit logging failed (non-blocking):", auditError);
    }

    return newUser;
  }

  static async getAllUsers(selectedBranch?: string) {
    try {
      await ensureAuth();
      const snapshot = await getDocs(collection(db, "users"));
      let users = snapshot.docs.map((docSnap: any) => docSnap.data());
      
      // Deduplicate users by uid or email to prevent duplicate keys from dual-seeded docs
      const uniqueMap = new Map<string, any>();
      users.forEach((u: any) => {
        const key = u.uid || u.email;
        if (key) {
          uniqueMap.set(key, u);
        }
      });
      users = Array.from(uniqueMap.values());

      if (selectedBranch) {
        users = users.filter((u: any) => {
          const allowed = u.allowedBranches || (u.defaultBranch ? [u.defaultBranch] : []);
          return allowed.includes(selectedBranch);
        });
      }
      return users;
    } catch (error) {
      console.error("UserService.getAllUsers Error:", error);
      return [];
    }
  }

  static async getUserById(id: string) {
    try {
      await ensureAuth();
      const userDoc = await getDoc(doc(db, "users", id));
      if (!userDoc.exists()) {
        throw new Error("User not found");
      }
      return userDoc.data();
    } catch (error) {
      console.error("UserService.getUserById Error:", error);
      throw error;
    }
  }

  static async updateUser(id: string, updateData: any, adminUser: any, metadata?: any) {
    await ensureAuth();
    const userRef = doc(db, "users", id);
    const userDocSnapshot = await getDoc(userRef);
    if (!userDocSnapshot.exists()) {
      throw new Error("User not found");
    }

    const oldValue = userDocSnapshot.data();
    const { password, ...otherData } = updateData;

    // Validate uniqueness if fields are updated and changed
    const allUsersSnap = await getDocs(collection(db, "users"));
    const targetEmail = otherData.email ? otherData.email.trim().toLowerCase() : "";
    const targetUsername = otherData.username ? otherData.username.trim().toLowerCase() : "";
    const targetEmpId = otherData.employeeId ? otherData.employeeId.trim().toLowerCase() : "";

    for (const uDoc of allUsersSnap.docs) {
      if (uDoc.id === id) continue;
      const u = uDoc.data();
      if (u.uid === id) continue;

      if (targetEmail && (u.email || "").trim().toLowerCase() === targetEmail && targetEmail !== (oldValue.email || "").trim().toLowerCase()) {
        throw new Error("User with this email already exists.");
      }
      if (targetUsername && (u.username || "").trim().toLowerCase() === targetUsername && targetUsername !== (oldValue.username || "").trim().toLowerCase()) {
        throw new Error(`User with username "${otherData.username}" already exists.`);
      }
      if (targetEmpId && (u.employeeId || "").trim().toLowerCase() === targetEmpId && targetEmpId !== (oldValue.employeeId || "").trim().toLowerCase()) {
        throw new Error(`User with Employee ID "${otherData.employeeId}" already exists.`);
      }
    }

    if (otherData.role) {
      otherData.functionalRole = otherData.role;
      otherData.role = mapFunctionalToBaseRole(otherData.role);
    }

    if (otherData.name) {
      otherData.displayName = otherData.name;
    }

    // Update Firebase Auth if needed (bypass for virtual users)
    if (!id.startsWith("virtual-") && !UserService.identityDisabled) {
      try {
        const authUpdates: any = {};
        const targetDisplayName = otherData.displayName || otherData.name || oldValue.displayName;
        if (targetDisplayName) authUpdates.displayName = targetDisplayName;
        if (password) authUpdates.password = password;
        if (otherData.status === 'inactive') authUpdates.disabled = true;
        if (otherData.status === 'active') authUpdates.disabled = false;

        if (Object.keys(authUpdates).length > 0) {
          try {
            await adminAuth.updateUser(id, authUpdates);
          } catch (adminError: any) {
            const adminMsg = adminError.message || "";
            if (UserService.isIdentityToolkitDisabledError(adminMsg)) {
              console.log(`[USER_SERVICE] Identity Toolkit is unconfigured/disabled. Skipping Auth sync for user ${id}, updating Firestore only.`);
              UserService.identityDisabled = true;
            } else {
              console.warn("UserService: Admin SDK auth update failed, trying REST fallback...", adminError.message);
              try {
                if (targetDisplayName || password) {
                  await this.callIdentityApi('update', {
                    localId: id,
                    displayName: targetDisplayName,
                    password: password
                  });
                }
                if (otherData.status === 'inactive' || otherData.status === 'active') {
                  await this.callIdentityApi('update', {
                    localId: id,
                    disableUser: otherData.status === 'inactive'
                  });
                }
              } catch (restErr: any) {
                const restMsg = restErr.message || "";
                if (UserService.isIdentityToolkitDisabledError(restMsg)) {
                  console.log(`[USER_SERVICE] Identity Toolkit is unconfigured/disabled (REST error). Skipping Auth update for user ${id}.`);
                  UserService.identityDisabled = true;
                } else {
                  console.warn("UserService: REST fallback auth update failed, skipping sync:", restErr.message);
                }
              }
            }
          }
        }
      } catch (e: any) {
        console.warn(`UserService: Non-blocking auth update skip for ${id}:`, e.message);
      }
    } else if (id.startsWith("virtual-")) {
      console.log(`[USER_SERVICE] Virtual user updated in database only: ${id}`);
    } else {
      console.log(`[USER_SERVICE] Identity Toolkit is unconfigured/disabled. Skipping Auth sync for user ${id}, updating Firestore only.`);
    }

    const updatedValue: any = {
      ...otherData,
      updatedAt: new Date().toISOString()
    };

    if (password) {
      updatedValue.hashedPassword = crypto.createHash("sha256").update(password).digest("hex");
    }

    if (otherData.status === 'active') {
      updatedValue.failedLoginAttempts = 0;
    }

    await updateDoc(userRef, updatedValue);

    await AuditService.logAction(
      adminUser.uid,
      adminUser.email,
      "USER_UPDATED",
      id,
      "USER",
      oldValue,
      updatedValue,
      otherData.changeReason || `User ${oldValue.email} updated`,
      undefined,
      undefined,
      undefined,
      metadata?.ip,
      metadata?.userAgent
    );

    // If designation changed, log DESIGNATION_CHANGED
    if (otherData.designation && otherData.designation !== oldValue.designation) {
      await AuditService.logAction(
        adminUser.uid,
        adminUser.email,
        "DESIGNATION_CHANGED",
        id,
        "USER",
        { designation: oldValue.designation, permissions: oldValue.permissions, permissionSource: oldValue.permissionSource },
        { designation: otherData.designation, permissions: updatedValue.permissions, permissionSource: updatedValue.permissionSource },
        `User ${oldValue.email} designation changed from '${oldValue.designation}' to '${otherData.designation}'`,
        undefined,
        undefined,
        undefined,
        metadata?.ip,
        metadata?.userAgent
      );
    }

    // If permission source is override or permissions changed
    if (otherData.permissionSource === 'USER_OVERRIDE' && otherData.permissionOverrideReason) {
      await AuditService.logAction(
        adminUser.uid,
        adminUser.email,
        "USER_PERMISSION_OVERRIDE_CHANGED",
        id,
        "USER",
        { permissions: oldValue.permissions, permissionSource: oldValue.permissionSource },
        { permissions: updatedValue.permissions, permissionSource: updatedValue.permissionSource, reason: otherData.permissionOverrideReason },
        `Individual permission override applied for user ${oldValue.email}. Reason: ${otherData.permissionOverrideReason}`,
        undefined,
        undefined,
        undefined,
        metadata?.ip,
        metadata?.userAgent
      );
    }

    return { id, ...updatedValue };
  }

  static async softDeleteUser(id: string, adminUser: any) {
    await ensureAuth();
    const userRef = doc(db, "users", id);
    const userDocSnapshot = await getDoc(userRef);
    if (!userDocSnapshot.exists()) {
      throw new Error("User not found");
    }

    const userData = userDocSnapshot.data();
    if (userData?.role === "ADMIN") {
      throw new Error("Cannot delete Admin user");
    }

    if (!id.startsWith("virtual-") && !UserService.identityDisabled) {
      try {
        await adminAuth.updateUser(id, { disabled: true });
      } catch (e: any) {
        const adminMsg = e.message || "";
        if (UserService.isIdentityToolkitDisabledError(adminMsg)) {
          console.log(`[USER_SERVICE] Identity Toolkit is unconfigured/disabled. Skipping Auth disable for user ${id}, updating Firestore only.`);
          UserService.identityDisabled = true;
        } else {
          try {
            await this.callIdentityApi('update', { localId: id, disableUser: true });
          } catch (restErr: any) {
            console.warn("Auth disable failed:", restErr.message);
          }
        }
      }
    } else if (id.startsWith("virtual-")) {
      console.log(`[USER_SERVICE] Virtual user soft-deleted from database only: ${id}`);
    } else {
      console.log(`[USER_SERVICE] Identity Toolkit is unconfigured/disabled. Skipping Auth disable for user ${id}, updating Firestore only.`);
    }

    await updateDoc(userRef, { status: "inactive", updatedAt: new Date().toISOString() });

    await AuditService.logAction(
      adminUser.uid,
      adminUser.email,
      "DELETE_USER",
      id,
      "USER",
      { status: "active" },
      { status: "inactive" }
    );

    return { id, status: "inactive" };
  }

  static async assignRoles(id: string, roles: string[], adminUser: any) {
    await ensureAuth();
    const userRef = doc(db, "users", id);
    const userDocSnapshot = await getDoc(userRef);
    if (!userDocSnapshot.exists()) {
      throw new Error("User not found");
    }

    const oldValue = userDocSnapshot.data();
    const newRole = roles[0];
    
    await updateDoc(userRef, { role: newRole, updatedAt: new Date().toISOString() }); 

    await AuditService.logAction(
      adminUser.uid,
      adminUser.email,
      "ASSIGN_ROLE",
      id,
      "USER",
      { role: oldValue?.role },
      { role: newRole }
    );

    return { id, role: newRole };
  }

  static async logLogin(user: any, metadata?: any) {
    await AuditService.logAction(
      user.uid,
      user.email,
      "LOGIN",
      user.uid,
      "USER",
      null,
      { loginAt: new Date().toISOString() },
      "User logged in",
      undefined,
      undefined,
      undefined,
      metadata?.ip,
      metadata?.userAgent
    );
  }

  static async runEmployeeIdMigration() {
    try {
      await ensureAuth();
      const usersRef = collection(db, "users");
      const querySnapshot = await getDocs(usersRef);
      const existingIds = new Set<string>();

      querySnapshot.forEach(docSnap => {
        const id = docSnap.data().employeeId;
        if (id) {
          existingIds.add(String(id).trim());
        }
      });

      let count = 101;
      for (const docSnap of querySnapshot.docs) {
        const data = docSnap.data();
        if (!data.employeeId) {
          let generatedId = `EMP${String(count).padStart(5, '0')}`;
          while (existingIds.has(generatedId)) {
            count++;
            generatedId = `EMP${String(count).padStart(5, '0')}`;
          }
          existingIds.add(generatedId);
          count++;

          const userDocRef = doc(db, "users", docSnap.id);
          await updateDoc(userDocRef, {
            employeeId: generatedId,
            updatedAt: new Date().toISOString()
          });
          console.log(`[MIGRATION-CLIENT] Migrated user ${data.email || docSnap.id} to Employee ID: ${generatedId}`);
        }
      }
      console.log("BRIMS User Employee ID automatic migration completed successfully via Client SDK.");
    } catch (e: any) {
      console.warn("Client SDK migration notice:", e.message);
    }
  }
}
