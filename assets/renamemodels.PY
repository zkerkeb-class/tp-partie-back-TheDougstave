import os
from pathlib import Path

# === CONFIG ===
ROOT_DIR = "bbmodels_gen1"  # <- mets ici le dossier où sont tes .bbmodel
RECURSIVE = True            # True = inclut sous-dossiers
RENAME_LONE_FEMALE_TO_BASE = False  # True = "pikachu_female.bbmodel" -> "pikachu.bbmodel" s'il est seul
DRY_RUN = False             # True = affiche sans modifier
# ==============

def unique_path(path: Path) -> Path:
    """Si path existe déjà, retourne un nom non-collisant en ajoutant __dupN."""
    if not path.exists():
        return path
    stem = path.stem
    suffix = path.suffix
    parent = path.parent
    i = 1
    while True:
        candidate = parent / f"{stem}__dup{i}{suffix}"
        if not candidate.exists():
            return candidate
        i += 1

def iter_bbmodels(root: Path):
    if RECURSIVE:
        yield from root.rglob("*.bbmodel")
    else:
        yield from root.glob("*.bbmodel")

def main():
    root = Path(ROOT_DIR)
    if not root.exists():
        raise SystemExit(f"Dossier introuvable: {root.resolve()}")

    # Index par "base name" (nom sans _male/_female + .bbmodel)
    groups = {}
    for f in iter_bbmodels(root):
        name = f.name
        if name.endswith("_male.bbmodel"):
            base = name[:-len("_male.bbmodel")]
            groups.setdefault(base, {}).setdefault("male", []).append(f)
        elif name.endswith("_female.bbmodel"):
            base = name[:-len("_female.bbmodel")]
            groups.setdefault(base, {}).setdefault("female", []).append(f)
        else:
            base = f.stem  # déjà "normal"
            groups.setdefault(base, {}).setdefault("base", []).append(f)

    # Traitement
    for base, items in sorted(groups.items()):
        male_files = items.get("male", [])
        female_files = items.get("female", [])
        base_files = items.get("base", [])

        # Si plusieurs males/females existent (cas rare), on traite tous proprement
        # 1) Si male + female : supprimer toutes les females
        if male_files and female_files:
            for ff in female_files:
                print(f"[DEL] {ff}")
                if not DRY_RUN:
                    ff.unlink()

        # 2) Renommer les males -> base.bbmodel
        #    Si plusieurs males, le premier devient base, les autres deviennent __dupN
        if male_files:
            # Si un fichier base existe déjà, on évite d'écraser : on renomme le male en __dupN
            target0 = male_files[0].with_name(f"{base}.bbmodel")
            if target0.exists():
                target0 = unique_path(target0)

            for idx, mf in enumerate(male_files):
                if idx == 0:
                    target = target0
                else:
                    target = unique_path(mf.with_name(f"{base}.bbmodel"))

                if mf == target:
                    continue

                print(f"[REN] {mf}  ->  {target}")
                if not DRY_RUN:
                    mf.rename(target)

            # 3) Si un fichier base existait déjà + male(s) renommé(s), ça cohabite via __dupN
            continue

        # 4) S'il n'y a pas de male :
        #    - si female seul et option active: renommer female -> base
        if not male_files and female_files and RENAME_LONE_FEMALE_TO_BASE:
            # Si plusieurs females, même logique que pour male
            target0 = female_files[0].with_name(f"{base}.bbmodel")
            if target0.exists():
                target0 = unique_path(target0)

            for idx, ff in enumerate(female_files):
                if idx == 0:
                    target = target0
                else:
                    target = unique_path(ff.with_name(f"{base}.bbmodel"))

                if ff == target:
                    continue

                print(f"[REN] {ff}  ->  {target}")
                if not DRY_RUN:
                    ff.rename(target)

    print("✅ Terminé.")

if __name__ == "__main__":
    main()
