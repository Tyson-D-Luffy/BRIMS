import { db, ensureAuth } from "../config/firebase-client.ts";
import { collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, runTransaction, orderBy } from "firebase/firestore";
import { AuditService } from "./audit.service.ts";
import { SignatureService } from "./signature.service.ts";
import { BatchSheetRecord, RecordStatus, Approval, MasterStatus } from "../../types.ts";
import { computeNextVersion } from "./batchSheetMaster.service.ts";

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

  static async reviewRecord(recordId: string, comments: string, user: any, signatureInfo?: any) {
    await ensureAuth();
    const recordRef = doc(db, "batch_sheet_records", recordId);

    return await runTransaction(db, async (transaction) => {
      const recordDoc = await transaction.get(recordRef);

      if (!recordDoc.exists()) {
        throw new Error("Batch Sheet Record not found");
      }

      const recordData = recordDoc.data() as BatchSheetRecord;
      const masterId = recordData.masterId;

      if (!masterId) {
        throw new Error("Missing masterId association on record");
      }

      if (recordData.status !== 'UNDER_REVIEW') {
        throw new Error(`Only records in UNDER_REVIEW status can be reviewed. Current status: ${recordData.status}`);
      }

      // 21 CFR Part 11 Duty Segregation
      if (recordData.createdBy === user.uid && user.role !== "ADMIN") {
        throw new Error("Compliance Duty Segregation (21 CFR Part 11): The author cannot perform the Review step.");
      }

      const masterRef = doc(db, "batch_sheet_masters", masterId);
      const masterDoc = await transaction.get(masterRef);
      if (!masterDoc.exists()) {
        throw new Error("Batch Sheet Master not found");
      }

      const reviewerName = user.displayName || user.username || user.email?.split('@')[0] || user.email || 'QA Reviewer';
      const reviewTimestamp = new Date().toISOString();
      const reviewCommentsVal = comments || "Reviewed and recommended for approval";

      const updateData = {
        status: 'PENDING_APPROVAL' as RecordStatus,
        reviewedBy: user.uid,
        reviewedByEmail: user.email || '',
        reviewedByName: reviewerName,
        reviewedAt: reviewTimestamp,
        reviewComments: reviewCommentsVal,
        updatedAt: reviewTimestamp,
      };

      transaction.update(recordRef, updateData);

      // Create Approval Record with REVIEWED status
      const approvalRef = doc(collection(db, "approvals"));
      const approvalRecord: any = {
        recordId,
        status: 'REVIEWED',
        comments: reviewCommentsVal,
        actionBy: user.uid,
        actionAt: reviewTimestamp,
        signatureRequired: true,
        createdAt: reviewTimestamp,
      };
      transaction.set(approvalRef, approvalRecord);

      // Update master to PENDING_APPROVAL
      transaction.update(masterRef, {
        status: 'PENDING_APPROVAL' as MasterStatus,
        reviewedBy: user.uid,
        reviewedByEmail: user.email || '',
        reviewedByName: reviewerName,
        reviewedAt: reviewTimestamp,
        reviewComments: reviewCommentsVal,
        updatedAt: reviewTimestamp,
      });

      let signatureId: string | undefined;
      if (signatureInfo) {
        const sigResult = await SignatureService.signAction(
          user.uid,
          user.email,
          "REVIEW",
          "BATCH_SHEET_RECORD",
          recordId,
          signatureInfo.meaning || "I have reviewed this record and recommend it for approval",
          signatureInfo.ipAddress,
          signatureInfo.userAgent,
          transaction
        );
        signatureId = sigResult.id;
      }

      await AuditService.logAction(
        user.uid,
        user.email,
        "REVIEW_BATCH_SHEET_RECORD",
        recordId,
        "BATCH_SHEET_RECORD",
        { status: 'UNDER_REVIEW' },
        updateData,
        reviewCommentsVal,
        transaction,
        signatureId,
        signatureInfo?.meaning || "I have reviewed this record and recommend it for approval",
        signatureInfo?.ipAddress,
        signatureInfo?.userAgent
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

      if (recordData.status !== 'PENDING_APPROVAL' && recordData.status !== 'UNDER_REVIEW') {
        throw new Error(`Only records in PENDING_APPROVAL status can be approved. Current status: ${recordData.status}`);
      }

      // Segregation of Duties: Creator cannot approve their own record
      if (recordData.createdBy === user.uid && user.role !== "ADMIN") {
        throw new Error("Compliance Duty Segregation (21 CFR Part 11): The author cannot perform the Approval step.");
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
      }

      const approverName = user.displayName || user.username || user.email?.split('@')[0] || user.email || 'QA Approver';
      const approveTimestamp = new Date().toISOString();
      const approvalCommentsVal = comments || "Approved for production";

      // 2. Approve the new record
      const approvalData = {
        status: 'APPROVED' as RecordStatus,
        approvedBy: user.uid,
        approvedByEmail: user.email || '',
        approvedByName: approverName,
        approvedAt: approveTimestamp,
        approvalComments: approvalCommentsVal,
        isLocked: true,
        updatedAt: approveTimestamp,
      };

      transaction.update(recordRef, approvalData);

      // 3. Create Approval record
      const approvalRef = doc(collection(db, "approvals"));
      const approvalRecord: Omit<Approval, 'id'> = {
        recordId,
        status: 'APPROVED',
        comments: approvalCommentsVal,
        actionBy: user.uid,
        actionAt: approveTimestamp,
        signatureRequired: true,
        createdAt: approveTimestamp,
      };
      transaction.set(approvalRef, approvalRecord);

      // 4. Update master
      let nextVerStr = masterData.version || "1.0";
      if (oldApprovedDocIds.length > 0) {
        let prevVer = "1.0";
        const prevApprovedRecord = approvedSnapshot.docs.find(d => d.data().status === "APPROVED");
        if (prevApprovedRecord) {
          prevVer = prevApprovedRecord.data().masterSnapshot?.version || prevVer;
        }
        if (masterData.version && masterData.version !== prevVer) {
          nextVerStr = masterData.version;
        } else {
          nextVerStr = computeNextVersion(prevVer);
        }
      }

      transaction.update(masterRef, {
        status: 'APPROVED' as MasterStatus,
        isLocked: true,
        version: nextVerStr,
        approvedBy: user.uid,
        approvedByEmail: user.email || '',
        approvedByName: approverName,
        approvedAt: approveTimestamp,
        approvalComments: approvalCommentsVal,
        updatedAt: approveTimestamp
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
          signatureInfo.meaning || "I have reviewed this record and I approve it for production",
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
        { status: recordData.status },
        approvalData,
        approvalCommentsVal,
        transaction,
        signatureId,
        signatureInfo?.meaning || "I have reviewed this record and I approve it for production",
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

      if (recordData.status !== 'UNDER_REVIEW' && recordData.status !== 'PENDING_APPROVAL') {
        throw new Error(`Only records in UNDER_REVIEW or PENDING_APPROVAL status can be rejected. Current status: ${recordData.status}`);
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
        { status: recordData.status },
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

      if (recordData.status !== 'UNDER_REVIEW' && recordData.status !== 'PENDING_APPROVAL') {
        throw new Error(`Only records in UNDER_REVIEW or PENDING_APPROVAL status can be returned. Current status: ${recordData.status}`);
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
        fromStep: recordData.status,
        toStep: returnToStep,
        reason: returnReason.trim(),
        comments: comments?.trim() || '',
      };

      const targetStatus: RecordStatus = returnToStep === 'UNDER_REVIEW' ? 'UNDER_REVIEW' : 'RETURNED';

      const updateData = {
        status: targetStatus,
        returnedBy: user?.uid,
        returnedByEmail: user?.email,
        returnedAt: new Date().toISOString(),
        returnedFrom: recordData.status,
        returnedTo: returnToStep,
        returnReason: returnReason.trim(),
        returnComments: comments?.trim() || '',
        returnCount,
        returnHistory: [...history, newHistoryEntry],
        updatedAt: new Date().toISOString(),
      };

      transaction.update(recordRef, updateData);

      // Update master status
      const masterRef = doc(db, "batch_sheet_masters", recordData.masterId);
      transaction.update(masterRef, {
        status: (targetStatus === 'UNDER_REVIEW' ? 'UNDER_REVIEW' : 'RETURNED') as MasterStatus,
        returnedBy: user?.uid,
        returnedByEmail: user?.email,
        returnedAt: new Date().toISOString(),
        returnedFrom: recordData.status,
        returnedTo: returnToStep,
        returnReason: returnReason.trim(),
        returnComments: comments?.trim() || '',
        returnCount,
        returnHistory: [...history, newHistoryEntry],
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
        { status: recordData.status },
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
    let qReview = query(collection(db, "batch_sheet_records"), where("status", "==", "UNDER_REVIEW"));
    let qApprove = query(collection(db, "batch_sheet_records"), where("status", "==", "PENDING_APPROVAL"));
    if (selectedBranch) {
      qReview = query(qReview, where("branch", "==", selectedBranch));
      qApprove = query(qApprove, where("branch", "==", selectedBranch));
    }
    const [snapReview, snapApprove] = await Promise.all([getDocs(qReview), getDocs(qApprove)]);
    const docs = [
      ...snapReview.docs.map((doc: any) => ({ id: doc.id, ...(doc.data() as any) })),
      ...snapApprove.docs.map((doc: any) => ({ id: doc.id, ...(doc.data() as any) }))
    ];

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
      "REVIEW_BATCH_SHEET_RECORD",
      "APPROVE_BATCH_SHEET_RECORD",
      "REJECT_BATCH_SHEET_RECORD",
      "RETURN_BATCH_SHEET_RECORD",
      "RESUBMIT_BATCH_SHEET_RECORD",
      "BATCH_SHEET_RECORD_ARCHIVED",
      "BATCH_SHEET_RECORD_SUPERSEDED"
    ];

    return history.filter(h => workflowActions.includes(h.action));
  }
}
