#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const CSV_PATH = path.join(
  __dirname,
  "../static/data/pictographs/DiamondPictographDataframe.csv"
);
const OUT_DIR = path.join(
  __dirname,
  "../src/routes/(public)/guide/level-1/_data"
);

function parseCSV(csvPath) {
  const content = fs.readFileSync(csvPath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    if (values.length !== headers.length) continue;
    const row = {};
    headers.forEach((h, idx) => (row[h] = values[idx]));
    if (row.letter) rows.push(row);
  }
  return rows;
}

function csvRowToPictographData(row, index) {
  const id = `${row.letter}-${index}`;

  function buildMotion(color) {
    const prefix = color === "blue" ? "blue" : "red";
    return {
      motionType: row[`${prefix}MotionType`],
      rotationDirection: row[`${prefix}RotationDirection`],
      startLocation: row[`${prefix}StartLocation`],
      endLocation: row[`${prefix}EndLocation`],
      color,
      turns: row[`${prefix}MotionType`] === "static" ? 0 : 1,
      startOrientation: "in",
      endOrientation: "in",
      isVisible: true,
      propType: "staff",
      arrowLocation: row[`${prefix}StartLocation`],
      gridMode: "DIAMOND",
    };
  }

  return {
    id,
    letter: row.letter,
    startPlacement: row.startPlacement,
    endPlacement: row.endPlacement,
    gridMode: "DIAMOND",
    motions: {
      left: buildMotion("blue"),
      right: buildMotion("red"),
    },
  };
}

function buildLetterIndex(rows) {
  const index = {};
  for (const row of rows) {
    if (!index[row.letter]) index[row.letter] = [];
    const varIndex = index[row.letter].length;
    index[row.letter].push(csvRowToPictographData(row, varIndex));
  }
  return index;
}

function buildChapter10(letterIndex) {
  const pictographs = {};
  const sequences = {};

  const posLetters = ["A", "B", "C", "G", "H", "I"];
  for (const letter of posLetters) {
    const vars = letterIndex[letter] || [];
    for (let v = 0; v < Math.min(vars.length, 4); v++) {
      pictographs[`${letter}-${v}`] = vars[v];
    }
  }

  for (const letter of Object.keys(letterIndex)) {
    const vars = letterIndex[letter];
    if (vars && vars.length > 0) {
      pictographs[`${letter}-0`] = vars[0];
    }
  }

  for (const letter of ["Φ", "Ψ", "Λ", "α", "β", "γ"]) {
    const vars = letterIndex[letter] || [];
    for (let v = 0; v < Math.min(vars.length, 4); v++) {
      pictographs[`${letter}-${v}`] = vars[v];
    }
  }

  return { pictographs, sequences };
}

function buildChapter11(letterIndex) {
  const pictographs = {};
  const sequences = {};

  for (const letter of Object.keys(letterIndex)) {
    const vars = letterIndex[letter];
    for (let v = 0; v < Math.min(vars.length, 8); v++) {
      pictographs[`${letter}-${v}`] = vars[v];
    }
  }

  return { pictographs, sequences };
}

function buildChapter12(letterIndex) {
  const pictographs = {};
  const sequences = {};

  for (const letter of Object.keys(letterIndex)) {
    const vars = letterIndex[letter];
    for (let v = 0; v < Math.min(vars.length, 4); v++) {
      pictographs[`${letter}-${v}`] = vars[v];
    }
  }

  return { pictographs, sequences };
}

function main() {
  console.log("Reading CSV...");
  const rows = parseCSV(CSV_PATH);
  console.log(`Loaded ${rows.length} pictograph rows`);

  const letterIndex = buildLetterIndex(rows);
  const letterCount = Object.keys(letterIndex).length;
  console.log(`Found ${letterCount} unique letters`);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const chapters = {
    "placements-motions": buildChapter10(letterIndex),
    letters: buildChapter11(letterIndex),
    words: buildChapter12(letterIndex),
  };

  for (const [name, data] of Object.entries(chapters)) {
    const outPath = path.join(OUT_DIR, `${name}.json`);
    const pCount = Object.keys(data.pictographs).length;
    const sCount = Object.keys(data.sequences).length;
    fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
    console.log(`Wrote ${outPath} (${pCount} pictographs, ${sCount} sequences)`);
  }

  console.log("Done.");
}

main();
