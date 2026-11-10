const mongoose = require('mongoose');
const { Schema } = mongoose;

const ProfileSchema = new Schema(
  {
    empId: { type: String, required: true, unique: true },
    imageUrl: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Profile', ProfileSchema);
