// Install validated fixed projects as new archive files (same shape the dev
// storage endpoint writes). Never edits or removes existing archive files.
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const ARCHIVE = path.join(process.env.USERPROFILE, ".tka", "post-studio-drafts");
const OUT = path.join(__dirname, "fixed-projects");
for (const file of process.argv.slice(2).length ? process.argv.slice(2) : ["DCK.json", "woods.json"]) {
  const project = JSON.parse(fs.readFileSync(path.join(OUT, file), "utf8"));
  const savedAt = Date.now();
  const target = path.join(ARCHIVE, `${savedAt}-${randomUUID()}.json`);
  const body = JSON.stringify({
    savedAt,
    records: [{ key: `tka:post-studio:project:v2:${project.sequenceId}`, value: JSON.stringify(project) }],
  });
  fs.writeFileSync(`${target}.tmp`, body);
  fs.renameSync(`${target}.tmp`, target);
  console.log(project.sequenceId, "->", path.basename(target), body.length, "bytes, updatedAt", new Date(project.updatedAt).toISOString());
}
