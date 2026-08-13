import { db, ensureAuth } from "../config/firebase-client.ts";
import { collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, runTransaction, orderBy } from "firebase/firestore";
import { AuditService } from "./audit.service.ts";
import { SignatureService } from "./signature.service.ts";
import { BatchSheetRecord, RecordStatus, Approval, MasterStatus } from "../../types.ts";

export class ApprovalService {
  static async submitForReview(recordId: string, user: any, signatureInfo?: any) {
    await ensureAuth();
    const recordRef = doc(db, "batch_sheet_records", recordId);
    
    return await runTransaction(db, async (transaction) => {
      const recordDoc = await transaction.get(recordRef);

      if (!recordDoc.exists()) {
        throw new Error("Batch Sheet Record not found");
      }

      const recordData = recordDoc.data() as BatchSheetRecord;
      if (!recordData.masterId) {
        throw new Error("Batch Sheet Record is not associated with a Master ID");
      }

      if (recordData.status !== 'DRAFT') {
        throw new Error(`Cannot submit record in ${recordData.status} status. Only DRAFT records can be submitted.`);
      }

      const updateData = {
        status: 'UNDER_REVIEW' as RecordStatus,
        updatedAt: new Date().toISOString(),
      };

      transaction.update(recordRef, updateData);

      // Update master status
      const masterRef = doc(db, "batch_sheet_masters", recordData.masterId);
      transaction.update(masterRef, {
        status: 'UNDER_REVIEW',
        updatedAt: new Date().toISOString()
      });

      if (signatureInfo) {
        await SignatureService.signAction(
          user.uid,
          user.email,
          "SUBMIT",
          "BATCH_SHEET_RECORD",
          recordId,
          signatureInfo.meaning,
          signatureInfo.ipAddress,
          signatureInfo.userAgent,
          transaction
        );
      }

      await AuditService.logAction(
        user.uid,
        user.email,
        "SUBMIT_FOR_APPROVAL",
        recordId,
        "BATCH_SHEET_RECORD",
        { status: 'DRAFT' },
        { status: 'UNDER_REVIEW' },
        "Submitted for review",
        transaction,
        undefined,
        signatureInfo?.meaning
      );

      return { id: recordId, ...updateData };
    });
  }

  static async approveRecord(recordId: string, comments: string, user: any, signatureInfo?: any) {
    await ensureAuth();
    const recordRef = doc(db, "batch_sheet_records", recordId);
    
    // Pre-fetch data needed for the transaction that requires queries
    const recordDocSnapshot = await getDoc(recordRef);
    if (!recordDocSnapshot.exists()) {
      throw new Error("Batch Sheet Record not found");
    }
    const preliminaryData = recordDocSnapshot.data() as BatchSheetRecord;
    const masterId = preliminaryData.masterId;

    if (!masterId) {
      throw new Error("Missing masterId association on record");
    }

    const q = query(
      collection(db, "batch_sheet_records"),
      where("masterId", "==", masterId),
      where("status", "==", "APPROVED")
    );
    const approvedSnapshot = await getDocs(q);
    const oldApprovedDocIds = approvedSnapshot.docs.map(d => d.id);

    return await runTransaction(db, async (transaction) => {
      const recordDoc = await transaction.get(recordRef);

      if (!recordDoc.exists()) {
        throw new Error("Batch Sheet Record not found during transaction");
      }

      const recordData = recordDoc.data() as BatchSheetRecord;

      if (recordData.status !== 'UNDER_REVIEW') {
        throw new Error(`Only records in UNDER_REVIEW status can be approved. Current status: ${recordData.status}`);
      }

      // Read master document before any writes
      const masterRef = doc(db, "batch_sheet_masters", masterId);
      const masterDoc = await transaction.get(masterRef);
      if (!masterDoc.exists()) {
        throw new Error("Batch Sheet Master not found");
      }
      const masterData = masterDoc.data();

      // 1. Archive existing approved records
      for (const oldDocId of oldApprovedDocIds) {
        transaction.update(doc(db, "batch_sheet_records", oldDocId), {
          status: 'ARCHIVED',
          updatedAt: new Date().toISOString()
        });

        // Non-blocking audit for archives can happen after transaction or we do it simply here
        // But for transaction atomicity we only update the status
      }

      // 2. Approve the new record
      const approvalData = {
        status: 'APPROVED' as RecordStatus,
        approvedBy: user.uid,
        approvedAt: new Date().toISOString(),
        isLocked: true,
        updatedAt: new Date().toISOString(),
      };

      transaction.update(recordRef, approvalData);

      // 3. Create Approval record
      const approvalRef = doc(collection(db, "approvals"));
      const approvalRecord: Omit<Approval, 'id'> = {
        recordId,
        status: 'APPROVED',
        comments: comments || "Approved",
        actionBy: user.uid,
        actionAt: new Date().toISOString(),
        signatureRequired: true,
        createdAt: new Date().toISOString(),
      };
      transaction.set(approvalRef, approvalRecord);

      // 4. Update master
      let nextVerStr = masterData.version || "1.0";
      if (oldApprovedDocIds.length > 0) {
        let prevVer = masterData.version || "1.0";
        const prevApprovedRecord = approvedSnapshot.docs.find(d => d.data().status === "APPROVED");
        if (prevApprovedRecord) {
          prevVer = prevApprovedRecord.data().masterSnapshot?.version || prevVer;
        }
        const parsedVer = parseFloat(prevVer);
        nextVerStr = isNaN(parsedVer) ? "2.0" : (parsedVer + 1.0).toFixed(1);
      }

      transaction.update(masterRef, {
        status: 'APPROVED',
        isLocked: true,
        version: nextVerStr,
        updatedAt: new Date().toISOString()
      });

      // Update approved record's snapshot version to match
      transaction.update(recordRef, {
        "masterSnapshot.version": nextVerStr
      });

      let signatureId: string | undefined;
      if (signatureInfo) {
        const sigResult = await SignatureService.signAction(
          user.uid,
          user.email,
          "APPROVE",
          "BATCH_SHEET_RECORD",
          recordId,
          signatureInfo.meaning,
          signatureInfo.ipAddress,
          signatureInfo.userAgent,
          transaction
        );
        signatureId = sigResult.id;
      }

      await AuditService.logAction(
        user.uid,
        user.email,
        "APPROVE_BATCH_SHEET_RECORD",
        recordId,
        "BATCH_SHEET_RECORD",
        { status: 'UNDER_REVIEW' },
        approvalData,
        comments,
        transaction,
        signatureId,
        signatureInfo?.meaning,
        signatureInfo?.ipAddress,
        signatureInfo?.userAgent
      );

      return { id: recordId, ...approvalData };
    });
  }

  static async rejectRecord(recordId: string, comments: string, user: any, signatureInfo?: any) {
    if (!comments) {
      throw new Error("Comments are required for rejection");
    }

    await ensureAuth();
    const recordRef = doc(db, "batch_sheet_records", recordId);
    
    return await runTransaction(db, async (transaction) => {
      const recordDoc = await transaction.get(recordRef);

      if (!recordDoc.exists()) {
        throw new Error("Batch Sheet Record not found");
      }

      const recordData = recordDoc.data() as BatchSheetRecord;
      if (!recordData.masterId) {
        throw new Error("Batch Sheet Record is not associated with a Master ID");
      }

      if (recordData.status !== 'UNDER_REVIEW') {
        throw new Error(`Only records in UNDER_REVIEW status can be rejected. Current status: ${recordData.status}`);
      }

      const updateData = {
        status: 'REJECTED' as RecordStatus,
        updatedAt: new Date().toISOString(),
      };

      transaction.update(recordRef, updateData);

      // Update master status
      const masterRef = doc(db, "batch_sheet_masters", recordData.masterId);
      transaction.update(masterRef, {
        status: 'REJECTED' as MasterStatus,
        updatedAt: new Date().toISOString()
      });

      // Create Approval record
      const approvalRef = doc(collection(db, "approvals"));
      const approvalRecord: Omit<Approval, 'id'> = {
        recordId,
        status: 'REJECTED',
        comments,
        actionBy: user.uid,
        actionAt: new Date().toISOString(),
        signatureRequired: true,
        createdAt: new Date().toISOString(),
      };
      transaction.set(approvalRef, approvalRecord);

      let signatureId: string | undefined;
      if (signatureInfo) {
        const sigResult = await SignatureService.signAction(
          user.uid,
          user.email,
          "REJECT",
          "BATCH_SHEET_RECORD",
          recordId,
          signatureInfo.meaning,
          signatureInfo.ipAddress,
          signatureInfo.userAgent,
          transaction
        );
        signatureId = sigResult.id;
      }

      await AuditService.logAction(
        user.uid,
        user.email,
        "REJECT_BATCH_SHEET_RECORD",
        recordId,
        "BATCH_SHEET_RECORD",
        { status: 'UNDER_REVIEW' },
        updateData,
        comments,
        transaction,
        signatureId,
        signatureInfo?.meaning,
        signatureInfo?.ipAddress,
        signatureInfo?.userAgent
      );

      return { id: recordId, ...updateData };
    });
  }

  static async returnRecord(
    recordId: string, 
    returnReason: string, 
    returnToStep: string = 'DRAFT', 
    comments?: string, 
    user?: any, 
    signatureInfo?: any
  ) {
    if (!returnReason || returnReason.trim().length < 5) {
      throw new Error("Return reason is required and must be at least 5 characters long.");
    }

    await ensureAuth();
    const recordRef = doc(db, "batch_sheet_records", recordId);

    return await runTransaction(db, async (transaction) => {
      const recordDoc = await transaction.get(recordRef);

      if (!recordDoc.exists()) {
        throw new Error("Batch Sheet Record not found");
      }

      const recordData = recordDoc.data() as BatchSheetRecord;
      if (!recordData.masterId) {
        throw new Error("Batch Sheet Record is not associated with a Master ID");
      }

      if (recordData.status !== 'UNDER_REVIEW') {
        throw new Error(`Only records in UNDER_REVIEW status can be returned. Current status: ${recordData.status}`);
      }

      const returnCount = (recordData.returnCount || 0) + 1;
      const history = recordData.returnHistory || [];
      const newHistoryEntry = {
        returnNo: returnCount,
        returnedAt: new Date().toISOString(),
        returnedBy: user?.uid || 'QA',
        returnedByEmail: user?.email || '',
        returnedByName: user?.displayName || user?.email || 'QA Personnel',
        returnedByRole: user?.role || 'QA',
        fromStep: 'UNDER_REVIEW',
        toStep: returnToStep,
        reason: returnReason.trim(),
        comments: comments?.trim() || '',
      };

      const updateData = {
        status: 'RETURNED' as RecordStatus,
        returnedBy: user?.uid,
        returnedByEmail: user?.email,
        returnedAt: new Date().toISOString(),
        returnedFrom: 'UNDER_REVIEW',
        returnedTo: returnToStep,
        returnReason: returnReason.trim(),
        returnComments: comments?.trim() || '',
        returnCount,
        returnHistory: [...history, newHistoryEntry],
        updatedAt: new Date().toISOString(),
      };

      transaction.update(recordRef, updateData);

      // Update master status to RETURNED
      const masterRef = doc(db, "batch_sheet_masters", recordData.masterId);
      transaction.update(masterRef, {
        status: 'RETURNED' as MasterStatus,
        updatedAt: new Date().toISOString()
      });

      // Create Approval / Return Record
      const approvalRef = doc(collection(db, "approvals"));
      const approvalRecord: Omit<Approval, 'id'> = {
        recordId,
        status: 'PENDING',
        comments: `[RETURNED] Reason: ${returnReason}${comments ? ` | Comments: ${comments}` : ''}`,
        actionBy: user?.uid || 'QA',
        actionAt: new Date().toISOString(),
        signatureRequired: true,
        createdAt: new Date().toISOString(),
      };
      transaction.set(approvalRef, approvalRecord);

      let signatureId: string | undefined;
      if (signatureInfo) {
        const sigResult = await SignatureService.signAction(
          user.uid,
          user.email,
          "RETURN_FOR_CORRECTION",
          "BATCH_SHEET_RECORD",
          recordId,
          signatureInfo.meaning || "Returned for Correction",
          signatureInfo.ipAddress,
          signatureInfo.userAgent,
          transaction
        );
        signatureId = sigResult.id;
      }

      await AuditService.logAction(
        user.uid,
        user.email,
        "RETURN_BATCH_SHEET_RECORD",
        recordId,
        "BATCH_SHEET_RECORD",
        { status: 'UNDER_REVIEW' },
        updateData,
        `Returned for Correction: ${returnReason}`,
        transaction,
        signatureId,
        signatureInfo?.meaning || "Returned for Correction",
        signatureInfo?.ipAddress,
        signatureInfo?.userAgent
      );

      return { id: recordId, ...updateData };
    });
  }

  static async resubmitRecord(recordId: string, changeReason: string, user: any, signatureInfo?: any) {
    await ensureAuth();
    const recordRef = doc(db, "batch_sheet_records", recordId);

    return await runTransaction(db, async (transaction) => {
      const recordDoc = await transaction.get(recordRef);

      if (!recordDoc.exists()) {
        throw new Error("Batch Sheet Record not found");
      }

      const recordData = recordDoc.data() as BatchSheetRecord;

      if (recordData.status !== 'RETURNED' && recordData.status !== 'DRAFT') {
        throw new Error(`Cannot resubmit record in ${recordData.status} status. Only RETURNED or DRAFT records can be resubmitted.`);
      }

      // Update return history to record resubmission date/user
      const history = [...(recordData.returnHistory || [])];
      if (history.length > 0) {
        history[history.length - 1].resubmittedAt = new Date().toISOString();
        history[history.length - 1].resubmittedBy = user.uid;
        history[history.length - 1].resubmittedByEmail = user.email;
        history[history.length - 1].resubmittedByName = user.displayName || user.email;
      }

      const updateData = {
        status: 'UNDER_REVIEW' as RecordStatus,
        changeReason: changeReason || recordData.changeReason || 'Resubmitted after correction',
        returnHistory: history,
        updatedAt: new Date().toISOString(),
      };

      transaction.update(recordRef, updateData);

      if (recordData.masterId) {
        const masterRef = doc(db, "batch_sheet_masters", recordData.masterId);
        transaction.update(masterRef, {
          status: 'UNDER_REVIEW',
          updatedAt: new Date().toISOString()
        });
      }

      if (signatureInfo) {
        await SignatureService.signAction(
          user.uid,
          user.email,
          "RESUBMIT",
          "BATCH_SHEET_RECORD",
          recordId,
          signatureInfo.meaning || "Resubmitted for review after correction",
          signatureInfo.ipAddress,
          signatureInfo.userAgent,
          transaction
        );
      }

      await AuditService.logAction(
        user.uid,
        user.email,
        "RESUBMIT_BATCH_SHEET_RECORD",
        recordId,
        "BATCH_SHEET_RECORD",
        { status: recordData.status },
        { status: 'UNDER_REVIEW' },
        "Resubmitted after correction",
        transaction,
        undefined,
        signatureInfo?.meaning
      );

      return { id: recordId, ...updateData };
    });
  }

  static async getPendingApprovals(selectedBranch?: string) {
    await ensureAuth();
    let q = query(collection(db, "batch_sheet_records"), where("status", "==", "UNDER_REVIEW"));
    if (selectedBranch) {
      q = query(q, where("branch", "==", selectedBranch));
    }
    const snapshot = await getDocs(q);
    const docs = snapshot.docs.map((doc: any) => ({ id: doc.id, ...(doc.data() as any) }));

    // Sort by createdAt asc in-memory
    docs.sort((a: any, b: any) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeA - timeB;
    });

    return docs;
  }

  static async getApprovalHistory(recordId: string) {
    await ensureAuth();
    // Query the audit trail for all actions related to this record
    const q = query(
      collection(db, "audit_trail"),
      where("entityId", "==", recordId),
      where("entityType", "==", "BATCH_SHEET_RECORD"),
      orderBy("timestamp", "asc")
    );
    const snapshot = await getDocs(q);

    const history = snapshot.docs.map((doc: any) => {
      const data = doc.data();
      return {
        id: doc.id,
        action: data.action,
        userId: data.userId,
        userEmail: data.userEmail,
        timestamp: data.timestamp,
        comments: data.changeReason || data.newValue?.comments || null,
        oldStatus: data.oldValue?.status || null,
        newStatus: data.newValue?.status || null
      };
    });

    // Filter for workflow-relevant actions
    const workflowActions = [
      "SUBMIT_FOR_APPROVAL",
      "APPROVE_BATCH_SHEET_RECORD",
      "REJECT_BATCH_SHEET_RECORD",
      "BATCH_SHEET_RECORD_ARCHIVED",
      "BATCH_SHEET_RECORD_SUPERSEDED"
    ];

    return history.filter(h => workflowActions.includes(h.action));
  }
}
