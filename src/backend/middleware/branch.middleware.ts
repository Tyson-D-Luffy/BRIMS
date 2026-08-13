import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.middleware.ts";
import { doc, getDoc } from "firebase/firestore";
import { db, ensureAuth } from "../config/firebase-client.ts";

export const validateBranchAccess = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  // Get selected branch from headers (or fallback to user defaultBranch or "Masulkhana")
  let selectedBranch = req.headers['x-selected-branch'] as string;
  
  if (!selectedBranch) {
    selectedBranch = (req.user as any).defaultBranch || "Masulkhana";
  }

  // Normalize case-insensitively to ensure consistency with standard branches
  if (selectedBranch) {
    const sbLower = selectedBranch.trim().toLowerCase();
    if (sbLower === "baddi" || sbLower === "baddi branch") {
      selectedBranch = "Baddi";
    } else if (sbLower === "masulkhana" || sbLower === "masulkhana branch") {
      selectedBranch = "Masulkhana";
    }
  }

  // Force normalization to standard branches to prevent input injection/poisoning
  if (selectedBranch !== "Masulkhana" && selectedBranch !== "Baddi") {
    selectedBranch = "Masulkhana";
  }

  const { role, uid } = req.user;
  let allowedBranches: string[] = (req.user as any).allowedBranches || [];
  let multiBranchAccess = (req.user as any).multiBranchAccess || false;

  // Let's resolve allowedBranches and multiBranchAccess directly from DB if empty
  if (!allowedBranches.length && role !== "ADMIN") {
    try {
      await ensureAuth();
      const userDoc = await getDoc(doc(db, "users", uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        allowedBranches = data?.allowedBranches || [];
        multiBranchAccess = !!data?.multiBranchAccess;
      }
    } catch (err) {
      console.error("Error fetching user branch config in middleware:", err);
    }
  }

  const roleUpper = (role || "").toUpperCase();
  const emailLower = (req.user.email || "").toLowerCase();
  const isAdminUser = roleUpper === "ADMIN" || emailLower === "shakshay04@gmail.com";
  
  const allowedBranchesLower = allowedBranches.map(b => b.trim().toLowerCase());
  const selectedBranchLower = (selectedBranch || "").trim().toLowerCase();
  
  const isAllowed = isAdminUser || multiBranchAccess || allowedBranchesLower.includes(selectedBranchLower);

  if (!isAllowed) {
    return res.status(403).json({
      success: false,
      message: "Access denied. You are not authorized to access this branch data."
    });
  }

  // Inject selectedBranch into req as is compliance requirement
  (req as any).selectedBranch = selectedBranch;
  next();
};
