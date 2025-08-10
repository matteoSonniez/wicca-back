const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
});

module.exports = mongoose.model('Booking', bookingSchema);
