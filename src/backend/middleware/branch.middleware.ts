import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.middleware.ts";
import { doc, getDoc } from "firebase/firestore";
import { db, ensureAuth } from "../config/firebase-client.ts";

/**
 * Checks if a user has access to a specific resource branch.
 */
export function hasBranchAccess(req: AuthRequest, resourceBranch?: string): boolean {
  if (!resourceBranch) return true;
  const user = req.user;
  if (!user) return true;

  const roleUpper = (user.role || "").toUpperCase();
  const emailLower = (user.email || "").toLowerCase();
  const isSystemAdmin = 
    roleUpper === "ADMIN" || 
    roleUpper.includes("ADMIN") || 
    roleUpper.includes("SYSTEM") || 
    roleUpper.includes("IT") || 
    emailLower === "shakshay04@gmail.com" || 
    !!(user as any).multiBranchAccess;

  if (isSystemAdmin) return true;

  const resBranchLower = resourceBranch.trim().toLowerCase();
  if (resBranchLower === "all" || resBranchLower === "" || resBranchLower === "general") return true;

  const allowedBranches: string[] = Array.isArray((user as any).allowedBranches) && (user as any).allowedBranches.length > 0
    ? (user as any).allowedBranches
    : [
        (user as any).defaultBranch || (user as any).branch || "Masulkhana"
      ];
  
  const allowedBranchesLower = allowedBranches.map(b => b.trim().toLowerCase());
  if (allowedBranchesLower.includes(resBranchLower)) {
    return true;
  }

  const selectedBranch = (req as any).selectedBranch || (req.headers['x-selected-branch'] as string);
  if (selectedBranch && selectedBranch.trim().toLowerCase() === resBranchLower) {
    return true;
  }

  return false;
}

export const validateBranchAccess = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const { role, uid } = req.user;
  const roleUpper = (role || "").toUpperCase();
  const emailLower = (req.user.email || "").toLowerCase();
  const isAdminUser = 
    roleUpper === "ADMIN" || 
    roleUpper.includes("ADMIN") || 
    roleUpper.includes("SYSTEM") || 
    roleUpper.includes("IT") || 
    emailLower === "shakshay04@gmail.com";

  let allowedBranches: string[] = (req.user as any).allowedBranches || [];
  let multiBranchAccess = !!(req.user as any).multiBranchAccess;
  const defaultBranch = (req.user as any).defaultBranch || (req.user as any).branch || "Masulkhana";

  // Let's resolve allowedBranches and multiBranchAccess directly from DB if empty
  if (!allowedBranches.length && !isAdminUser) {
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

  if (!allowedBranches.length) {
    allowedBranches = [defaultBranch];
  }

  // Get selected branch from headers (or fallback to user defaultBranch or "Masulkhana")
  let selectedBranch = req.headers['x-selected-branch'] as string;
  
  if (!selectedBranch) {
    selectedBranch = defaultBranch;
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

  const allowedBranchesLower = allowedBranches.map(b => b.trim().toLowerCase());
  const selectedBranchLower = (selectedBranch || "").trim().toLowerCase();
  
  const isAllowed = isAdminUser || multiBranchAccess || allowedBranchesLower.includes(selectedBranchLower);

  // Instead of rejecting valid users with a fatal 403 if their client sent a mismatch branch,
  // gracefully fall back to their first allowed branch or default branch
  if (!isAllowed) {
    selectedBranch = allowedBranches[0] || defaultBranch || "Masulkhana";
  }

  // Inject selectedBranch into req as is compliance requirement
  (req as any).selectedBranch = selectedBranch;
  next();
};

