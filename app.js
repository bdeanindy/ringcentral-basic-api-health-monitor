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
var SparkPost = require('sparkpost');

// VARS
var dbUriString = process.env.MONGODB_URI || process.env.MONGOLAB_URI || 'mongodb://localhost:27017/bdean-rc-basic';
var RC = require('ringcentral');
var routes = require('./routes');
var app = express();

// Mongoose Schemas
var logSchema = new mongoose.Schema({
    when: String,
    statusCode: String,
    statusText: String,
    url: String,
    data: mongoose.Schema.Types.Mixed
});
var APIResponse = mongoose.model('APIResponse', logSchema);

// Setup SparkPost
var server = require('http').Server(app);
var sparkpostClient = new SparkPost(); // Using the environment variable default

// CONSTANTS
const RC_API_BASE_URI = ('Production' === process.env.mode)
    ? 'https://platform.ringcentral.com'
    : 'https://platform.devtest.ringcentral.com'
    ;

const PORT = process.env.PORT || '3000';

const DEFAULT_ALERT_RECIPIENT = [{
    address: {
        email: process.env.DEFAULT_ALERT_EMAIL,
        name: process.env.DEFAULT_ALERT_NAME
    }
}];

// Server and Utilities
function errorLogger(e) {
    console.error(e);
    throw e;
}

function logIt(msg) {
    console.log(msg);
}

function isAlertError(httpStatus) {
    var isErrorCodeRegex = /^([4|5][0-9]{2}){1}$/;
    return isErrorCodeRegex.test(httpStatus);
}

function sendMail(options) {
    options = options || {};
    var spCID = options.campaignId || process.env.ALERT_CAMPAIGN_ID;
    var spTID = options.templateId || process.env.ALERT_TEMPLATE_ID;
    var spREC = options.recipients
        ? options.recipients
        : [{address:{email:process.env.DEFAULT_ALERT_EMAIL, name:process.env.DEFAULT_ALERT_NAME, result: options.data}}]
        ;

    logIt('Sending SparkPost Email...');
    sparkpostClient.transmissions.send({
        transmissionBody: {
            campaignId: spCID ,
            content: {
                template_id: spTID
            },
            // Add additional recipient objects below as you need
            // or modify the logic to use different lists
            recipients: spREC
        },
        function(err, res) {
            if(err) {
                logIt('Unable to send email using SparkPost');
            } else {
                logIt('Notification email sent at: ' +new Date());
            }
        }
    });
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
platform.on(platform.events.loginSuccess, apiResponseLogger);
var routes = require('./routes/index');
platform.on(platform.events.loginError, apiResponseLogger);
platform.on(platform.events.refreshSuccess, apiResponseLogger);
platform.on(platform.events.refreshError, apiResponseLogger);

function apiResponseLogger(apiResponseData) {
    logIt(apiResponseData);
    logIt('Inside apiResponseLogger');
    var response = apiResponseData['_response'];
    var statusCode = response['status'];
    var statusText = response['statusText'];
    var url = response['url'];
    var json = apiResponseData.json();
    var when = +new Date();
    var dataToSave = {};
    var data = process.env.LOG_LEVEL
        ? json
        : url
        ;

    logIt('Status Code: ' + statusCode + ', isAlertError(statusCode): ' + isAlertError(statusCode));
    logIt('url: ' + url);
    logIt('when: ' + when);
    logIt('statusText: ' + statusText);

    if(isAlertError(statusCode)) {
        logIt('Error: ' + statusCode + ' to: ' + url + ' at: ' + when);
        dataToSave.when = when;
        dataToSave.statusCode = statusCode;
        dataToSave.statusText = statusText;
        dataToSave.url = url;
        dataToSave.data = data;
        // TODO: Add some logic later to check the DB for thresholds used for determining if we alert or not, now...just send all errors
        sendMail(); // Could provide more logic here, but good enough to start
    }
    var response = new APIResponse(dataToSave);
    response.save(function(err) {
        if(err) {
            logIt('Error saving data!');
        } else {
            logIt('Data saved to DB');
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
    logIt('testPass called');
    var errors = [];
    var calls = [
        platform.get('/', {}).then(function(response){errors.push(response);}).catch(apiResponseLogger),
        platform.get('/v1.0', {}).then(function(response){errors.push(response);}).catch(apiResponseLogger),
        platform.get('/account/~', {}).then(function(response){errors.push(response);}).catch(apiResponseLogger),
        platform.get('/account/~/extension', {}).then(function(response){errors.push(response);}).catch(apiResponseLogger),
        platform.get('/account/~/extension/~/call-log', {}).then(function(response){errors.push(response);}).catch(apiResponseLogger),
        platform.get('/account/~/extension/~/message-store', {}).then(function(response){errors.push(response);}).catch(apiResponseLogger),
        platform.get('/account/~/extension/~/presence', {}).then(function(response){errors.push(response);}).catch(apiResponseLogger),
        platform.get('/dictionary/country', {}).then(function(response){errors.push(response);}).catch(apiResponseLogger),
        platform.get('/oauth/authorize', {}).then(function(response){errors.push(response);}).catch(apiResponseLogger)
    ];
    if( platform.auth().accessTokenValid() ) {
        Promise.all(calls)
        .then(function(responses) {
            logIt('FUNK =========> ', responses);
            logIt('testPass.errors: ', errors);
            if(0 <= errors.length) {
                errors.map(apiResponseLogger(response));
            } else {
                logIt('Everything worked');
            }
        },function(reason){
            logIt('FAST FAIL REASON: ', reason);
        });
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
