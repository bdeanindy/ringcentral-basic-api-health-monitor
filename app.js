'use strict';

if('Production' !== process.env.MODE) {
    require('dotenv').load();
}
var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var schedule = require('node-schedule');

var routes = require('./routes/index');

// VARS
var RC = require('ringcentral');
var routes = require('./routes');
var app = express();
var server = require('http').Server(app);

// CONSTANTS
const RC_API_BASE_URI = ('Production' === process.env.mode)
    ? 'https://platform.ringcentral.com'
    : 'https://platform.devtest.ringcentral.com'
    ;

const PORT = process.env.PORT || '3000';

// Server and Utilities

function errorLogger(e) {
    console.error(e);
    throw e;
}

function logIt(msg) {
    console.log(msg);
}

// Setup RingCentral 
var sdk = new RC({
    server: RC_API_BASE_URI,
    appKey: process.env.RC_APP_KEY,
    appSecret: process.env.RC_APP_SECRET
});

var platform = sdk.platform();
platform
    .login({
        username: process.env.RC_USERNAME,
        password: process.env.RC_PASSWORD,
        extension: process.env.RC_EXTENSION
    })
    .then(function(response) {
        logIt('RingCentral successfully authenticated, access_token = ' + response.json().access_token);
    })
    .catch(errorLogger)
    ;

// Register Platform Event Listeners
platform.on(platform.events.loginSuccess, rcAuthLog);
platform.on(platform.events.loginError, rcAuthLog);
platform.on(platform.events.refreshSuccess, rcAuthLog);
platform.on(platform.events.refreshError, rcAuthLog);

function rcAuthLog(data) {
    logIt(data.json());
    // TODO: Record in DB
}

// Connect to the Database

// Setup the scheduling rule ~ every 15 minutes
var rule1 = new schedule.RecurrenceRule();
rule1.minute = 14;
schedule.scheduleJob(rule1, testPass);
var rule2 = new schedule.RecurrenceRule();
rule2.minute = 29;
schedule.scheduleJob(rule2, testPass);
var rule3 = new schedule.RecurrenceRule();
rule3.minute = 44;
schedule.scheduleJob(rule3, testPass);
var rule4 = new schedule.RecurrenceRule();
rule4.minute = 59;
schedule.scheduleJob(rule4, testPass);

// Define the API requests we want to execute according to the scheduling rule
function testPass() {
    if( platform.auth().accessTokenValid() ) {
        platform.get('/', {}).then(function(response){});
        platform.get('/v1.0', {}).then(function(response){});
        platform.get('/account/~', {}).then(function(response){});
        platform.get('/account/~/extension', {}).then(function(response){});
        platform.get('/account/~/extension/~/call-log', {}).then(function(response){});
        platform.get('/account/~/extension/~/message-store', {}).then(function(response){});
        platform.get('/account/~/extension/~/presence', {}).then(function(response){});
        platform.get('/dictionary/country', {}).then(function(response){});
        platform.get('/oauth/authorize', {}).then(function(response){});
    }
}

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', routes);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});


module.exports = app;
