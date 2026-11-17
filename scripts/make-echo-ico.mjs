// Assembles build/icon.ico from pre-sized PNGs produced by make-echo-icons.ps1.
// Usage: node scripts/make-echo-ico.mjs <dir-with-echo-<size>.png>
import { writeFile } from "node:fs/promises";
import pngToIco from "png-to-ico";

const dir = process.argv[2];
if (!dir) {
    console.error("Usage: node scripts/make-echo-ico.mjs <dir-with-echo-<size>.png>");
    process.exit(1);
}

const sizes = [16, 32, 48, 64, 128, 256];
const ico = await pngToIco(sizes.map((size) => `${dir}/echo-${size}.png`));
await writeFile("build/icon.ico", ico);
console.log("Wrote build/icon.ico");
