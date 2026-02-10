import os
import requests

# Configuration
PROJECT_ID = "cable-mc/cobblemon-assets"
BRANCH = "master"
BASE_PATH = "blockbench/pokemon/gen1"
OUTPUT_DIR = "bbmodels_gen1"

API_BASE = "https://gitlab.com/api/v4"
HEADERS = {"Accept": "application/json"}

os.makedirs(OUTPUT_DIR, exist_ok=True)

def list_files(path): # a changer en 151 pour les autres (ou alors verifier si je peux recup directement les glb autre part)
    url = f"{API_BASE}/projects/{PROJECT_ID.replace('/', '%2F')}/repository/tree"
    params = {
        "path": path,
        "ref": BRANCH,
        "per_page": 100
    }

    response = requests.get(url, headers=HEADERS, params=params)
    response.raise_for_status()

    for item in response.json():
        if item["type"] == "tree":
            list_files(item["path"])
        elif item["type"] == "blob" and item["name"].endswith(".bbmodel"):
            download_file(item["path"])


def download_file(file_path):
    encoded_path = file_path.replace("/", "%2F")
    url = f"{API_BASE}/projects/{PROJECT_ID.replace('/', '%2F')}/repository/files/{encoded_path}/raw"
    params = {"ref": BRANCH}

    response = requests.get(url, headers=HEADERS, params=params)
    response.raise_for_status()

    local_path = os.path.join(OUTPUT_DIR, os.path.basename(file_path))
    with open(local_path, "wb") as f:
        f.write(response.content)

    print(f"✔ Téléchargé : {local_path}")


if __name__ == "__main__":
    list_files(BASE_PATH)
    print("🎉 Téléchargement terminé")
