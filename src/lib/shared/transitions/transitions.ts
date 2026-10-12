// The motion clock lives in @austencloud/motion, shared with Ringmaster and
// the Cirque Aflame website. Feature code keeps importing this path.
export { DURATION, STAGGER, SLIDE } from "@austencloud/motion";
import { SLIDE } from "@austencloud/motion";

/** @deprecated Use SLIDE instead */
export const SLIDE_DISTANCE = SLIDE;
