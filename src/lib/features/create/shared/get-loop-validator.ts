import { browser } from "$app/environment";

import { LOOPValidator } from "./services/loop-validator";

let instance: LOOPValidator | null = null;

export function getLOOPValidator(): LOOPValidator {
  if (!browser) throw new Error("getLOOPValidator() is browser-only");
  return (instance ??= new LOOPValidator());
}
