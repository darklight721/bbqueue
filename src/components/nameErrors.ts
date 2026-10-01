export type NameErrorCode = "required" | "duplicate";

export const NAME_ERROR_MESSAGE: Record<NameErrorCode, string> = {
  required: "Enter a name",
  duplicate: "Name already used",
};
