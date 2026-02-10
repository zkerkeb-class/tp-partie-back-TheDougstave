import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import fs from "fs/promises";

import Pokemon from "./schema/pokemon.js";
import "./connect.js";

const app = express();
app.use(cors());
app.use(express.json());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const imgDir = path.join(__dirname, "assets", "pokemons");        // id.png
const glbDir = path.join(__dirname, "assets", "gltf_pokemons");   // english_name.glb
const bgDir = path.join(__dirname, "assets", "bg"); // Fire.jpg, Water.jpg, ...

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
});

const toNum = (v, def = 0) => (v === "" || v == null ? def : Number(v));
const parseTypes = (v) =>
  Array.isArray(v) ? v : String(v || "").split(",").map(s => s.trim()).filter(Boolean);


const BASE = process.env.BASE_URL || "http://localhost:3000";


app.post(
  "/api/pokemons/upload",
  upload.fields([
    { name: "sprite", maxCount: 1 }, // png
    { name: "model", maxCount: 1 },  // glb
  ]),
  async (req, res) => {
    try {
      // 1) champs text (FormData)
      const id = toNum(req.body.id);
      const english = String(req.body.english || "").trim();
      const french = String(req.body.french || "").trim();
      const japanese = String(req.body.japanese || "").trim();
      const chinese = String(req.body.chinese || "").trim();
      const type = parseTypes(req.body.type);

      if (!id || !english || !type.length) {
        return res.status(400).json({ error: "id, english et type sont obligatoires" });
      }

      // check id unique
      const exists = await Pokemon.findOne({ id });
      if (exists) return res.status(400).json({ error: "id déjà utilisé" });

      // 2) fichiers
      const spriteFile = req.files?.sprite?.[0];
      const modelFile = req.files?.model?.[0];

      // sprite = id.png (si fourni)
      if (spriteFile) {
        if (!spriteFile.originalname.toLowerCase().endsWith(".png")) {
          return res.status(400).json({ error: "sprite doit être un .png" });
        }
        await fs.writeFile(path.join(imgDir, `${id}.png`), spriteFile.buffer);
      }

      // model = slug(english).glb (si fourni)
      if (modelFile) {
        if (!modelFile.originalname.toLowerCase().endsWith(".glb")) {
          return res.status(400).json({ error: "model doit être un .glb" });
        }
        await fs.writeFile(path.join(glbDir, `${slug(english)}.glb`), modelFile.buffer);
      }

      // 3) stats (FormData => strings)
      const base = {
        HP: toNum(req.body.hp),
        Attack: toNum(req.body.atk),
        Defense: toNum(req.body.def),
        SpecialAttack: toNum(req.body.spAtk),
        SpecialDefense: toNum(req.body.spDef),
        Speed: toNum(req.body.speed),
      };

      // 4) doc Mongo
      const created = await Pokemon.create({
        id,
        name: { english, french, japanese, chinese },
        type,
        base,
        // image (optionnel) : on garde ton pattern assets/id.png
        image: `${BASE}/assets/pokemons/${id}.png`,
      });

      res.status(201).json(urls(created.toObject()));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);




// ==========================
// Helpers
// ==========================
const slug = (s) =>
  String(s)
    .trim()
    .toLowerCase()
    .replace(/♂/g, "m")
    .replace(/♀/g, "f")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");

const urls = (p) => ({
  ...p,
  spriteUrl: `${BASE}/${slug(p.name.english)}.png`,
  modelUrl: `${BASE}/${slug(p.name.english)}.glb`,
  backgroundUrl: p?.type?.[0] ? `${BASE}/bg/${p.type[0]}.jpg` : null,

});

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const toInt = (v, def = 0) => (Number.isFinite(+v) ? +v : def);

const splitList = (v) =>
  Array.isArray(v)
    ? v.flatMap((x) => String(x).split(","))
    : String(v).split(",").map((x) => x.trim()).filter(Boolean);

// ==========================
// Static files (optionnel)
// ==========================
app.use("/assets/pokemons", express.static(imgDir));
app.use(
  "/assets/gltf_pokemons",
  express.static(glbDir, {
    setHeaders(res, file) {
      if (file.endsWith(".glb")) res.setHeader("Content-Type", "model/gltf-binary");
    },
  })
);

// Backgrounds : /assets/backgrounds/Fire.jpg
app.use("/assets/backgrounds", express.static(bgDir));

// Route simple : /bg/Fire.jpg ou /bg/Fire
app.get("/bg/:type", (req, res) => {
  try {
    const type = req.params.type;
    // accepte /bg/Fire ou /bg/Fire.jpg
    const file = type.toLowerCase().endsWith(".jpg") ? type : `${type}.jpg`;
    res.sendFile(path.join(bgDir, file));
  } catch {
    res.status(404).end();
  }
});


// ==========================
// Health
// ==========================
app.get("/", (req, res) => res.json({ ok: true }));

// ==========================
// /search (DOIT être AVANT /:name)
// ==========================
app.get("/search", async (req, res) => {
  try {
    const q = req.query;
    const filter = {};

    // id exact
    if (q.id) filter.id = Number(q.id);

    // name contient (insensible à la casse)
    if (q.name) filter["name.english"] = new RegExp(q.name, "i");

    // types
    // typeAny=Fire,Electric  -> au moins un
    // typeAll=Grass,Poison   -> doit contenir tous
    // typeNot=Ground         -> exclure
    if (q.typeAny) filter.type = { ...(filter.type || {}), $in: splitList(q.typeAny) };
    if (q.typeAll) filter.type = { ...(filter.type || {}), $all: splitList(q.typeAll) };
    if (q.typeNot) filter.type = { ...(filter.type || {}), $nin: splitList(q.typeNot) };

    // stats min/max
    // hpMin/hpMax, atkMin/atkMax, defMin/defMax, spAtkMin/spAtkMax, spDefMin/spDefMax, speedMin/speedMax
    const statMap = {
      hp: "base.HP",
      atk: "base.Attack",
      def: "base.Defense",
      spAtk: "base.SpecialAttack",
      spDef: "base.SpecialDefense",
      speed: "base.Speed",
    };

    for (const [key, mongoPath] of Object.entries(statMap)) {
      const min = q[`${key}Min`];
      const max = q[`${key}Max`];
      if (min != null || max != null) {
        filter[mongoPath] = {};
        if (min != null) filter[mongoPath].$gte = Number(min);
        if (max != null) filter[mongoPath].$lte = Number(max);
      }
    }

    // pagination
    const limit = clamp(toInt(q.limit, 20), 1, 100);
    const offset = Math.max(0, toInt(q.offset, 0));

    // tri (allowlist)
    const sortAllow = {
      id: "id",
      name: "name.english",
      hp: "base.HP",
      atk: "base.Attack",
      def: "base.Defense",
      spAtk: "base.SpecialAttack",
      spDef: "base.SpecialDefense",
      speed: "base.Speed",
    };
    const sortPath = sortAllow[q.sort] || "id";
    const order = q.order === "desc" ? -1 : 1;

    const [results, total] = await Promise.all([
      Pokemon.find(filter).sort({ [sortPath]: order }).skip(offset).limit(limit),
      Pokemon.countDocuments(filter),
    ]);

    res.json({
      total,
      limit,
      offset,
      count: results.length,
      nextOffset: offset + results.length < total ? offset + limit : null,
      results: results.map((p) => urls(p.toObject())),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==========================
// CRUD API (minimal) + pagination
// ==========================

// GET 20 par 20: /api/pokemons?limit=20&offset=0
app.get("/api/pokemons", async (req, res) => {
  try {
    const limit = clamp(toInt(req.query.limit, 20), 1, 100);
    const offset = Math.max(0, toInt(req.query.offset, 0));

    const [results, total] = await Promise.all([
      Pokemon.find({}).sort({ id: 1 }).skip(offset).limit(limit),
      Pokemon.countDocuments({}),
    ]);

    res.json({
      total,
      limit,
      offset,
      count: results.length,
      nextOffset: offset + results.length < total ? offset + limit : null,
      results: results.map((p) => urls(p.toObject())),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET par nom: /api/pokemons/name/pikachu
app.get("/api/pokemons/name/:name", async (req, res) => {
  try {
    const name = req.params.name;
    const pokemon = await Pokemon.findOne({
      "name.english": new RegExp(`^${name}$`, "i"),
    });

    if (!pokemon) return res.status(404).json({ error: "Pokemon not found" });
    res.json(urls(pokemon.toObject()));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET par id: /api/pokemons/25
app.get("/api/pokemons/:id", async (req, res) => {
  try {
    const p = await Pokemon.findOne({ id: Number(req.params.id) });
    if (!p) return res.status(404).json({ error: "Pokemon not found" });
    res.json(urls(p.toObject()));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST créer: /api/pokemons
app.post("/api/pokemons", async (req, res) => {
  try {
    const created = await Pokemon.create(req.body);
    res.status(201).json(urls(created.toObject()));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// PATCH update: /api/pokemons/25
app.patch("/api/pokemons/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    const updated = await Pokemon.findOneAndUpdate(
      { id },
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ error: "Pokemon not found" });
    res.json(urls(updated.toObject()));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE: /api/pokemons/25
app.delete("/api/pokemons/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const deleted = await Pokemon.findOneAndDelete({ id });

    if (!deleted) return res.status(404).json({ error: "Pokemon not found" });
    res.json({ ok: true, deletedId: id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==========================
// ROUTES "SIMPLES" (TOUJOURS À LA FIN)
// ==========================

// Sprite : /pikachu.png -> assets/pokemons/<id>.png
app.get("/:name.png", async (req, res) => {
  try {
    const key = slug(req.params.name); // <- normalise ce que le client a envoyé

    // on retrouve le Pokémon par slug(english)
    const all = await Pokemon.find({}, { id: 1, "name.english": 1 });
    const p = all.find(x => slug(x.name.english) === key);

    if (!p) return res.status(404).end();
    return res.sendFile(path.join(imgDir, `${p.id}.png`));
  } catch {
    res.status(404).end();
  }
});


// Modèle : /pikachu.glb -> assets/gltf_pokemons/<english_normalisé>.glb
app.get("/:name.glb", async (req, res) => {
  try {
    const key = slug(req.params.name); // <- normalise param

    const all = await Pokemon.find({}, { "name.english": 1 });
    const p = all.find(x => slug(x.name.english) === key);

    if (!p) return res.status(404).end();

    const file = `${slug(p.name.english)}.glb`; // <- vrai nom de fichier
    return res.sendFile(path.join(glbDir, file));
  } catch {
    res.status(404).end();
  }
});


// JSON par nom : /pikachu
app.get("/:name", async (req, res) => {
  try {
    if (req.params.name.includes(".")) return res.status(404).end();

    const name = req.params.name;
    const pokemon = await Pokemon.findOne({
      "name.english": new RegExp(`^${name}$`, "i"),
    });
    if (!pokemon) return res.status(404).json({ error: "Pokemon not found" });

    res.json(urls(pokemon.toObject()));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==========================
// Server
// ==========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
  console.log(`Search: http://localhost:${PORT}/search?typeAny=Fire&limit=5&offset=0&sort=id&order=desc`);
  console.log(`JSON : http://localhost:${PORT}/pikachu`);
  console.log(`PNG  : http://localhost:${PORT}/pikachu.png`);
  console.log(`GLB  : http://localhost:${PORT}/pikachu.glb`);
});
