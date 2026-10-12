// The route-motion skip flag lives in @austencloud/motion.
// Keep this compatibility path for existing Composer imports.
export {
  skipNextRouteMotion as setSkipNextViewTransition,
  consumeSkipNextRouteMotion as consumeSkipNextViewTransition,
} from "@austencloud/motion";
