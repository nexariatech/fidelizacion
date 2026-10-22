import { z } from "zod";
import { DomainError } from "./errors";

export function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw new DomainError("invalid_input", z.prettifyError(result.error));
  return result.data;
}
