const mongoose = require('mongoose');
const { Schema } = mongoose;

const DutyPlaceSchema = new Schema(
  {
    place: { type: String, required: true, unique: true, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DutyPlace', DutyPlaceSchema);
