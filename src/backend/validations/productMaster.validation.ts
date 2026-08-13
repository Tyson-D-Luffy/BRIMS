import { z } from "zod";
import { changeReasonSchema } from "./common.validation.ts";

export const productSchema = z.object({
  body: z.object({
    title: z.string().min(1, "Title is required"),
    type: z.string().optional().default(""),
    stage: z.string().optional(),
    batchNumberSeries: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(["active", "inactive"]).optional().default("active"),
  }),
});

export const updateProductSchema = z.object({
  body: z.object({
    title: z.string().optional(),
    type: z.string().optional(),
    stage: z.string().optional(),
    batchNumberSeries: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(["active", "inactive"]).optional(),
    changeReason: changeReasonSchema,
  }),
});

export const deleteProductSchema = z.object({
  body: z.object({
    changeReason: changeReasonSchema.describe("Reason for deletion"),
  }),
});
