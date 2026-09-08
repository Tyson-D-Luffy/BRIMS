import { db, ensureAuth } from "../config/firebase-client.ts";
import { collection, doc, getDoc, getDocs, query, where, orderBy, setDoc, updateDoc, runTransaction, limit as firestoreLimit } from "firebase/firestore";
import { adminDb, checkAdminHealth } from "../config/firebase-admin.ts";
import { AuditService } from "./audit.service.ts";
import { SignatureService } from "./signature.service.ts";
import { BatchSheetRecordService } from "./batchSheetRecord.service.ts";
import { MasterStatus } from "../../types.ts";

export class BatchSheetMasterService {
  private static async checkDuplicate(masterName: string, description?: string, documentNumber?: string, excludeId?: string, batchNumberSeries?: string) {
    let masters: any[] = [];
    try {
      if (await checkAdminHealth()) {
        const snapshot = await adminDb.collection("batch_sheet_masters").get();
        masters = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      } else {
        await ensureAuth();
        const snapshot = await getDocs(query(collection(db, "batch_sheet_masters"), where("isDeleted", "==", false)));
        masters = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      }
    } catch (err: any) {
      console.warn("BatchSheetMasterService.checkDuplicate fallback query:", err.message);
    }

    const inputName = (masterName || "").trim().toLowerCase();
    const inputDocNum = (documentNumber || "").trim().toLowerCase();
    const inputBatchSeries = (batchNumberSeries || "").trim().toLowerCase();

    for (const m of masters) {
      if (m.isDeleted || m.status === 'RETIRED' || m.status === 'OBSOLETE') continue;
      if (excludeId && m.id === excludeId) continue;

      const docName = (m.masterName || m.title || "").trim().toLowerCase();
      const docNum = (m.documentNumber || "").trim().toLowerCase();
      const docBatchSeries = (m.batchNumberSeries || "").trim().toLowerCase();

      // Batch Sheet Master with the exact same Title/Name can exist if the Batch number series or Document number is different.
      // A record is considered a duplicate ONLY if ALL three match: Title/Name, Batch number series, and Document number!
      if (inputName && docName === inputName) {
        const isSameBatchSeries = inputBatchSeries === docBatchSeries;
        const isSameDocNum = inputDocNum === docNum;

        if (isSameBatchSeries && isSameDocNum) {
          throw new Error(`A Batch Sheet Master with the name "${masterName}", batch series "${batchNumberSeries || 'N/A'}", and document number "${documentNumber || 'N/A'}" already exists.`);
        }
      }
    }
  }

  static async createMaster(masterData: any, user: any, metadata?: any) {
    const { 
      productId, 
      masterName, 
      steps_json,
      stage,
      type,
      batchNumberSeries,
      documentNumber,
      description,
      version: customVersion,
      files
    } = masterData;

    await this.checkDuplicate(masterName, description, documentNumber, undefined, batchNumberSeries);

    console.log(`BatchSheetMasterService: Creating new master: ${masterName} for product ${productId}`);
    
    // 1. Try Admin SDK write if available for maximum reliability in Cloud Run
    try {
      if (await checkAdminHealth()) {
        const productDoc = await adminDb.collection("product_masters").doc(productId).get();
        if (!productDoc.exists) {
          console.error(`BatchSheetMasterService (Admin): Product ${productId} not found.`);
          throw new Error(`Product Master with ID ${productId} not found. Please select a valid product.`);
        }

        const docRef = adminDb.collection("batch_sheet_masters").doc();
        const newMaster = {
          productId,
          masterName: masterName || "Untitled Master",
          version: customVersion || "1.0",
          status: "DRAFT" as MasterStatus,
          steps_json: steps_json || [],
          stage: stage || "",
          type: type || "",
          branch: masterData.branch || "Masulkhana",
          batchNumberSeries: batchNumberSeries || "",
          documentNumber: documentNumber || "",
          files: files || [],
          createdBy: user.uid,
          createdAt: new Date().toISOString(),
          updatedBy: user.uid,
          updatedAt: new Date().toISOString(),
          isDeleted: false,
          isLocked: false
        };

        await docRef.set(newMaster);

        // Record history snapshot
        try {
          await BatchSheetRecordService.createRecord(
            docRef.id,
            "Initial record creation",
            user,
            undefined,
            newMaster
          );
        } catch (recErr: any) {
          console.warn("BatchSheetMasterService (Admin): Record snapshot warning:", recErr.message);
        }

        // Log audit action
        try {
          await AuditService.logAction(
            user.uid,
            user.email,
            "CREATE_BATCH_SHEET_MASTER",
            docRef.id,
            "BATCH_SHEET_MASTER",
            null,
            newMaster,
            "Initial creation",
            undefined,
            undefined,
            undefined,
            metadata?.ip,
            metadata?.userAgent,
            metadata?.selectedBranch || masterData.branch,
            masterData.branch || "Masulkhana"
          );
        } catch (auditErr: any) {
          console.warn("BatchSheetMasterService (Admin): Audit logging warning:", auditErr.message);
        }

        return { id: docRef.id, ...newMaster };
      }
    } catch (adminError: any) {
      if (adminError.message.includes("not found")) {
        throw adminError;
      }
      console.warn("BatchSheetMasterService: Admin SDK failed, falling back to client SDK:", adminError.message);
    }

    // 2. Client SDK Fallback
    await ensureAuth();
    try {
      return await runTransaction(db, async (transaction) => {
        // 1. Verify product exists
        const productRef = doc(db, "product_masters", productId);
        const productDoc = await transaction.get(productRef);
        if (!productDoc.exists()) {
          console.error(`BatchSheetMasterService: Product ${productId} not found.`);
          throw new Error(`Product Master with ID ${productId} not found. Please select a valid product.`);
        }

        const docRef = doc(collection(db, "batch_sheet_masters"));
        const newMaster = {
          productId,
          masterName: masterName || "Untitled Master",
          version: customVersion || "1.0",
          status: "DRAFT" as MasterStatus,
          steps_json: steps_json || [],
          stage: stage || "",
          type: type || "",
          branch: masterData.branch || "Masulkhana",
          batchNumberSeries: batchNumberSeries || "",
          documentNumber: documentNumber || "",
          files: files || [],
          createdBy: user.uid,
          createdAt: new Date().toISOString(),
          updatedBy: user.uid,
          updatedAt: new Date().toISOString(),
          isDeleted: false,
          isLocked: false
        };

        console.log(`BatchSheetMasterService: Saving master document ${docRef.id}`);
        transaction.set(docRef, newMaster);

        // 2. Create Record 1 (within transaction)
        console.log(`BatchSheetMasterService: Creating initial history record for ${docRef.id}`);
        await BatchSheetRecordService.createRecord(
          docRef.id,
          "Initial record creation",
          user,
          transaction,
          newMaster
        );

        console.log(`BatchSheetMasterService: Logging audit action for ${docRef.id}`);
        await AuditService.logAction(
          user.uid,
          user.email,
          "CREATE_BATCH_SHEET_MASTER",
          docRef.id,
          "BATCH_SHEET_MASTER",
          null,
          newMaster,
          "Initial creation",
          transaction,
          undefined,
          undefined,
          metadata?.ip,
          metadata?.userAgent,
          metadata?.selectedBranch || masterData.branch,
          masterData.branch || "Masulkhana"
        );

        return { id: docRef.id, ...newMaster };
      });
    } catch (err: any) {
      console.error(`BatchSheetMasterService: Transaction failed:`, err.message);
      throw new Error(`Critical error saving master protocol: ${err.message}`);
    }
  }

  static async getAllMasters(filters: any) {
    const { name, status, stage, type, productId, batchNumberSeries, limit: limitVal = 100, selectedBranch } = filters;
    
    try {
      let masters: any[] = [];

      if (await checkAdminHealth()) {
        const snapshot = await adminDb.collection("batch_sheet_masters").get();
        masters = snapshot.docs
          .map(docSnap => ({ id: docSnap.id, ...docSnap.data() as any }))
          .filter(m => !m.isDeleted);
      } else {
        await ensureAuth();
        const q = query(collection(db, "batch_sheet_masters"), where("isDeleted", "==", false));
        const snapshot = await getDocs(q);
        masters = snapshot.docs.map((docSnap: any) => ({ id: docSnap.id, ...docSnap.data() as any }));
      }

      // 2. Branch filtering (inclusive of masters without explicit branch tag or matching branch)
      if (selectedBranch) {
        masters = masters.filter(m => !m.branch || m.branch === selectedBranch || m.branch === "Masulkhana");
      }

      // 3. In-memory filtering
      if (name) {
        const searchLower = name.toLowerCase();
        masters = masters.filter(m => 
          (m.masterName && m.masterName.toLowerCase().includes(searchLower)) ||
          (m.documentNumber && m.documentNumber.toLowerCase().includes(searchLower)) ||
          (m.batchNumberSeries && m.batchNumberSeries.toLowerCase().includes(searchLower))
        );
      }
      if (status) masters = masters.filter(m => m.status === status);
      if (stage) masters = masters.filter(m => m.stage === stage);
      if (type) masters = masters.filter(m => m.type === type);
      if (productId) masters = masters.filter(m => m.productId === productId);
      if (batchNumberSeries) masters = masters.filter(m => m.batchNumberSeries === batchNumberSeries);

      // 4. Sort and Limit
      masters.sort((a, b) => (a.masterName || "").localeCompare(b.masterName || ""));
      masters = masters.slice(0, Number(limitVal));

      // 5. Resolve Product info
      const resolvedMasters = await Promise.all(masters.map(async (master) => {
        try {
          if (await checkAdminHealth()) {
            const productDoc = await adminDb.collection("product_masters").doc(master.productId).get();
            return {
              ...master,
              product: productDoc.exists ? productDoc.data() : null
            };
          } else {
            const productDoc = await getDoc(doc(db, "product_masters", master.productId));
            return { 
              ...master,
              product: productDoc.exists() ? productDoc.data() : null
            };
          }
        } catch (err) {
          console.error(`Error fetching product ${master.productId} for master ${master.id}:`, err);
          return { ...master, product: null };
        }
      }));

      return resolvedMasters;
    } catch (error) {
      console.error("BatchSheetMasterService.getAllMasters Error:", error);
      throw error;
    }
  }

  static async getMasterById(id: string) {
    await ensureAuth();
    const masterDoc = await getDoc(doc(db, "batch_sheet_masters", id));
    if (!masterDoc.exists() || masterDoc.data()?.isDeleted) {
      throw new Error("Batch Sheet Master not found");
    }
    const data = masterDoc.data();
    const productDoc = await getDoc(doc(db, "product_masters", data?.productId));
    return { 
      id: masterDoc.id, 
      ...data,
      product: productDoc.exists() ? productDoc.data() : null
    };
  }

  static async updateMaster(id: string, updateData: any, user: any, metadata?: any) {
    const { changeReason, ...restOfData } = updateData;

    if (!changeReason) {
      throw new Error("Reason for change is required for GMP compliance");
    }

    await ensureAuth();
    return await runTransaction(db, async (transaction) => {
      const masterRef = doc(db, "batch_sheet_masters", id);
      const masterDoc = await transaction.get(masterRef);
      if (!masterDoc.exists() || masterDoc.data()?.isDeleted) {
        throw new Error("Batch Sheet Master not found");
      }

      const currentData = masterDoc.data();

      const newMasterName = restOfData.masterName || restOfData.title || currentData?.masterName || currentData?.title;
      const newDesc = restOfData.description !== undefined ? restOfData.description : currentData?.description;
      const newDocNum = restOfData.documentNumber || currentData?.documentNumber;
      const newBatchSeries = restOfData.batchNumberSeries || currentData?.batchNumberSeries;
      
      await BatchSheetMasterService.checkDuplicate(newMasterName, newDesc, newDocNum, id, newBatchSeries);

      if (currentData?.isLocked === true && !['UNDER_UPDATE', 'DRAFT', 'REJECTED', 'RETURNED'].includes(currentData?.status)) {
        throw new Error("This master is LOCKED. Modifications are prohibited.");
      }

      const updatedMaster = {
        ...restOfData,
        updatedBy: user.uid,
        updatedAt: new Date().toISOString(),
      };

      transaction.update(masterRef, updatedMaster);

      await AuditService.logAction(
        user.uid,
        user.email,
        "UPDATE_BATCH_SHEET_MASTER",
        id,
        "BATCH_SHEET_MASTER",
        currentData,
        updatedMaster,
        changeReason,
        transaction,
        undefined,
        undefined,
        metadata?.ip,
        metadata?.userAgent
      );

      return { id, ...updatedMaster };
    });
  }

  static async requestUpdateMaster(id: string, changeReason: string, user: any, signatureInfo: any) {
    if (!changeReason) throw new Error("Reason for update is required");

    await ensureAuth();
    return await runTransaction(db, async (transaction) => {
      const masterRef = doc(db, "batch_sheet_masters", id);
      const masterDoc = await transaction.get(masterRef);
      if (!masterDoc.exists() || masterDoc.data()?.isDeleted) throw new Error("Master not found");

      const currentData = masterDoc.data();
      if (!['APPROVED', 'REJECTED', 'RETURNED', 'UNDER_UPDATE'].includes(currentData.status)) {
        throw new Error("Only approved, rejected, or returned masters can be requested for update");
      }

      const updateData = {
        status: "UNDER_UPDATE" as MasterStatus,
        isLocked: false,
        updatedBy: user.uid,
        updatedAt: new Date().toISOString(),
      };

      transaction.update(masterRef, updateData);

      const signatureRef = doc(collection(db, "electronic_signatures"));
      const signatureData = {
        userId: user.uid,
        actionType: "REQUEST_UPDATE_BATCH_SHEET_MASTER",
        entityType: "BATCH_SHEET_MASTER",
        entityId: id,
        meaning: signatureInfo?.meaning || "I certify that I am requesting an update to this master record. This action will be logged and requires justification.",
        signedAt: new Date().toISOString(),
        ipAddress: signatureInfo?.ipAddress || "unknown",
        userAgent: signatureInfo?.userAgent || "unknown",
        createdAt: new Date().toISOString(),
      };
      transaction.set(signatureRef, signatureData);

      await AuditService.logAction(
        user.uid, user.email, "REQUEST_UPDATE_BATCH_SHEET_MASTER", id, "BATCH_SHEET_MASTER",
        { status: currentData.status, isLocked: currentData.isLocked }, updateData,
        changeReason, transaction, signatureRef.id, signatureData.meaning, signatureInfo?.ipAddress, signatureInfo?.userAgent
      );

      return { id, ...updateData };
    });
  }

  static async submitMasterForReview(id: string, changeReason: string, user: any, signatureInfo: any) {
    if (!changeReason) throw new Error("Reason for submission is required");

    await ensureAuth();
    return await runTransaction(db, async (transaction) => {
      const masterRef = doc(db, "batch_sheet_masters", id);
      const masterDoc = await transaction.get(masterRef);
      if (!masterDoc.exists() || masterDoc.data()?.isDeleted) throw new Error("Master not found");

      const masterData = masterDoc.data() || {};
      if (!['DRAFT', 'UNDER_UPDATE', 'REJECTED', 'RETURNED'].includes(masterData.status)) {
        throw new Error("Invalid status for submission");
      }

      const record = await BatchSheetRecordService.createRecord(id, changeReason, user, transaction, masterData);
      const recordRef = doc(db, "batch_sheet_records", record.id);
      transaction.update(recordRef, { status: 'UNDER_REVIEW', updatedAt: new Date().toISOString() });

      const updateData = {
        status: "UNDER_REVIEW" as MasterStatus,
        updatedBy: user.uid,
        updatedAt: new Date().toISOString(),
      };
      transaction.update(masterRef, updateData);

      const signatureRef = doc(collection(db, "electronic_signatures"));
      const signatureData = {
        userId: user.uid,
        actionType: "SUBMIT_MASTER_FOR_REVIEW",
        entityType: "BATCH_SHEET_MASTER",
        entityId: id,
        meaning: signatureInfo.meaning,
        signedAt: new Date().toISOString(),
        ipAddress: signatureInfo.ipAddress,
        userAgent: signatureInfo.userAgent,
        createdAt: new Date().toISOString(),
      };
      transaction.set(signatureRef, signatureData);

      await AuditService.logAction(
        user.uid, user.email, "SUBMIT_MASTER_FOR_REVIEW", id, "BATCH_SHEET_MASTER",
        { status: masterData.status }, updateData,
        changeReason, transaction, signatureRef.id, signatureInfo.meaning, signatureInfo.ipAddress, signatureInfo.userAgent
      );

      return { id, recordId: record.id };
    });
  }

  static async reviewMaster(id: string, comments: string, user: any, signatureInfo?: any) {
    await ensureAuth();
    return await runTransaction(db, async (transaction) => {
      const masterRef = doc(db, "batch_sheet_masters", id);
      const masterDoc = await transaction.get(masterRef);
      if (!masterDoc.exists() || masterDoc.data()?.isDeleted) throw new Error("Master not found");

      const masterData = masterDoc.data() || {};
      if (masterData.status !== 'UNDER_REVIEW') {
        throw new Error(`Only masters in UNDER_REVIEW status can be reviewed. Current status: ${masterData.status}`);
      }

      // Segregation of duties
      if (masterData.createdBy === user.uid && user.role !== 'ADMIN') {
        throw new Error("Compliance Duty Segregation (21 CFR Part 11): The author cannot perform the Review step.");
      }

      const reviewerName = user.displayName || user.username || user.email?.split('@')[0] || user.email || 'QA Reviewer';
      const reviewTimestamp = new Date().toISOString();
      const reviewCommentsVal = comments || "Reviewed and recommended for approval";

      const updateData: any = {
        status: "PENDING_APPROVAL" as MasterStatus,
        reviewedBy: user.uid,
        reviewedByEmail: user.email || '',
        reviewedByName: reviewerName,
        reviewedAt: reviewTimestamp,
        reviewComments: reviewCommentsVal,
        updatedBy: user.uid,
        updatedAt: reviewTimestamp,
      };

      transaction.update(masterRef, updateData);

      let signatureId: string | undefined;
      if (signatureInfo) {
        const sigResult = await SignatureService.signAction(
          user.uid,
          user.email,
          "REVIEW_MASTER",
          "BATCH_SHEET_MASTER",
          id,
          signatureInfo.meaning || "I have reviewed this master record and recommend it for approval",
          signatureInfo.ipAddress,
          signatureInfo.userAgent,
          transaction
        );
        signatureId = sigResult.id;
      }

      await AuditService.logAction(
        user.uid,
        user.email,
        "REVIEW_BATCH_SHEET_MASTER",
        id,
        "BATCH_SHEET_MASTER",
        { status: masterData.status },
        updateData,
        reviewCommentsVal,
        transaction,
        signatureId,
        signatureInfo?.meaning || "I have reviewed this master record and recommend it for approval",
        signatureInfo?.ipAddress,
        signatureInfo?.userAgent
      );

      return { id, ...updateData };
    });
  }

  static async softDeleteMaster(id: string, changeReason: string, user: any) {
    if (!changeReason) throw new Error("Reason for deletion is required");

    await ensureAuth();
    return await runTransaction(db, async (transaction) => {
      const masterRef = doc(db, "batch_sheet_masters", id);
      const masterDoc = await transaction.get(masterRef);
      if (!masterDoc.exists() || masterDoc.data()?.isDeleted) throw new Error("Master not found");

      if (masterDoc.data()?.isLocked) throw new Error("Cannot delete a locked master");

      const updateData = { isDeleted: true, updatedBy: user.uid, updatedAt: new Date().toISOString() };
      transaction.update(masterRef, updateData);

      await AuditService.logAction(
        user.uid, user.email, "DELETE_BATCH_SHEET_MASTER", id, "BATCH_SHEET_MASTER",
        masterDoc.data(), updateData, changeReason, transaction
      );

      return { id, ...updateData };
    });
  }

  static async retireMaster(id: string, changeReason: string, user: any, signatureInfo: any) {
    if (!changeReason) throw new Error("Reason required");

    await ensureAuth();
    return await runTransaction(db, async (transaction) => {
      const masterRef = doc(db, "batch_sheet_masters", id);
      const masterDoc = await transaction.get(masterRef);
      if (!masterDoc.exists() || masterDoc.data()?.isDeleted) throw new Error("Master not found");

      const updateData = { status: "RETIRED" as MasterStatus, updatedBy: user.uid, updatedAt: new Date().toISOString() };
      transaction.update(masterRef, updateData);

      const signatureRef = doc(collection(db, "electronic_signatures"));
      transaction.set(signatureRef, {
        userId: user.uid, 
        actionType: "RETIRE_BATCH_SHEET_MASTER", 
        entityType: "BATCH_SHEET_MASTER", 
        entityId: id,
        meaning: signatureInfo.meaning, 
        signedAt: new Date().toISOString(), 
        ipAddress: signatureInfo.ipAddress,
        userAgent: signatureInfo.userAgent, 
        createdAt: new Date().toISOString()
      });

      await AuditService.logAction(
        user.uid, user.email, "RETIRE_BATCH_SHEET_MASTER", id, "BATCH_SHEET_MASTER",
        { status: masterDoc.data()?.status }, updateData, changeReason, transaction, signatureRef.id, signatureInfo.meaning
      );

      return { id, ...updateData };
    });
  }

  static async isEditable(id: string) {
    await ensureAuth();
    const masterDoc = await getDoc(doc(db, "batch_sheet_masters", id));
    if (!masterDoc.exists() || masterDoc.data()?.isDeleted) throw new Error("Master not found");
    
    const data = masterDoc.data();
    const isLocked = data?.isLocked === true;
    const isApproved = data?.status === "APPROVED";
    const isUnderUpdate = data?.status === "UNDER_UPDATE";
    
    return {
      id,
      isLocked,
      status: data?.status,
      isEditable: (!isLocked && !isApproved) || isUnderUpdate,
      reason: isLocked ? (isUnderUpdate ? null : "LOCKED") : (isApproved ? "APPROVED" : null)
    };
  }

  static async updateStatus(id: string, newStatus: MasterStatus, changeReason: string, user: any) {
    await ensureAuth();
    return await runTransaction(db, async (transaction) => {
      const masterRef = doc(db, "batch_sheet_masters", id);
      const masterDoc = await transaction.get(masterRef);
      if (!masterDoc.exists()) throw new Error("Master not found");

      const updateData: any = { status: newStatus, updatedBy: user.uid, updatedAt: new Date().toISOString() };
      if (['UNDER_UPDATE', 'DRAFT'].includes(newStatus)) updateData.isLocked = false;

      transaction.update(masterRef, updateData);

      await AuditService.logAction(
        user.uid, user.email, "STATUS_CHANGE_BATCH_SHEET_MASTER", id, "BATCH_SHEET_MASTER",
        { status: masterDoc.data()?.status }, updateData, changeReason, transaction
      );

      return { id, ...updateData };
    });
  }

  static async cloneMaster(id: string, newName: string, user: any) {
    await ensureAuth();
    return await runTransaction(db, async (transaction) => {
      const sourceRef = doc(db, "batch_sheet_masters", id);
      const sourceDoc = await transaction.get(sourceRef);
      if (!sourceDoc.exists() || sourceDoc.data()?.isDeleted) throw new Error("Source not found");

      const sourceData = sourceDoc.data() || {};
      const newRef = doc(collection(db, "batch_sheet_masters"));
      const cloned = {
        ...sourceData,
        masterName: newName,
        version: "1.0",
        status: "DRAFT" as MasterStatus,
        createdBy: user.uid,
        createdAt: new Date().toISOString(),
        updatedBy: user.uid,
        updatedAt: new Date().toISOString(),
        isDeleted: false,
      };

      transaction.set(newRef, cloned);
      await BatchSheetRecordService.createRecord(newRef.id, `Cloned from ${sourceData.masterName}`, user, transaction, cloned);

      await AuditService.logAction(
        user.uid, user.email, "CLONE_BATCH_SHEET_MASTER", newRef.id, "BATCH_SHEET_MASTER",
        { sourceId: id }, cloned, `Cloned from ${sourceData.masterName}`, transaction
      );

      return { id: newRef.id, ...cloned };
    });
  }

  static async duplicateSteps(sourceId: string, targetId: string, changeReason: string, user: any) {
    await ensureAuth();
    return await runTransaction(db, async (transaction) => {
      const sourceRef = doc(db, "batch_sheet_masters", sourceId);
      const targetRef = doc(db, "batch_sheet_masters", targetId);
      const [sourceDoc, targetDoc] = await Promise.all([transaction.get(sourceRef), transaction.get(targetRef)]);

      if (!sourceDoc.exists() || !targetDoc.exists()) throw new Error("Master not found");
      if (targetDoc.data()?.isLocked) throw new Error("Target is locked");

      const updateData = {
        steps_json: sourceDoc.data()?.steps_json,
        updatedBy: user.uid,
        updatedAt: new Date().toISOString()
      };
      transaction.update(targetRef, updateData);

      await AuditService.logAction(
        user.uid, user.email, "DUPLICATE_STEPS", targetId, "BATCH_SHEET_MASTER",
        { oldSteps: targetDoc.data()?.steps_json?.length }, { newSteps: sourceDoc.data()?.steps_json?.length, sourceId },
        changeReason, transaction
      );

      return { id: targetId, ...updateData };
    });
  }

  static async updateSingleStep(id: string, stepNumber: number, stepData: any, changeReason: string, user: any) {
    await ensureAuth();
    return await runTransaction(db, async (transaction) => {
      const masterRef = doc(db, "batch_sheet_masters", id);
      const masterDoc = await transaction.get(masterRef);
      if (!masterDoc.exists()) throw new Error("Master not found");
      if (masterDoc.data()?.isLocked) throw new Error("Master is locked");

      const steps = [...(masterDoc.data()?.steps_json || [])];
      const index = steps.findIndex(s => s.step_number === stepNumber);
      if (index === -1) throw new Error("Step not found");

      steps[index] = { ...steps[index], ...stepData, step_number: stepNumber };
      const updateData = { steps_json: steps, updatedBy: user.uid, updatedAt: new Date().toISOString() };
      transaction.update(masterRef, updateData);

      await AuditService.logAction(
        user.uid, user.email, "UPDATE_STEP", id, "BATCH_SHEET_MASTER",
        { old: masterDoc.data()?.steps_json[index] }, { new: steps[index] },
        changeReason, transaction
      );

      return { id, step: steps[index] };
    });
  }

  static async returnMaster(
    id: string,
    returnReason: string,
    returnToStep: string = 'DRAFT',
    comments?: string,
    user?: any
  ) {
    if (!returnReason || returnReason.trim().length < 5) {
      throw new Error("Return reason is required and must be at least 5 characters long.");
    }

    await ensureAuth();
    return await runTransaction(db, async (transaction) => {
      const masterRef = doc(db, "batch_sheet_masters", id);
      const masterDoc = await transaction.get(masterRef);
      if (!masterDoc.exists() || masterDoc.data()?.isDeleted) throw new Error("Master not found");

      const masterData = masterDoc.data();
      const returnCount = (masterData.returnCount || 0) + 1;
      const history = masterData.returnHistory || [];
      const newHistoryEntry = {
        returnNo: returnCount,
        returnedAt: new Date().toISOString(),
        returnedBy: user?.uid || 'QA',
        returnedByEmail: user?.email || '',
        returnedByName: user?.displayName || user?.email || 'QA Personnel',
        returnedByRole: user?.role || 'QA',
        fromStep: masterData.status || 'UNDER_REVIEW',
        toStep: returnToStep,
        reason: returnReason.trim(),
        comments: comments?.trim() || '',
      };

      const updateData: any = {
        status: 'RETURNED' as MasterStatus,
        isLocked: false,
        returnedBy: user?.uid,
        returnedByEmail: user?.email,
        returnedAt: new Date().toISOString(),
        returnedFrom: masterData.status || 'UNDER_REVIEW',
        returnedTo: returnToStep,
        returnReason: returnReason.trim(),
        returnComments: comments?.trim() || '',
        returnCount,
        returnHistory: [...history, newHistoryEntry],
        updatedBy: user?.uid || 'QA',
        updatedAt: new Date().toISOString(),
      };

      transaction.update(masterRef, updateData);

      await AuditService.logAction(
        user?.uid || 'QA',
        user?.email || '',
        "RETURN_BATCH_SHEET_MASTER",
        id,
        "BATCH_SHEET_MASTER",
        { status: masterData.status },
        updateData,
        `Returned for Correction: ${returnReason}`,
        transaction
      );

      return { id, ...updateData };
    });
  }

  static async resubmitMaster(id: string, changeReason: string, user: any) {
    await ensureAuth();
    return await runTransaction(db, async (transaction) => {
      const masterRef = doc(db, "batch_sheet_masters", id);
      const masterDoc = await transaction.get(masterRef);
      if (!masterDoc.exists() || masterDoc.data()?.isDeleted) throw new Error("Master not found");

      const masterData = masterDoc.data();
      if (masterData.status !== 'RETURNED' && masterData.status !== 'DRAFT') {
        throw new Error(`Cannot resubmit master in ${masterData.status} status.`);
      }

      const history = [...(masterData.returnHistory || [])];
      if (history.length > 0) {
        history[history.length - 1].resubmittedAt = new Date().toISOString();
        history[history.length - 1].resubmittedBy = user.uid;
        history[history.length - 1].resubmittedByEmail = user.email;
        history[history.length - 1].resubmittedByName = user.displayName || user.email;
      }

      const updateData: any = {
        status: 'UNDER_REVIEW' as MasterStatus,
        changeReason: changeReason || masterData.changeReason || 'Resubmitted after correction',
        returnHistory: history,
        updatedBy: user.uid,
        updatedAt: new Date().toISOString(),
      };

      transaction.update(masterRef, updateData);

      await AuditService.logAction(
        user.uid,
        user.email,
        "RESUBMIT_BATCH_SHEET_MASTER",
        id,
        "BATCH_SHEET_MASTER",
        { status: masterData.status },
        { status: 'UNDER_REVIEW' },
        "Resubmitted after correction",
        transaction
      );

      return { id, ...updateData };
    });
  }
}
