/**
 * Copyright 2017 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const functions = require('firebase-functions');
const {google} = require('googleapis');
const {WebhookClient} = require('dialogflow-fulfillment');

// Enter your calendar ID below and service account JSON below, see https://github.com/dialogflow/bike-shop/blob/master/README.md#calendar-setup
const calendarId = '<INSERT CALENDAR ID HERE>'; // looks like "6ujc6j6rgfk02cp02vg6h38cs0@group.calendar.google.com"
const serviceAccount = {}; // Starts with {"type": "service_account",...

// Set up Google Calendar Service account credentials
const serviceAccountAuth = new google.auth.JWT({
  email: serviceAccount.client_email,
  key: serviceAccount.private_key,
  scopes: 'https://www.googleapis.com/auth/calendar'
});

const calendar = google.calendar('v3');
process.env.DEBUG = 'dialogflow:*'; // enables lib debugging statements

const timeZone = 'America/Los_Angeles';
const timeZoneOffset = '-07:00';

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  const agent = new WebhookClient({ request, response });

  function hours (agent) {
    if (currentlyOpen()) {
      agent.add(`We're open now! We close at 5:30pm today.`);
    } else {
      agent.add(`We're currently closed, but we open every weekday at 9am!`);
    }
  }

  function makeAppointment (agent) {
    // Calculate appointment start and end datetimes (end = +1hr from start)
    const dateTimeStart = new Date(Date.parse(agent.parameters.date + 'T' + agent.parameters.time + timeZoneOffset));
    const dateTimeEnd = new Date(new Date(dateTimeStart).setHours(dateTimeStart.getHours() + 1));
    const appointmentTimeString = dateTimeStart.toLocaleString(
      'en-US',
      { month: 'long', day: 'numeric', hour: 'numeric', timeZone: timeZone }
    );

    // Check the availibility of the time, and make an appointment if there is time on the calendar
    return createCalendarEvent(dateTimeStart, dateTimeEnd).then(() => {
      agent.add(`Ok, let me see if we can fit you in.  ${appointmentTimeString} is fine!.  Do you need a repair or just a tune-up?`);
    }).catch(() => {
      agent.add(`I'm sorry, there are no slots available for ${appointmentTimeString}, would you like to check another day?`);
    });
  }

  let intentMap = new Map();
  intentMap.set('Hours', hours);
  intentMap.set('Make Appointment', makeAppointment);
  agent.handleRequest(intentMap);
});

function currentlyOpen () {
  var currentDateTime = new Date(); // current time
  var hours = currentDateTime.getHours();
  var mins = currentDateTime.getMinutes();
  var day = currentDateTime.getDay();

  return day >= 1 &&
        day <= 5 &&
        hours >= 9 &&
        (hours < 17 || hours === 17 && mins <= 30);
}

function createCalendarEvent (dateTimeStart, dateTimeEnd) {
  return new Promise((resolve, reject) => {
    calendar.events.list({
      auth: serviceAccountAuth, // List events for time period
      calendarId: calendarId,
      timeMin: dateTimeStart.toISOString(),
      timeMax: dateTimeEnd.toISOString()
    }, (err, calendarResponse) => {
      // Check if there is a event already on the Bike Shop Calendar
      if (err || calendarResponse.data.items.length > 0) {
        reject(err || new Error('Requested time conflicts with another appointment'));
      }
      // Create event for the requested time period
      calendar.events.insert({ auth: serviceAccountAuth,
        calendarId: calendarId,
        resource: {summary: 'Bike Appointment',
          start: {dateTime: dateTimeStart},
          end: {dateTime: dateTimeEnd}}
      }, (err, event) => {
        err ? reject(err) : resolve(event);
      }
      );
    });
  });
}