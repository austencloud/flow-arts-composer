import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "#lib/shared/auth/firebase.js";
import type { LoopConfig } from "../domain/loop-config";

export async function createCheckoutSession(
  productId: string,
  propType?: string,
  loopConfig?: LoopConfig
): Promise<string> {
  const functions = getFunctions(app);
  const createCheckout = httpsCallable<
    { productId: string; propType?: string; loopConfig?: LoopConfig },
    { url: string }
  >(functions, "createMerchCheckout");
  const result = await createCheckout({
    productId,
    ...(propType && { propType }),
    ...(loopConfig && { loopConfig }),
  });
  return result.data.url;
}
