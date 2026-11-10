const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * One entry in the "Contact Us" directory (people a guard can call for help:
 * mentors, department staff, app support ...).
 *
 * The data already lives in the MongoDB collection `contactus`. Mongoose
 * would pluralise the model name "ContactUs" to "contactuses", so the
 * collection name is pinned explicitly below - otherwise this model would
 * silently read/write a different, empty collection.
 *
 * Fields match the existing documents:
 *   { dept, name, designation, role, mail, mobile }
 */
const ContactUsSchema = new Schema(
  {
    dept: { type: String, trim: true, default: '' },        // e.g. "Department of Technical Training"
    name: { type: String, required: true, trim: true },     // e.g. "Nanda Kumar"
    designation: { type: String, trim: true, default: '' }, // e.g. "Assistant Mentor"
    role: { type: String, trim: true, default: '' },        // e.g. "App Developer"
    mail: { type: String, trim: true, lowercase: true, default: '' },
    mobile: { type: String, required: true, trim: true },
  },
  { timestamps: true, collection: 'contactus' }
);

ContactUsSchema.index({ name: 1 });

module.exports = mongoose.model('ContactUs', ContactUsSchema);
