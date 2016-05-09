'use strict';

module.exports = {
    // Server and Utilities
    errorLogger: function errorLogger(e) {
        if(1 >= process.env.LOG_LEVEL) {
            console.error(e);
        }
        throw e;
    },

    isAlertError: function isAlertError(httpStatus) {
        var isErrorCodeRegex = /^([4|5][0-9]{2}){1}$/;
        return isErrorCodeRegex.test(httpStatus);
    },

    logger: function logIt(msg) {
        if(2 >= process.env.LOG_LEVEL) {
            console.log(msg);
        }
    },

    notify: function notify(msg) {
        if(3 >= process.env.LOG_LEVEL) {
            console.log(msg);
        }
    }
};
