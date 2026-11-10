const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * State for the "Forgot password" flow (routes/passwordReset.js), one
 * document per Emp ID (roll_no). Kept in its own collection - not as fields
 * on User - because several routes return user documents (only the password
 * is stripped), which would leak an OTP stored there.
 *
 *   1. send-otp   -> otpHash / otpExpiresAt / lastSentAt / sendCount are set
 *   2. verify-otp -> otpHash is cleared, resetTokenHash / resetTokenExpiresAt set
 *   3. reset      -> resetTokenHash is cleared (the token works once)
 *
 * The OTP and the reset token are stored hashed, never in plaintext.
 * MongoDB removes the whole document by itself once `expiresAt` has passed
 * (TTL index below), so abandoned resets don't pile up.
 */
const PasswordResetSchema = new Schema(
  {
    roll_no: { type: String, required: true, unique: true, trim: true },

    // Step 1 - the OTP that was texted
    otpHash: { type: String, default: null },
    otpExpiresAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 }, // wrong-OTP tries against the current OTP

    // Send throttling (resend cooldown + a cap on texts per hour)
    lastSentAt: { type: Date, default: null },
    sendWindowStartedAt: { type: Date, default: null },
    sendCount: { type: Number, default: 0 },

    // Step 2 - proof that the OTP was entered correctly, needed by step 3
    resetTokenHash: { type: String, default: null },
    resetTokenExpiresAt: { type: Date, default: null },

    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

PasswordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('PasswordReset', PasswordResetSchema);
