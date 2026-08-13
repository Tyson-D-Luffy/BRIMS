import { db, ensureAuth } from "../config/firebase-client.ts";
import { collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc } from "firebase/firestore";
import { AuditService } from "./audit.service.ts";
import { DepartmentService } from "./department.service.ts";
import { Designation, DesignationAuditLog, DesignationApprovalTimeline } from "../../types.ts";

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

export class DesignationService {
  /**
   * Check if a designation with the same name already exists in the same department
   */
  private static async checkDuplicateName(name: string, departmentId: string, excludeId?: string, versionCheck?: number, description?: string) {
    const q = query(
      collection(db, "designationMaster"),
      where("departmentId", "==", departmentId)
    );
    const snapshot = await getDocs(q);
    
    const inputUpper = name.trim().toUpperCase();
    const inputDesc = (description || "").trim().toLowerCase();

    for (const docSnap of snapshot.docs) {
      if (excludeId && docSnap.id === excludeId) continue;
      const data = docSnap.data() as Designation;
      
      if (data.status === "Obsolete") continue;
      
      const nameUpper = data.designationName?.trim().toUpperCase();
      const docDesc = (data.description || "").trim().toLowerCase();
      
      if (nameUpper === inputUpper) {
        if (versionCheck === undefined || data.version === versionCheck) {
          if (description !== undefined && docDesc === inputDesc) {
            throw new Error(`A designation with the exact same name "${name}" and description already exists in this department.`);
          }
          throw new Error(`A designation with name "${name}" already exists in this department.`);
        }
      }
    }
  }

  /**
   * Clean/format code for safe document ID
   */
  private static cleanCode(code: string): string {
    return code.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  static async createDesignation(designationData: any, user: any, metadata?: any) {
    const {
      designationName,
      departmentId,
      description = "",
      remarks = ""
    } = designationData;

    if (!designationName || !departmentId) {
      throw new Error("Missing mandatory designation fields: Name or Department");
    }

    // Fetch and check department
    const department = await DepartmentService.getDepartmentById(departmentId);
    if (!department) {
      throw new Error(`Valid department not found for ID "${departmentId}"`);
    }

    if (department.status !== "Active") {
      throw new Error(`Cannot create designation under an inactive/obsolete department. Selected department exhibits status: "${department.status}"`);
    }

    // Role division checking
    const userRole = (user?.role || "OPERATOR").toUpperCase();
    const isQAorAdmin = userRole === "ADMIN" || userRole === "QA" || userRole === "QA REVIEWER" || userRole === "QA APPROVER";
    
    if (!isQAorAdmin) {
      // Normal User: check alignment with own department
      const userDept = user?.department?.trim().toUpperCase();
      const deptCode = department.departmentCode.trim().toUpperCase();
      const deptName = department.departmentName.trim().toUpperCase();
      
      if (!userDept || (userDept !== deptCode && userDept !== deptName)) {
        throw new Error(`Unauthorized: Normal users can only create designations within their own department ("${user?.department || 'N/A'}").`);
      }
    }

    // Uniqueness checks
    await this.checkDuplicateName(designationName, departmentId, undefined, undefined, description);

    const designationId = `desig-${this.cleanCode(designationName)}-${Math.random().toString(36).substr(2, 5)}`;
    
    const newDesig: Designation = {
      designationId,
      designationName: designationName.trim(),
      departmentId,
      departmentName: department.departmentName,
      description: description.trim(),
      remarks: remarks.trim(),
      status: "Draft",
      version: 1,
      createdBy: formatLogUser(user),
      createdOn: new Date().toISOString()
    };

    // Save Designation Record
    await ensureAuth();
    await setDoc(doc(db, "designationMaster", designationId), newDesig);

    // Save Timeline Entry
    const timelineId = `tl-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const initialTimeline: DesignationApprovalTimeline = {
      timelineId,
      designationId,
      action: "Designation Created",
      userId: user?.employeeId || user?.uid || "N/A",
      userName: user?.username || user?.displayName || "System",
      department: user?.department || "N/A",
      timestamp: new Date().toISOString(),
      comments: "Initial drafting of designation",
      reason: "Initial Creation"
    };
    await setDoc(doc(db, "designationApprovalTimeline", timelineId), initialTimeline);

    // Save Audit Trail Log
    const logId = `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const auditEntry: DesignationAuditLog = {
      logId,
      designationId,
      action: "Create",
      designationName: newDesig.designationName,
      oldValue: null,
      newValue: newDesig,
      user: formatLogUser(user),
      timestamp: new Date().toISOString(),
      department: department.departmentName,
      reason: "Initial Designation Master Creation"
    };
    await setDoc(doc(db, "designationAuditLogs", logId), auditEntry);

    // Main dashboard general audit trail
    try {
      await AuditService.logAction(
        user?.uid || "system",
        user?.email || "system@internal",
        "CREATE_DESIGNATION_MASTER",
        designationId,
        "DESIGNATION_MASTER",
        null,
        newDesig,
        "Initial creation as Draft",
        undefined,
        undefined,
        undefined,
        metadata?.ip,
        metadata?.userAgent,
        department.allowedBranches?.[0] || "Masulkhana",
        department.allowedBranches?.[0] || "Masulkhana",
        user?.role,
        user?.displayName || user?.email
      );
    } catch (e) {
      console.error("Non-blocking dashboard audit failed for designation creation:", e);
    }

    return newDesig;
  }

  static async getDesignationById(id: string) {
    await ensureAuth();
    const docRef = doc(db, "designationMaster", id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      throw new Error("Designation master record not found");
    }
    return docSnap.data() as Designation;
  }

  static async getAllDesignations(filters: any) {
    await ensureAuth();
    const querySnapshot = await getDocs(collection(db, "designationMaster"));
    const list: Designation[] = [];
    querySnapshot.forEach((doc) => {
      list.push(doc.data() as Designation);
    });

    const { name, departmentId, status } = filters;

    return list.filter((item) => {
      if (name && !item.designationName.toLowerCase().includes((name as string).toLowerCase())) return false;
      if (departmentId && item.departmentId !== departmentId) return false;
      if (status && item.status !== status) return false;
      return true;
    }).sort((a, b) => {
      const dateA = a.createdOn || "";
      const dateB = b.createdOn || "";
      return dateB.localeCompare(dateA);
    });
  }

  static async updateDesignation(id: string, updateData: any, user: any, metadata?: any) {
    await ensureAuth();
    const existing = await this.getDesignationById(id);

    if (existing.status === "Obsolete") {
      throw new Error("Cannot edit an obsolete designation.");
    }

    // Role division validation on update as well
    const department = await DepartmentService.getDepartmentById(existing.departmentId);
    const userRole = (user?.role || "OPERATOR").toUpperCase();
    const isQAorAdmin = userRole === "ADMIN" || userRole === "QA" || userRole === "QA REVIEWER" || userRole === "QA APPROVER";
    
    if (!isQAorAdmin) {
      const userDept = user?.department?.trim().toUpperCase();
      const deptCode = department.departmentCode.trim().toUpperCase();
      const deptName = department.departmentName.trim().toUpperCase();
      
      if (!userDept || (userDept !== deptCode && userDept !== deptName)) {
        throw new Error(`Unauthorized: Normal users can only modify details within their own department.`);
      }
    }

    const { designationName, description, remarks, changeReason = "Details update" } = updateData;

    // Strict GMP: Modifying Active, Review, or Approval records spawns a new version as Draft.
    if (existing.status === "Active" || existing.status === "Review" || existing.status === "Approval") {
      const newVersion = (existing.version || 1) + 1;
      
      const nextName = designationName || existing.designationName;
      const nextDesc = description !== undefined ? description : existing.description;
      // Check duplicates for standard name under this version
      await this.checkDuplicateName(nextName, existing.departmentId, id, newVersion, nextDesc);

      const designationId = `desig-${this.cleanCode(nextName)}-${Math.random().toString(36).substr(2, 5)}`;
      const newDraft: Designation = {
        ...existing,
        designationId,
        designationName: nextName,
        description: description !== undefined ? description.trim() : existing.description,
        remarks: remarks !== undefined ? remarks.trim() : existing.remarks,
        status: "Draft",
        version: newVersion,
        createdBy: formatLogUser(user),
        createdOn: new Date().toISOString(),
        reviewedBy: "",
        reviewedOn: "",
        approvedBy: "",
        approvedOn: "",
        activatedBy: "",
        activatedOn: ""
      };

      if ('designationCode' in newDraft) {
        delete (newDraft as any).designationCode;
      }

      await setDoc(doc(db, "designationMaster", designationId), newDraft);

      // Timeline entry for new draft version creation
      const timelineId = `tl-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      await setDoc(doc(db, "designationApprovalTimeline", timelineId), {
        timelineId,
        designationId,
        action: "Designation Created",
        userId: user?.employeeId || user?.uid || "N/A",
        userName: user?.username || user?.displayName || "System",
        department: user?.department || "N/A",
        timestamp: new Date().toISOString(),
        comments: `Forked new draft version ${newVersion} from existing ${existing.status} record`,
        reason: changeReason
      } as DesignationApprovalTimeline);

      // Dedicated Audit Log
      const logId = `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const auditEntry: DesignationAuditLog = {
        logId,
        designationId,
        action: "Edit (New Version)",
        designationName: newDraft.designationName,
        oldValue: existing,
        newValue: newDraft,
        user: formatLogUser(user),
        timestamp: new Date().toISOString(),
        department: department.departmentName,
        reason: changeReason
      };
      await setDoc(doc(db, "designationAuditLogs", logId), auditEntry);

      // Main dashboard general audit trail
      try {
        const destBranch = department.allowedBranches?.[0] || "Masulkhana";
        await AuditService.logAction(
          user?.uid || "system",
          user?.email || "system@internal",
          "EDIT_DESIGNATION_MASTER",
          designationId,
          "DESIGNATION_MASTER",
          existing,
          newDraft,
          changeReason,
          undefined,
          undefined,
          undefined,
          metadata?.ip,
          metadata?.userAgent,
          destBranch,
          destBranch,
          user?.role,
          user?.displayName || user?.email
        );
      } catch (e) {
        console.error("Non-blocking dashboard audit failed for designation edit (new version):", e);
      }

      return newDraft;
    } else {
      const nextName = designationName || existing.designationName;
      const nextDesc = description !== undefined ? description : existing.description;
      await this.checkDuplicateName(nextName, existing.departmentId, id, undefined, nextDesc);
      // In-place edit of Draft designations
      const updatedDesig: Designation = {
        ...existing,
        designationName: nextName,
        description: description !== undefined ? description.trim() : existing.description,
        remarks: remarks !== undefined ? remarks.trim() : existing.remarks,
      };

      if ('designationCode' in updatedDesig) {
        delete (updatedDesig as any).designationCode;
      }

      await setDoc(doc(db, "designationMaster", id), updatedDesig);

      // Audit Log
      const logId = `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const auditEntry: DesignationAuditLog = {
        logId,
        designationId: id,
        action: "Edit",
        designationName: updatedDesig.designationName,
        oldValue: existing,
        newValue: updatedDesig,
        user: formatLogUser(user),
        timestamp: new Date().toISOString(),
        department: department.departmentName,
        reason: changeReason
      };
      await setDoc(doc(db, "designationAuditLogs", logId), auditEntry);

      // Main dashboard general audit trail
      try {
        const destBranch = department.allowedBranches?.[0] || "Masulkhana";
        await AuditService.logAction(
          user?.uid || "system",
          user?.email || "system@internal",
          "EDIT_DESIGNATION_MASTER",
          id,
          "DESIGNATION_MASTER",
          existing,
          updatedDesig,
          changeReason,
          undefined,
          undefined,
          undefined,
          metadata?.ip,
          metadata?.userAgent,
          destBranch,
          destBranch,
          user?.role,
          user?.displayName || user?.email
        );
      } catch (e) {
        console.error("Non-blocking dashboard audit failed for designation edit:", e);
      }

      return updatedDesig;
    }
  }

  static async transitionWorkflow(id: string, action: string, body: any, user: any, signatureInfo?: any) {
    await ensureAuth();
    const existing = await this.getDesignationById(id);
    let nextStatus: "Draft" | "Review" | "Approval" | "Active" | "Obsolete" = existing.status;
    let transitionReason = body.reason || signatureInfo?.meaning || "Workflow transition";
    let textAction = "";

    const updatedByFields: any = {};

    if (action === "submit") {
      if (existing.status !== "Draft") {
        throw new Error("Only Draft designations can be submitted for review");
      }
      nextStatus = "Review";
      textAction = "Submitted For Review";
    } else if (action === "approve") {
      if (existing.status !== "Review") {
        throw new Error("Only submitted designations in review can be approved");
      }
      nextStatus = "Approval";
      textAction = "Reviewed";
      updatedByFields.reviewedBy = formatLogUser(user);
      updatedByFields.reviewedOn = new Date().toISOString();
    } else if (action === "activate") {
      if (existing.status !== "Approval") {
        throw new Error("Only reviewed/approved records can be activated");
      }
      nextStatus = "Active";
      textAction = "Approved";
      updatedByFields.approvedBy = formatLogUser(user);
      updatedByFields.approvedOn = new Date().toISOString();
      updatedByFields.activatedBy = formatLogUser(user);
      updatedByFields.activatedOn = new Date().toISOString();

      // GMP Compliance: automatically obsolesce any previous active designation of the same name + department
      const snapshot = await getDocs(collection(db, "designationMaster"));
      for (const docSnap of snapshot.docs) {
        const dData = docSnap.data() as Designation;
        if (
          dData.designationId !== id &&
          dData.designationName.trim().toUpperCase() === existing.designationName.trim().toUpperCase() &&
          dData.departmentId === existing.departmentId &&
          dData.status === "Active"
        ) {
          // Retire earlier active record
          await updateDoc(doc(db, "designationMaster", dData.designationId), {
            status: "Obsolete"
          });

          // Log transition for previous
          const prevLogId = `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          const obsoleteData = {
            logId: prevLogId,
            designationId: dData.designationId,
            action: "Obsolete (Superceded)",
            designationName: dData.designationName,
            oldValue: dData,
            newValue: { ...dData, status: "Obsolete" },
            user: "system@brims",
            timestamp: new Date().toISOString(),
            department: dData.departmentName,
            reason: `Automatically obsoleted due to activation of version ${existing.version || 1}`,
            signatureId: ""
          };
          if ('designationCode' in obsoleteData) {
            delete (obsoleteData as any).designationCode;
          }
          await setDoc(doc(db, "designationAuditLogs", prevLogId), obsoleteData as DesignationAuditLog);

          // Sibling timeline updated as well
          const prevTimelineId = `tl-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          await setDoc(doc(db, "designationApprovalTimeline", prevTimelineId), {
            timelineId: prevTimelineId,
            designationId: dData.designationId,
            action: "Obsolete",
            userId: "SYSTEM",
            userName: "BRIMS Engine",
            department: dData.departmentName,
            timestamp: new Date().toISOString(),
            comments: `Automatically retired because a new version was activated`,
            reason: `Superceded by newer version ${existing.version || 1}`
          } as DesignationApprovalTimeline);
        }
      }
    } else if (action === "obsolete") {
      if (existing.status !== "Active") {
        throw new Error("Only Active designations can be obsoleted");
      }
      nextStatus = "Obsolete";
      textAction = "Obsolete";
    } else {
      throw new Error(`Invalid transition action: ${action}`);
    }

    const updated: Designation = {
      ...existing,
      ...updatedByFields,
      status: nextStatus
    };

    await setDoc(doc(db, "designationMaster", id), updated);

    // Save Electronic Signature if provided
    let sigId = "";
    if (signatureInfo) {
      sigId = `sig-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const signatureDocument = {
        userId: user?.uid,
        actionType: action.toUpperCase(),
        entityType: "DESIGNATION",
        entityId: id,
        meaning: signatureInfo.meaning || transitionReason,
        signedAt: new Date().toISOString(),
        ipAddress: signatureInfo.ipAddress || "127.0.0.1",
        userAgent: signatureInfo.userAgent || "Browser",
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, "electronic_signatures", sigId), signatureDocument);
    }

    // Save Dedicated Timeline Entry
    const timelineId = `tl-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const timelineEntry: DesignationApprovalTimeline = {
      timelineId,
      designationId: id,
      action: textAction,
      userId: user?.employeeId || user?.uid || "N/A",
      userName: user?.username || user?.displayName || "System",
      department: user?.department || "N/A",
      timestamp: new Date().toISOString(),
      comments: body.remarks || transitionReason,
      reason: transitionReason
    };
    await setDoc(doc(db, "designationApprovalTimeline", timelineId), timelineEntry);

    // Save Dedicated Audit Log
    const logId = `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const auditEntry: DesignationAuditLog = {
      logId,
      designationId: id,
      action: action.charAt(0).toUpperCase() + action.slice(1),
      designationName: updated.designationName,
      oldValue: existing,
      newValue: updated,
      user: formatLogUser(user),
      timestamp: new Date().toISOString(),
      department: updated.departmentName,
      reason: transitionReason,
      signatureId: sigId
    };
    if ('designationCode' in auditEntry) {
      delete (auditEntry as any).designationCode;
    }
    await setDoc(doc(db, "designationAuditLogs", logId), auditEntry);

    // Feed main dashboard general audit trail
    try {
      let destBranch = "Masulkhana";
      try {
        const dept = await DepartmentService.getDepartmentById(existing.departmentId);
        if (dept && dept.allowedBranches && dept.allowedBranches.length > 0) {
          destBranch = dept.allowedBranches[0];
        }
      } catch (errDept) {
        console.warn("Could not fetch branch for audit log:", errDept);
      }

      await AuditService.logAction(
        user?.uid || "system",
        user?.email || "system@internal",
        `${action.toUpperCase()}_DESIGNATION_MASTER`,
        id,
        "DESIGNATION_MASTER",
        existing,
        updated,
        transitionReason,
        undefined,
        sigId,
        signatureInfo?.meaning,
        signatureInfo?.ipAddress,
        signatureInfo?.userAgent,
        destBranch,
        destBranch,
        user?.role,
        user?.displayName || user?.email
      );
    } catch (e) {
      console.error(e);
    }

    return updated;
  }

  static async getDesignationAuditLogs(designationId?: string) {
    await ensureAuth();
    const querySnapshot = await getDocs(collection(db, "designationAuditLogs"));
    const logs: DesignationAuditLog[] = [];
    querySnapshot.forEach((doc) => {
      logs.push(doc.data() as DesignationAuditLog);
    });

    if (designationId) {
      return logs.filter(log => log.designationId === designationId).sort((a, b) => {
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

  static async getDesignationApprovalTimeline(designationId: string) {
    await ensureAuth();
    const querySnapshot = await getDocs(collection(db, "designationApprovalTimeline"));
    const list: DesignationApprovalTimeline[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data() as DesignationApprovalTimeline;
      if (data.designationId === designationId) {
        list.push(data);
      }
    });
    return list.sort((a, b) => {
      const timeA = a.timestamp || "";
      const timeB = b.timestamp || "";
      return timeA.localeCompare(timeB);
    });
  }
}
