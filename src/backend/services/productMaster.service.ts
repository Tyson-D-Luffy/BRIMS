import { db, ensureAuth } from "../config/firebase-client.ts";
import { adminDb, checkAdminHealth } from "../config/firebase-admin.ts";
import { collection, doc, getDoc, getDocs, query, where, orderBy, setDoc, updateDoc, runTransaction } from "firebase/firestore";
import { AuditService } from "./audit.service.ts";
import { validateBatchNumber } from "../../lib/batchValidation.ts";
import { NotificationService, NotificationType, TargetType } from "./notification.service.ts";

export function getProductLogUser(user: any): string {
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

export class ProductMasterService {
  /**
   * Helper to check duplicate product codes / titles in the same branch.
   * "1. Duplicate Product Codes not allowed."
   */
  private static async checkDuplicate(title: string, batchNumberSeries: string | undefined, branch: string, excludeId?: string, excludeParentId?: string, description?: string) {
    await ensureAuth();
    const q = query(
      collection(db, "product_masters"),
      where("branch", "==", branch)
    );
    const snapshot = await getDocs(q);
    const parsedValid = batchNumberSeries ? validateBatchNumber(batchNumberSeries) : { isValid: false, productCode: undefined };
    const checkProductCode = parsedValid.isValid ? parsedValid.productCode?.toUpperCase() : null;

    const inputTitle = (title || "").trim().toLowerCase();
    const inputDesc = (description || "").trim().toLowerCase();

    for (const docSnap of snapshot.docs) {
      if (excludeId && docSnap.id === excludeId) continue;
      const data = docSnap.data();
      
      // If we are checking duplicates for a product revision/version, exclude its own family
      if (excludeParentId) {
        const docParentId = data.parentProductId || docSnap.id;
        if (docParentId === excludeParentId) {
          continue;
        }
      }

      // Skip Inactive & Obsolete records from duplicate checks
      if (data.workflowStatus === "Obsolete" || data.status === "inactive" && data.workflowStatus === "Inactive") {
        continue;
      }

      const docTitle = (data.title || "").trim().toLowerCase();
      const docDesc = (data.description || "").trim().toLowerCase();

      // 1. Literal duplicate checks for Product Name & Description
      if (docTitle === inputTitle && docDesc === inputDesc) {
        throw new Error(`A Product Master with the exact same product name "${title}" and description already exists in the ${branch} branch.`);
      }

      if (docTitle === inputTitle) {
        throw new Error(`A Product Master with this title "${title}" already exists in the ${branch} branch.`);
      }
      if (batchNumberSeries && data.batchNumberSeries?.toLowerCase().trim() === batchNumberSeries.toLowerCase().trim()) {
        throw new Error(`A Product Master with this Batch Number Series "${batchNumberSeries}" already exists in the ${branch} branch.`);
      }

      // 2. Parsed Product Code duplicate check
      if (checkProductCode) {
        const otherValid = data.batchNumberSeries ? validateBatchNumber(data.batchNumberSeries || "") : { isValid: false };
        if (otherValid.isValid && otherValid.productCode?.toUpperCase() === checkProductCode) {
          throw new Error(`A product with the parsed Product Code "${checkProductCode}" already exists in "${data.title}" (${data.batchNumberSeries}).`);
        }
      }
    }
  }

  static async createProduct(productData: any, adminUser: any, metadata?: any) {
    const { 
      title, 
      type, 
      stage, 
      batchNumberSeries, 
      description,
      branch
    } = productData;

    const selectedBranch = branch || "Masulkhana";

    // 1. Enforce validation patterns
    if (batchNumberSeries) {
      const parsedBatch = validateBatchNumber(batchNumberSeries);
      if (!parsedBatch.isValid) {
        throw new Error(`Batch Number Error: ${parsedBatch.error}`);
      }
    }

    // 2. Duplicate Check
    await this.checkDuplicate(title, batchNumberSeries, selectedBranch, undefined, undefined, description);

    const initialHistory: any[] = [
      {
        action: "Product Created",
        fromStatus: "",
        toStatus: "Draft",
        performedBy: getProductLogUser(adminUser),
        performedByUid: adminUser?.uid || "system",
        timestamp: new Date().toISOString(),
        reason: "Initial product draft registration"
      }
    ];

    const newProduct: any = {
      title: title || "",
      type: type || "",
      stage: stage || "",
      batchNumberSeries: batchNumberSeries || "",
      description: description || "",
      branch: selectedBranch,
      
      // Workflow State & Database Requirements
      workflowStatus: "Draft",
      status: "inactive", // MUST NOT appear in active operational selects
      version: 1,
      revisionNo: 0,
      createdBy: adminUser?.uid || "system",
      createdByEmail: getProductLogUser(adminUser),
      createdByUserName: adminUser?.name || adminUser?.username || getProductLogUser(adminUser) || "Creator",
      history: initialHistory,
      
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      console.log(`[SERVICE]: createProduct - Saving draft with Admin SDK...`);
      const adminDocRef = adminDb.collection("product_masters").doc();
      await adminDocRef.set(newProduct);
      console.log(`[SERVICE]: createProduct - Admin SDK Success. ID: ${adminDocRef.id}`);
      
      const resData = { id: adminDocRef.id, ...newProduct };
      
      // Audit trail logging
      try {
        await AuditService.logAction(
          adminUser?.uid,
          adminUser?.email,
          "CREATE_PRODUCT_MASTER",
          adminDocRef.id,
          "PRODUCT_MASTER",
          null,
          newProduct,
          "Initial creation as Draft",
          undefined,
          undefined,
          undefined,
          metadata?.ip,
          metadata?.userAgent,
          selectedBranch,
          selectedBranch,
          adminUser?.role,
          adminUser?.name || adminUser?.email
        );
      } catch (e) { console.error("Audit log failed (non-blocking):", e); }

      // Trigger Notification
      try {
        await NotificationService.sendNotification({
          title: "New Product Master Created",
          message: `Product Master draft "${title}" has been created.`,
          type: NotificationType.INFO,
          targetType: TargetType.ROLE,
          targetId: "QA",
          eventType: "create:product",
          link: "/product-masters"
        });
      } catch (notiErr) {
        console.error("Failed to send creation notification:", notiErr);
      }

      return resData;
    } catch (adminError: any) {
      console.warn(`[SERVICE]: createProduct Fallback to Client SDK...`);
      try {
        await ensureAuth();
        const docRef = doc(collection(db, "product_masters"));
        await setDoc(docRef, newProduct);
        console.log(`[SERVICE]: createProduct Client SDK Success. ID: ${docRef.id}`);

        try {
          await AuditService.logAction(adminUser?.uid, adminUser?.email, "CREATE_PRODUCT_MASTER", docRef.id, "PRODUCT_MASTER", null, newProduct, "Initial creation as Draft", undefined, undefined, undefined, metadata?.ip, metadata?.userAgent, selectedBranch, selectedBranch, adminUser?.role, adminUser?.name || adminUser?.email);
        } catch (e) { console.error("Audit log failed:", e); }

        // Trigger Notification on Fallback
        try {
          await NotificationService.sendNotification({
            title: "New Product Master Created",
            message: `Product Master draft "${title}" has been created.`,
            type: NotificationType.INFO,
            targetType: TargetType.ROLE,
            targetId: "QA",
            eventType: "create:product",
            link: "/product-masters"
          });
        } catch (notiErr) {
          console.error("Failed to send creation notification:", notiErr);
        }

        return { id: docRef.id, ...newProduct };
      } catch (clientError: any) {
        throw new Error(`Failed to save product master: ${clientError.message}`);
      }
    }
  }

  static async getAllProducts(filters: any) {
    try {
      const { name, status, selectedBranch } = filters;
      
      await ensureAuth();
      let q = collection(db, "product_masters") as any;
      if (selectedBranch) {
        q = query(q, where("branch", "==", selectedBranch));
      }
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        return [];
      }

      let products = snapshot.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data()
      }));

      // In-memory filtering including workflowStatus compatibility
      if (name || status) {
        const searchLower = name?.toLowerCase() || "";
        products = products.filter((p: any) => {
          const matchesName = !name || 
            (p.title && p.title.toLowerCase().includes(searchLower)) || 
            (p.batchNumberSeries && p.batchNumberSeries.toLowerCase().includes(searchLower));
          
          let matchesStatus = true;
          if (status && status !== 'all') {
            matchesStatus = 
              p.status === status || 
              p.workflowStatus === status ||
              (p.workflowStatus && p.workflowStatus.toLowerCase().replace(/\s/g, '') === status.toLowerCase().replace(/\s/g, ''));
          }
          
          return matchesName && matchesStatus;
        });
      }

      // Sort by updatedAt descending for historical workflow comfort, falls back to title
      products.sort((a: any, b: any) => {
        const dateA = a.updatedAt || "";
        const dateB = b.updatedAt || "";
        return dateB.localeCompare(dateA);
      });

      return products;
    } catch (error: any) {
      console.error("ProductService.getAllProducts Error:", error);
      throw error;
    }
  }

  static async getProductById(id: string): Promise<any> {
    await ensureAuth();
    const productDoc = await getDoc(doc(db, "product_masters", id));
    if (!productDoc.exists()) {
      throw new Error("Product Master not found");
    }
    return { id: productDoc.id, ...productDoc.data() };
  }

  /**
   * GMP Update controls:
   * "If active Product Master is edited:
   * 1. Create revision workflow.
   * 2. Existing approved version remains active.
   * 3. Edited version goes through approval again."
   */
  static async updateProduct(id: string, updateData: any, adminUser: any, metadata?: any) {
    const { changeReason, ...restOfData } = updateData;
    
    if (!changeReason || changeReason.length < 5) {
      throw new Error("Reason for change is required for GMP and 21 CFR Part 11 compliant tracking");
    }

    // Load original record to check status
    const original = await this.getProductById(id);
    const isDraftState = original.workflowStatus === "Draft" || original.workflowStatus === "Returned for Correction";

    if (isDraftState) {
      // Creator can edit directly in Draft / Returned for Correction
      if (original.createdBy !== adminUser?.uid && adminUser?.role !== "ADMIN") {
        throw new Error("Only the original creator or an system Admin can edit a draft Product Master.");
      }

      await this.checkDuplicate(
        restOfData.title || original.title, 
        restOfData.batchNumberSeries || original.batchNumberSeries, 
        original.branch, 
        id, 
        original.parentProductId,
        restOfData.description !== undefined ? restOfData.description : original.description
      );

      const updatedHistory = [
        ...(original.history || []),
        {
          action: "Draft Updated",
          fromStatus: original.workflowStatus,
          toStatus: original.workflowStatus,
          performedBy: getProductLogUser(adminUser),
          performedByUid: adminUser?.uid || "system",
          timestamp: new Date().toISOString(),
          reason: changeReason
        }
      ];

      const updatedProduct: any = {
        title: restOfData.title ?? original.title,
        type: restOfData.type ?? original.type,
        stage: restOfData.stage ?? original.stage,
        batchNumberSeries: restOfData.batchNumberSeries ?? original.batchNumberSeries,
        description: restOfData.description ?? original.description,
        history: updatedHistory,
        updatedAt: new Date().toISOString()
      };

      try {
        const productRef = adminDb.collection("product_masters").doc(id);
        await productRef.update(updatedProduct);
        
        try {
          await AuditService.logAction(adminUser?.uid, adminUser?.email, "UPDATE_PRODUCT_MASTER", id, "PRODUCT_MASTER", original, updatedProduct, changeReason, undefined, undefined, undefined, metadata?.ip, metadata?.userAgent, original.branch, original.branch, adminUser?.role, adminUser?.name || adminUser?.email);
        } catch (e) { console.error("Audit fail:", e); }

        // Trigger Notification
        try {
          await NotificationService.sendNotification({
            title: "Product Master Draft Updated",
            message: `Product Master draft "${updatedProduct.title}" has been updated. Reason: ${changeReason}`,
            type: NotificationType.INFO,
            targetType: TargetType.ROLE,
            targetId: "QA",
            eventType: "edit:product",
            link: "/product-masters"
          });
        } catch (notiErr) {
          console.error("Failed to send update notification:", notiErr);
        }

        return { id, ...original, ...updatedProduct };
      } catch (err) {
        // Fallback Client update
        await ensureAuth();
        const clientRef = doc(db, "product_masters", id);
        await setDoc(clientRef, updatedProduct, { merge: true });
        
        try {
          await AuditService.logAction(adminUser?.uid, adminUser?.email, "UPDATE_PRODUCT_MASTER", id, "PRODUCT_MASTER", original, updatedProduct, changeReason, undefined, undefined, undefined, metadata?.ip, metadata?.userAgent, original.branch, original.branch, adminUser?.role, adminUser?.name || adminUser?.email);
        } catch (e) { console.error("Audit fail:", e); }

        // Trigger Notification on Fallback
        try {
          await NotificationService.sendNotification({
            title: "Product Master Draft Updated",
            message: `Product Master draft "${updatedProduct.title}" has been updated. Reason: ${changeReason}`,
            type: NotificationType.INFO,
            targetType: TargetType.ROLE,
            targetId: "QA",
            eventType: "edit:product",
            link: "/product-masters"
          });
        } catch (notiErr) {
          console.error("Failed to send update notification:", notiErr);
        }

        return { id, ...original, ...updatedProduct };
      }
    } else {
      // EDITING ACTIVE/APPROVED REQUISITIONS - CREATES REVISION WORKFLOW
      // This ensures Version 1 remains Active, while Version 2 enters workflow as Draft.
      const currentParentId = original.parentProductId || original.id;
      const currentVersion = original.version || 1;
      const currentRevision = original.revisionNo || 0;

      // Duplicate Check across family
      await this.checkDuplicate(
        restOfData.title || original.title, 
        restOfData.batchNumberSeries || original.batchNumberSeries, 
        original.branch, 
        undefined, 
        currentParentId,
        restOfData.description !== undefined ? restOfData.description : original.description
      );

      const revisionHistory = [
        {
          action: `Created Revision Version ${currentVersion + 1}`,
          fromStatus: original.workflowStatus,
          toStatus: "Draft",
          performedBy: getProductLogUser(adminUser),
          performedByUid: adminUser?.uid || "system",
          timestamp: new Date().toISOString(),
          reason: `Revision generated from original active master: ${changeReason}`
        }
      ];

      const newRevisionProduct: any = {
        title: restOfData.title ?? original.title,
        type: restOfData.type ?? original.type,
        stage: restOfData.stage ?? original.stage,
        batchNumberSeries: restOfData.batchNumberSeries ?? original.batchNumberSeries,
        description: restOfData.description ?? original.description,
        branch: original.branch,
        
        // Relationship metadata
        parentProductId: currentParentId,
        version: currentVersion + 1,
        revisionNo: currentRevision + 1,
        
        workflowStatus: "Draft",
        status: "inactive", // Kept safe/unapproved
        
        createdBy: adminUser?.uid || "system",
        createdByEmail: getProductLogUser(adminUser),
        createdByUserName: adminUser?.name || adminUser?.username || getProductLogUser(adminUser) || "Creator",
        history: revisionHistory,
        
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      try {
        const adminDocRef = adminDb.collection("product_masters").doc();
        await adminDocRef.set(newRevisionProduct);
        
        try {
          await AuditService.logAction(adminUser?.uid, adminUser?.email, "CREATE_PRODUCT_MASTER_REVISION", adminDocRef.id, "PRODUCT_MASTER", original, newRevisionProduct, `Revision creation: ${changeReason}`, undefined, undefined, undefined, metadata?.ip, metadata?.userAgent, original.branch, original.branch, adminUser?.role, adminUser?.name || adminUser?.email);
        } catch (e) { console.error("Audit log failed:", e); }

        // Trigger Notification
        try {
          await NotificationService.sendNotification({
            title: "Product Master Revision Created",
            message: `A new draft revision Version ${newRevisionProduct.version} for "${newRevisionProduct.title}" has been created. Reason: ${changeReason}`,
            type: NotificationType.INFO,
            targetType: TargetType.ROLE,
            targetId: "QA",
            eventType: "edit:product",
            link: "/product-masters"
          });
        } catch (notiErr) {
          console.error("Failed to send revision notification:", notiErr);
        }

        return { id: adminDocRef.id, ...newRevisionProduct };
      } catch (err) {
        await ensureAuth();
        const docRef = doc(collection(db, "product_masters"));
        await setDoc(docRef, newRevisionProduct);

        try {
          await AuditService.logAction(adminUser?.uid, adminUser?.email, "CREATE_PRODUCT_MASTER_REVISION", docRef.id, "PRODUCT_MASTER", original, newRevisionProduct, `Revision creation: ${changeReason}`, undefined, undefined, undefined, metadata?.ip, metadata?.userAgent, original.branch, original.branch, adminUser?.role, adminUser?.name || adminUser?.email);
        } catch (e) { console.error("Audit log failed:", e); }

        // Trigger Notification on Fallback
        try {
          await NotificationService.sendNotification({
            title: "Product Master Revision Created",
            message: `A new draft revision Version ${newRevisionProduct.version} for "${newRevisionProduct.title}" has been created. Reason: ${changeReason}`,
            type: NotificationType.INFO,
            targetType: TargetType.ROLE,
            targetId: "QA",
            eventType: "edit:product",
            link: "/product-masters"
          });
        } catch (notiErr) {
          console.error("Failed to send revision notification:", notiErr);
        }

        return { id: docRef.id, ...newRevisionProduct };
      }
    }
  }

  /**
   * Unified transition coordinator for 21 CFR duty segregation and secure logs.
   */
  static async transitionWorkflow(
    id: string, 
    action: "submit" | "start-review" | "review" | "approve" | "reject" | "return-correction", 
    payload: { comments?: string; password?: string; actionType?: string } | any, 
    adminUser: any, 
    signatureInfo?: any
  ) {
    const product = await this.getProductById(id);
    const originalWorkflowStatus = product.workflowStatus || "Draft";
    let targetWorkflowStatus = originalWorkflowStatus;
    let targetStatus = product.status || "inactive";

    const comments = payload?.comments || payload?.changeReason || "";
    const performEmail = getProductLogUser(adminUser);
    const performUid = adminUser?.uid || "system";

    // Standard Dual-Verification Segregation
    if (action !== "submit" && action !== "return-correction" && product.createdBy === performUid && adminUser?.role !== "ADMIN") {
      throw new Error("Compliance Duty Segregation (21 CFR Part 11): The resource creator cannot perform Review or Approval steps.");
    }

    const logHistory = (actionName: string, fromSt: string, toSt: string, commentVal: string) => {
      const hist = product.history || [];
      return [
        ...hist,
        {
          action: actionName,
          fromStatus: fromSt,
          toStatus: toSt,
          performedBy: performEmail,
          performedByUid: performUid,
          timestamp: new Date().toISOString(),
          reason: commentVal || "Workflow Action Transition"
        }
      ];
    };

    const updateFields: any = {
      updatedAt: new Date().toISOString()
    };

    if (action === "submit") {
      if (originalWorkflowStatus !== "Draft" && originalWorkflowStatus !== "Returned for Correction") {
        throw new Error(`Cannot submit product master of state: ${originalWorkflowStatus}`);
      }
      targetWorkflowStatus = "Pending for Review";
      updateFields.workflowStatus = "Pending for Review";
      updateFields.history = logHistory("Submit for Review", originalWorkflowStatus, targetWorkflowStatus, "Submitting product specifications for GAMP alignment");
    } 
    else if (action === "start-review") {
      if (originalWorkflowStatus !== "Pending for Review") {
        throw new Error(`Cannot start review of product master of state: ${originalWorkflowStatus}`);
      }
      targetWorkflowStatus = "Under Review";
      updateFields.workflowStatus = "Under Review";
      updateFields.history = logHistory("Review Initiated", originalWorkflowStatus, targetWorkflowStatus, "QA reviewing product master metrics");
    } 
    else if (action === "review") {
      // Can result in either Under Review forwarding (or returning for correction)
      if (originalWorkflowStatus !== "Under Review" && originalWorkflowStatus !== "Pending for Review") {
        throw new Error(`Cannot review product master of state: ${originalWorkflowStatus}`);
      }
      const isReturn = payload?.decision === "return";
      if (isReturn) {
        targetWorkflowStatus = "Returned for Correction";
        updateFields.workflowStatus = "Returned for Correction";
        updateFields.reviewComments = comments;
        updateFields.history = logHistory("Returned for Correction", originalWorkflowStatus, targetWorkflowStatus, `Returned by reviewer: ${comments}`);
      } else {
        // Kept Under Review but marked with reviewer recommendation/comments
        targetWorkflowStatus = "Under Review";
        updateFields.reviewComments = comments;
        updateFields.reviewedBy = performUid;
        updateFields.reviewedByEmail = performEmail;
        updateFields.history = logHistory("Forwarded for Approval", originalWorkflowStatus, targetWorkflowStatus, `Approved by reviewer: ${comments}`);
      }
    } 
    else if (action === "approve") {
      if (originalWorkflowStatus !== "Under Review" && originalWorkflowStatus !== "Pending for Review") {
        throw new Error(`Cannot approve product master of state: ${originalWorkflowStatus}`);
      }
      targetWorkflowStatus = "Approved";
      targetStatus = "active";
      updateFields.workflowStatus = "Active"; // Becomes effective immediately
      updateFields.status = "active";
      updateFields.approvedBy = performUid;
      updateFields.approvedByEmail = performEmail;
      updateFields.approvedDate = new Date().toISOString();
      updateFields.effectiveDate = new Date().toISOString();
      updateFields.activeSince = new Date().toISOString();
      updateFields.approvalComments = comments;
      updateFields.history = logHistory("Product Approved & Active", originalWorkflowStatus, "Active", `Approved and sealed: ${comments}`);

      // AUTOMATED OBSOLESCENCE ON APPROVAL
      // "Only after approval: Version 2 → Active, Version 1 → Obsolete"
      if (product.parentProductId) {
        try {
          console.log(`[SERVICE]: transitionWorkflow - Initiating obsolescence for parent ID: ${product.parentProductId}`);
          const previousActiveId = product.parentProductId;
          let docsToObsolete: any[] = [];
          let primaryParentDocExists = false;
          let primaryParentData: any = null;

          if (await checkAdminHealth()) {
            // Let's mark previous family active documents as Obsolete
            const snapshot = await adminDb.collection("product_masters")
              .where("parentProductId", "==", previousActiveId)
              .get();
            
            docsToObsolete = snapshot.docs.filter(snap => snap.id !== id && snap.data().status === "active").map(snap => ({
              id: snap.id,
              data: snap.data(),
              update: (fields: any) => snap.ref.update(fields)
            }));

            // Also check the primary parent itself
            const primaryParentRef = adminDb.collection("product_masters").doc(previousActiveId);
            const primaryParentDoc = await primaryParentRef.get();
            primaryParentDocExists = primaryParentDoc.exists;
            primaryParentData = primaryParentDoc.data();
            
            if (primaryParentDocExists && primaryParentData?.status === "active") {
              await primaryParentRef.update({
                status: "inactive",
                workflowStatus: "Obsolete",
                deactivatedSince: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              });
              await AuditService.logAction(performUid, performEmail, "OBSOLETE_PRODUCT_MASTER", previousActiveId, "PRODUCT_MASTER", primaryParentData, { status: "inactive", workflowStatus: "Obsolete" }, `Obsoleted automatically upon Version ${product.version} approval`, undefined, undefined, undefined, signatureInfo?.ipAddress, signatureInfo?.userAgent, product.branch, product.branch, adminUser?.role, adminUser?.name);
            }

            for (const docObj of docsToObsolete) {
              await docObj.update({
                status: "inactive",
                workflowStatus: "Obsolete",
                deactivatedSince: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              });
              await AuditService.logAction(performUid, performEmail, "OBSOLETE_PRODUCT_MASTER", docObj.id, "PRODUCT_MASTER", docObj.data, { status: "inactive", workflowStatus: "Obsolete" }, `Obsoleted automatically upon Version ${product.version} approval`, undefined, undefined, undefined, signatureInfo?.ipAddress, signatureInfo?.userAgent, product.branch, product.branch, adminUser?.role, adminUser?.name);
            }
          } else {
            // Client SDK Fallback
            await ensureAuth();

            const snapshot = await getDocs(
              query(
                collection(db, "product_masters"),
                where("parentProductId", "==", previousActiveId)
              )
            );

            docsToObsolete = snapshot.docs.filter(snap => snap.id !== id && snap.data().status === "active").map(snap => ({
              id: snap.id,
              data: snap.data(),
              update: async (fields: any) => {
                await updateDoc(doc(db, "product_masters", snap.id), fields);
              }
            }));

            // Also check the primary parent itself
            const primaryParentRef = doc(db, "product_masters", previousActiveId);
            const primaryParentDoc = await getDoc(primaryParentRef);
            primaryParentDocExists = primaryParentDoc.exists();
            primaryParentData = primaryParentDoc.data();

            if (primaryParentDocExists && primaryParentData?.status === "active") {
              await updateDoc(primaryParentRef, {
                status: "inactive",
                workflowStatus: "Obsolete",
                deactivatedSince: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              });
              await AuditService.logAction(performUid, performEmail, "OBSOLETE_PRODUCT_MASTER", previousActiveId, "PRODUCT_MASTER", primaryParentData, { status: "inactive", workflowStatus: "Obsolete" }, `Obsoleted automatically upon Version ${product.version} approval`, undefined, undefined, undefined, signatureInfo?.ipAddress, signatureInfo?.userAgent, product.branch, product.branch, adminUser?.role, adminUser?.name);
            }

            for (const docObj of docsToObsolete) {
              await docObj.update({
                status: "inactive",
                workflowStatus: "Obsolete",
                deactivatedSince: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              });
              await AuditService.logAction(performUid, performEmail, "OBSOLETE_PRODUCT_MASTER", docObj.id, "PRODUCT_MASTER", docObj.data, { status: "inactive", workflowStatus: "Obsolete" }, `Obsoleted automatically upon Version ${product.version} approval`, undefined, undefined, undefined, signatureInfo?.ipAddress, signatureInfo?.userAgent, product.branch, product.branch, adminUser?.role, adminUser?.name);
            }
          }
        } catch (obsErr) {
          console.error("Failed to obsolete previous product master versions automatically:", obsErr);
        }
      }
    } 
    else if (action === "reject") {
      if (originalWorkflowStatus !== "Under Review" && originalWorkflowStatus !== "Pending for Review") {
        throw new Error(`Cannot reject product of state: ${originalWorkflowStatus}`);
      }
      targetWorkflowStatus = "Rejected";
      targetStatus = "inactive";
      updateFields.workflowStatus = "Rejected";
      updateFields.status = "inactive";
      updateFields.rejectedComments = comments;
      updateFields.history = logHistory("Product Rejected", originalWorkflowStatus, "Rejected", `Rejected by Approver: ${comments}`);
    } 
    else if (action === "return-correction") {
      if (originalWorkflowStatus !== "Rejected" && originalWorkflowStatus !== "Under Review" && originalWorkflowStatus !== "Pending for Review") {
        throw new Error(`Cannot return for correction product master of state: ${originalWorkflowStatus}`);
      }
      
      const returnReason = comments || payload?.returnReason || "Returned for correction";
      const returnToStep = payload?.returnToStep || "Draft";
      targetWorkflowStatus = "Returned for Correction";
      
      const returnCount = ((product as any).returnCount || 0) + 1;
      const history = (product as any).returnHistory || [];
      const newHistoryEntry = {
        returnNo: returnCount,
        returnedAt: new Date().toISOString(),
        returnedBy: performUid,
        returnedByEmail: performEmail,
        returnedByName: adminUser?.displayName || performEmail,
        returnedByRole: adminUser?.role || 'QA',
        fromStep: originalWorkflowStatus,
        toStep: returnToStep,
        reason: returnReason,
        comments: payload?.comments || '',
      };

      updateFields.workflowStatus = "Returned for Correction";
      updateFields.returnedBy = performUid;
      updateFields.returnedByEmail = performEmail;
      updateFields.returnedAt = new Date().toISOString();
      updateFields.returnedFrom = originalWorkflowStatus;
      updateFields.returnedTo = returnToStep;
      updateFields.returnReason = returnReason;
      updateFields.returnComments = payload?.comments || '';
      updateFields.returnCount = returnCount;
      updateFields.returnHistory = [...history, newHistoryEntry];
      updateFields.history = logHistory("Returned for Correction", originalWorkflowStatus, targetWorkflowStatus, `Returned for Correction: ${returnReason}`);
    }

    // Attempt Admin SDK update
    try {
      const adminRef = adminDb.collection("product_masters").doc(id);
      await adminRef.update(updateFields);

      let signatureId: string | undefined;
      if (signatureInfo) {
        try {
          const sigRef = adminDb.collection("electronic_signatures").doc();
          signatureId = sigRef.id;
          await sigRef.set({
            userId: performUid,
            actionType: `${action.toUpperCase()}_PRODUCT_MASTER`,
            entityType: "PRODUCT_MASTER",
            entityId: id,
            meaning: signatureInfo.meaning,
            signedAt: new Date().toISOString(),
            ipAddress: signatureInfo.ipAddress,
            userAgent: signatureInfo.userAgent,
            createdAt: new Date().toISOString()
          });
        } catch (errSig) { console.error("Signature save error:", errSig); }
      }

      await AuditService.logAction(
        performUid, 
        performEmail, 
        `WORKFLOW_${action.toUpperCase()}_PRODUCT_MASTER`, 
        id, 
        "PRODUCT_MASTER", 
        product, 
        { ...product, ...updateFields }, 
        comments, 
        undefined, 
        signatureId, 
        signatureInfo?.meaning, 
        signatureInfo?.ipAddress, 
        signatureInfo?.userAgent, 
        product.branch, 
        product.branch, 
        adminUser?.role, 
        adminUser?.name
      );

      // Trigger Notification
      try {
        let notiTitle = "";
        let notiMsg = "";
        let notiType = NotificationType.INFO;
        let notiEvent = "";
        let notiTargetType = TargetType.ROLE;
        let notiTargetId = "QA";

        if (action === "submit") {
          notiTitle = "Product Master Pending Review";
          notiMsg = `Product Master "${product.title}" has been submitted for review.`;
          notiType = NotificationType.INFO;
          notiEvent = "product:review";
        } 
        else if (action === "start-review") {
          notiTitle = "Product Master Under Review";
          notiMsg = `Review has been initiated for Product Master "${product.title}".`;
          notiType = NotificationType.INFO;
          notiEvent = "product:review";
        } 
        else if (action === "review") {
          const isReturn = payload?.decision === "return";
          if (isReturn) {
            notiTitle = "Product Master Returned for Correction";
            notiMsg = `Product Master "${product.title}" was returned for correction. Comments: ${comments}`;
            notiType = NotificationType.WARNING;
            notiEvent = "product:review";
            if (product.createdBy) {
              notiTargetType = TargetType.USER;
              notiTargetId = product.createdBy;
            }
          } else {
            notiTitle = "Product Master Review Completed";
            notiMsg = `Review completed for Product Master "${product.title}". Forwarded for approval. Comments: ${comments}`;
            notiType = NotificationType.SUCCESS;
            notiEvent = "product:review";
          }
        } 
        else if (action === "approve") {
          notiTitle = "Product Master Approved";
          notiMsg = `Product Master "${product.title}" has been approved and is now Active. Comments: ${comments}`;
          notiType = NotificationType.SUCCESS;
          notiEvent = "product:approve";
        } 
        else if (action === "reject") {
          notiTitle = "Product Master Rejected";
          notiMsg = `Product Master "${product.title}" has been rejected. Comments: ${comments}`;
          notiType = NotificationType.ERROR;
          notiEvent = "product:review";
          if (product.createdBy) {
            notiTargetType = TargetType.USER;
            notiTargetId = product.createdBy;
          }
        } 
        else if (action === "return-correction") {
          notiTitle = "Product Master Returned for Correction";
          notiMsg = `Product Master "${product.title}" has been returned for correction. Comments: ${comments}`;
          notiType = NotificationType.WARNING;
          notiEvent = "product:review";
          if (product.createdBy) {
            notiTargetType = TargetType.USER;
            notiTargetId = product.createdBy;
          }
        }

        if (notiTitle) {
          await NotificationService.sendNotification({
            title: notiTitle,
            message: notiMsg,
            type: notiType,
            targetType: notiTargetType,
            targetId: notiTargetId,
            eventType: notiEvent,
            link: "/product-masters"
          });
        }
      } catch (notiErr) {
        console.error("Failed to send workflow transition notification:", notiErr);
      }

      return { id, ...product, ...updateFields };
    } catch (adminErr: any) {
      // Fallback Client SDK transaction
      await ensureAuth();
      const clientRef = doc(db, "product_masters", id);
      await setDoc(clientRef, updateFields, { merge: true });

      let signatureId: string | undefined;
      if (signatureInfo) {
        const sigRef = doc(collection(db, "electronic_signatures"));
        signatureId = sigRef.id;
        await setDoc(sigRef, {
          userId: performUid,
          actionType: `${action.toUpperCase()}_PRODUCT_MASTER`,
          entityType: "PRODUCT_MASTER",
          entityId: id,
          meaning: signatureInfo.meaning,
          signedAt: new Date().toISOString(),
          ipAddress: signatureInfo.ipAddress,
          userAgent: signatureInfo.userAgent,
          createdAt: new Date().toISOString()
        });
      }

      await AuditService.logAction(
        performUid, 
        performEmail, 
        `WORKFLOW_${action.toUpperCase()}_PRODUCT_MASTER`, 
        id, 
        "PRODUCT_MASTER", 
        product, 
        { ...product, ...updateFields }, 
        comments, 
        undefined, 
        signatureId, 
        signatureInfo?.meaning, 
        signatureInfo?.ipAddress, 
        signatureInfo?.userAgent, 
        product.branch, 
        product.branch, 
        adminUser?.role, 
        adminUser?.name
      );

      // Trigger Notification on Fallback
      try {
        let notiTitle = "";
        let notiMsg = "";
        let notiType = NotificationType.INFO;
        let notiEvent = "";
        let notiTargetType = TargetType.ROLE;
        let notiTargetId = "QA";

        if (action === "submit") {
          notiTitle = "Product Master Pending Review";
          notiMsg = `Product Master "${product.title}" has been submitted for review.`;
          notiType = NotificationType.INFO;
          notiEvent = "product:review";
        } 
        else if (action === "start-review") {
          notiTitle = "Product Master Under Review";
          notiMsg = `Review has been initiated for Product Master "${product.title}".`;
          notiType = NotificationType.INFO;
          notiEvent = "product:review";
        } 
        else if (action === "review") {
          const isReturn = payload?.decision === "return";
          if (isReturn) {
            notiTitle = "Product Master Returned for Correction";
            notiMsg = `Product Master "${product.title}" was returned for correction. Comments: ${comments}`;
            notiType = NotificationType.WARNING;
            notiEvent = "product:review";
            if (product.createdBy) {
              notiTargetType = TargetType.USER;
              notiTargetId = product.createdBy;
            }
          } else {
            notiTitle = "Product Master Review Completed";
            notiMsg = `Review completed for Product Master "${product.title}". Forwarded for approval. Comments: ${comments}`;
            notiType = NotificationType.SUCCESS;
            notiEvent = "product:review";
          }
        } 
        else if (action === "approve") {
          notiTitle = "Product Master Approved";
          notiMsg = `Product Master "${product.title}" has been approved and is now Active. Comments: ${comments}`;
          notiType = NotificationType.SUCCESS;
          notiEvent = "product:approve";
        } 
        else if (action === "reject") {
          notiTitle = "Product Master Rejected";
          notiMsg = `Product Master "${product.title}" has been rejected. Comments: ${comments}`;
          notiType = NotificationType.ERROR;
          notiEvent = "product:review";
          if (product.createdBy) {
            notiTargetType = TargetType.USER;
            notiTargetId = product.createdBy;
          }
        } 
        else if (action === "return-correction") {
          notiTitle = "Product Master Returned for Correction";
          notiMsg = `Product Master "${product.title}" has been returned for correction. Comments: ${comments}`;
          notiType = NotificationType.WARNING;
          notiEvent = "product:review";
          if (product.createdBy) {
            notiTargetType = TargetType.USER;
            notiTargetId = product.createdBy;
          }
        }

        if (notiTitle) {
          await NotificationService.sendNotification({
            title: notiTitle,
            message: notiMsg,
            type: notiType,
            targetType: notiTargetType,
            targetId: notiTargetId,
            eventType: notiEvent,
            link: "/product-masters"
          });
        }
      } catch (notiErr) {
        console.error("Failed to send workflow transition notification on fallback:", notiErr);
      }

      return { id, ...product, ...updateFields };
    }
  }

  static async softDeleteProduct(id: string, changeReason: string, adminUser: any, signatureInfo?: any) {
    if (!changeReason) {
      throw new Error("Reason for deactivation is required");
    }

    const updateData = { 
      status: "inactive" as const, 
      workflowStatus: "Inactive" as const,
      deactivatedSince: new Date().toISOString(),
      updatedAt: new Date().toISOString() 
    };

    try {
      console.log(`[SERVICE]: softDeleteProduct - Attempting with Admin SDK...`);
      const productRef = adminDb.collection("product_masters").doc(id);
      const productDoc = await productRef.get();
      if (!productDoc.exists) {
        throw new Error("Product Master not found");
      }

      const oldValue = productDoc.data();

      // Business Rule: Cannot delete if linked to ACTIVE batch sheet masters
      const mastersSnapshot = await adminDb.collection("batch_sheet_masters")
        .where("productId", "==", id)
        .where("isDeleted", "==", false)
        .get();
        
      const activeMasters = mastersSnapshot.docs.filter(docSnap => {
        const status = docSnap.data().status;
        return ['DRAFT', 'UNDER_REVIEW', 'APPROVED'].includes(status);
      });
      
      if (activeMasters.length > 0) {
        throw new Error("Cannot deactivate product master that is linked to active batch sheet masters.");
      }

      await productRef.update(updateData);
      console.log(`[SERVICE]: softDeleteProduct - Admin SDK Success.`);

      let signatureId: string | undefined;
      const uid = adminUser?.uid || 'system';
      const email = adminUser?.email || 'system@internal';

      if (signatureInfo) {
        try {
          const signatureRef = adminDb.collection("electronic_signatures").doc();
          signatureId = signatureRef.id;
          await signatureRef.set({
            userId: uid,
            actionType: "DELETE_PRODUCT_MASTER",
            entityType: "PRODUCT_MASTER",
            entityId: id,
            meaning: signatureInfo.meaning,
            signedAt: new Date().toISOString(),
            ipAddress: signatureInfo.ipAddress,
            userAgent: signatureInfo.userAgent,
            createdAt: new Date().toISOString(),
          });
        } catch (sigErr) { console.error("Admin Signature save failed:", sigErr); }
      }

      await AuditService.logAction(uid, email, "DELETE_PRODUCT_MASTER", id, "PRODUCT_MASTER", oldValue, updateData, changeReason, undefined, signatureId, signatureInfo?.meaning, signatureInfo?.ipAddress, signatureInfo?.userAgent, oldValue.branch, oldValue.branch, adminUser?.role, adminUser?.name);

      // Trigger Notification
      try {
        await NotificationService.sendNotification({
          title: "Product Master Deactivated",
          message: `Product Master "${oldValue?.title || id}" has been deactivated. Reason: ${changeReason}`,
          type: NotificationType.WARNING,
          targetType: TargetType.ROLE,
          targetId: "QA",
          eventType: "edit:product",
          link: "/product-masters"
        });
      } catch (notiErr) {
        console.error("Failed to send deactivation notification:", notiErr);
      }

      return { id, ...updateData };
    } catch (adminError: any) {
      console.warn(`[SERVICE]: softDeleteProduct - Fallback to Client...`);
      try {
        await ensureAuth();
        const productRef = doc(db, "product_masters", id);
        const productDoc = await getDoc(productRef);
        if (!productDoc.exists()) {
          throw new Error("Product Master not found via Client SDK fallback.");
        }

        const oldValue = productDoc.data();

        // Client SDK check
        const q = query(
          collection(db, "batch_sheet_masters"),
          where("productId", "==", id),
          where("isDeleted", "==", false)
        );
        const mastersSnapshot = await getDocs(q);
          
        const activeMasters = mastersSnapshot.docs.filter(docSnap => {
          const status = docSnap.data().status;
          return ['DRAFT', 'UNDER_REVIEW', 'APPROVED'].includes(status);
        });
        
        if (activeMasters.length > 0) {
          throw new Error("Cannot deactivate product master that is linked to active batch sheet masters.");
        }

        await setDoc(productRef, updateData, { merge: true });

        let signatureId: string | undefined;
        const uid = adminUser?.uid || 'system';
        const email = adminUser?.email || 'system@internal';

        if (signatureInfo) {
          const signatureRef = doc(collection(db, "electronic_signatures"));
          signatureId = signatureRef.id;
          await setDoc(signatureRef, {
            userId: uid,
            actionType: "DELETE_PRODUCT_MASTER",
            entityType: "PRODUCT_MASTER",
            entityId: id,
            meaning: signatureInfo.meaning,
            signedAt: new Date().toISOString(),
            ipAddress: signatureInfo.ipAddress,
            userAgent: signatureInfo.userAgent,
            createdAt: new Date().toISOString(),
          });
        }

        await AuditService.logAction(uid, email, "DELETE_PRODUCT_MASTER", id, "PRODUCT_MASTER", oldValue, updateData, changeReason, undefined, signatureId, signatureInfo?.meaning, signatureInfo?.ipAddress, signatureInfo?.userAgent, oldValue.branch, oldValue.branch, adminUser?.role, adminUser?.name);

        // Trigger Notification on Fallback
        try {
          await NotificationService.sendNotification({
            title: "Product Master Deactivated",
            message: `Product Master "${oldValue?.title || id}" has been deactivated. Reason: ${changeReason}`,
            type: NotificationType.WARNING,
            targetType: TargetType.ROLE,
            targetId: "QA",
            eventType: "edit:product",
            link: "/product-masters"
          });
        } catch (notiErr) {
          console.error("Failed to send deactivation notification on fallback:", notiErr);
        }

        return { id, ...updateData };
      } catch (clientError: any) {
        throw new Error(`Failed to deactivate product master: ${clientError.message}`);
      }
    }
  }

  static async getProductMastersWithMasters(selectedBranch?: string) {
    await ensureAuth();
    // Fetch all active, fully approved product masters
    let qProducts = query(
      collection(db, "product_masters"),
      where("status", "==", "active")
    );
    if (selectedBranch) {
      qProducts = query(qProducts, where("branch", "==", selectedBranch));
    }
    const productsSnapshot = await getDocs(qProducts);
    
    const products = productsSnapshot.docs.map((docSnap: any) => ({ id: docSnap.id, ...docSnap.data() }));

    // For each product master, fetch its batch sheet masters
    const productsWithMasters = await Promise.all(products.map(async (product: any) => {
      let qMasters = query(
        collection(db, "batch_sheet_masters"),
        where("productId", "==", product.id)
      );
      if (selectedBranch) {
        qMasters = query(qMasters, where("branch", "==", selectedBranch));
      }
      const mastersSnapshot = await getDocs(qMasters);
      
      const masters = mastersSnapshot.docs.map((docSnap: any) => ({ id: docSnap.id, ...docSnap.data() }));
      
      return {
        ...product,
        masters: masters,
        masterCount: masters.length
      };
    }));

    return productsWithMasters;
  }
}
