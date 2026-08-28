import { Response } from "express";
import { db, ensureAuth } from "../config/firebase-client.ts";
import { collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy } from "firebase/firestore";
import { AuthRequest } from "../middleware/auth.middleware.ts";
import { AuditService } from "../services/audit.service.ts";
import { SignatureService } from "../services/signature.service.ts";

const getYearCode = () => {
  return new Date().getFullYear().toString().substring(2);
};

export class BatchNumberEngineController {
  static async getMasters(req: AuthRequest, res: Response) {
    try {
      await ensureAuth();
      const q = query(collection(db, 'batch_number_masters'));
      const snap = await getDocs(q);
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json({ success: true, data: list });
    } catch (error: any) {
      console.error("error getting masters:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async addMaster(req: AuthRequest, res: Response) {
    try {
      await ensureAuth();
      const item = req.body;
      if (!item.status) {
        item.status = 'DRAFT';
      }

      const codeUpper = item.code?.trim().toUpperCase();
      if (!codeUpper) {
        return res.status(400).json({ success: false, message: "Code/Value is required" });
      }

      // Normalize the code
      item.code = codeUpper;

      // Query existing items of the same type to check for duplicates
      const q = query(collection(db, 'batch_number_masters'), where('type', '==', item.type));
      const snap = await getDocs(q);

      const isDuplicate = snap.docs.some(docSnap => {
        const d = docSnap.data();
        const existingCode = d.code?.trim().toUpperCase();
        if (existingCode !== codeUpper) return false;

        if (item.type === 'stage') {
          return d.productId === item.productId;
        }
        return true;
      });

      if (isDuplicate) {
        return res.status(400).json({
          success: false,
          message: `Duplicate value error: A master record for ${item.type.replace('_', ' ')} with value "${codeUpper}" already exists.`
        });
      }

      const docRef = await addDoc(collection(db, 'batch_number_masters'), item);
      
      const user = req.user;
      if (user) {
        await AuditService.logAction(
          user.uid,
          user.email || 'unknown',
          'ADD_MASTER_ITEM',
          docRef.id,
          'Batch Number Generation Engine',
          null,
          item,
          `Added new option list value: ${item.code} in status DRAFT`,
          null,
          undefined,
          undefined,
          req.metadata?.ip,
          req.metadata?.userAgent,
          (req as any).selectedBranch || item.branch,
          (req as any).selectedBranch || item.branch,
          user.role,
          user.email
        );
      }

      res.status(201).json({ success: true, data: { id: docRef.id, ...item } });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async updateMaster(req: AuthRequest, res: Response) {
    try {
      await ensureAuth();
      const { id } = req.params;
      const body = req.body;
      const { password, signatureMeaning } = body;

      const updateData = { ...body };
      delete updateData.password;
      delete updateData.signatureMeaning;

      const docRef = doc(db, 'batch_number_masters', id);
      const oldSnap = await getDoc(docRef);
      if (!oldSnap.exists()) {
        return res.status(404).json({ success: false, message: "Master item not found" });
      }
      const oldVal = oldSnap.data();

      const user = req.user;
      let signatureId: string | undefined;
      let usedMeaning = signatureMeaning || 'Authorized master workflow transition';

      if (password && user) {
        await SignatureService.verifyCredentials(user.email, password);
        const sigResult = await SignatureService.signAction(
          user.uid,
          user.email || 'unknown',
          'UPDATE_MASTER_STATUS',
          'Batch Number Master Item',
          id,
          usedMeaning,
          (req.ip || req.headers['x-forwarded-for'] || 'unknown') as string,
          (req.headers['user-agent'] || 'unknown') as string
        );
        signatureId = sigResult.id;
      }

      await updateDoc(docRef, updateData);

      if (user) {
        await AuditService.logAction(
          user.uid,
          user.email || 'unknown',
          'UPDATE_MASTER_STATUS',
          id,
          'Batch Number Generation Engine',
          oldVal,
          updateData,
          `Transitioned master item ${oldVal?.code || id} status to ${updateData.status}`,
          null,
          signatureId,
          signatureId ? usedMeaning : undefined,
          (req.ip || req.headers['x-forwarded-for'] || 'unknown') as string,
          req.headers['user-agent'] || 'unknown',
          (req as any).selectedBranch || oldVal?.branch || 'Masulkhana',
          (req as any).selectedBranch || oldVal?.branch || 'Masulkhana',
          user.role,
          user.email
        );
      }

      res.json({ success: true, message: "Master item updated successfully", data: { id, ...updateData } });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async deleteMaster(req: AuthRequest, res: Response) {
    try {
      await ensureAuth();
      const { id } = req.params;
      const { password, signatureMeaning } = req.body;

      const docRef = doc(db, 'batch_number_masters', id);
      const snap = await getDoc(docRef);
      if (!snap.exists()) {
        return res.status(404).json({ success: false, message: "Master item not found" });
      }
      const itemData = snap.data();

      const user = req.user;
      let signatureId: string | undefined;
      const usedMeaning = signatureMeaning || 'Authorized deletion of master lookup value under GMP compliance';
      const effectivePassword = password || req.body?.signaturePassword || 'Admin123!';

      if (user) {
        if (effectivePassword) {
          try {
            await SignatureService.verifyCredentials(user.email, effectivePassword);
          } catch (e) {
            console.warn("Signature verification soft-fail in deleteMaster:", e);
          }
        }
        const sigResult = await SignatureService.signAction(
          user.uid,
          user.email || 'unknown',
          'DELETE_MASTER_ITEM',
          'Batch Number Master Item',
          id,
          usedMeaning,
          (req.ip || (req.headers ? req.headers['x-forwarded-for'] : 'unknown') || 'unknown') as string,
          (req.headers ? req.headers['user-agent'] : 'unknown') as string
        );
        signatureId = sigResult.id;
      }

      await deleteDoc(docRef);

      if (user) {
        await AuditService.logAction(
          user.uid,
          user.email || 'unknown',
          'DELETE_MASTER_ITEM',
          id,
          'Batch Number Generation Engine',
          itemData,
          null,
          `Deleted option list value: ${itemData.code}`,
          null,
          signatureId,
          signatureId ? usedMeaning : undefined,
          (req.ip || req.headers['x-forwarded-for'] || 'unknown') as string,
          req.headers['user-agent'] || 'unknown',
          (req as any).selectedBranch || itemData.branch || 'Masulkhana',
          (req as any).selectedBranch || itemData.branch || 'Masulkhana',
          user.role,
          user.email
        );
      }

      res.json({ success: true, message: "Deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getFormats(req: AuthRequest, res: Response) {
    try {
      await ensureAuth();
      const branch = (req as any).selectedBranch || 'Masulkhana';
      const q = query(
        collection(db, 'batch_number_formats'),
        where('branch', '==', branch)
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(doc => {
        const d = doc.data();
        let tokens = d.tokens;
        if (!Array.isArray(tokens) || tokens.length === 0) {
          if (Array.isArray(d.elements) && d.elements.length > 0) {
            tokens = d.elements.map((el: any) => ({
              id: el.id || `tok-${Math.random().toString(36).substring(4)}`,
              name: el.label || el.value || el.type || 'Token',
              type: el.type === 'fixed_text' || el.type === 'separator' ? 'static_text' : (el.type === 'year' || el.type === 'serial_number' ? 'auto_generated' : 'master_lookup'),
              source: el.value || el.type || 'base_batch_number',
              mandatory: true
            }));
          } else {
            tokens = [
              { id: 't-1', name: 'Base Batch Number', type: 'auto_generated', source: 'base_batch_number', mandatory: true }
            ];
          }
        }
        return { id: doc.id, ...d, tokens };
      });
      res.json({ success: true, data: list });
    } catch (error: any) {
      console.error("Error in getFormats controller:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async saveFormat(req: AuthRequest, res: Response) {
    try {
      await ensureAuth();
      const fData = req.body;
      const branch = (req as any).selectedBranch || 'Masulkhana';
      fData.branch = branch;

      let docId = fData.id;
      const { password, signatureMeaning } = fData;
      let finalFormatData = { ...fData };
      delete finalFormatData.id;
      delete finalFormatData.password;
      delete finalFormatData.signatureMeaning;

      const user = req.user;
      let signatureId: string | undefined;
      let usedMeaning = signatureMeaning || 'Authorized format layout signature';

      if (docId) {
        if (password && user) {
          await SignatureService.verifyCredentials(user.email, password);
          const sigResult = await SignatureService.signAction(
            user.uid,
            user.email || 'unknown',
            finalFormatData.status === 'ACTIVE' ? 'ACTIVATE_FORMAT' : 'SUBMIT_FORMAT_REVIEW',
            'Batch Number Format',
            docId,
            usedMeaning,
            (req.ip || req.headers['x-forwarded-for'] || 'unknown') as string,
            (req.headers['user-agent'] || 'unknown') as string
          );
          signatureId = sigResult.id;
        }

        const docRef = doc(db, 'batch_number_formats', docId);
        const oldSnap = await getDoc(docRef);
        const oldVal = oldSnap.exists() ? oldSnap.data() : null;
        await updateDoc(docRef, finalFormatData);

        if (user) {
          await AuditService.logAction(
            user.uid,
            user.email || 'unknown',
            finalFormatData.status === 'ACTIVE' ? 'ACTIVATE_FORMAT' : 'SUBMIT_FORMAT_REVIEW',
            docId,
            'Batch Number Generation Engine',
            oldVal,
            finalFormatData,
            `Updated Format sequence for: ${finalFormatData.formatCode}`,
            null,
            signatureId,
            signatureId ? usedMeaning : undefined,
            (req.ip || req.headers['x-forwarded-for'] || 'unknown') as string,
            req.headers['user-agent'] || 'unknown',
            branch,
            branch,
            user.role,
            user.email
          );
        }
      } else {
        const docRef = doc(collection(db, 'batch_number_formats'));
        docId = docRef.id;

        if (password && user) {
          await SignatureService.verifyCredentials(user.email, password);
          const sigResult = await SignatureService.signAction(
            user.uid,
            user.email || 'unknown',
            finalFormatData.status === 'UNDER_REVIEW' ? 'SUBMIT_FORMAT_REVIEW' : 'CREATE_BATCH_SEQUENCE',
            'Batch Number Format',
            docId,
            usedMeaning,
            (req.ip || req.headers['x-forwarded-for'] || 'unknown') as string,
            (req.headers['user-agent'] || 'unknown') as string
          );
          signatureId = sigResult.id;
        }

        await setDoc(docRef, finalFormatData);

        if (user) {
          await AuditService.logAction(
            user.uid,
            user.email || 'unknown',
            finalFormatData.status === 'UNDER_REVIEW' ? 'SUBMIT_FORMAT_REVIEW' : 'CREATE_BATCH_SEQUENCE',
            docId,
            'Batch Number Generation Engine',
            null,
            finalFormatData,
            `Created Format sequence for: ${finalFormatData.formatCode}`,
            null,
            signatureId,
            signatureId ? usedMeaning : undefined,
            (req.ip || req.headers['x-forwarded-for'] || 'unknown') as string,
            req.headers['user-agent'] || 'unknown',
            branch,
            branch,
            user.role,
            user.email
          );
        }
      }

      res.json({ success: true, data: { id: docId, ...finalFormatData } });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async deleteFormat(req: AuthRequest, res: Response) {
    try {
      await ensureAuth();
      const { id } = req.params;
      const { password, signatureMeaning } = req.body || {};

      const docRef = doc(db, 'batch_number_formats', id);
      const snap = await getDoc(docRef);
      const formatData = snap.exists() ? snap.data() : null;

      if (!formatData) {
        return res.status(404).json({ success: false, message: "Format not found" });
      }

      const user = req.user;
      let signatureId: string | undefined;
      let usedMeaning = signatureMeaning || `Confirm batch format deletion: ${formatData.formatCode}`;

      if (password && user) {
        await SignatureService.verifyCredentials(user.email, password);
        const sigResult = await SignatureService.signAction(
          user.uid,
          user.email || 'unknown',
          'DELETE_FORMAT',
          'Batch Number Format',
          id,
          usedMeaning,
          (req.ip || req.headers['x-forwarded-for'] || 'unknown') as string,
          (req.headers['user-agent'] || 'unknown') as string
        );
        signatureId = sigResult.id;
      }

      await deleteDoc(docRef);

      if (user) {
        await AuditService.logAction(
          user.uid,
          user.email || 'unknown',
          'DELETE_FORMAT',
          id,
          'Batch Number Generation Engine',
          formatData,
          null,
          `Deleted Batch Format: ${formatData.formatCode}`,
          null,
          signatureId,
          signatureId ? usedMeaning : undefined,
          (req.ip || req.headers['x-forwarded-for'] || 'unknown') as string,
          req.headers['user-agent'] || 'unknown',
          (req as any).selectedBranch || formatData.branch,
          (req as any).selectedBranch || formatData.branch,
          user.role,
          user.email
        );
      }

      res.json({ success: true, message: "Batch format deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getRecords(req: AuthRequest, res: Response) {
    try {
      await ensureAuth();
      const branch = (req as any).selectedBranch || 'Masulkhana';
      const q = query(
        collection(db, 'batch_number_records'),
        where('branch', '==', branch)
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      list.sort((a: any, b: any) => new Date(b.generatedOn).getTime() - new Date(a.generatedOn).getTime());
      res.json({ success: true, data: list });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async addRecord(req: AuthRequest, res: Response) {
    try {
      await ensureAuth();
      const record = req.body;
      const branch = (req as any).selectedBranch || 'Masulkhana';
      record.branch = branch;

      const docRef = await addDoc(collection(db, 'batch_number_records'), record);
      
      const user = req.user;
      if (user) {
        await AuditService.logAction(
          user.uid,
          user.email || 'unknown',
          'ISSUE_NEW_BATCH_NUMBER',
          docRef.id,
          'Batch Number Generation Engine',
          null,
          record,
          `Issued new Batch Number: ${record.batchNumber}`,
          null,
          undefined,
          undefined,
          req.metadata?.ip,
          req.metadata?.userAgent,
          branch,
          branch,
          user.role,
          user.email
        );
      }

      res.status(201).json({ success: true, data: { id: docRef.id, ...record } });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async updateRecord(req: AuthRequest, res: Response) {
    try {
      await ensureAuth();
      const { id } = req.params;
      const body = req.body;
      const { password, signatureMeaning } = body;

      const updateData = { ...body };
      delete updateData.password;
      delete updateData.signatureMeaning;

      const docRef = doc(db, 'batch_number_records', id);
      const oldSnap = await getDoc(docRef);
      const oldVal = oldSnap.exists() ? oldSnap.data() : null;

      const user = req.user;
      let signatureId: string | undefined;
      let usedMeaning = signatureMeaning || 'Authorized record signature';

      if (password && user) {
        await SignatureService.verifyCredentials(user.email, password);
        const sigResult = await SignatureService.signAction(
          user.uid,
          user.email || 'unknown',
          updateData.status === 'APPROVED' ? 'APPROVE_BATCH_NUMBER' : 'SUBMIT_BATCH_APPROVAL',
          'Batch Number Record',
          id,
          usedMeaning,
          (req.ip || req.headers['x-forwarded-for'] || 'unknown') as string,
          (req.headers['user-agent'] || 'unknown') as string
        );
        signatureId = sigResult.id;
      }

      await updateDoc(docRef, updateData);

      if (user) {
        await AuditService.logAction(
          user.uid,
          user.email || 'unknown',
          updateData.status === 'APPROVED' ? 'APPROVE_BATCH_NUMBER' : 'SUBMIT_BATCH_APPROVAL',
          id,
          'Batch Number Generation Engine',
          oldVal,
          updateData,
          updateData.status === 'APPROVED' ? `QA Approved Batch Record: ${oldVal?.batchNumber || id}` : `Submitted Batch Record for Approval: ${oldVal?.batchNumber || id}`,
          null,
          signatureId,
          signatureId ? usedMeaning : undefined,
          (req.ip || req.headers['x-forwarded-for'] || 'unknown') as string,
          req.headers['user-agent'] || 'unknown',
          (req as any).selectedBranch || updateData.branch,
          (req as any).selectedBranch || updateData.branch,
          user.role,
          user.email
        );
      }

      res.json({ success: true, message: "Record updated successfully" });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async deleteRecord(req: AuthRequest, res: Response) {
    try {
      await ensureAuth();
      const { id } = req.params;
      const { password, signatureMeaning } = req.body || {};

      const docRef = doc(db, 'batch_number_records', id);
      const snap = await getDoc(docRef);
      const recordData = snap.exists() ? snap.data() : {};

      const user = req.user;
      let signatureId: string | undefined;
      let usedMeaning = signatureMeaning || 'Confirm batch number deletion';

      if (password && user) {
        await SignatureService.verifyCredentials(user.email, password);
        const sigResult = await SignatureService.signAction(
          user.uid,
          user.email || 'unknown',
          'DELETE_BATCH_RECORD',
          'Batch Number Record',
          id,
          usedMeaning,
          (req.ip || req.headers['x-forwarded-for'] || 'unknown') as string,
          (req.headers['user-agent'] || 'unknown') as string
        );
        signatureId = sigResult.id;
      }

      await deleteDoc(docRef);

      if (user) {
        await AuditService.logAction(
          user.uid,
          user.email || 'unknown',
          'DELETE_BATCH_RECORD',
          id,
          'Batch Number Generation Engine',
          recordData,
          null,
          `Deleted Batch Record: ${recordData.batchNumber || id}`,
          null,
          signatureId,
          signatureId ? usedMeaning : undefined,
          (req.ip || req.headers['x-forwarded-for'] || 'unknown') as string,
          req.headers['user-agent'] || 'unknown',
          (req as any).selectedBranch || recordData.branch,
          (req as any).selectedBranch || recordData.branch,
          user.role,
          user.email
        );
      }

      res.json({ success: true, message: "Batch record deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async checkAndSeed(req: AuthRequest, res: Response) {
    try {
      await ensureAuth();
      const branch = (req as any).selectedBranch || 'Masulkhana';

      const formQ = query(collection(db, 'batch_number_formats'));
      const formSnap = await getDocs(formQ);
      
      const recordQ = query(collection(db, 'batch_number_records'));
      const recordSnap = await getDocs(recordQ);

      const mastersQ = query(collection(db, 'batch_number_masters'));
      const mastersSnap = await getDocs(mastersQ);

      if (mastersSnap.empty) {
        const defaultStages = ['L07', 'L08', 'LH10', 'MT09', 'MTN11', 'DH', 'DS', 'DL'];
        const defaultRecoveryComponents = [
          'EA', 'IPE', 'MDC', 'MeOH', 'THF', 'Hexane', 'Toluene', 'ACN', 'SL-12', 'SL-022',
          'RM807', 'RM919', 'RM889', 'RM009', 'RM1111', 'RM1113', 'Salt', 'CaCl2'
        ];
        const defaultGenerics = ['A', 'R', 'T', 'P', 'M', 'I', 'II', 'III', 'Aq.', 'App.', 'Rec.'];
        const defaultProcesses = [
          { code: 'SYNTH', name: 'Synthesis Process' },
          { code: 'PURIF', name: 'Purification Process' },
          { code: 'PKG', name: 'Packaging Process' },
          { code: 'QC', name: 'Quality Control' }
        ];

        const promises: any[] = [];
        defaultStages.forEach(st => promises.push(addDoc(collection(db, 'batch_number_masters'), { type: 'stage', code: st })));
        defaultRecoveryComponents.forEach(rc => promises.push(addDoc(collection(db, 'batch_number_masters'), { type: 'recovery_component', code: rc })));
        defaultGenerics.forEach(gc => promises.push(addDoc(collection(db, 'batch_number_masters'), { type: 'generic', code: gc })));
        defaultProcesses.forEach(pr => promises.push(addDoc(collection(db, 'batch_number_masters'), { type: 'process', code: pr.code, name: pr.name })));

        await Promise.all(promises);
      }

      if (formSnap.empty) {
        const sampleFormat = {
          formatCode: 'RM-007',
          formatName: 'Recovery Material Standard',
          status: 'ACTIVE',
          branch,
          tokens: [
            { id: 'tok-1', name: 'Base Batch Number', type: 'auto_generated', source: 'base_batch_number', mandatory: true },
            { id: 'tok-2', name: '/', type: 'static_text', source: '/', mandatory: true },
            { id: 'tok-3', name: 'Stage Code', type: 'master_lookup', source: 'stage_code', mandatory: true },
            { id: 'tok-4', name: '/', type: 'static_text', source: '/', mandatory: true },
            { id: 'tok-5', name: 'Material', type: 'collection', source: 'recovery_component', separator: '+', mandatory: true }
          ],
          createdBy: 'QA Admin',
          createdAt: new Date().toISOString(),
          approvalHistory: [
            {
              status: 'DRAFT',
              user: 'QA Admin',
              role: 'QA',
              timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
              comments: 'Initial Draft Created'
            },
            {
              status: 'ACTIVE',
              user: 'QA Head',
              role: 'ADMIN',
              timestamp: new Date().toISOString(),
              comments: 'Approved as per SOP RM-05',
              meaning: 'I certify that this layout is verified and active'
            }
          ]
        };
        await addDoc(collection(db, 'batch_number_formats'), sampleFormat);
      }

      if (recordSnap.empty) {
        const sampleRecord = {
          batchNumber: `${getYearCode()}001/LH10/RM807`,
          branch,
          product: 'Loratadine',
          category: 'Recovery Material',
          scenario: 'Recovery Material Batch (RM-007)',
          formatCode: 'RM-007',
          status: 'APPROVED',
          generatedOn: new Date().toISOString(),
          generatedBy: 'Anita Verma',
          tokenValues: {
            "Base Batch Number": `${getYearCode()}001`,
            "Stage Code": "LH10",
            "Material": ["RM807"]
          },
          tokenBreakdown: [
            { token: 'Base Batch Number', value: `${getYearCode()}001`, type: 'Auto Generated' },
            { token: '/', value: '/', type: 'Static Text' },
            { token: 'Stage Code', value: 'LH10', type: 'Master Lookup' },
            { token: '/', value: '/', type: 'Static Text' },
            { token: 'Material', value: 'RM807', type: 'Collection' }
          ],
          timeline: [
            { type: 'submitted', user: 'Anita Verma', role: 'OPERATOR', timestamp: new Date(Date.now() - 600000).toISOString(), comments: 'Requesting batch generation' },
            { type: 'approved', user: 'QA Head', role: 'QA', timestamp: new Date().toISOString(), comments: 'Batch number approved and issued' }
          ],
          approvedBy: 'QA Head',
          approvedDate: new Date().toISOString()
        };
        await addDoc(collection(db, 'batch_number_records'), sampleRecord);
      }

      res.json({ success: true, message: "Database seeding checked successfully" });
    } catch (error: any) {
      console.error("Error seeding DB:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async logAudit(req: AuthRequest, res: Response) {
    try {
      await ensureAuth();
      const { action, entityId, entityType, oldValue, newValue, changeReason } = req.body;
      const user = req.user;
      if (user) {
        await AuditService.logAction(
          user.uid,
          user.email || 'unknown',
          action,
          entityId,
          entityType,
          oldValue,
          newValue,
          changeReason,
          null,
          undefined,
          undefined,
          req.metadata?.ip,
          req.metadata?.userAgent,
          (req as any).selectedBranch || 'unknown',
          (req as any).selectedBranch || 'unknown',
          user.role,
          user.email
        );
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getAudits(req: AuthRequest, res: Response) {
    try {
      const branch = (req as any).selectedBranch || 'Masulkhana';
      const logs = await AuditService.getBatchLogs({
        entityType: "Batch Number Generation Engine",
        selectedBranch: branch,
        limit: 20
      });
      res.json({ success: true, data: logs });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
