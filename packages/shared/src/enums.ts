export const JOB_TYPES = ["ENHANCE", "PHOTOSHOOT", "EDIT", "ERASE"] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_STATUSES = ["PENDING", "PROCESSING", "DONE", "REJECTED", "FAILED"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const PAYMENT_STATUSES = ["PENDING", "SUCCEEDED", "FAILED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const OPERATORS = ["mpesa", "orange", "airtel"] as const;
export type Operator = (typeof OPERATORS)[number];

export const ASSET_KINDS = ["SOURCE", "SELFIE_TRAINING"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];
