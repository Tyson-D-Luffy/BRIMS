import { z } from "zod";

/**
 * Common validation fragments used across multiple modules.
 * Ensures consistency in error messages and constraints.
 */

export const changeReasonSchema = z.string().min(5, "Reason for change must be at least 5 characters");

export const idParamSchema = z.object({
  params: z.object({
    id: z.string().min(1, "ID is required"),
  }),
});

export const paginationSchema = z.object({
  query: z.object({
    page: z.string().optional().transform(val => val ? parseInt(val) : 1),
    limit: z.string().optional().transform(val => val ? parseInt(val) : 10),
    status: z.string().optional(),
    name: z.string().optional(),
  }),
});

export const statusSchema = z.object({
  body: z.object({
    status: z.string().min(1, "Status is required"),
    changeReason: changeReasonSchema,
  }),
});
