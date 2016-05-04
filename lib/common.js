'use strict';

module.exports = {
    // Server and Utilities
    errorLogger: function errorLogger(e) {
        console.error(e);
        throw e;
    },

    logIt: function logIt(msg) {
        console.log(msg);
    },

    isAlertError: function isAlertError(httpStatus) {
        var isErrorCodeRegex = /^([4|5][0-9]{2}){1}$/;
        return isErrorCodeRegex.test(httpStatus);
    }
};
