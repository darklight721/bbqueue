import { MAX_NAME_LENGTH } from "../domain/validation.ts";

export type NameErrorCode = "required" | "too-long" | "duplicate";

export const NAME_ERROR_MESSAGE: Record<NameErrorCode, string> = {
  required: "Enter a name",
  "too-long": `Name is too long (at most ${MAX_NAME_LENGTH} characters)`,
  duplicate: "Name already used",
};
