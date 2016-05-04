'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var apiLogSchema = new Schema({
    when: String,
    statusCode: String,
    statusText: String,
    url: String,
    data: mongoose.Schema.Types.Mixed
});

module.exports = mongoose.model('APILog', apiLogSchema);
