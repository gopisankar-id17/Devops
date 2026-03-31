const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connect to MongoDB Atlas
// MONGO_URL comes from environment variable (never hardcode your password)
const MONGO_URL = process.env.MONGO_URL;

mongoose.connect(MONGO_URL)
  .then(() => console.log('MongoDB Atlas connected'))
  .catch(err => console.log('DB error:', err));

// Todo schema
const Todo = mongoose.model('Todo', {
  text: String,
  done: { type: Boolean, default: false }
});

// GET all todos
app.get('/todos', async (req, res) => {
  const todos = await Todo.find();
  res.json(todos);
});

// POST create todo
app.post('/todos', async (req, res) => {
  const todo = new Todo({ text: req.body.text });
  await todo.save();
  res.json(todo);
});

// DELETE a todo
app.delete('/todos/:id', async (req, res) => {
  await Todo.findByIdAndDelete(req.params.id);
  res.json({ message: 'deleted' });
});

app.listen(3000, () => console.log('Server running on port 3000'));