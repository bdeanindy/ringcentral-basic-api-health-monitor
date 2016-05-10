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
var Sparkpost = require('sparkpost');
var RC = require('ringcentral');
var routes = require('./routes');
var app = express();
var subscription;
var APILogSchema = require('./models/APILog');
var common = require('./lib/common');
var dbUriString = process.env.MONGODB_URI || process.env.MONGOLAB_URI || process.env.LOCAL_MONGO;

const LOG_LEVEL = process.env.LOG_LEVEL || 0;

// Connect to database
mongoose.connect(dbUriString);
var db = mongoose.connection;

// Mongo Connection Event Handlers
db.on('open', function() {
    common.notify('Connection to MongoDB has been established');
});

db.on('error', function(err) {
    common.notify('Error connecting to MongoDB');
    common.notify(err);
});

// Mount Express
var server = require('http').Server(app);

// CONSTANTS
const RC_API_BASE_URI = ('Production' === process.env.mode)
    ? 'https://platform.ringcentral.com'
    : 'https://platform.devtest.ringcentral.com'
    ;

const PORT = process.env.PORT || '3000';

// Setup SparkPost
var sparkpostClient = new Sparkpost(); // Using the environment variable default

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
        common.logger('RingCentral successfully authenticated, access_token = ' + response.json().access_token);
    })
    .catch(common.errorLogger)
    ;

function apiResponseLogger(res) {
    common.notify('apiResponseLogger called...........');
    var item;
    if(res) {
        if(res.message) {
            // ERROR RESPONSE
            common.notify('IT IS AN ERROR');
            common.errorLogger('ERROR MESSAGE: ' + res.message);
            if(res.apiResponse) {
                if(res.apiResponse.response) {
                    item = res.apiResponse.response;
                }
                if(res.apiResponse._response) {
                    item = res.apiResponse._response;
                }
            }
        } else {
            // GOOD RESPONSE
            if(res.response) {
                item = res.response;
            }
            if(res._response) {
                item = res._response;
            }
            if(res.apiResponse) {
                if(res.apiResponse.response) {
                    item = res.apiResponse.response;
                }
                if(res.apiResponse._response) {
                    item = res.apiResponse._response;
                }
            }
        }
    }

    if(item) {
        var statusCode = item['status'];
        var statusText = item['statusText'];
        var url = item['url'];
    } else {
        common.notify('Unable to parse data from response...');
        var resType = typeof res;
        common.notify('RESPONSE TYPE IS....................(SEE BELOW)');
        common.notify(resType);
    }

    var dataToSave = {}; // Use this to store the record for the DB
    var when = +new Date();
    var msg = res.message || item.statusText;
    var summary = 'Status: ' + String(statusCode) + ' to: ' + encodeURI(url) + ' at: ' + String(when) + ' message: ' + encodeURI(msg);
    var data = (1 === LOG_LEVEL)
        ? res.json()
        : summary
        ;
    dataToSave.when = when;
    dataToSave.statusCode = statusCode;
    dataToSave.statusText = statusText;
    dataToSave.url = url;
    dataToSave.data = data;

    common.notify('Status Code: ' + statusCode + ', isAlertError(statusCode): ' + common.isAlertError(statusCode));
    common.notify('url: ' + url);
    common.notify('when: ' + when);
    common.notify('statusText: ' + statusText);
    common.notify('data: ' + data);

    // Only send emails when there are errors
    if(common.isAlertError(statusCode)) {
        sendMail({errorMessage:res.message}); // Could provide more logic here, but good enough to start
    }

    var response = new APILogSchema(dataToSave);
    response.save(function(err) {
        if(err) {
            common.errorLogger(err);
        } else {
            common.notify('Data was saved to Mongo');
        }
    });
}


function initiateTests() {
    common.notify('InitiateTests has been called...');
    var minutes = process.env.TEST_PASS_DELAY_IN_MINUTES || 10;
    var delay = 1000 * 60 * minutes;
    var testGetTimer = setInterval(testGET, delay);
}

// Define the API requests we want to execute according to the scheduling rule
function testGET() {
    common.notify('testGET has been called...');

    /* TODO: Use this for later...
    // Setup the start date as the first of the year
    var dateFrom = new Date(2016,0,1,0,0,0);
    var dateFromIso = dateFrom.toISOString();

    // Setup the to date to be today
    var dateTo = new Date();
    var dateToIso = dateTo.toISOString();

    var getCallRecordingPath = '/account/~/call-log?withRecording=true';
    getCallRecordingPath += '&dateTo=' + dateToIso.replace(/\:/g,'%3A');
    getCallRecordingPath += '&dateFrom=' + dateFromIso.replace(/\:/g,'%3A');
    common.notify('Call Recording Path: ' + getCallRecordingPath);
    */

    // List of routes to test against
    var calls = [
        //'/v1.0',
        //'/account/~/extension/1235151',
        //'/oauth/authorize',
        '/',
        '/account/~/extension',
        '/account/~/extension/~/',
        '/account/~/extension/~/call-log',
        '/account/~/recording/' + process.env.CALL_LOG_RECORDING_ID,
        '/account/~/extension/~/message-store',
        '/account/~/extension/~/presence',
        '/dictionary/country'
    ];

    if( platform.auth().accessTokenValid() ) {
        //common.notify('Executing RC Platform requests');
        calls.forEach(function(item, idx, array) {
            platform.get(item)
                .then(function(response){ apiResponseLogger(response); })
                .catch(function(e){ apiResponseLogger(e); })
                ;
        });
    } else {
        var msg = 'Invalid RingCentral access_token, unable to execute testPass';
        common.notify(msg);
        apiResponseLogger({message: msg, when: +new Date()});

        platform.loggedIn().then(function(state) {common.notify('Logged In State: ' + state);});
        platform.refresh();
        common.notify('Refreshing the RC via platform.refresh()');
    }
}

// TODO
function postPass() {
}

// TODO
function putPass() {
}

// TODO
function deletePass() {
}

// Send mail via SparkPost
function sendMail(options) {
    common.notify('Sending SparkPost Email...');
    options = options || {};
    var spCID = options.campaignId || process.env.ALERT_CAMPAIGN_ID;
    var spTID = options.templateId || process.env.ALERT_TEMPLATE_ID;
    options.errorMessage = options.errorMessage
        ? options.errorMessage
        : 'Please see the database for errors, this was undefined'
        ;
    var emailOpts = {
        transmissionBody: {
            campaignId: spCID,
            content: {
                template_id: spTID
            },
            // Add additional recipient objects below as you need
            recipients: [{address: {
                    email: process.env.DEFAULT_ALERT_EMAIL,
                    name: process.env.DEFAULT_ALERT_NAME
                },
                substitution_data: {
                    name: process.env.DEFAULT_ALERT_NAME,
                    apiErrors: options.errorMessage
                }
            }],
            metadata: {
                type: 'apiHealthMonitor'
            },
            substitution_data: {
                apiErrors: options.errorMessage
            }
        }
    };

    sparkpostClient.transmissions.send(emailOpts, function(err, res) {
        if(err) {
            common.errorLogger(err);
        } else {
            common.notify('Email sent as expected');
            common.notify(res);
        }
    });
}

// Monitoring perpetual subscription
function startSubscription() {
    common.notify('startSubscription has been called...');
    subscription = sdk.createSubscription();
    subscription
        .setEventFilters(['/account/~/extension/~/presence'])
        .register()
        ;

    // Register Subscription Event Listeners
    subscription.on(subscription.events.notification, apiResponseLogger);
    subscription.on(subscription.events.removeSuccess, apiResponseLogger);
    subscription.on(subscription.events.removeError, subscriptionRemoveErrorHandler);
    subscription.on(subscription.events.renewSuccess, apiResponseLogger);
    subscription.on(subscription.events.renewError, subscriptionRenewErrorHandler);
    subscription.on(subscription.events.subscribeSuccess, apiResponseLogger);
    subscription.on(subscription.events.subscribeError, subscriptionErrorHandler);
}

// EVENT HANDLERS
// Register Platform Event Listeners
platform.on(platform.events.loginSuccess, loginSuccessHandler);
platform.on(platform.events.loginError, loginErrorHandler);
platform.on(platform.events.logoutSuccess, apiResponseLogger);
platform.on(platform.events.logoutError, logoutErrorHandler);
platform.on(platform.events.refreshSuccess, refreshSuccessHandler);
platform.on(platform.events.refreshError, refreshErrorHandler);

// access_token
function loginSuccessHandler(e) {
    console.log('SUCCESS HANDLER');
    common.notify('RC Platform LOGIN HANDLER');
    startSubscription();
    initiateTests();
    apiResponseLogger(e);
}

function loginErrorHandler(e) {
    common.errorLogger('RC Platform unable to login...');
    common.errorLogger(e);
    apiResponseLogger(e);
}

function logoutErrorHandler(e) {
    common.errorLogger('RC Platform unable to logout...');
    common.errorLogger(e);
    apiResponseLogger(e);
}

function refreshErrorHandler(e) {
    common.errorLogger('RC access_token unable to refresh...');
    common.errorLogger(e);
    apiResponseLogger(e);
}

function refreshSuccessHandler(e) {
    common.logger('RC access_token REFRESHED!');
    apiResponseLogger(e);
}

// subscription_token
function subscriptionRemoveErrorHandler(e) {
    common.errorLogger('Subscription Removal Error...');
    common.errorLogger(e);
    apiResponseLogger(e);
}

function subscriptionRenewErrorHandler(e) {
    common.errorLogger('Subscription Renewal Error...');
    common.errorLogger(e);
    apiResponseLogger(e);
}

function subscriptionErrorHandler(e) {
    common.errorLogger('Subscription Error...');
    common.errorLogger(e);
    apiResponseLogger(e);
}

function subscriptionRenewSuccessHandler(e) {
    common.notify('Subscription RENEWED!');
    apiResponseLogger(e);
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
