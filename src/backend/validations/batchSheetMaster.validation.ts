import { z } from "zod";
import { changeReasonSchema } from "./common.validation.ts";

export const masterSchema = z.object({
  body: z.object({
    productId: z.string().min(1, "Product ID is required"),
    masterName: z.string().min(1, "Master name is required"),
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
      step_number: z.number(),
      description: z.string(),
      equipment: z.string(),
      expected_time: z.string()
    })).optional(),
  }),
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
      step_number: z.number(),
      description: z.string(),
      equipment: z.string(),
      expected_time: z.string()
    })).optional(),
    changeReason: changeReasonSchema,
  }),
});

export const masterStatusSchema = z.object({
  body: z.object({
    status: z.enum(["DRAFT", "UNDER_REVIEW", "APPROVED", "RETIRED"]),
    changeReason: changeReasonSchema,
  }),
});

export const newRecordSchema = z.object({
  body: z.object({
    changeReason: changeReasonSchema,
  }),
});

export const cloneMasterSchema = z.object({
  body: z.object({
    newName: z.string().min(1, "New master name is required"),
  }),
});

export const duplicateStepsSchema = z.object({
  body: z.object({
    sourceId: z.string().min(1, "Source master ID is required"),
    changeReason: changeReasonSchema,
  }),
});

export const updateStepSchema = z.object({
  body: z.object({
    stepData: z.object({
      description: z.string().optional(),
      equipment: z.string().optional(),
      expected_time: z.string().optional()
    }),
    changeReason: changeReasonSchema,
  }),
});
