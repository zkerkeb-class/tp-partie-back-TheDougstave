import os
import subprocess
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent

APPIMAGE = SCRIPT_DIR / "Blockbench_5.0.7.AppImage"
BB_SCRIPT = SCRIPT_DIR / "export_gltf.js"

INPUT_DIR = SCRIPT_DIR / "bbmodels_gen1"
OUTPUT_DIR = SCRIPT_DIR / "gltf_gen1"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def run_export(bbmodel: Path, out_file: Path):
    env = os.environ.copy()
    env.setdefault("ELECTRON_OZONE_PLATFORM_HINT", "x11")

    cmd = [
        str(APPIMAGE),
        "--no-sandbox",
        "--disable-gpu",
        "--script", str(BB_SCRIPT),
        "--", str(bbmodel), str(out_file)
    ]

    subprocess.run(cmd, check=True, env=env)

def main():
    files = sorted(INPUT_DIR.rglob("*.bbmodel"))
    if not files:
        print("Aucun .bbmodel trouvé.")
        return

    for bbmodel in files:
        out_file = OUTPUT_DIR / f"{bbmodel.stem}.glb"
        print(f"🔄 {bbmodel.name} -> {out_file.name}")
        run_export(bbmodel, out_file)

    print("✅ Conversion terminée")

if __name__ == "__main__":
    main()
