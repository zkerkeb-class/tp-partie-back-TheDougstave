// export_gltf.js
// Usage: Blockbench.AppImage --script export_gltf.js -- <input.bbmodel> <output.glb>

const fs = require('fs');
const path = require('path');

async function main() {
  const args = process.argv;
  const sep = args.indexOf('--');
  const userArgs = sep >= 0 ? args.slice(sep + 1) : [];

  const input = userArgs[0];
  const output = userArgs[1];

  if (!input || !output) {
    console.error("Usage: --script export_gltf.js -- <input.bbmodel> <output.glb>");
    Blockbench.quit();
    return;
  }

  try {
    // Ouvre le bbmodel
    await Blockbench.read([input]);

    // Export glTF/GLB
    // Blockbench exporte en glTF via le codec glTF
    await Codecs.gltf.export({
      path: output,
      binary: output.toLowerCase().endsWith('.glb'),
      embed_textures: true
    });

    console.log(`✅ Export OK: ${output}`);
  } catch (e) {
    console.error("❌ Export failed:", e);
  } finally {
    Blockbench.quit();
  }
}

main();
