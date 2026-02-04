// index.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";

import Pokemon from "./schema/pokemon.js";
import "./connect.js";

const app = express();

// --- Paths (ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dossiers statiques
const glbDir = path.join(__dirname, "assets", "gltf_pokemons"); // assets/gltf_pokemons/english_name.glb
const imagesDir = path.join(__dirname, "assets", "pokemons");   // assets/pokemons/126.png (ex)

// Base URL (pratique pour renvoyer des URLs utilisables directement côté frontend)
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

// --- Middlewares
app.use(cors());
app.use(express.json());

// --- Static Images
app.use(
  "/assets/pokemons",
  express.static(imagesDir, {
    setHeaders(res) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("Accept-Ranges", "bytes");
    },
  })
);

// --- Static GLB (Three.js / GLTFLoader => simple GET, donc pareil qu’un “download” HTTP)
app.use(
  "/glb",
  express.static(glbDir, {
    setHeaders(res, filePath) {
      if (filePath.endsWith(".glb")) {
        res.setHeader("Content-Type", "model/gltf-binary");
      }
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("Accept-Ranges", "bytes");
    },
  })
);

// --- Helpers
function toGlbFileNameFromEnglishName(englishName) {
  // règle: assets/gltf_pokemons/nom_du_pokemon_en_anglais.glb
  // On transforme en nom de fichier "safe" : lowercase + espaces -> _
  // Ex: "Mr. Mime" -> "mr_mime.glb" (si tes fichiers sont comme ça)
  // Si tes fichiers gardent EXACTEMENT la casse/ponctuation, enlève la normalisation.
  return `${String(englishName)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")}.glb`;
}

function withUrls(pokemonDoc) {
  const p = pokemonDoc.toObject ? pokemonDoc.toObject() : pokemonDoc;

  // IMAGE:
  // - si p.image est déjà une URL complète => on garde
  // - si p.image ressemble à "126.png" => on préfixe /assets/pokemons/
  // - si p.image ressemble à "assets/pokemons/126.png" ou "/assets/pokemons/126.png" => on normalise
  let imageUrl = p.image || "";
  if (imageUrl && !/^https?:\/\//i.test(imageUrl)) {
    imageUrl = imageUrl.replace(/^\/?assets\/pokemons\//, "");
    imageUrl = `${BASE_URL}/assets/pokemons/${imageUrl}`;
  }

  // GLB:
  // basé sur le nom anglais: assets/gltf_pokemons/nom_du_pokemon_en_anglais.glb
  const english = p?.name?.english || "";
  const glbFile = english ? toGlbFileNameFromEnglishName(english) : null;
  const glbUrl = glbFile ? `${BASE_URL}/glb/${glbFile}` : null;

  return {
    ...p,
    imageUrl,
    glbUrl,
  };
}

// --- Healthcheck
app.get("/", (req, res) => {
  res.json({ ok: true, message: "API is running" });
});

/**
 * ==========================
 * CRUD POKEMONS (JSON)
 * Base route: /api/pokemons
 * ==========================
 */

// READ ALL (filtres optionnels)
app.get("/api/pokemons", async (req, res) => {
  try {
    const { type, name } = req.query;

    const filter = {};
    if (type) filter.type = type;
    if (name) filter["name.english"] = new RegExp(name, "i");

    const pokemons = await Pokemon.find(filter).sort({ id: 1 });
    res.json(pokemons.map(withUrls));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// READ ONE (par id "pokemon.id")
app.get("/api/pokemons/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const pokemon = await Pokemon.findOne({ id });

    if (!pokemon) return res.status(404).json({ error: "Pokemon not found" });
    res.json(withUrls(pokemon));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREATE
app.post("/api/pokemons", async (req, res) => {
  try {
    const created = await Pokemon.create(req.body);
    res.status(201).json(withUrls(created));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// UPDATE (PATCH)
app.patch("/api/pokemons/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    const updated = await Pokemon.findOneAndUpdate(
      { id },
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ error: "Pokemon not found" });
    res.json(withUrls(updated));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// UPDATE (PUT)
app.put("/api/pokemons/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    const updated = await Pokemon.findOneAndUpdate({ id }, req.body, {
      new: true,
      runValidators: true,
      overwrite: true,
    });

    if (!updated) return res.status(404).json({ error: "Pokemon not found" });
    res.json(withUrls(updated));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE
app.delete("/api/pokemons/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    const deleted = await Pokemon.findOneAndDelete({ id });
    if (!deleted) return res.status(404).json({ error: "Pokemon not found" });

    res.json({ ok: true, deletedId: id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Images: http://localhost:${PORT}/assets/pokemons/<file>.png`);
  console.log(`GLB:    http://localhost:${PORT}/glb/<english_name>.glb`);
});
