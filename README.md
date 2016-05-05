# RingCentral API Basic Health Monitor

Simple application to notify you if there are error responses from your expected RingCentral API requests

## Prerequisites

* Valid [RingCentral](https://developer.ringcentral.com) account with Platform API access
* Valid [SparkPost](https://sparkpost.com) account with a configured sending domain
* MongoDB installed locally (for development)
* Node.js

## Setup

If you already have your SparkPost.com API Key and RingCentral API Keys created and available, you can use the Heroku One-Button Deployment
[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

If you have do not have SparkPost.com API Key and RingCentral API Keys (or your accounts) you can follow the directions below to setup the application...

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
