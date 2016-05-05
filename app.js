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

// VARS
var RC = require('ringcentral');
var routes = require('./routes');
var app = express();
var subscription;
var APILogSchema = require('./models/APILog');
var common = require('./lib/common');
var dbUriString = process.env.MONGODB_URI || process.env.MONGOLAB_URI || process.env.LOCAL_MONGO;
const DEFAULT_ALERT_RECIPIENT = [{
    address: {
    }
}];

// Connect to database
mongoose.connect(dbUriString);
var db = mongoose.connection;

// Mongo Connection Event Handlers
db.on('open', function() {
    common.logIt('Connection to MongoDB has been established');
});

db.on('error', function(err) {
    common.logIt('Error connecting to MongoDB');
    common.logIt(err);
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
        common.logIt('RingCentral successfully authenticated, access_token = ' + response.json().access_token);
        startSubscription();
        initiateTests();
    })
    .catch(common.errorLogger)
    ;

function apiResponseLogger(res) {
    //common.logIt('apiResponseLogger called...........');
    var item;
    if(res) {
        if(res.message) {
            // ERROR RESPONSE
            //common.logIt('IT IS AN ERROR');
            console.error('ERROR MESSAGE: ' + res.message);
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
            if(item) {
                //common.logIt('WE HAVE THE DATA WE NEED TO PROCESS THIS REQUEST');
            }
        }
    }

    if(item) {
        var statusCode = item['status'];
        var statusText = item['statusText'];
        var url = item['url'];
    } else {
        //common.logIt('Unable to parse data from response...');
        var resType = typeof res;
        //common.logIt('RESPONSE TYPE IS....................(SEE BELOW)');
        //common.logIt(resType);
        for(var prop in res) {
            common.logIt('Property: ' + prop + ' is type: ' + typeof res[prop] + ', and is set to: ' + res[prop]);
        }
    }
    var when = +new Date();
    var dataToSave = {};
    var data = (1 === process.env.LOG_LEVEL)
        ? res.json()
        : url
        ;

    //common.logIt('Status Code: ' + statusCode + ', isAlertError(statusCode): ' + common.isAlertError(statusCode));
    //common.logIt('url: ' + url);
    //common.logIt('when: ' + when);
    //common.logIt('statusText: ' + statusText);
    //common.logIt('data: ' + data);

    // Only send emails when there are errors
    if(common.isAlertError(statusCode)) {
        var data = 'Error: ' + statusCode + ' to: ' + url + ' at: ' + when + ' message: ' + res.message;
        dataToSave.when = when;
        dataToSave.statusCode = statusCode;
        dataToSave.statusText = statusText;
        dataToSave.url = url;
        dataToSave.data = data;
        // TODO: Add some logic later to check the DB for thresholds used for determining if we alert or not, now...just send all errors
        sendMail({errorMessage:res.message}); // Could provide more logic here, but good enough to start
    } else {
        //common.logIt('apiResponseLogger should not be a failure');
    }

    // Save it to the database
    var response = new APILogSchema(dataToSave);
    response.save(function(err) {
        if(err) {
            common.logIt('Error saving data!');
        } else {
            //common.logIt('Data saved to DB');
        }
    });
}

// Monitoring perpetual subscription
function startSubscription() {
    subscription = sdk.createSubscription();
    subscription
        .setEventFilters(['/account/~/extension/~/presence'])
        .register()
        ;

    // Register Subscription Event Listeners
    subscription.on(subscription.events.notification, apiResponseLogger);
    subscription.on(subscription.events.removeSuccess, apiResponseLogger);
    subscription.on(subscription.events.removeError, apiResponseLogger);
    subscription.on(subscription.events.renewSuccess, apiResponseLogger);
    subscription.on(subscription.events.renewError, apiResponseLogger);
    subscription.on(subscription.events.subscribeSuccess, apiResponseLogger);
    subscription.on(subscription.events.subscribeError, apiResponseLogger);
}

function initiateTests() {
    // Setup the scheduling rule ~ every 5 minutes
    var minutes = process.env.TEST_PASS_DELAY_IN_MINUTES || 10;
    var delay = 1000 * 60 * minutes;
    var testGetTimer = setInterval(testGET, delay);
}

// Define the API requests we want to execute according to the scheduling rule
function testGET() {
    //common.logIt('testGET called');
    var calls = [
        //'/v1.0',
        //'/account/~/extension/1235151',
        //'/oauth/authorize',
        '/',
        '/account/~/extension',
        '/account/~/extension/~/',
        '/account/~/extension/~/call-log',
        '/account/~/extension/~/message-store',
        '/account/~/extension/~/presence',
        '/dictionary/country'
    ];

    if( platform.auth().accessTokenValid() ) {
        //common.logIt('Executing RC Platform requests');
        calls.forEach(function(item, idx, array) {
            platform.get(item)
                .then(function(response){ apiResponseLogger(response); })
                .catch(function(e){ apiResponseLogger(e); })
                ;
        });
    /*
    }
        platform.get('/').then(function(response){apiResponseLogger(response);}).catch(function(e){apiResponseLogger(e);});
        platform.get('/v1.0').then(function(response){apiResponseLogger(response);}).catch(function(e){apiResponseLogger(e);});
        platform.get('/account/~/extension/1247124').then(function(response){apiResponseLogger(response);}).catch(function(e){apiResponseLogger(e);});
        platform.get('/account/~').then(function(response){errors.push(response);}).catch(apiResponseLogger),
        platform.get('/account/~/extension/~/call-log').then(function(response){errors.push(response);}).catch(apiResponseLogger),
        platform.get('/account/~/extension/~/message-store').then(function(response){errors.push(response);}).catch(apiResponseLogger),
        platform.get('/account/~/extension/~/presence').then(function(response){errors.push(response);}).catch(apiResponseLogger),
        platform.get('/dictionary/country').then(function(response){errors.push(response);}).catch(apiResponseLogger),
        platform.get('/oauth/authorize').then(function(response){errors.push(response);}).catch(apiResponseLogger)
    */
    } else {
        var msg = 'Invalid RingCentral access_token, unable to execute testPass';
        common.logIt(msg);
        apiResponseLogger({message: msg, when: +new Date()});
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
    common.logIt('Sending SparkPost Email...');
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
            common.logIt(err);
        } else {
            common.logIt('Email sent as expected');
        }
    });
}


// EVENT HANDLERS
// Register Platform Event Listeners
platform.on(platform.events.loginSuccess, apiResponseLogger);
platform.on(platform.events.loginError, apiResponseLogger);
platform.on(platform.events.refreshSuccess, apiResponseLogger);
platform.on(platform.events.refreshError, apiResponseLogger);
platform.on(platform.events.refreshSuccess, apiResponseLogger);
platform.on(platform.events.refreshError, apiResponseLogger);

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
