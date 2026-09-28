import { redirect } from "@sveltejs/kit";

export function load() {
  redirect(307, "/test/composer-flight/stops");
}
