'use strict';

// Dependencies
if('Production' !== process.env.MODE) {require('dotenv').load();}
var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var mongoose = require('mongoose');

// VARS
var dbUriString = process.env.MONGODB_URI || process.env.MONGOLAB_URI || 'mongodb://localhost:27017/bdean-rc-basic';
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

// Mongoose Schemas
var apiResponseSchema = new mongoose.Schema({
    data: mongoose.Schema.Types.Mixed
});
var APIResponse = mongoose.model('APIResponse', apiResponseSchema);

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
platform.on(platform.events.loginSuccess, apiResponseLogger);
var routes = require('./routes/index');
platform.on(platform.events.loginError, apiResponseLogger);
platform.on(platform.events.refreshSuccess, apiResponseLogger);
platform.on(platform.events.refreshError, apiResponseLogger);

function apiResponseLogger(apiResponseData) {
    logIt('HTTP Status Code: ' + apiResponseData['_response']['status']);
    // Error
    if(200 !== apiResponseData['_response']['status'] || 'OK' !== apiResponseData['_response']['statusText'] || apiResponseData instanceof Error) {
        // TODO: Send notification using SparkPost
        logIt(apiResponseData);
        apiResponseData = {when: +new Date(), "status": apiResponseData['_response']['status'], data: apiResponseData};
    } else {
        // High db space
        //apiResponseData = {when: +new Date(), data: apiResponseData.json()};
        // Low db space
        apiResponseData = {when: +new Date(), "status": apiResponseData['_response']['status'], data: apiResponseData['_response']['url']};
    }
    var response = new APIResponse({
        data: apiResponseData
    });
    response.save(function(err) {
        if(err) {
            logIt('Error saving data!');
        } else {
            logIt('Data saved');
        }
    });
}

// Connect to the Database
mongoose.connect( dbUriString, function( err, db ) {
  if( err ) {
    throw err;
    return;
  }
  console.log('Connecting to database');
});

var db = mongoose.connection;

db.on('open', function() {
    logIt('Connection to MongoDB has been established');
});

// Setup the scheduling rule ~ every 5 minutes
var minutes = process.env.TEST_PASS_DELAY_IN_MINUTES || 10;
var delay = 1000 * 60 * minutes;
var caller = setInterval(testPass, delay);

// Define the API requests we want to execute according to the scheduling rule
function testPass() {
    if( platform.auth().accessTokenValid() ) {
        platform.get('/', {}).then(function(response){apiResponseLogger(response);}).catch(apiResponseLogger);
        platform.get('/v1.0', {}).then(function(response){apiResponseLogger(response);}).catch(apiResponseLogger);
        platform.get('/account/~', {}).then(function(response){apiResponseLogger(response);}).catch(apiResponseLogger);
        platform.get('/account/~/extension', {}).then(function(response){apiResponseLogger(response);}).catch(apiResponseLogger);
        platform.get('/account/~/extension/~/call-log', {}).then(function(response){apiResponseLogger(response);}).catch(apiResponseLogger);
        platform.get('/account/~/extension/~/message-store', {}).then(function(response){apiResponseLogger(response);}).catch(apiResponseLogger);
        platform.get('/account/~/extension/~/presence', {}).then(function(response){apiResponseLogger(response);}).catch(apiResponseLogger);
        platform.get('/dictionary/country', {}).then(function(response){apiResponseLogger(response);}).catch(apiResponseLogger);
        platform.get('/oauth/authorize', {}).then(function(response){apiResponseLogger(response);}).catch(apiResponseLogger);
    } else {
        var msg = 'Invalid RingCentral access_token, unable to execute testPass';
        logIt(msg);
        apiResponseLogger({message: msg, when: +new Date()});
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
