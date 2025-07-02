const mongoose = require('mongoose');

const orderStatusSchema = new mongoose.Schema({
  orderId: {
    type: String,
    required: true,
    unique: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending',
    required: true
  },
  message: {
    type: String
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

orderStatusSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('OrderStatus', orderStatusSchema);
