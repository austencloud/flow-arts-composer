import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = ({ url }) => {
  const character = url.searchParams.get("candidate");
  redirect(
    307,
    `/test/character-playground${character ? `?character=${encodeURIComponent(character)}` : ""}`
  );
};
