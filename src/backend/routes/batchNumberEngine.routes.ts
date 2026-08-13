import { Router } from "express";
import { BatchNumberEngineController } from "../controllers/batchNumberEngine.controller.ts";

const router = Router();

router.get("/masters", BatchNumberEngineController.getMasters);
router.post("/masters", BatchNumberEngineController.addMaster);
router.put("/masters/:id", BatchNumberEngineController.updateMaster);
router.delete("/masters/:id", BatchNumberEngineController.deleteMaster);

router.get("/formats", BatchNumberEngineController.getFormats);
router.post("/formats", BatchNumberEngineController.saveFormat);
router.delete("/formats/:id", BatchNumberEngineController.deleteFormat);

router.get("/records", BatchNumberEngineController.getRecords);
router.post("/records", BatchNumberEngineController.addRecord);
router.put("/records/:id", BatchNumberEngineController.updateRecord);
router.delete("/records/:id", BatchNumberEngineController.deleteRecord);

router.post("/seed", BatchNumberEngineController.checkAndSeed);
router.post("/audit", BatchNumberEngineController.logAudit);
router.get("/audits", BatchNumberEngineController.getAudits);

export default router;
