import { z } from "zod";
import { ASSET_KINDS, JOB_TYPES, OPERATORS } from "../enums";

export const RegisterDto = z.object({ email: z.string().min(1).max(254), password: z.string().min(8).max(128) });
export const LoginDto = z.object({ email: z.string().min(1).max(254), password: z.string().min(1).max(128) });
export const ConfirmAgeDto = z.object({ confirmed: z.literal(true) });
export const PresignDto = z.object({ kind: z.enum(ASSET_KINDS) });
export const CreateJobDto = z.object({
  type: z.enum(JOB_TYPES),
  styleId: z.string().optional(),
  inputAssetIds: z.array(z.string()).min(1),
});
export const InitiatePaymentDto = z.object({
  packId: z.string(),
  phone: z.string().min(1),
  operator: z.enum(OPERATORS),
});
