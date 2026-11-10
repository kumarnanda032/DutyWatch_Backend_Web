const mongoose = require('mongoose');
const { Schema } = mongoose;

const SubPlaceSchema = new Schema(
  {
    name: { type: String, required: true },
  },
  { _id: false }
);

const DutyPlaceSchema = new Schema(
  {
    mainPlace: { type: String, required: true, unique: true, trim: true },
    subPlaces: { type: [SubPlaceSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DutyPlace', DutyPlaceSchema);
