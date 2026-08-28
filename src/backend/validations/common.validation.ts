import { z } from "zod";

/**
 * Common validation fragments used across multiple modules.
 * Ensures consistency in error messages and constraints.
 */

export const changeReasonSchema = z.union([
  z.string(),
  z.null(),
  z.undefined()
]).transform(val => (val && val.trim().length > 0 ? val.trim() : "System operation"));

export const idParamSchema = z.object({
  params: z.object({
    id: z.string().min(1, "ID is required"),
  }).passthrough(),
});

export const paginationSchema = z.object({
  query: z.object({
    page: z.union([z.string(), z.number()]).optional().transform(val => val ? parseInt(String(val)) : 1),
    limit: z.union([z.string(), z.number()]).optional().transform(val => val ? parseInt(String(val)) : 10),
    status: z.string().optional(),
    name: z.string().optional(),
    branch: z.string().optional(),
    range: z.string().optional(),
  }).passthrough(),
});

export const statusSchema = z.object({
  body: z.object({
    status: z.string().min(1, "Status is required"),
    changeReason: changeReasonSchema.optional(),
  }).passthrough(),
});

