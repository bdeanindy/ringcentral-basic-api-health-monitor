<a href="https://developer.ringcentral.com" title="RingCentral"  border="0"><img src="https://github-jobs.s3.amazonaws.com/b6496492-a905-11e5-90a0-ccc5e0424421.jpg" alt="RingCentral" width="250px" height="auto" /></a><a href="https://sparkpost.com" alt="SparkPost.com" title="SparkPost.com" border="0"><img src="https://www.sparkpost.com/sites/all/themes/sparkpost/assets/images/sparkpost-logo.png" alt="SparkPost.com" width="250px" height="auto" /></a>

# RingCentral API Basic Health Monitor

Simple application to notify you via SparkPost.com email if there are error responses from your expected RingCentral API requests.

## Prerequisites

* Valid [RingCentral](https://ringcentral.com) account with Platform API access
* Valid [SparkPost](https://sparkpost.com) account with a configured sending domain
* RingCentral Application defined in the [Developer Portal](https://developer.ringcentral.com)
* RingCentral Sandbox Account (available in Developer Portal) created, and configured with at least one extension
* SparkPost API Key (with appropriate permissions, see below)
* RingCentral API Keys (with appropriate permissions, see below)
* MongoDB installed locally (for development)
* Optionally - a Heroku account
* Node.js

## Heroku Setup

If you already have your SparkPost.com API Key and RingCentral API Keys created and available, you can use the Heroku One-Button Deployment

**REMEMBER, you must have all the prerequisites to configure the app properly**

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

## Manual Setup

If you have do not have SparkPost.com API Key and RingCentral API Keys (or your accounts) you can follow the directions below to setup the application...

Use the links in the [Prerequisites](Prerequisites) section to create your SparkPost.com and RingCentral / RingCentral Developer Portal accounts. Follow the documentation for each one, respectively, to learn more about each service.

Nearly all the configuration is stored in the environment variables except the recipient list you send to with SparkPost and the RingCentral API requests you test.

* Rename the file `.env.tmpl` to `.env`
    > `mv .env.tmpl .env`
* Create a new application in RingCentral:
    * Server/Web
    * All basic READ permissions, such as: ReadAccount, ReadPresence, etc...
* Add your RingCentral API Keys (appKey and appSecret) into the `.env` file you copied in step 1
* Create a new SparkPost API Key, you only need the `Transmissions Read/Write` so you can send email (if you want to add more later, that is up to you)
* Add your SparkPost API Key to the `.env` file for the `SPARKPOST_API_KEY` property
* Create an email template in Sparkpost which you will use to send the alert notification (make sure the body has a `{{result}}` substitutionString setup for use (since our app will reference that during delivery)
* Insert the remaining values into the `.env` file as indicated respectively

## Install dependencies

`npm install`

## Start the application

`npm start`

When you start the application without modifying any of the routes being referenced, you should receive zero email alerts. If you would like to test that the errors are being delivered, just uncomment the three intentional errors in the `testGET` method near line 180, relaunch/redeploy the app and you should see error alerts.

## Adding new routes for testing

For each new GET route you would like to test (I would recommend adding some bad ones in on purpose during initial testing), just add them to the `calls` array on line 182 of `app.js`

## Notification

You could use the .csv file in the root of this repository (the Sparkpost recipients template) to create one or more lists which you could refer to as well. Might add this in later improvements.

## License

See [LICENSE](/LICENSE) file for complete information

## Contributions

You're welcome to submit issues and pull requests to this repository. No harsh rules, we can figure it out.
