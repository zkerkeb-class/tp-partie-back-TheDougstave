
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import pokemon from './schema/pokemon.js';

import './connect.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const glbDir = path.join(__dirname, 'assets', 'gltf_pokemons');

app.use('/glb', (req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  next();
});

app.use('/glb', express.static(glbDir, {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.glb')) {
      res.set('Content-Type', 'model/gltf-binary');
    }
  }
}));

app.get('/', (req, res) => {
  res.send('Hello, World!');
});

app.get('/pokemons', async (req, res) => {
  try {
    const pokemons = await pokemon.find({});
    res.json(pokemons);
  } catch (error){
    res.status(500).send(error.message);
  }
});

console.log('Server is set up. Ready to start listening on a port.');

app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});
