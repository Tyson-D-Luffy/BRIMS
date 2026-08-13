import { db, ensureAuth } from "../config/firebase-client.ts";
import { adminDb } from "../config/firebase-admin.ts";
import { collection, doc, getDoc, getDocs, query, where, orderBy, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { AuditService } from "./audit.service.ts";

export function formatLogUser(user: any): string {
  if (!user) return "system";
  if (user.employeeId && user.username) {
    return `${user.employeeId} - ${user.username}`;
  }
  if (user.email && user.email.toLowerCase() === 'shakshay04@gmail.com') {
    return "Admin - admin";
  }
  if (user.employeeId) {
    return `${user.employeeId} - ${user.displayName || user.username || 'user'}`;
  }
  if (user.username) {
    return user.username;
  }
  if (user.email) {
    return user.email.split('@')[0];
  }
  return "system";
}

export interface DepartmentData {
  departmentId?: string;
  departmentCode: string;
  departmentName: string;
  description: string;
  branch: string; // Baddi, Masulkhana, or both/Multi
  branchType: "Single" | "Multi";
  allowedBranches: string[]; // ["Baddi"] or ["Masulkhana"] or ["Baddi", "Masulkhana"]
  status: "Draft" | "Review" | "Approval" | "Active" | "Obsolete";
  version?: number;
  createdBy?: string;
  reviewedBy?: string;
  approvedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export class DepartmentService {
  /**
   * Check if a department with the exact same name and description already exists in the same branch(es)
   */
  private static async checkDuplicateNameAndDescription(name: string, description: string, allowedBranches: string[], excludeId?: string) {
    const q = query(collection(db, "departments"));
    const snapshot = await getDocs(q);
    
    const inputName = name.trim().toLowerCase();
    const inputDesc = (description || "").trim().toLowerCase();

    for (const docSnap of snapshot.docs) {
      if (excludeId && docSnap.id === excludeId) continue;
      const data = docSnap.data();
      if (data.status === "Obsolete") continue;

      const docName = (data.departmentName || "").trim().toLowerCase();
      const docDesc = (data.description || "").trim().toLowerCase();

      const hasOverlap = !allowedBranches || allowedBranches.length === 0 || data.allowedBranches?.some((b: string) => allowedBranches.includes(b));
      if (hasOverlap) {
        if (docName === inputName && docDesc === inputDesc) {
          throw new Error(`A department with the exact same department name "${name}" and description already exists.`);
        }
      }
    }
  }

  /**
   * Check if a department with the same code already exists as Draft, Review, Approval, or Active in the same branch
   */
  private static async checkDuplicateCode(code: string, allowedBranches: string[], excludeId?: string, versionCheck?: number) {
    const q = query(collection(db, "departments"));
    const snapshot = await getDocs(q);
    
    for (const docSnap of snapshot.docs) {
      if (excludeId && docSnap.id === excludeId) continue;
      const data = docSnap.data();
      
      // If the duplicate has been marked as obsolete, skip check
      if (data.status === "Obsolete") continue;
      
      const codeUpper = data.departmentCode?.trim().toUpperCase();
      const inputUpper = code.trim().toUpperCase();
      
      if (codeUpper === inputUpper) {
        // If it's the same department code, check if they overlap in branches
        const hasOverlap = data.allowedBranches?.some((b: string) => allowedBranches.includes(b));
        
        // Also check if they are the exact same version
        const isSameVersion = versionCheck !== undefined && data.version === versionCheck;
        
        if (hasOverlap && (!excludeId || isSameVersion)) {
          // If they overlap in branches and have active/draft status
          if (data.status !== "Obsolete" && data.version === (versionCheck || 1)) {
            throw new Error(`A department with code "${code}" already exists for branch(es) $[${data.allowedBranches.join(", ")}].`);
          }
        }
      }
    }
  }

  static async createDepartment(departmentData: any, user: any, metadata?: any) {
    const {
      departmentCode,
      departmentName,
      description,
      branchType, // "Single" or "Multi"
      branch, // masulkhana, baddi, etc.
      allowedBranches // ["Masulkhana"] etc.
    } = departmentData;

    if (!departmentCode || !departmentName || !description || !branchType || !allowedBranches || allowedBranches.length === 0) {
      throw new Error("Missing mandatory department fields");
    }

    // Uniqueness checks
    await this.checkDuplicateCode(departmentCode, allowedBranches);
    await this.checkDuplicateNameAndDescription(departmentName, description, allowedBranches);

    const depId = `dept-${departmentCode.toLowerCase().replace(/[^a-z0-9]/g, "")}-${Math.random().toString(36).substr(2, 5)}`;
    
    const newDept: DepartmentData = {
      departmentId: depId,
      departmentCode: departmentCode.trim().toUpperCase(),
      departmentName: departmentName.trim(),
      description: description.trim(),
      branch: branch || allowedBranches[0],
      branchType,
      allowedBranches,
      status: "Draft",
      version: 1,
      createdBy: formatLogUser(user),
      reviewedBy: "",
      approvedBy: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Save to Firestore
    await ensureAuth();
    await setDoc(doc(db, "departments", depId), newDept);

    // Save Dedicated Audit Log
    const logId = `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const auditEntry = {
      logId,
      departmentId: depId,
      action: "Create",
      departmentCode: newDept.departmentCode,
      departmentName: newDept.departmentName,
      oldValue: null,
      newValue: newDept,
      user: formatLogUser(user),
      timestamp: new Date().toISOString(),
      branch: allowedBranches.join(", "),
      reason: "Initial Department Master Creation",
      signatureId: ""
    };
    await setDoc(doc(db, "departmentAuditLogs", logId), auditEntry);

    // Feed main dashboard audit
    try {
      await AuditService.logAction(
        user?.uid || "system",
        user?.email || "system@internal",
        "CREATE_DEPARTMENT_MASTER",
        depId,
        "DEPARTMENT_MASTER",
        null,
        newDept,
        "Initial creation as Draft",
        undefined,
        undefined,
        undefined,
        metadata?.ip,
        metadata?.userAgent,
        allowedBranches[0],
        allowedBranches[0],
        user?.role,
        user?.name || user?.email
      );
    } catch (e) {
      console.error("Non-blocking dashboard audit failed:", e);
    }

    return newDept;
  }

  static async getDepartmentById(id: string) {
    const docRef = doc(db, "departments", id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      throw new Error("Department not found");
    }
    return docSnap.data() as DepartmentData;
  }

  static async getAllDepartments(filters: any) {
    await ensureAuth();
    const querySnapshot = await getDocs(collection(db, "departments"));
    let depts: DepartmentData[] = [];
    
    querySnapshot.forEach((doc) => {
      depts.push(doc.data() as DepartmentData);
    });

    const { code, name, branch, status } = filters;

    // Filter results
    return depts.filter((dept) => {
      if (code && !dept.departmentCode.toLowerCase().includes((code as string).toLowerCase())) return false;
      if (name && !dept.departmentName.toLowerCase().includes((name as string).toLowerCase())) return false;
      if (status && dept.status !== status) return false;
      
      // Branch permission filter
      if (branch) {
        // Must match either the selected branch, or be multi-branch
        return dept.allowedBranches?.includes(branch);
      }
      return true;
    }).sort((a, b) => {
      // Sort by branch, code, version descending
      const dateA = a.createdAt || "";
      const dateB = b.createdAt || "";
      return dateB.localeCompare(dateA);
    });
  }

  static async getActiveDepartments(branch?: string) {
    await ensureAuth();
    const querySnapshot = await getDocs(collection(db, "departments"));
    const depts: DepartmentData[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data() as DepartmentData;
      if (data.status === "Active") {
        if (!branch || data.allowedBranches?.includes(branch)) {
          depts.push(data);
        }
      }
    });
    return depts;
  }

  static async updateDepartment(id: string, updateData: any, user: any, metadata?: any) {
    await ensureAuth();
    const existingDept = await this.getDepartmentById(id);

    if (existingDept.status === "Obsolete") {
      throw new Error("Cannot edit an obsolete department.");
    }

    const { departmentName, description, branchType, allowedBranches } = updateData;

    await this.checkDuplicateNameAndDescription(
      departmentName || existingDept.departmentName,
      description !== undefined ? description : existingDept.description,
      allowedBranches || existingDept.allowedBranches,
      id
    );

    // Direct editing of Active records is not allowed. Any change shall create a new Draft version.
    if (existingDept.status === "Active" || existingDept.status === "Review" || existingDept.status === "Approval") {
      // Create new draft version
      const newVersion = (existingDept.version || 1) + 1;
      
      // Double check duplicates for new draft version
      await this.checkDuplicateCode(existingDept.departmentCode, allowedBranches || existingDept.allowedBranches, id, newVersion);

      const depId = `dept-${existingDept.departmentCode.toLowerCase().replace(/[^a-z0-9]/g, "")}-${Math.random().toString(36).substr(2, 5)}`;
      const newDraftDept: DepartmentData = {
        ...existingDept,
        departmentId: depId,
        departmentName: departmentName || existingDept.departmentName,
        description: description || existingDept.description,
        branchType: branchType || existingDept.branchType,
        allowedBranches: allowedBranches || existingDept.allowedBranches,
        branch: (allowedBranches || existingDept.allowedBranches)[0],
        status: "Draft",
        version: newVersion,
        createdBy: formatLogUser(user),
        reviewedBy: "",
        approvedBy: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, "departments", depId), newDraftDept);

      // Log to departmentAuditLogs
      const logId = `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const auditEntry = {
        logId,
        departmentId: depId,
        action: "Edit (New Version)",
        departmentCode: newDraftDept.departmentCode,
        departmentName: newDraftDept.departmentName,
        oldValue: existingDept,
        newValue: newDraftDept,
        user: formatLogUser(user),
        timestamp: new Date().toISOString(),
        branch: newDraftDept.allowedBranches.join(", "),
        reason: updateData.changeReason || "Created new draft version on active record edit",
        signatureId: ""
      };
      await setDoc(doc(db, "departmentAuditLogs", logId), auditEntry);

      // Main dashboard audit
      try {
        await AuditService.logAction(
          user?.uid || "system",
          user?.email || "system@internal",
          "EDIT_DEPARTMENT_MASTER_NEW_VERSION",
          depId,
          "DEPARTMENT_MASTER",
          existingDept,
          newDraftDept,
          updateData.changeReason || "Direct edit of Active/Workflow department initiated standard version increment",
          undefined,
          undefined,
          undefined,
          metadata?.ip,
          metadata?.userAgent,
          newDraftDept.allowedBranches[0],
          newDraftDept.allowedBranches[0],
          user?.role,
          user?.name || user?.email
        );
      } catch (e) {
        console.error("Non-blocking dashboard edit audit failed:", e);
      }

      return newDraftDept;
    } else {
      // Standard in-place edit for Draft version
      const updatedDept: DepartmentData = {
        ...existingDept,
        departmentName: departmentName || existingDept.departmentName,
        description: description || existingDept.description,
        branchType: branchType || existingDept.branchType,
        allowedBranches: allowedBranches || existingDept.allowedBranches,
        branch: (allowedBranches || existingDept.allowedBranches)[0],
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, "departments", id), updatedDept);

      // Audit Log
      const logId = `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const auditEntry = {
        logId,
        departmentId: id,
        action: "Edit",
        departmentCode: updatedDept.departmentCode,
        departmentName: updatedDept.departmentName,
        oldValue: existingDept,
        newValue: updatedDept,
        user: formatLogUser(user),
        timestamp: new Date().toISOString(),
        branch: updatedDept.allowedBranches.join(", "),
        reason: updateData.changeReason || "Draft modifications",
        signatureId: ""
      };
      await setDoc(doc(db, "departmentAuditLogs", logId), auditEntry);

      // Main audit
      try {
        await AuditService.logAction(
          user?.uid || "system",
          user?.email || "system@internal",
          "EDIT_DEPARTMENT_MASTER",
          id,
          "DEPARTMENT_MASTER",
          existingDept,
          updatedDept,
          updateData.changeReason || "Modified draft specifications",
          undefined,
          undefined,
          undefined,
          metadata?.ip,
          metadata?.userAgent,
          updatedDept.allowedBranches[0],
          updatedDept.allowedBranches[0],
          user?.role,
          user?.name || user?.email
        );
      } catch (e) {
        console.error(e);
      }

      return updatedDept;
    }
  }

  static async transitionWorkflow(id: string, action: string, body: any, user: any, signatureInfo?: any) {
    await ensureAuth();
    const existingDept = await this.getDepartmentById(id);
    let nextStatus: "Draft" | "Review" | "Approval" | "Active" | "Obsolete" = existingDept.status;
    let transitionReason = body.reason || signatureInfo?.meaning || "Workflow transition";

    let updatedByFields: any = {
      updatedAt: new Date().toISOString()
    };

    if (action === "submit") {
      if (existingDept.status !== "Draft") {
        throw new Error("Only Draft records can be submitted for review");
      }
      nextStatus = "Review";
      updatedByFields.reviewedBy = formatLogUser(user);
    } else if (action === "approve") {
      if (existingDept.status !== "Review") {
        throw new Error("Only submitted records in review status can be approved");
      }
      nextStatus = "Approval";
    } else if (action === "activate") {
      if (existingDept.status !== "Approval") {
        throw new Error("Only approved records can be activated");
      }
      nextStatus = "Active";
      updatedByFields.approvedBy = formatLogUser(user);

      // IMPORTANT GMP ALIGNMENT: 
      // If we are activating a new version of an existing department code,
      // we must automatically mark all previous active versions of the same code as Obsolete.
      const querySnapshot = await getDocs(collection(db, "departments"));
      for (const docSnap of querySnapshot.docs) {
        const dData = docSnap.data() as DepartmentData;
        if (
          dData.departmentId !== id &&
          dData.departmentCode === existingDept.departmentCode &&
          dData.status === "Active"
        ) {
          // Retroactively obsolescing previous Active record
          await updateDoc(doc(db, "departments", dData.departmentId!), {
            status: "Obsolete",
            updatedAt: new Date().toISOString()
          });

          // Log obsolete for previous version
          const obsLogId = `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          await setDoc(doc(db, "departmentAuditLogs", obsLogId), {
            logId: obsLogId,
            departmentId: dData.departmentId!,
            action: "Obsolete (Superceded)",
            departmentCode: dData.departmentCode,
            departmentName: dData.departmentName,
            oldValue: dData,
            newValue: { ...dData, status: "Obsolete" },
            user: "system@brims",
            timestamp: new Date().toISOString(),
            branch: dData.allowedBranches.join(", "),
            reason: `Automatically obsoleted due to activation of version ${existingDept.version || 1}`,
            signatureId: ""
          });
        }
      }
    } else if (action === "obsolete") {
      if (existingDept.status !== "Active") {
        throw new Error("Only Active departments can be obsoleted");
      }
      nextStatus = "Obsolete";
    } else {
      throw new Error(`Invalid transition action: ${action}`);
    }

    const updatedDept: DepartmentData = {
      ...existingDept,
      ...updatedByFields,
      status: nextStatus,
      updatedAt: new Date().toISOString()
    };

    await setDoc(doc(db, "departments", id), updatedDept);

    // Save Electronic Signature if provided
    let sigId = "";
    if (signatureInfo) {
      sigId = `sig-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const signatureDocument = {
        userId: user?.uid,
        actionType: action.toUpperCase(),
        entityType: "DEPARTMENT",
        entityId: id,
        meaning: signatureInfo.meaning || transitionReason,
        signedAt: new Date().toISOString(),
        ipAddress: signatureInfo.ipAddress || "127.0.0.1",
        userAgent: signatureInfo.userAgent || "Browser",
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, "electronic_signatures", sigId), signatureDocument);
    }

    // Save Dedicated Audit Log
    const logId = `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const auditEntry = {
      logId,
      departmentId: id,
      action: action.charAt(0).toUpperCase() + action.slice(1),
      departmentCode: updatedDept.departmentCode,
      departmentName: updatedDept.departmentName,
      oldValue: existingDept,
      newValue: updatedDept,
      user: formatLogUser(user),
      timestamp: new Date().toISOString(),
      branch: updatedDept.allowedBranches.join(", "),
      reason: transitionReason,
      signatureId: sigId
    };
    await setDoc(doc(db, "departmentAuditLogs", logId), auditEntry);

    // Feed main dashboard audit
    try {
      await AuditService.logAction(
        user?.uid || "system",
        user?.email || "system@internal",
        `${action.toUpperCase()}_DEPARTMENT_MASTER`,
        id,
        "DEPARTMENT_MASTER",
        existingDept,
        updatedDept,
        transitionReason,
        undefined,
        sigId,
        signatureInfo?.meaning,
        signatureInfo?.ipAddress,
        signatureInfo?.userAgent,
        updatedDept.allowedBranches[0],
        updatedDept.allowedBranches[0],
        user?.role,
        user?.name || user?.email
      );
    } catch (e) {
      console.error(e);
    }

    return updatedDept;
  }

  static async getDepartmentAuditLogs(departmentId?: string) {
    await ensureAuth();
    const querySnapshot = await getDocs(collection(db, "departmentAuditLogs"));
    const logs: any[] = [];
    querySnapshot.forEach((doc) => {
      logs.push(doc.data());
    });

    if (departmentId) {
      return logs.filter(log => log.departmentId === departmentId).sort((a, b) => {
        const timeA = a.timestamp || "";
        const timeB = b.timestamp || "";
        return timeB.localeCompare(timeA);
      });
    }
    return logs.sort((a, b) => {
      const timeA = a.timestamp || "";
      const timeB = b.timestamp || "";
      return timeB.localeCompare(timeA);
    });
  }

  static async deleteDepartment(id: string, user: any, signatureInfo?: any) {
    await ensureAuth();
    const existingDept = await this.getDepartmentById(id);

    // Perform the Firestore deletion
    await deleteDoc(doc(db, "departments", id));

    // Save Electronic Signature if provided
    let sigId = "";
    if (signatureInfo) {
      sigId = `sig-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const signatureDocument = {
        userId: user?.uid,
        actionType: "DELETE",
        entityType: "DEPARTMENT",
        entityId: id,
        meaning: signatureInfo.meaning || "Deleted Department Master record",
        signedAt: new Date().toISOString(),
        ipAddress: signatureInfo.ipAddress || "127.0.0.1",
        userAgent: signatureInfo.userAgent || "Browser",
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, "electronic_signatures", sigId), signatureDocument);
    }

    // Save Dedicated Audit Log
    const logId = `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const auditEntry = {
      logId,
      departmentId: id,
      action: "Delete",
      departmentCode: existingDept.departmentCode,
      departmentName: existingDept.departmentName,
      oldValue: existingDept,
      newValue: null,
      user: formatLogUser(user),
      timestamp: new Date().toISOString(),
      branch: existingDept.allowedBranches?.join(", ") || existingDept.branch,
      reason: signatureInfo?.meaning || "Department Deleted by Admin",
      signatureId: sigId
    };
    await setDoc(doc(db, "departmentAuditLogs", logId), auditEntry);

    // Feed main dashboard audit
    try {
      await AuditService.logAction(
        user?.uid || "system",
        user?.email || "system@internal",
        "DELETE_DEPARTMENT_MASTER",
        id,
        "DEPARTMENT_MASTER",
        existingDept,
        null,
        "Department Deleted by Admin with E-sign control",
        undefined,
        sigId,
        signatureInfo?.meaning || "Deleted Department Master record",
        signatureInfo?.ipAddress,
        signatureInfo?.userAgent,
        existingDept.allowedBranches?.[0] || existingDept.branch,
        existingDept.allowedBranches?.[0] || existingDept.branch,
        user?.role,
        user?.name || user?.email
      );
    } catch (e) {
      console.error("Non-blocking dashboard delete audit failed:", e);
    }

    return { id, success: true };
  }
}
