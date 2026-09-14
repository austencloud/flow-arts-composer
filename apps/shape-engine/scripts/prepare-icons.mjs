import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import sharp from "sharp";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const resRoot = join(appRoot, "android/app/src/main/res");
const source = join(appRoot, "assets/icon-source.png");
for (const [density, size] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
  const destination = join(resRoot, `mipmap-${density}`);
  await mkdir(destination, { recursive: true });
  for (const name of ["ic_launcher", "ic_launcher_round"]) {
    await sharp(source).resize(size, size).png().toFile(join(destination, `${name}.png`));
  }
}
await mkdir(join(resRoot, "drawable-nodpi"), { recursive: true });
await sharp(source).resize(768, 768).png().toFile(join(resRoot, "drawable-nodpi/shape_engine_mark.png"));
await writeFile(join(resRoot, "drawable/shape_engine_foreground.xml"), `<?xml version="1.0" encoding="utf-8"?>
<inset xmlns:android="http://schemas.android.com/apk/res/android" android:inset="12dp">
  <bitmap android:src="@drawable/shape_engine_mark" android:gravity="fill" />
</inset>
`);
for (const name of ["ic_launcher", "ic_launcher_round"]) {
  await writeFile(join(resRoot, `mipmap-anydpi-v26/${name}.xml`), `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/ic_launcher_background" />
  <foreground android:drawable="@drawable/shape_engine_foreground" />
</adaptive-icon>
`);
}
await writeFile(join(resRoot, "values/ic_launcher_background.xml"), `<?xml version="1.0" encoding="utf-8"?>
<resources><color name="ic_launcher_background">#030719</color></resources>
`);
console.log("Prepared Android launcher icons from Shape Engine artwork.");
