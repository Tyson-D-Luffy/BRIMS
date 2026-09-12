import { db, ensureAuth } from "../config/firebase-client.ts";
import { collection, doc, getDoc, getDocs, query, where, orderBy, setDoc, updateDoc, runTransaction, limit as firestoreLimit } from "firebase/firestore";
import { adminDb, checkAdminHealth } from "../config/firebase-admin.ts";
import { AuditService } from "./audit.service.ts";
import { SignatureService } from "./signature.service.ts";
import { BatchSheetRecordService } from "./batchSheetRecord.service.ts";
import { MasterStatus, BatchIssuanceStatus } from "../../types.ts";
import { initializeBatchSheets } from "./batch-issuance.service.ts";
import { isSheetCompleted, isSheetDiscarded, getIndividualSheetState, computeDiscardReconciliation } from "../../lib/batch-sheets.ts";

export function computeNextVersion(currentVersion: string | number | undefined): string {
  if (!currentVersion) return "2.0";
  const verStr = String(currentVersion).trim();
  if (verStr.includes(".")) {
    const parts = verStr.split(".");
    const decPlaces = parts[1].length;
    const nextVal = parseFloat(verStr) + 1;
    return nextVal.toFixed(decPlaces);
  }
  const intVal = parseInt(verStr, 10);
  return isNaN(intVal) ? "2" : String(intVal + 1);
}

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

      // Backend validation: reject any manually manipulated version value
      if (restOfData.version !== undefined && currentData?.version !== undefined) {
        if (String(restOfData.version).trim() !== String(currentData.version).trim()) {
          throw new Error(`Manual modification of master version is prohibited. Expected: ${currentData.version}, Received: ${restOfData.version}`);
        }
      }

      const updatedMaster = {
        ...restOfData,
        version: currentData?.version || restOfData.version || "1.0",
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

  static async getActiveIssuanceImpact(masterId: string) {
    await ensureAuth();
    const masterRef = doc(db, "batch_sheet_masters", masterId);
    const masterDoc = await getDoc(masterRef);
    if (!masterDoc.exists() || masterDoc.data()?.isDeleted) {
      throw new Error("Batch Sheet Master not found");
    }

    const master = masterDoc.data();
    const currentVersion = master.version || "1.0";
    const nextVersion = computeNextVersion(currentVersion);

    // 1. Get all record IDs for this master
    const recordsQ = query(collection(db, "batch_sheet_records"), where("masterId", "==", masterId));
    const recordsSnap = await getDocs(recordsQ);
    const recordIds = new Set(recordsSnap.docs.map(d => d.id));

    // 2. Query production_batches
    const batchesSnap = await getDocs(collection(db, "production_batches"));
    const affectedBatches: any[] = [];
    const stateSnapshot: Record<string, string> = {};

    let totalCompletedSheets = 0;
    let totalIncompleteSheetsToDiscard = 0;

    const terminalStatuses = ['COMPLETED', 'REJECTED', 'CANCELLED', 'DISCARDED'];

    for (const bDoc of batchesSnap.docs) {
      const bData = bDoc.data();
      if (bData.isDeleted) continue;

      const isMatchingMaster = (bData.recordId && recordIds.has(bData.recordId)) || 
                               bData.masterId === masterId || 
                               (bData.productId === master.productId && (String(bData.version) === String(currentVersion) || parseFloat(bData.version) === parseFloat(currentVersion)));
      
      const isMatchingVersion = String(bData.version) === String(currentVersion) || 
                                (bData.version && parseFloat(bData.version) === parseFloat(currentVersion));
      
      const isTerminal = terminalStatuses.includes(bData.status);

      if (isMatchingMaster && isMatchingVersion && !isTerminal) {
        const sheets = initializeBatchSheets(bData);
        const completedSheets: any[] = [];
        const incompleteSheets: any[] = [];

        for (const s of sheets) {
          const completed = isSheetCompleted(s, bData.status);
          const discarded = isSheetDiscarded(s);
          const state = getIndividualSheetState(s, bData.status);
          const reconciliation = computeDiscardReconciliation(s, bData.status);

          stateSnapshot[`${bDoc.id}:${s.id}`] = state;

          if (completed) {
            completedSheets.push({
              id: s.id,
              batchNumber: s.batchNumber,
              sequenceIndex: s.sequenceIndex,
              state: 'Completed',
              custody: s.currentCustody || 'QA – Reviewed',
              completedAt: s.completedAt || s.qaReviewedAt || bData.completedAt || null,
              completedByName: s.completedByName || s.qaReviewedByName || 'QA'
            });
            totalCompletedSheets++;
          } else if (!discarded) {
            incompleteSheets.push({
              id: s.id,
              batchNumber: s.batchNumber,
              sequenceIndex: s.sequenceIndex,
              state: state,
              custody: reconciliation.custody,
              returnToQaStatus: reconciliation.returnToQaStatus
            });
            totalIncompleteSheetsToDiscard++;
          }
        }

        affectedBatches.push({
          id: bDoc.id,
          batchNumber: bData.batchNumber || "Unknown",
          productId: bData.productId,
          productName: bData.productName || master.masterName || master.title || "Unknown",
          version: bData.version || currentVersion,
          status: bData.status,
          manufacturingDate: bData.manufacturingDate || bData.createdAt,
          createdAt: bData.createdAt,
          issuedBy: bData.issuedBy,
          requestType: bData.requestType || 'NEW',
          completedSheets,
          incompleteSheets,
          completedCount: completedSheets.length,
          incompleteCount: incompleteSheets.length,
          totalSheets: sheets.length
        });
      }
    }

    return {
      masterId,
      masterName: master.masterName || master.title,
      documentNumber: master.documentNumber,
      status: master.status,
      currentVersion,
      nextVersion,
      totalAffectedRequests: affectedBatches.length,
      totalCompletedSheets,
      totalIncompleteSheetsToDiscard,
      hasActiveRequests: affectedBatches.length > 0,
      hasIncompleteSheets: totalIncompleteSheetsToDiscard > 0,
      count: affectedBatches.length,
      activeRequests: affectedBatches,
      snapshot: stateSnapshot
    };
  }

  static async requestUpdateMaster(
    id: string, 
    changeReason: string, 
    user: any, 
    signatureInfo: any, 
    options?: { 
      discardActiveRequests?: boolean;
      expectedSnapshot?: Record<string, string>;
    }
  ) {
    if (!changeReason) throw new Error("Reason for update is required");

    await ensureAuth();

    // 1. First, inspect active requests for this master and current version
    const impact = await BatchSheetMasterService.getActiveIssuanceImpact(id);
    const hasActiveRequests = impact.hasActiveRequests;
    const hasIncompleteSheets = impact.hasIncompleteSheets;
    const shouldDiscard = options?.discardActiveRequests === true;

    if (hasIncompleteSheets && !shouldDiscard) {
      throw new Error(`Active incomplete batch sheets exist for current version (${impact.currentVersion}). Confirmation to discard incomplete sheets with electronic signature is required.`);
    }

    return await runTransaction(db, async (transaction) => {
      const masterRef = doc(db, "batch_sheet_masters", id);
      const masterDoc = await transaction.get(masterRef);
      if (!masterDoc.exists() || masterDoc.data()?.isDeleted) throw new Error("Master not found");

      const currentData = masterDoc.data();
      if (currentData.status === "UNDER_UPDATE") {
        throw new Error("This master is already undergoing an update by another user or session.");
      }
      if (!['APPROVED', 'REJECTED', 'RETURNED', 'ACTIVE'].includes(currentData.status)) {
        throw new Error("Only approved, rejected, or returned masters can be requested for update");
      }

      const currentVersion = currentData.version || "1.0";
      const nextVersion = computeNextVersion(currentVersion);

      // Read active batch documents in the transaction for strict optimistic concurrency
      const activeBatchItems: { ref: any, data: any, sheets: any[] }[] = [];
      if (hasActiveRequests) {
        for (const req of impact.activeRequests) {
          const bRef = doc(db, "production_batches", req.id);
          const bDoc = await transaction.get(bRef);
          if (bDoc.exists() && !bDoc.data()?.isDeleted) {
            const bData = bDoc.data();
            if (!['COMPLETED', 'REJECTED', 'CANCELLED', 'DISCARDED'].includes(bData.status)) {
              const currentSheets = initializeBatchSheets(bData);
              activeBatchItems.push({ ref: bRef, data: bData, sheets: currentSheets });
            }
          }
        }
      }

      // Concurrency check against expectedSnapshot
      if (options?.expectedSnapshot && Object.keys(options.expectedSnapshot).length > 0) {
        for (const item of activeBatchItems) {
          for (const s of item.sheets) {
            const snapKey = `${item.ref.id}:${s.id}`;
            const expectedState = options.expectedSnapshot[snapKey];
            if (expectedState) {
              const currentState = getIndividualSheetState(s, item.data.status);
              if (currentState !== expectedState) {
                throw new Error("The Batch Sheet status has changed since impact review. Please review the updated Version Change Impact before proceeding.");
              }
            }
          }
        }
      }

      // Count totals for electronic signature record and compliance
      let grandTotalCompleted = 0;
      let grandTotalDiscarded = 0;
      for (const item of activeBatchItems) {
        for (const s of item.sheets) {
          if (isSheetCompleted(s, item.data.status)) {
            grandTotalCompleted++;
          } else if (!isSheetDiscarded(s)) {
            grandTotalDiscarded++;
          }
        }
      }

      // Prepare electronic signature
      const signatureRef = doc(collection(db, "electronic_signatures"));
      const signatureMeaning = signatureInfo?.meaning || 
        "I confirm that incomplete Batch Sheets associated with the current Batch Sheet Master version will be discarded due to version change. Completed Batch Sheets will remain valid and historically retained.";
      
      const nowIso = new Date().toISOString();
      const operatorName = user.displayName || user.username || user.name || (user.email ? user.email.split('@')[0] : 'Operator');
      const userRole = user.role || user.designation || 'QA';
      const userEmployeeId = user.employeeId || user.badgeNumber || 'N/A';
      const userBranch = user.branch || user.selectedBranch || currentData.branch || 'Main Plant';

      const signatureData = {
        userId: user.uid,
        userName: operatorName,
        userEmail: user.email || '',
        employeeId: userEmployeeId,
        role: userRole,
        designation: userRole,
        branch: userBranch,
        actionType: "REQUEST_UPDATE_BATCH_SHEET_MASTER",
        entityType: "BATCH_SHEET_MASTER",
        entityId: id,
        masterDocumentNumber: currentData.documentNumber || id,
        masterName: currentData.masterName || currentData.title || "Master",
        currentVersion,
        proposedVersion: nextVersion,
        completedSheetsRetained: grandTotalCompleted,
        incompleteSheetsDiscarded: grandTotalDiscarded,
        affectedRequestsCount: activeBatchItems.length,
        meaning: signatureMeaning,
        signedAt: nowIso,
        ipAddress: signatureInfo?.ipAddress || "unknown",
        userAgent: signatureInfo?.userAgent || "unknown",
        createdAt: nowIso,
      };
      transaction.set(signatureRef, signatureData);

      // Perform individual batch sheet discard & parent status aggregation
      for (const item of activeBatchItems) {
        const batchData = item.data;
        const sheets = [...item.sheets];
        let anyDiscardedInThisBatch = false;

        for (const s of sheets) {
          const completed = isSheetCompleted(s, batchData.status);
          const alreadyDiscarded = isSheetDiscarded(s);

          if (!completed && !alreadyDiscarded) {
            anyDiscardedInThisBatch = true;
            const stateBefore = getIndividualSheetState(s, batchData.status);
            const reconciliation = computeDiscardReconciliation(s, batchData.status);

            s.discardStatus = 'DISCARDED_DUE_TO_VERSION_CHANGE';
            s.discardReason = 'Discarded due to Version Change';
            s.discardedAt = nowIso;
            s.discardedBy = user.uid;
            s.discardedByName = operatorName;
            s.discardedByRole = userRole;
            s.discardedByEmployeeId = userEmployeeId;
            s.versionChangeId = signatureRef.id;
            s.stateBeforeDiscard = stateBefore;
            s.custodyBeforeDiscard = reconciliation.custody;
            s.returnToQaStatus = reconciliation.returnToQaStatus;
            s.currentCustody = reconciliation.custody;

            if (!s.history) s.history = [];
            s.history.push({
              id: `hist-disc-${s.id}-${Date.now()}`,
              action: 'BATCH_SHEET_DISCARDED_DUE_TO_VERSION_CHANGE' as any,
              status: 'DISCARDED_DUE_TO_VERSION_CHANGE' as any,
              timestamp: nowIso,
              performedBy: operatorName,
              userId: user.uid,
              userRole: userRole,
              employeeId: userEmployeeId,
              reason: 'Discarded due to Version Change'
            });

            // Log individual central audit event for each discarded sheet
            await AuditService.logAction(
              user.uid,
              user.email,
              "BATCH_SHEET_DISCARDED_DUE_TO_VERSION_CHANGE",
              `${item.ref.id}/${s.id}`,
              "BATCH_SHEET_ITEM",
              { state: stateBefore, custody: s.custodyBeforeDiscard },
              { 
                state: "DISCARDED_DUE_TO_VERSION_CHANGE", 
                returnToQaStatus: s.returnToQaStatus, 
                currentCustody: s.currentCustody,
                batchNumber: s.batchNumber,
                masterId: id,
                oldVersion: currentVersion,
                newVersion: nextVersion
              },
              `Discarded due to Version Change (Batch Sheet Master ${currentData.documentNumber || id} updated from v${currentVersion} to v${nextVersion})`,
              transaction,
              signatureRef.id,
              signatureMeaning,
              signatureInfo?.ipAddress,
              signatureInfo?.userAgent
            );
          }
        }

        // Recalculate parent request status
        const completedCount = sheets.filter(s => isSheetCompleted(s, batchData.status)).length;
        const discardedCount = sheets.filter(s => isSheetDiscarded(s)).length;
        const totalCount = sheets.length;

        let newParentStatus: BatchIssuanceStatus = batchData.status;
        if (completedCount === totalCount && totalCount > 0) {
          newParentStatus = 'COMPLETED';
        } else if (completedCount > 0 && discardedCount > 0 && (completedCount + discardedCount === totalCount)) {
          newParentStatus = 'PARTIALLY_COMPLETED';
        } else if (discardedCount === totalCount && totalCount > 0) {
          newParentStatus = 'DISCARDED';
        } else if (discardedCount > 0 && completedCount === 0) {
          newParentStatus = 'DISCARDED';
        }

        const batchUpdatePayload: any = {
          batchSheets: sheets,
          completedSheetCount: completedCount,
          discardedSheetCount: discardedCount,
          updatedAt: nowIso,
          versionChangeId: signatureRef.id,
          aggregateStatus: newParentStatus
        };

        if (newParentStatus !== batchData.status) {
          batchUpdatePayload.status = newParentStatus;
          batchUpdatePayload.previousStatus = batchData.status;
        }

        if (discardedCount > 0) {
          batchUpdatePayload.rejectionReason = "Discarded due to Version Change";
          batchUpdatePayload.discardReason = "Discarded due to Version Change";
          batchUpdatePayload.discardedAt = nowIso;
          batchUpdatePayload.discardedBy = user.uid;
          batchUpdatePayload.discardedByName = operatorName;
          batchUpdatePayload.discardedByEmail = user.email || '';
        }

        transaction.update(item.ref, batchUpdatePayload);

        if (newParentStatus === 'PARTIALLY_COMPLETED') {
          await AuditService.logAction(
            user.uid,
            user.email,
            "PARTIAL_REQUEST_COMPLETION_RECALCULATED",
            item.ref.id,
            "PRODUCTION_BATCH",
            { status: batchData.status },
            { 
              status: "PARTIALLY_COMPLETED", 
              completedSheets: completedCount, 
              discardedSheets: discardedCount, 
              totalSheets: totalCount 
            },
            `Batch Issuance Request recalculated as Partially Completed (${completedCount} completed / ${discardedCount} discarded due to version change)`,
            transaction,
            signatureRef.id,
            signatureMeaning,
            signatureInfo?.ipAddress,
            signatureInfo?.userAgent
          );
        } else if (newParentStatus === 'DISCARDED') {
          await AuditService.logAction(
            user.uid,
            user.email,
            "DISCARD_BATCH_ISSUANCE",
            item.ref.id,
            "PRODUCTION_BATCH",
            { status: batchData.status },
            { status: "DISCARDED", rejectionReason: "Discarded due to Version Change" },
            `Discarded due to Version Change (Batch Sheet Master ${currentData.documentNumber || id} updated from v${currentVersion} to v${nextVersion})`,
            transaction,
            signatureRef.id,
            signatureMeaning,
            signatureInfo?.ipAddress,
            signatureInfo?.userAgent
          );
        }
      }

      // Update master to UNDER_UPDATE with the new incremented version
      const updateData = {
        status: "UNDER_UPDATE" as MasterStatus,
        isLocked: false,
        version: nextVersion,
        previousVersion: currentVersion,
        updatedBy: user.uid,
        updatedAt: nowIso,
        lastUpdateRequestedAt: nowIso,
        lastUpdateRequestedBy: user.uid,
        changeReason: changeReason
      };
      transaction.update(masterRef, updateData);

      // Audit log for the master update
      await AuditService.logAction(
        user.uid,
        user.email,
        "REQUEST_UPDATE_BATCH_SHEET_MASTER",
        id,
        "BATCH_SHEET_MASTER",
        { status: currentData.status, version: currentData.version, isLocked: currentData.isLocked },
        updateData,
        `${changeReason} (Updated to version ${nextVersion}${grandTotalDiscarded > 0 ? `, discarded ${grandTotalDiscarded} incomplete batch sheet(s), retained ${grandTotalCompleted} completed sheet(s)` : ''})`,
        transaction,
        signatureRef.id,
        signatureMeaning,
        signatureInfo?.ipAddress,
        signatureInfo?.userAgent
      );

      return {
        id,
        newVersion: nextVersion,
        previousVersion: currentVersion,
        status: "UNDER_UPDATE",
        completedSheetsRetained: grandTotalCompleted,
        incompleteSheetsDiscarded: grandTotalDiscarded,
        affectedRequestsCount: activeBatchItems.length
      };
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
