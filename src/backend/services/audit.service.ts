import { db, ensureAuth } from "../config/firebase-client.ts";
import { adminDb, checkAdminHealth } from "../config/firebase-admin.ts";
import { collection, doc, addDoc, getDoc, getDocs, query, where, orderBy, limit as firestoreLimit } from "firebase/firestore";

export class AuditService {
  /**
   * Helper to calculate the difference between two objects.
   */
  private static calculateDiff(oldVal: any, newVal: any) {
    if (!oldVal) return { old: null, new: newVal };
    if (!newVal) return { old: oldVal, new: null };

    const diff: Record<string, { old: any; new: any }> = {};
    const allKeys = new Set([...Object.keys(oldVal), ...Object.keys(newVal)]);

    for (const key of allKeys) {
      if (key === 'updatedAt' || key === 'createdAt') continue;

      const oldK = oldVal[key];
      const newK = newVal[key];

      if (JSON.stringify(oldK) !== JSON.stringify(newK)) {
        diff[key] = {
          old: oldK === undefined ? null : oldK,
          new: newK === undefined ? null : newK
        };
      }
    }

    return Object.keys(diff).length > 0 ? diff : null;
  }

  private static deepSanitize(val: any): any {
    if (val === undefined) return null;
    if (val === null) return null;
    if (Array.isArray(val)) {
      return val.map(item => this.deepSanitize(item));
    }
    if (typeof val === 'object') {
      if (val instanceof Date) {
        return val.toISOString();
      }
      const cleaned: any = {};
      const keys = Object.keys(val);
      if (keys.length === 0 && val.constructor && val.constructor.name !== 'Object') {
        return val;
      }
      for (const key of keys) {
        cleaned[key] = this.deepSanitize(val[key]);
      }
      return cleaned;
    }
    return val;
  }

  /**
   * Determines if the given action/entityType corresponds to a System Administration or Security audit event.
   */
  public static isSystemAdminAction(action: string, entityType: string): boolean {
    const actionUpper = (action || '').toUpperCase();
    const entityUpper = (entityType || '').toUpperCase();

    // Specific system admin actions list
    const adminActions = [
      'LOGIN',
      'LOGOUT',
      'FAILED_LOGIN',
      'ACCOUNT_LOCK',
      'ACCOUNT_UNLOCK',
      'SESSION_TIMEOUT',
      'PASSWORD_RESET',
      'PASSWORD_CHANGE',
      'USER_CREATE',
      'USER_CREATED',
      'USER_UPDATE',
      'USER_UPDATED',
      'USER_ACTIVATE',
      'USER_DEACTIVATE',
      'ROLE_CREATE',
      'ROLE_UPDATE',
      'PERMISSION_MODIFY',
      'SETTINGS_CHANGE',
      'SECURITY_POLICY_UPDATE',
      'SESSION_POLICY_UPDATE',
      'BATCH_RULES_CHANGE',
      'UNAUTHORIZED_ACCESS',
      'PERMISSION_DENIED',
      'SIGN_IN',
      'SIGN_OUT'
    ];

    const adminEntities = [
      'USER',
      'ROLE',
      'PERMISSION',
      'SECURITY_POLICY',
      'SETTINGS',
      'POLICY',
      'ACCESS_CONTROL',
      'SYSTEM_CONFIG'
    ];

    if (adminEntities.includes(entityUpper)) {
      return true;
    }

    if (adminActions.some(term => actionUpper.includes(term))) {
      return true;
    }

    // Special case for API URLs or specific controllers routing
    if (entityUpper === 'API_CALL' && (actionUpper.includes('/USERS') || actionUpper.includes('/ROLES') || actionUpper.includes('/PERMISSIONS') || actionUpper.includes('/AUTH'))) {
      return true;
    }

    return false;
  }

  /**
   * Logs an action to either batch_process_audit_logs or system_admin_audit_logs.
   */
  static async logAction(
    userId: string, 
    userEmail: string, 
    action: string, 
    entityId: string, 
    entityType: string, 
    oldValue?: any, 
    newValue?: any,
    changeReason?: string,
    transaction?: any,
    signatureId?: string,
    signatureMeaning?: string,
    ipAddress?: string,
    userAgent?: string,
    selectedBranch?: string,
    affectedRecordBranch?: string,
    userRole?: string,
    userName?: string
  ) {
    const diff = this.calculateDiff(oldValue, newValue);

    // Determine target collection table
    const isSystemAdmin = this.isSystemAdminAction(action, entityType);
    const targetCollection = isSystemAdmin ? "system_admin_audit_logs" : "batch_process_audit_logs";

    let finalPerformedBy = userEmail || 'system';
    if (finalPerformedBy.includes('@') && !finalPerformedBy.includes(' - ')) {
      finalPerformedBy = finalPerformedBy.split('@')[0];
    }
    let finalUserName = userName || (newValue?.displayName || newValue?.name || oldValue?.displayName || oldValue?.name || userEmail || 'System');
    let finalRole = userRole || (newValue?.functionalRole || newValue?.role || oldValue?.functionalRole || oldValue?.role || '');

    if (userEmail && userEmail.toLowerCase() === 'shakshay04@gmail.com') {
      finalPerformedBy = "Admin - admin";
      finalUserName = "admin";
      finalRole = "ADMIN";
    }

    if (userId && userId !== 'system' && userId !== 'system@internal' && !transaction) {
      try {
        const userRef = doc(db, "users", userId);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const empId = userData.employeeId || "Admin";
          const uName = userData.username || userData.displayName || userData.name || (userData.email ? userData.email.split('@')[0] : 'user');
          finalPerformedBy = `${empId} - ${uName}`;
          finalUserName = uName;
          if (userData.functionalRole || userData.role) {
            finalRole = userData.functionalRole || userData.role;
          }
        }
      } catch (err) {
        console.warn("AuditService: Non-blocking user lookup failed:", err);
      }
    }

    // Fallback lookup by userEmail if finalRole is empty or default PRODUCTION_INCHARGE (skip inside transaction to prevent transaction conflict)
    if (!transaction && (!finalRole || finalRole === 'PRODUCTION_INCHARGE' || finalRole === 'OPERATOR') && userEmail && userEmail !== 'system@internal') {
      try {
        const q = query(collection(db, "users"), where("email", "==", userEmail));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const uData = snap.docs[0].data();
          if (uData.functionalRole || uData.role) {
            finalRole = uData.functionalRole || uData.role;
          }
        }
      } catch (e) {
        // ignore
      }
    }

    if (!finalRole) {
      finalRole = (userEmail && userEmail.toLowerCase() === 'shakshay04@gmail.com') ? "ADMIN" : "USER";
    }

    // Standardized common audit fields conforming to FDA 21 CFR Part 11 and GAMP
    const logEntry: any = {
      auditId: '', // To be filled/updated with document ID
      module: entityType || 'SYSTEM',
      action,
      performedBy: finalPerformedBy,
      userId: userId || 'system',
      userEmail: userEmail || 'system@internal',
      userName: finalUserName,
      role: finalRole,
      functionalRole: finalRole,
      branch: selectedBranch || (newValue?.branch || oldValue?.branch || 'Masulkhana'),
      selectedBranch: selectedBranch || (newValue?.branch || oldValue?.branch || 'Masulkhana'),
      affectedRecordBranch: affectedRecordBranch || (newValue?.branch || oldValue?.branch || selectedBranch || 'Masulkhana'),
      timestamp: new Date().toISOString(),
      oldValue: oldValue || null,
      newValue: newValue || null,
      diff,
      operation: !oldValue ? 'CREATE' : !newValue ? 'DELETE' : 'UPDATE',
      changeReason: changeReason || null,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      sessionId: newValue?.sessionId || oldValue?.sessionId || 'SESSION-' + (userId || 'system').slice(0, 5) + '-' + new Date().getDate(),
      signatureId: signatureId || null,
      signatureMeaning: signatureMeaning || null,
      entityId: entityId || 'N/A',
      entityType: entityType || 'SYSTEM'
    };

    // Strip sensitive passwords / credentials for compliance
    if (logEntry.oldValue && logEntry.oldValue.password) {
      logEntry.oldValue = { ...logEntry.oldValue, password: '********' };
    }
    if (logEntry.newValue && logEntry.newValue.password) {
      logEntry.newValue = { ...logEntry.newValue, password: '********' };
    }

    // Capture oldDepartment and newDepartment for 21 CFR Part 11 / GAMP compliance
    if (oldValue && oldValue.department) {
      logEntry.oldDepartment = oldValue.department;
    }
    if (newValue && newValue.department) {
      logEntry.newDepartment = newValue.department;
    }

    // Capture Batch Process & Print specific metadata on the top-level log document
    if (newValue) {
      if (newValue.batchNumber) logEntry.batchNumber = newValue.batchNumber;
      if (newValue.requestId) logEntry.requestId = newValue.requestId;
      if (newValue.batchSheetRequestId) logEntry.batchSheetRequestId = newValue.batchSheetRequestId;
      if (newValue.sheetId) logEntry.sheetId = newValue.sheetId;
      if (newValue.printJobId) logEntry.printJobId = newValue.printJobId;
      if (newValue.attemptNumber !== undefined) logEntry.attemptNumber = newValue.attemptNumber;
      if (newValue.requestedPages) logEntry.requestedPages = newValue.requestedPages;
      if (newValue.auditEventId) logEntry.auditEventId = newValue.auditEventId;
    } else if (oldValue) {
      if (oldValue.batchNumber) logEntry.batchNumber = oldValue.batchNumber;
      if (oldValue.requestId) logEntry.requestId = oldValue.requestId;
      if (oldValue.batchSheetRequestId) logEntry.batchSheetRequestId = oldValue.batchSheetRequestId;
      if (oldValue.sheetId) logEntry.sheetId = oldValue.sheetId;
    }

    // Clean up any undefined values recursively to avoid Firestore errors
    Object.keys(logEntry).forEach(key => {
      logEntry[key] = this.deepSanitize(logEntry[key]);
    });

    try {
      if (transaction) {
        // DETECT TRANSACTION TYPE FOR THE CHOSEN SEPARATE COLLECTION
        try {
          // Client SDK pattern
          const docRef = doc(collection(db, targetCollection));
          logEntry.auditId = docRef.id;
          transaction.set(docRef, logEntry);
        } catch (clientErr: any) {
          try {
            // Attempt Admin SDK fallback
            if (await checkAdminHealth()) {
              const logRef = adminDb.collection(targetCollection).doc();
              logEntry.auditId = logRef.id;
              transaction.set(logRef, logEntry);
            } else {
              throw new Error("ADMIN_NOT_HEALTHY");
            }
          } catch (adminErr: any) {
            if (adminErr.message !== "ADMIN_NOT_HEALTHY") {
              console.log(`AuditService: Transaction log Admin fallback skipped for ${targetCollection}: ${adminErr.message}`);
            }
            
            // Fire and forget background write outside transaction
            (async () => {
              try {
                await ensureAuth();
                const { addDoc: clientAddDoc, collection: clientCollection } = await import("firebase/firestore");
                const docRef = await clientAddDoc(clientCollection(db, targetCollection), logEntry);
                // Try updating with generated id if local client works
              } catch (clientBgErr: any) {
                console.error(`AuditService: Background log failed for ${targetCollection}. FINAL DATA LOSS PREVENTED by printing to console:`, JSON.stringify(logEntry));
              }
            })();
          }
        }
      } else {
        // Standalone write
        try {
          if (await checkAdminHealth()) {
            const docRef = adminDb.collection(targetCollection).doc();
            logEntry.auditId = docRef.id;
            await docRef.set(logEntry);
          } else {
            throw new Error("ADMIN_NOT_HEALTHY");
          }
        } catch (adminError: any) {
          try {
            if (adminError.message !== "ADMIN_NOT_HEALTHY") {
              console.log(`AuditService: Admin SDK log skipped for ${targetCollection}, using Client SDK fallback...`);
            }
            await ensureAuth();
            const clientDocRef = doc(collection(db, targetCollection));
            logEntry.auditId = clientDocRef.id;
            const { setDoc: clientSetDoc } = await import("firebase/firestore");
            await clientSetDoc(clientDocRef, logEntry);
          } catch (clientError: any) {
            console.error(`AuditService: Both SDKs failed to log action in ${targetCollection}.`, clientError.message);
          }
        }
      }

      console.log(`[AUDIT - ${targetCollection}]: ${action} on ${entityType}:${entityId} by ${userEmail}`);
    } catch (criticalError: any) {
      console.error("AuditService.logAction CRITICAL CATCH-ALL (preventing backend crash):", criticalError.message);
    }
  }

  /**
   * Fetches audit logs from a specified collection with filters.
   */
  static async getLogsFromCollection(collectionName: "batch_process_audit_logs" | "system_admin_audit_logs", filters: any) {
    try {
      const { userId, action, entityType, entityId, startDate, endDate, limit: limitVal = 100, selectedBranch, userEmail, batchNumber, requestId, sheetId, search } = filters;
      let logs: any[] = [];

      try {
        if (await checkAdminHealth()) {
          let queryRef: any = adminDb.collection(collectionName);
          if (selectedBranch) {
            queryRef = queryRef.where("selectedBranch", "==", selectedBranch);
          }
          const snapshot = await queryRef
            .limit(2000)
            .get();
          logs = snapshot.docs.map((docSnap: any) => ({ id: docSnap.id, ...docSnap.data() }));
          // Sort in-memory to avoid index overhead/errors
          logs.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
        } else {
          throw new Error("Admin SDK is not healthy");
        }
      } catch (adminErr: any) {
        console.log(`AuditService.getLogsFromCollection: Switching to fallback client JSSDK. Details: ${adminErr.message}`);
        await ensureAuth();
        let q = collection(db, collectionName) as any;
        if (selectedBranch) {
          q = query(q, where("selectedBranch", "==", selectedBranch));
        }
        q = query(q, firestoreLimit(2000));
        const snapshot = await getDocs(q);
        logs = snapshot.docs.map((docSnap: any) => ({ id: docSnap.id, ...docSnap.data() }));
        // Sort in-memory
        logs.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
      }

      // Filtering in-memory to keep index-silent and GAMP compliant
      if (selectedBranch) {
        logs = logs.filter((log: any) => (log.selectedBranch || log.branch || "Masulkhana") === selectedBranch);
      }
      if (userId) {
        logs = logs.filter((log: any) => log.userId === userId);
      }
      if (userEmail) {
        logs = logs.filter((log: any) => (log.userEmail || '').toLowerCase().includes(userEmail.toLowerCase()));
      }
      if (action && action !== 'ALL') {
        logs = logs.filter((log: any) => log.action === action);
      }
      if (entityType && entityType !== 'ALL') {
        logs = logs.filter((log: any) => (log.entityType === entityType || log.module === entityType));
      }
      if (entityId) {
        logs = logs.filter((log: any) => (log.entityId || '').toLowerCase().includes(entityId.toLowerCase()));
      }
      if (batchNumber) {
        logs = logs.filter((log: any) => (log.batchNumber || log.entityId || '').toLowerCase().includes(batchNumber.toLowerCase()));
      }
      if (requestId) {
        logs = logs.filter((log: any) => (log.requestId || log.batchSheetRequestId || log.entityId || '').toLowerCase().includes(requestId.toLowerCase()));
      }
      if (sheetId) {
        logs = logs.filter((log: any) => (log.sheetId || log.entityId || '').toLowerCase().includes(sheetId.toLowerCase()));
      }
      if (search) {
        const searchLower = search.toLowerCase();
        logs = logs.filter((log: any) => {
          return (
            (log.action || '').toLowerCase().includes(searchLower) ||
            (log.entityId || '').toLowerCase().includes(searchLower) ||
            (log.batchNumber || '').toLowerCase().includes(searchLower) ||
            (log.requestId || '').toLowerCase().includes(searchLower) ||
            (log.changeReason || '').toLowerCase().includes(searchLower) ||
            (log.performedBy || '').toLowerCase().includes(searchLower) ||
            (log.userEmail || '').toLowerCase().includes(searchLower) ||
            (log.module || '').toLowerCase().includes(searchLower)
          );
        });
      }
      if (startDate) {
        logs = logs.filter((log: any) => log.timestamp >= startDate);
      }
      if (endDate) {
        logs = logs.filter((log: any) => log.timestamp <= endDate);
      }

      return logs.slice(0, Number(limitVal));
    } catch (error) {
      console.error(`AuditService.getLogsFromCollection for ${collectionName} Error:`, error);
      return [];
    }
  }

  /**
   * Fetches batch process audit logs.
   */
  static async getBatchLogs(filters: any) {
    return this.getLogsFromCollection("batch_process_audit_logs", filters);
  }

  /**
   * Fetches system admin/security audit logs.
   */
  static async getSystemAdminLogs(filters: any) {
    return this.getLogsFromCollection("system_admin_audit_logs", filters);
  }

  /**
   * Safe getter by ID checking both collections.
   */
  static async getLogById(id: string) {
    try {
      if (await checkAdminHealth()) {
        // Check batch collection first
        const batchDoc = await adminDb.collection("batch_process_audit_logs").doc(id).get();
        if (batchDoc.exists) {
          return { id: batchDoc.id, ...batchDoc.data() };
        }

        // Check system admin collection
        const adminDoc = await adminDb.collection("system_admin_audit_logs").doc(id).get();
        if (adminDoc.exists) {
          return { id: adminDoc.id, ...adminDoc.data() };
        }

        // Check legacy collection just in case
        const legacyDoc = await adminDb.collection("audit_trail").doc(id).get();
        if (legacyDoc.exists) {
          return { id: legacyDoc.id, ...legacyDoc.data() };
        }
      } else {
        throw new Error("Admin SDK is not healthy");
      }
    } catch (adminErr: any) {
      console.log(`AuditService.getLogById: Switching to fallback Client SDK lookup. Details: ${adminErr.message}`);
      await ensureAuth();
      
      // Check batch collection first
      const batchDoc = await getDoc(doc(db, "batch_process_audit_logs", id));
      if (batchDoc.exists()) {
        return { id: batchDoc.id, ...batchDoc.data() };
      }

      // Check system admin collection
      const adminDoc = await getDoc(doc(db, "system_admin_audit_logs", id));
      if (adminDoc.exists()) {
        return { id: adminDoc.id, ...adminDoc.data() };
      }

      // Check legacy collection just in case
      const legacyDoc = await getDoc(doc(db, "audit_trail", id));
      if (legacyDoc.exists()) {
        return { id: legacyDoc.id, ...legacyDoc.data() };
      }
    }

    throw new Error("Audit log not found across all collections");
  }

  /**
   * Migrates legacy logs from audit_trail into separated collections.
   */
  static async migrateExistingLogs() {
    try {
      console.log("AuditService: Running legacy logs migration check...");
      await ensureAuth();
      const snapshot = await getDocs(collection(db, "audit_trail"));
      if (snapshot.empty) {
        console.log("AuditService: No legacy logs found to migrate.");
        return { success: true, migratedCount: 0 };
      }

      console.log(`AuditService: Found ${snapshot.size} legacy logs. Starting migration...`);
      let migratedCount = 0;

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const action = data.action || "";
        const entityType = data.entityType || "";

        const isSystem = this.isSystemAdminAction(action, entityType);
        const targetCollection = isSystem ? "system_admin_audit_logs" : "batch_process_audit_logs";

        const compliants: any = {
          auditId: docSnap.id,
          module: data.entityType || "SYSTEM",
          action: data.action || "UNKNOWN_ACTION",
          performedBy: data.userEmail || "system@internal",
          userId: data.userId || "system",
          userEmail: data.userEmail || "system@internal",
          userName: data.userName || (data.userEmail ? data.userEmail.split('@')[0] : "System"),
          role: data.role || "PRODUCTION_INCHARGE",
          branch: data.selectedBranch || "Masulkhana",
          selectedBranch: data.selectedBranch || "Masulkhana",
          affectedRecordBranch: data.affectedRecordBranch || data.selectedBranch || "Masulkhana",
          timestamp: data.timestamp || new Date().toISOString(),
          oldValue: data.oldValue || null,
          newValue: data.newValue || null,
          diff: data.diff || null,
          operation: data.operation || (data.oldValue ? "UPDATE" : "CREATE"),
          changeReason: data.changeReason || null,
          ipAddress: data.ipAddress || null,
          userAgent: data.userAgent || null,
          sessionId: data.sessionId || "LEGACY-MIGRATED-SESSION",
          signatureId: data.signatureId || null,
          signatureMeaning: data.signatureMeaning || null,
          entityId: data.entityId || "N/A",
          entityType: data.entityType || "SYSTEM"
        };

        // Standardize passwords
        if (compliants.oldValue && compliants.oldValue.password) {
          compliants.oldValue = { ...compliants.oldValue, password: "********" };
        }
        if (compliants.newValue && compliants.newValue.password) {
          compliants.newValue = { ...compliants.newValue, password: "********" };
        }

        // Clean out undefined
        Object.keys(compliants).forEach(key => {
          if (compliants[key] === undefined) {
            compliants[key] = null;
          }
        });

        // Write to separate collection
        if (await checkAdminHealth()) {
          await adminDb.collection(targetCollection).doc(docSnap.id).set(compliants);
        } else {
          const { setDoc, doc: clientDoc } = await import("firebase/firestore");
          await setDoc(clientDoc(db, targetCollection, docSnap.id), compliants);
        }

        migratedCount++;
      }

      await this.fixAllAuditLogUserRoles();

      console.log(`AuditService: Successfully migrated ${migratedCount} logs.`);
      return { success: true, migratedCount };
    } catch (migError: any) {
      console.error("AuditService Migration script failed:", migError.message);
      return { success: false, error: migError.message };
    }
  }

  /**
   * Backfills existing audit log documents with the user's correct Functional Role from the users collection.
   */
  static async fixAllAuditLogUserRoles() {
    try {
      console.log("AuditService: Starting backfill of audit log user roles...");
      await ensureAuth();
      const usersSnap = await getDocs(collection(db, "users"));
      const userRoleMap = new Map<string, string>();

      usersSnap.docs.forEach(d => {
        const u = d.data();
        const functionalRole = u.functionalRole || u.role;
        if (functionalRole) {
          userRoleMap.set(d.id, functionalRole);
          if (u.email) {
            userRoleMap.set(u.email.toLowerCase(), functionalRole);
          }
        }
      });

      const collectionsToUpdate = ["batch_process_audit_logs", "system_admin_audit_logs"];
      let totalUpdated = 0;

      for (const colName of collectionsToUpdate) {
        const snap = await getDocs(collection(db, colName));
        for (const docSnap of snap.docs) {
          const data = docSnap.data();
          const uId = data.userId;
          const uEmail = (data.userEmail || '').toLowerCase();

          let targetRole = userRoleMap.get(uId) || userRoleMap.get(uEmail);
          if (!targetRole) {
            if (uEmail === 'shakshay04@gmail.com') targetRole = 'ADMIN';
            else if (data.role && data.role !== 'OPERATOR' && data.role !== 'USER' && data.role !== 'PRODUCTION_INCHARGE') targetRole = data.role;
            else targetRole = (colName === "system_admin_audit_logs") ? 'ADMIN' : 'PRODUCTION_INCHARGE';
          }

          if (data.role !== targetRole || data.functionalRole !== targetRole) {
            if (await checkAdminHealth()) {
              await adminDb.collection(colName).doc(docSnap.id).update({
                role: targetRole,
                functionalRole: targetRole
              });
            } else {
              const { updateDoc: clientUpdateDoc, doc: clientDoc } = await import("firebase/firestore");
              await clientUpdateDoc(clientDoc(db, colName, docSnap.id), {
                role: targetRole,
                functionalRole: targetRole
              });
            }
            totalUpdated++;
          }
        }
      }

      console.log(`AuditService: Successfully backfilled roles on ${totalUpdated} audit logs.`);
      return { success: true, updatedCount: totalUpdated };
    } catch (err: any) {
      console.error("AuditService: fixAllAuditLogUserRoles error:", err.message);
      return { success: false, error: err.message };
    }
  }
}
