// Mongoose schema for the `users` collection.
// NOTE: This file defines the schema/structure only. Nothing here connects
// to a database — wire it up later with `mongoose.connect(...)` in server.js.

const mongoose = require('mongoose');
const { Schema } = mongoose;

const UserSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true }, // store bcrypt hash, never plaintext
    role: { type: String, enum: ['admin', 'guard'], required: true },
    name: { type: String, required: true },
    gender: { type: String, enum: ['Male', 'Female', 'Other', ''], default: '' },
    designation: { type: String, default: 'Security Guard' },
    mobile: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', UserSchema);
