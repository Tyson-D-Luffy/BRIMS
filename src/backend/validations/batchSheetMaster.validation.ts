import { z } from "zod";
import { changeReasonSchema } from "./common.validation.ts";

export const masterSchema = z.object({
  body: z.object({
    productId: z.string().optional().nullable(),
    masterName: z.string().optional().nullable(),
    title: z.string().optional(),
    stage: z.string().optional(),
    type: z.string().optional(),
    batchNumberSeries: z.string().optional(),
    documentNumber: z.string().optional(),
    version: z.string().optional(),
    files: z.array(z.object({
      name: z.string(),
      url: z.string(),
    })).optional(),
    steps_json: z.array(z.object({
      step_number: z.number().optional(),
      description: z.string().optional(),
      equipment: z.string().optional(),
      expected_time: z.string().optional()
    }).passthrough()).optional(),
  }).passthrough(),
});

export const updateMasterSchema = z.object({
  body: z.object({
    masterName: z.string().optional(),
    title: z.string().optional(),
    stage: z.string().optional(),
    type: z.string().optional(),
    batchNumberSeries: z.string().optional(),
    documentNumber: z.string().optional(),
    version: z.string().optional(),
    files: z.array(z.object({
      name: z.string(),
      url: z.string(),
    })).optional(),
    steps_json: z.array(z.object({
      step_number: z.number().optional(),
      description: z.string().optional(),
      equipment: z.string().optional(),
      expected_time: z.string().optional()
    }).passthrough()).optional(),
    changeReason: changeReasonSchema.optional(),
  }).passthrough(),
});

export const masterStatusSchema = z.object({
  body: z.object({
    status: z.enum(["DRAFT", "UNDER_REVIEW", "APPROVED", "RETIRED", "ACTIVE", "INACTIVE"]),
    changeReason: changeReasonSchema.optional(),
  }).passthrough(),
});

export const newRecordSchema = z.object({
  body: z.object({
    changeReason: changeReasonSchema.optional(),
  }).passthrough(),
});

export const cloneMasterSchema = z.object({
  body: z.object({
    newName: z.string().optional().nullable(),
  }).passthrough(),
});

export const duplicateStepsSchema = z.object({
  body: z.object({
    sourceId: z.string().optional().nullable(),
    changeReason: changeReasonSchema.optional(),
  }).passthrough(),
});

export const updateStepSchema = z.object({
  body: z.object({
    stepData: z.object({
      description: z.string().optional(),
      equipment: z.string().optional(),
      expected_time: z.string().optional()
    }).passthrough().optional(),
    changeReason: changeReasonSchema.optional(),
  }).passthrough(),
});

