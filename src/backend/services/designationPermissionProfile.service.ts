import { db, ensureAuth } from "../config/firebase-client.ts";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where } from "firebase/firestore";
import { DEFAULT_DESIGNATION_PROFILES, getDefaultPermissionsForDesignation } from "../../constants/designationProfiles.ts";
import { DesignationPermissionProfile, User } from "../../types.ts";
import { AuditService } from "./audit.service.ts";

function sanitizeForFirestore<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => (v === undefined ? null : v)));
}

export class DesignationPermissionProfileService {
  private static COLLECTION_NAME = "designationPermissionProfiles";

  /**
   * Initializes and returns all Designation Permission Profiles from Firestore.
   * If any of the standard 5 profiles are missing, seeds them with Version 1.0.
   */
  static async getAllProfiles(): Promise<DesignationPermissionProfile[]> {
    await ensureAuth();
    const colRef = collection(db, this.COLLECTION_NAME);
    const snapshot = await getDocs(colRef);
    
    const existingProfiles: DesignationPermissionProfile[] = [];
    const existingProfileIds = new Set<string>();

    snapshot.forEach(docSnap => {
      const data = docSnap.data() as DesignationPermissionProfile;
      existingProfiles.push({ ...data, id: docSnap.id });
      if (data.profileId) existingProfileIds.add(data.profileId);
      existingProfileIds.add(docSnap.id);
    });

    // Seed missing default profiles
    let seededAny = false;
    for (const defaultProfile of DEFAULT_DESIGNATION_PROFILES) {
      if (!existingProfileIds.has(defaultProfile.profileId)) {
        const newDocRef = doc(db, this.COLLECTION_NAME, defaultProfile.profileId);
        const profileData: DesignationPermissionProfile = {
          id: defaultProfile.profileId,
          profileId: defaultProfile.profileId,
          designationName: defaultProfile.designationName,
          departmentName: defaultProfile.departmentName,
          permissions: [...defaultProfile.permissions],
          version: defaultProfile.version,
          status: defaultProfile.status,
          effectiveDate: defaultProfile.effectiveDate,
          approvedBy: defaultProfile.approvedBy,
          approvedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          description: defaultProfile.description,
          history: [
            {
              version: defaultProfile.version,
              permissions: [...defaultProfile.permissions],
              changedBy: defaultProfile.approvedBy,
              changedAt: new Date().toISOString(),
              reason: "Initial baseline creation of standard Designation Default Permission Profile (v1.0)"
            }
          ]
        };

        await setDoc(newDocRef, sanitizeForFirestore(profileData));
        existingProfiles.push(profileData);
        seededAny = true;
      }
    }

    // Ensure profile-qa-chemist has product:submit, and other profiles do NOT have it
    for (const profile of existingProfiles) {
      if (profile.profileId === 'profile-qa-chemist' || profile.id === 'profile-qa-chemist') {
        if (!profile.permissions.includes('product:submit')) {
          const updatedPerms = [...profile.permissions, 'product:submit'];
          profile.permissions = updatedPerms;
          try {
            const docRef = doc(db, this.COLLECTION_NAME, profile.id);
            await updateDoc(docRef, { permissions: updatedPerms, updatedAt: new Date().toISOString() });
            console.log("[DesignationProfileService]: Added 'product:submit' to profile-qa-chemist in Firestore");
          } catch (e) {
            console.warn("Could not update profile-qa-chemist doc in Firestore:", e);
          }
        }
      } else {
        if (profile.permissions.includes('product:submit')) {
          const updatedPerms = profile.permissions.filter(p => p !== 'product:submit');
          profile.permissions = updatedPerms;
          try {
            const docRef = doc(db, this.COLLECTION_NAME, profile.id);
            await updateDoc(docRef, { permissions: updatedPerms, updatedAt: new Date().toISOString() });
            console.log(`[DesignationProfileService]: Removed 'product:submit' from non-QA Chemist profile ${profile.id}`);
          } catch (e) {
            console.warn(`Could not update profile ${profile.id} in Firestore:`, e);
          }
        }
      }
    }

    // Sync users collection to ensure QA Chemist users have product:submit and others do not
    try {
      const usersCol = collection(db, "users");
      const usersSnap = await getDocs(usersCol);
      for (const uDoc of usersSnap.docs) {
        const uData = uDoc.data();
        const desig = (uData.designation || uData.designationName || uData.role || "").toUpperCase().trim();
        const isQaChemist = desig.includes("CHEMIST") || desig === "QA CHEMIST" || (desig.includes("ANALYST") && desig.includes("QA"));
        const currentPerms: string[] = uData.permissions || [];
        const isSystemAdmin = uData.role === 'ADMIN' || (uData.email && uData.email.toLowerCase() === 'shakshay04@gmail.com');

        if (isQaChemist) {
          if (!currentPerms.includes('product:submit')) {
            const newPerms = [...currentPerms, 'product:submit'];
            await updateDoc(uDoc.ref, { permissions: newPerms, updatedAt: new Date().toISOString() });
            console.log(`[DesignationProfileService]: Synced 'product:submit' to QA Chemist user: ${uData.email || uDoc.id}`);
          }
        } else if (!isSystemAdmin) {
          if (currentPerms.includes('product:submit')) {
            const newPerms = currentPerms.filter(p => p !== 'product:submit');
            await updateDoc(uDoc.ref, { permissions: newPerms, updatedAt: new Date().toISOString() });
            console.log(`[DesignationProfileService]: Removed 'product:submit' from non-QA Chemist user: ${uData.email || uDoc.id}`);
          }
        }
      }
    } catch (uErr) {
      console.warn("[DesignationProfileService]: User permissions sync warning:", uErr);
    }

    // Sort order: QA Chemist, QA Incharge, QA Manager, Production Incharge, IT ADMIN
    const orderMap: { [key: string]: number } = {
      'profile-qa-chemist': 1,
      'profile-qa-incharge': 2,
      'profile-qa-manager': 3,
      'profile-production-incharge': 4,
      'profile-it-admin': 5
    };

    return existingProfiles.sort((a, b) => {
      const orderA = orderMap[a.profileId] || 99;
      const orderB = orderMap[b.profileId] || 99;
      return orderA - orderB;
    });
  }

  /**
   * Fetches a specific profile by ID or Designation Name
   */
  static async getProfileById(id: string): Promise<DesignationPermissionProfile | null> {
    await ensureAuth();
    const docRef = doc(db, this.COLLECTION_NAME, id);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return { id: snap.id, ...(snap.data() as any) };
    }
    
    // Fallback search in all profiles
    const all = await this.getAllProfiles();
    return all.find(p => p.id === id || p.profileId === id || p.designationName.toLowerCase() === id.toLowerCase()) || null;
  }

  /**
   * Retrieves profile matching a designation name
   */
  static async getProfileByDesignation(designationName: string): Promise<DesignationPermissionProfile | null> {
    if (!designationName) return null;
    const all = await this.getAllProfiles();
    const normalized = designationName.toUpperCase().trim();
    
    const matched = all.find(p => 
      p.designationName.toUpperCase() === normalized ||
      p.profileId.toUpperCase().includes(normalized.replace(/[^A-Z0-9]/g, '-'))
    );
    if (matched) return matched;

    // Fallback helper
    const fallback = getDefaultPermissionsForDesignation(designationName);
    if (fallback.profile) {
      return all.find(p => p.profileId === fallback.profile?.profileId) || null;
    }
    return null;
  }

  /**
   * Updates an existing designation profile with new permissions, incrementing version and writing audit history
   */
  static async updateProfile(
    profileId: string,
    newPermissions: string[],
    user: any,
    reason: string,
    metadata?: any
  ): Promise<DesignationPermissionProfile> {
    await ensureAuth();
    const docRef = doc(db, this.COLLECTION_NAME, profileId);
    const snap = await getDoc(docRef);
    
    if (!snap.exists()) {
      throw new Error(`Designation Permission Profile ${profileId} not found`);
    }

    const currentData = snap.data() as DesignationPermissionProfile;
    const oldVersion = currentData.version || "1.0";
    
    // Increment minor version: e.g. "1.0" -> "1.1", "1.1" -> "1.2"
    const versionParts = oldVersion.split('.');
    const major = parseInt(versionParts[0] || '1', 10);
    const minor = parseInt(versionParts[1] || '0', 10) + 1;
    const newVersion = `${major}.${minor}`;

    const historyEntry = {
      version: newVersion,
      permissions: [...newPermissions],
      changedBy: user?.displayName || user?.name || user?.email || "System Admin",
      changedAt: new Date().toISOString(),
      reason: reason || `Updated permissions for ${currentData.designationName}`
    };

    const updatedHistory = Array.isArray(currentData.history) ? [...currentData.history, historyEntry] : [historyEntry];

    const updatedProfile: DesignationPermissionProfile = {
      ...currentData,
      permissions: newPermissions,
      version: newVersion,
      updatedAt: new Date().toISOString(),
      history: updatedHistory
    };

    await updateDoc(docRef, sanitizeForFirestore({
      permissions: newPermissions,
      version: newVersion,
      updatedAt: new Date().toISOString(),
      history: updatedHistory
    }));

    // Log to System Admin Audit Trail
    await AuditService.logAction(
      user?.uid || "system",
      user?.email || "system@brims.com",
      "DESIGNATION_PERMISSION_PROFILE_UPDATED",
      profileId,
      "DESIGNATION_PERMISSION_PROFILE",
      currentData,
      updatedProfile,
      `Updated Designation Permission Profile for ${currentData.designationName} to Version ${newVersion}. Reason: ${reason}`,
      undefined,
      undefined,
      undefined,
      metadata?.ip || "unknown",
      metadata?.userAgent || "unknown"
    );

    return updatedProfile;
  }

  /**
   * Retrieves all users currently assigned to a specific designation
   */
  static async getAffectedUsers(designationName: string): Promise<{ users: User[]; totalCount: number; withOverridesCount: number }> {
    await ensureAuth();
    const usersCol = collection(db, "users");
    const snapshot = await getDocs(usersCol);
    
    const normalizedTarget = (designationName || "").toUpperCase().trim();
    const matchedUsers: User[] = [];

    snapshot.forEach(docSnap => {
      const u = docSnap.data() as User;
      const uDesig = (u.designation || u.designationName || u.role || "").toUpperCase().trim();
      if (uDesig === normalizedTarget || uDesig.includes(normalizedTarget) || normalizedTarget.includes(uDesig)) {
        matchedUsers.push({ ...u, uid: docSnap.id });
      }
    });

    const withOverridesCount = matchedUsers.filter(u => u.permissionSource === 'USER_OVERRIDE' || (u.permissionOverrides && Object.keys(u.permissionOverrides).length > 0)).length;

    return {
      users: matchedUsers,
      totalCount: matchedUsers.length,
      withOverridesCount
    };
  }

  /**
   * Synchronizes existing users of a designation to the active profile permissions
   */
  static async syncUsers(
    designationName: string,
    profileId: string,
    adminUser: any,
    reason: string,
    metadata?: any
  ): Promise<{ syncedCount: number; message: string }> {
    await ensureAuth();
    const profile = await this.getProfileById(profileId);
    if (!profile) {
      throw new Error(`Profile ${profileId} not found`);
    }

    const { users } = await this.getAffectedUsers(designationName);
    let syncedCount = 0;

    for (const u of users) {
      const userRef = doc(db, "users", u.uid);
      const oldPermissions = u.permissions || [];

      const updatePayload: Partial<User> = {
        permissions: [...profile.permissions],
        designationPermissionProfileId: profile.profileId,
        designationPermissionProfileVersion: profile.version,
        permissionSource: 'DESIGNATION_DEFAULT',
        permissionOverrides: {},
        permissionOverrideReason: undefined,
        updatedAt: new Date().toISOString()
      };

      await updateDoc(userRef, sanitizeForFirestore(updatePayload));
      syncedCount++;

      // Log in System Admin Audit Trail
      await AuditService.logAction(
        adminUser?.uid || "system",
        adminUser?.email || "system@brims.com",
        "SYNC_USER_PERMISSIONS",
        u.uid,
        "USER",
        { permissions: oldPermissions, permissionSource: u.permissionSource },
        { permissions: profile.permissions, permissionSource: 'DESIGNATION_DEFAULT', profileVersion: profile.version },
        `Synchronized user ${u.email} (${u.employeeId || u.displayName}) permissions to ${profile.designationName} Profile v${profile.version}. Reason: ${reason}`,
        undefined,
        undefined,
        undefined,
        metadata?.ip || "unknown",
        metadata?.userAgent || "unknown"
      );
    }

    return {
      syncedCount,
      message: `Successfully synchronized ${syncedCount} users to ${profile.designationName} Profile v${profile.version}`
    };
  }

  /**
   * Resets a specific user to their active designation's default profile permissions
   */
  static async resetUserToDesignationDefaults(
    userId: string,
    adminUser: any,
    reason: string,
    metadata?: any
  ): Promise<{ user: User; message: string }> {
    await ensureAuth();
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      throw new Error(`User with ID ${userId} not found`);
    }

    const userData = userSnap.data() as User;
    const desigName = userData.designation || userData.designationName || userData.role || "";
    const profile = await this.getProfileByDesignation(desigName);

    if (!profile) {
      throw new Error(`No Designation Permission Profile found for designation: ${desigName}`);
    }

    const oldPerms = userData.permissions || [];
    const updatedUserData: Partial<User> = {
      permissions: [...profile.permissions],
      designationPermissionProfileId: profile.profileId,
      designationPermissionProfileVersion: profile.version,
      permissionSource: 'DESIGNATION_DEFAULT',
      permissionOverrides: {},
      permissionOverrideReason: undefined,
      updatedAt: new Date().toISOString()
    };

    await updateDoc(userRef, sanitizeForFirestore(updatedUserData));

    await AuditService.logAction(
      adminUser?.uid || "system",
      adminUser?.email || "system@brims.com",
      "USER_PERMISSION_RESET_TO_DEFAULTS",
      userId,
      "USER",
      { permissions: oldPerms, source: userData.permissionSource },
      { permissions: profile.permissions, source: 'DESIGNATION_DEFAULT', profileVersion: profile.version },
      `Reset user ${userData.email} permissions to ${profile.designationName} defaults (v${profile.version}). Reason: ${reason}`,
      undefined,
      undefined,
      undefined,
      metadata?.ip || "unknown",
      metadata?.userAgent || "unknown"
    );

    return {
      user: { ...userData, ...updatedUserData } as User,
      message: `User reset to ${profile.designationName} Default Profile v${profile.version}`
    };
  }
}
