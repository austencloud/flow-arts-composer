import type { RequestHandler } from "@sveltejs/kit";
import { dev } from "$app/env";
import fs from "fs";
import path from "path";

/**
 * Simple API endpoint that returns instructions for rendering pictographs
 * Since Canvas2DDirectRenderer needs browser APIs, we can't render server-side
 */
export const GET: RequestHandler = async ({ params }) => {
  if (!dev) {
    return new Response("This endpoint is only available in development", {
      status: 404,
    });
  }

  const { letter } = params;

  if (!letter) {
    return new Response(JSON.stringify({ error: "Missing letter parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const csvPath = path.join(
      process.cwd(),
      "static",
      "data",
      "pictographs",
      "DiamondPictographDataframe.csv"
    );
    const csvData = fs.readFileSync(csvPath, "utf-8");
    const lines = csvData.split("\n");
    const firstLine = lines[0];

    if (!firstLine) {
      return new Response(JSON.stringify({ error: "Empty CSV file" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const headers = firstLine.split(",");

    // Find the letter
    let row: string[] | null = null;
    for (let i = 1; i < lines.length; i++) {
      const r = lines[i]?.split(",");
      if (r?.[0] === letter) {
        row = r;
        break;
      }
    }

    if (!row) {
      return new Response(
        JSON.stringify({ error: `No data found for letter ${letter}` }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Return the pictograph data
    const pictographData = {
      id: `pictograph-${letter}`,
      letter: letter,
      motions: {
        left: {
          hand: "left",
          motionType: row[headers.indexOf("blueMotionType")],
          rotationDirection: row[headers.indexOf("blueRotationDirection")],
          startLocation: row[headers.indexOf("blueStartLocation")],
          endLocation: row[headers.indexOf("blueEndLocation")],
          startOrientation: "in",
          endOrientation: "in",
          turns: 1,
          propType: "staff",
          propPlacementData: { propType: "staff" },
        },
        right: {
          hand: "right",
          motionType: row[headers.indexOf("redMotionType")],
          rotationDirection: row[headers.indexOf("redRotationDirection")],
          startLocation: row[headers.indexOf("redStartLocation")],
          endLocation: row[headers.indexOf("redEndLocation")],
          startOrientation: "in",
          endOrientation: "in",
          turns: 1,
          propType: "staff",
          propPlacementData: { propType: "staff" },
        },
      },
    };

    return new Response(JSON.stringify(pictographData, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error loading pictograph data:", error);
    return new Response(
      JSON.stringify({
        error: `Error: ${error instanceof Error ? error.message : String(error)}`,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
