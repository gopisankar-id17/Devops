const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send("hi how are you tdy");
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
}); 