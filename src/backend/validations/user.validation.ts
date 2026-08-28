import { z } from "zod";
import { changeReasonSchema } from "./common.validation.ts";

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;

const VALID_DEPARTMENTS = [
  "QA",
  "QC",
  "Production",
  "Warehouse",
  "Engineering",
  "HR",
  "IT",
  "IT QA",
  "Administration",
  "Stores",
  "Packing"
] as const;

const VALID_ROLES = [
  "Admin",
  "QA Reviewer",
  "QA Approver",
  "Production User",
  "Warehouse User",
  "Viewer",
  "Master Data User",
  "Manager",
  "Issuer",
  "Requestor",
  "Receiver",
  "MANAGER",
  "ISSUER",
  "REQUESTOR",
  "RECEIVER",
  "ADMIN",
  "QA",
  "PRODUCTION_MANAGER",
  "OPERATOR"
] as const;

export const userSchema = z.object({
  body: z.object({
    employeeId: z.string().min(1, "Employee ID is mandatory"),
    name: z.string().min(1, "Full Name is mandatory"),
    designation: z.string().optional().nullable(),
    department: z.string().min(1, "Department is mandatory"),
    email: z.string().email("Invalid email format"),
    mobileNumber: z.string().optional().nullable(),
    status: z.enum(["active", "inactive", "locked"]).default("active"),
    
    username: z.string().min(1, "Username is mandatory"),
    password: z.string()
      .min(6, "Password must be at least 6 characters")
      .refine((val) => val.length >= 6, {
        message: "Password must be at least 6 characters"
      }),
    confirmPassword: z.string(),
    passwordExpiry: z.string().optional().nullable(),
    forcePasswordReset: z.boolean().optional().default(false),
    mfaEnabled: z.boolean().optional().default(false),
    
    role: z.string().min(1, "Role is mandatory"),
    permissions: z.array(z.string()).min(1, "At least one permission must be selected"),
    
    defaultBranch: z.enum(["Masulkhana", "Baddi"]),
    allowedBranches: z.array(z.enum(["Masulkhana", "Baddi"])).min(1, "At least one allowed branch is required"),
    multiBranchAccess: z.boolean().optional().default(false),
    
    esignatureRequiredApprovals: z.boolean().optional().default(false),
    esignatureRequiredStatusChanges: z.boolean().optional().default(false),
    
    sessionTimeout: z.coerce.number().optional().default(30),
    maxLoginAttempts: z.coerce.number().optional().default(5),
    accountLockAfterFailedAttempts: z.boolean().optional().default(false),
    
    remarks: z.string().optional().nullable(),
    effectiveFrom: z.string().optional().nullable(),
    effectiveTo: z.string().optional().nullable()
  }).passthrough().refine((data) => {
    if (data.password && data.confirmPassword && data.password !== data.confirmPassword) {
      return false;
    }
    return true;
  }, {
    message: "Passwords do not match",
    path: ["confirmPassword"]
  })
});

export const updateUserSchema = z.object({
  body: z.object({
    employeeId: z.string().min(1, "Employee ID is mandatory").optional(),
    name: z.string().min(1, "Full Name is mandatory").optional(),
    displayName: z.string().optional(),
    designation: z.string().optional().nullable(),
    department: z.string().optional(),
    email: z.string().email("Invalid email format").optional(),
    mobileNumber: z.string().optional().nullable(),
    status: z.enum(["active", "inactive", "locked"]).optional(),
    
    username: z.string().min(1, "Username is mandatory").optional(),
    password: z.string()
      .min(6, "Password must be at least 6 characters")
      .refine((val) => {
        if (!val) return true;
        return val.length >= 6;
      }, {
        message: "Password must be at least 6 characters"
      })
      .optional()
      .nullable(),
    confirmPassword: z.string().optional().nullable(),
    passwordExpiry: z.string().optional().nullable(),
    forcePasswordReset: z.boolean().optional(),
    mfaEnabled: z.boolean().optional(),
    
    role: z.string().optional(),
    permissions: z.array(z.string()).optional(),
    
    defaultBranch: z.enum(["Masulkhana", "Baddi"]).optional(),
    allowedBranches: z.array(z.enum(["Masulkhana", "Baddi"])).optional(),
    multiBranchAccess: z.boolean().optional(),
    
    esignatureRequiredApprovals: z.boolean().optional(),
    esignatureRequiredStatusChanges: z.boolean().optional(),
    
    sessionTimeout: z.coerce.number().optional(),
    maxLoginAttempts: z.coerce.number().optional(),
    accountLockAfterFailedAttempts: z.boolean().optional(),
    
    remarks: z.string().optional().nullable(),
    effectiveFrom: z.string().optional(),
    effectiveTo: z.string().optional().nullable(),
    changeReason: changeReasonSchema.optional()
  }).passthrough().refine((data) => {
    if (data.password && data.confirmPassword && data.password !== data.confirmPassword) {
      return false;
    }
    return true;
  }, {
    message: "Passwords do not match",
    path: ["confirmPassword"]
  })
});

export const assignRolesSchema = z.object({
  body: z.object({
    roles: z.array(z.string()).min(1, "At least one role is required")
  }).passthrough()
});

