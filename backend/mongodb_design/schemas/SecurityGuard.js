const mongoose = require('mongoose');
const { Schema } = mongoose;

const SecurityGuardSchema = new Schema(
  {
    empId: { type: String, required: true, unique: true, trim: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, required: true },
    mobile: { type: String, required: true },
    designation: { type: String, default: 'Security Guard' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SecurityGuard', SecurityGuardSchema);
