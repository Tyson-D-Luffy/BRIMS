import { z } from "zod";
import { changeReasonSchema } from "./common.validation.ts";

export const createRecordSchema = z.object({
  body: z.object({
    changeReason: changeReasonSchema,
  }),
});

export const updateRecordSchema = z.object({
  body: z.object({
    masterSnapshot: z.object({
      masterName: z.string().optional(),
      productId: z.string().optional(),
      steps_json: z.array(z.any()).optional(),
    }).optional(),
    changeReason: changeReasonSchema,
  }),
});
