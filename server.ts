import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import { adminDb } from "./src/backend/config/firebase-admin.ts"; // Initialize Firebase Admin
import authRoutes from "./src/backend/routes/auth.routes.ts";
import userRoutes from "./src/backend/routes/user.routes.ts";
import roleRoutes from "./src/backend/routes/role.routes.ts";
import productMasterRoutes from "./src/backend/routes/productMaster.routes.ts";
import batchSheetMasterRoutes from "./src/backend/routes/batchSheetMaster.routes.ts";
import batchSheetRecordRoutes from "./src/backend/routes/batchSheetRecord.routes.ts";
import approvalRoutes from "./src/backend/routes/approval.routes.ts";
import signatureRoutes from "./src/backend/routes/signature.routes.ts";
import batchRoutes from "./src/backend/routes/batch.routes.ts";
import auditRoutes from "./src/backend/routes/audit.routes.ts";
import dashboardRoutes from "./src/backend/routes/dashboard.routes.ts";
import notificationRoutes from "./src/backend/routes/notification.routes.ts";
import batchNumberEngineRoutes from "./src/backend/routes/batchNumberEngine.routes.ts";
import subscriptionRoutes from "./src/backend/routes/subscription.routes.ts";
import documentRoutes from "./src/backend/routes/document.routes.ts";
import uploadRoutes from "./src/backend/routes/upload.routes.ts";
import departmentRoutes from "./src/backend/routes/department.routes.ts";
import designationRoutes from "./src/backend/routes/designation.routes.ts";
import assistantRoutes from "./src/backend/routes/assistant.routes.ts";
import complianceGuardianRoutes from "./src/backend/routes/complianceGuardian.routes.ts";
import { captureMetadata } from "./src/backend/middleware/audit.middleware.ts";
import { authenticateToken } from "./src/backend/middleware/auth.middleware.ts";
import { validateBranchAccess } from "./src/backend/middleware/branch.middleware.ts";

import { createServer as createHttpServer } from "http";
import { SocketService } from "./src/backend/services/socket.service.ts";
import { securityMiddleware, apiLimiter, requestLogger } from "./src/backend/middleware/security.middleware.ts";
import logger from "./src/backend/config/logger.ts";


const JWT_SECRET = process.env.JWT_SECRET || "brims-super-secret-key-123";

async function startServer() {
  const app = express();
  const PORT = 3000;
  const httpServer = createHttpServer(app);

  // Trust proxy for rate limiting behind Cloud Run/Nginx
  app.set("trust proxy", 1);

  // Health check (Public, before any middleware)
  app.get("/health", (req, res) => {
    res.json({
      status: "OK",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: "1.0.4-PROD",
      environment: process.env.NODE_ENV
    });
  });

  // Public api/health check
  app.get("/api/health", async (req, res) => {
    try {
      const { checkAdminHealth, adminDb } = await import("./src/backend/config/firebase-admin.ts");
      let isAdminActive = false;
      try {
        isAdminActive = await checkAdminHealth();
      } catch (e) {
        isAdminActive = false;
      }
      
      if (isAdminActive) {
        await adminDb.collection("users").doc("probe-health").set({ lastCheck: new Date().toISOString() });
        res.json({
          status: "OK",
          database: "admin_connected",
          uptime: `${process.uptime().toFixed(0)} seconds`,
          timestamp: new Date().toISOString()
        });
      } else {
        // Safe check using Client SDK fallback
        const { db, ensureAuth } = await import("./src/backend/config/firebase-client.ts");
        const { doc, setDoc } = await import("firebase/firestore");
        await ensureAuth();
        await setDoc(doc(db, "users", "probe-health"), { lastCheck: new Date().toISOString() });
        
        res.json({
          status: "OK",
          database: "client_connected_fallback",
          uptime: `${process.uptime().toFixed(0)} seconds`,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      // In a container/serverless environment, we should return 200 with DEGRADED status
      // to prevent the container from being restarted or marked as dead by the ingress layer,
      // while still reporting the exact issue clearly.
      res.json({
        status: "DEGRADED",
        database: "disconnected",
        uptime: `${process.uptime().toFixed(0)} seconds`,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      });
    }
  });

  // Initialize Socket.io
  SocketService.initialize(httpServer);

  // --- Production Security & Logging ---
  app.use(requestLogger);
  app.use(securityMiddleware);
  app.use("/api/", apiLimiter); // Apply rate limiting to all API routes

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));
  app.use(captureMetadata);

  // --- API Routes ---
  app.use("/api/auth", authRoutes);
  app.use("/api/uploads", uploadRoutes);
  app.use("/api/users", authenticateToken, validateBranchAccess, userRoutes);
  app.use("/api/product-masters", authenticateToken, validateBranchAccess, productMasterRoutes);
  app.use("/api/batch-sheet-masters", authenticateToken, validateBranchAccess, batchSheetMasterRoutes);
  app.use("/api/batch-sheet-masters", authenticateToken, validateBranchAccess, batchSheetRecordRoutes); // For /api/batch-sheet-masters/:id/versions
  app.use("/api/batch-sheet-records", authenticateToken, validateBranchAccess, batchSheetRecordRoutes); // For /api/batch-sheet-records/:id
  app.use("/api/batch-sheet-records", authenticateToken, validateBranchAccess, approvalRoutes); // Handles /api/batch-sheet-records/:id/submit, approve, reject
  app.use("/api/approvals", authenticateToken, validateBranchAccess, approvalRoutes); // Handles /api/approvals/pending
  app.use("/api", authenticateToken, validateBranchAccess, signatureRoutes); // Handles signatures for various entities
  app.use("/api", authenticateToken, validateBranchAccess, roleRoutes); // For /api/roles and /api/permissions
  app.use("/api/batches", authenticateToken, validateBranchAccess, batchRoutes);
  app.use("/api/audit-logs", authenticateToken, validateBranchAccess, auditRoutes);
  app.use("/api/dashboard", authenticateToken, validateBranchAccess, dashboardRoutes);
  app.use("/api/notifications", authenticateToken, validateBranchAccess, notificationRoutes);
  app.use("/api/batch-number-engine", authenticateToken, validateBranchAccess, batchNumberEngineRoutes);
  app.use("/api/subscriptions", authenticateToken, subscriptionRoutes);
  app.use("/api/documents", authenticateToken, validateBranchAccess, documentRoutes);
  app.use("/api/departments", authenticateToken, validateBranchAccess, departmentRoutes);
  app.use("/api/designations", authenticateToken, validateBranchAccess, designationRoutes);
  app.use("/api/assistant", authenticateToken, validateBranchAccess, assistantRoutes);
  app.use("/api/compliance", authenticateToken, validateBranchAccess, complianceGuardianRoutes);

  // Serve PDF worker locally for 100% offline support and reliability
  app.get("/pdf.worker.min.mjs", (req, res) => {
    res.setHeader("Content-Type", "application/javascript");
    res.sendFile(path.resolve(process.cwd(), "node_modules/pdfjs-dist/build/pdf.worker.min.mjs"));
  });

  // Audit Log Proxy (to ensure server-side logging if needed)
  app.post("/api/audit", authenticateToken, async (req, res, next) => {
    try {
      const { action, entityType, entityId, details, changeReason } = req.body;
      const user = (req as any).user;
      
      const { AuditService } = await import("./src/backend/services/audit.service.ts");
      await AuditService.logAction(
        user.uid,
        user.email,
        action,
        entityId || "N/A",
        entityType || "SYSTEM",
        undefined,
        details || {},
        changeReason,
        undefined,
        undefined,
        undefined,
        req.ip,
        req.headers["user-agent"]
      );
      
      res.status(201).json({ success: true, message: "Log captured" });
    } catch (error) {
      next(error);
    }
  });

  // --- Vite Integration ---

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: {
          server: httpServer
        }
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Global Error Handler (MUST be after all routes)
  const { errorHandler } = await import("./src/backend/middleware/error.middleware.ts");
  app.use(errorHandler);

  httpServer.listen(PORT, "0.0.0.0", async () => {
    console.log(`BRIMS Server running on http://localhost:${PORT}`);
    
    // Background execution of user Employee ID migration for backwards compatibility
    try {
      const { adminDb, checkAdminHealth } = await import("./src/backend/config/firebase-admin.ts");
      let isAdminActive = false;
      try {
        isAdminActive = await checkAdminHealth();
      } catch (e) {
        isAdminActive = false;
      }
      
      if (isAdminActive) {
        console.log("[MIGRATION] Admin SDK is active. Running migration via Admin SDK...");
        const usersSnapshot = await adminDb.collection("users").get();
        const existingIds = new Set<string>();
        
        usersSnapshot.forEach(docSnap => {
          const id = docSnap.data().employeeId;
          if (id) {
            existingIds.add(String(id).trim());
          }
        });

        let count = 101;
        for (const docSnap of usersSnapshot.docs) {
          const data = docSnap.data();
          if (!data.employeeId) {
            let generatedId = `EMP${String(count).padStart(5, '0')}`;
            while (existingIds.has(generatedId)) {
              count++;
              generatedId = `EMP${String(count).padStart(5, '0')}`;
            }
            existingIds.add(generatedId);
            count++;
            
            await adminDb.collection("users").doc(docSnap.id).update({
              employeeId: generatedId,
              updatedAt: new Date().toISOString()
            });
            console.log(`[MIGRATION-ADMIN] Migrated user ${data.email || docSnap.id} to Employee ID: ${generatedId}`);
          }
        }
        console.log("BRIMS User Employee ID automatic migration completed successfully via Admin SDK.");
      } else {
        console.log("[MIGRATION] Admin SDK inactive or lacking permissions. Falling back to Client SDK...");
        const { db, ensureAuth } = await import("./src/backend/config/firebase-client.ts");
        const { collection, getDocs, doc, updateDoc } = await import("firebase/firestore");
        
        // Ensure anonymous auth is executed successfully first
        await ensureAuth();
        
        const usersRef = collection(db, "users");
        const querySnapshot = await getDocs(usersRef);
        const existingIds = new Set<string>();
        
        // collect existing employee IDs
        querySnapshot.forEach(docSnap => {
          const id = docSnap.data().employeeId;
          if (id) {
            existingIds.add(String(id).trim());
          }
        });

        let count = 101;
        for (const docSnap of querySnapshot.docs) {
          const data = docSnap.data();
          if (!data.employeeId) {
            let generatedId = `EMP${String(count).padStart(5, '0')}`;
            while (existingIds.has(generatedId)) {
              count++;
              generatedId = `EMP${String(count).padStart(5, '0')}`;
            }
            existingIds.add(generatedId);
            count++;
            
            await updateDoc(doc(db, "users", docSnap.id), {
              employeeId: generatedId,
              updatedAt: new Date().toISOString()
            });
            console.log(`[MIGRATION-CLIENT] Migrated user ${data.email || docSnap.id} to Employee ID: ${generatedId}`);
          }
        }
        console.log("BRIMS User Employee ID automatic migration completed successfully via Client SDK.");
      }
    } catch (err: any) {
      console.error("Failed to run User Employee ID migration:", err);
    }
  });
}

startServer();
