
import express from 'express';

const app = express();

app.get('/', (req, res) => {
  res.send('Hello, World!');
});


console.log('Server is set up. Ready to start listening on a port.');

app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});