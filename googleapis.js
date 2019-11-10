// @ts-nocheck
const config       = require('./config')

const { google }   = require('googleapis')
const request      = require('request-promise-native')
const MailComposer = require('nodemailer/lib/mail-composer')

const extractor    = require('./helper/extract_json')
const createBody   = require('./helper/gmail_body_maker')

const CREDENTIALS  = config.CREDENTIALS
const SCOPES       = config.SCOPES


function Google(){
  this.credentials   = CREDENTIALS
  this.client_secret = CREDENTIALS.client_secret
  this.client_id     = CREDENTIALS.client_id
}

Google.prototype.config = function(mode) {
  this.redirectTo = CREDENTIALS.redirect_to_uri

  if (mode === 'cli')
    this.redirectTo = CREDENTIALS.redirect_to_uri_cli

  this.oAuth2Client = new google.auth.OAuth2(this.client_id, this.client_secret, this.redirectTo)
}

Google.prototype.setGmailAddress = async function(gmailAddress) {
  this.gmailAddress = gmailAddress
}

Google.prototype.setCredentials = async function(tokens) {
  this.oAuth2Client.setCredentials(tokens)

  this.gmail  = google.gmail({ version: 'v1', auth: this.oAuth2Client })
  this.people = google.people({ version: 'v1', auth: this.oAuth2Client })
}

Google.prototype.revokeCredentials = async function() {
  const result = await this.oAuth2Client.revokeCredentials()

  return result
}

Google.prototype.getAuthenticationLink = async function(state, scopes) {
  let scope = SCOPES.basic

  if (scopes.includes('contacts.readonly'))
    scope = scope.concat(SCOPES.contacts.readonly)

  if (scopes.includes('gmail.readonly'))
    scope = scope.concat(SCOPES.gmail.readonly)

  if (scopes.includes('gmail.send'))
    scope = scope.concat(SCOPES.gmail.send)

  const authUrl = await this.oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scope,
    state: state,
    prompt: 'select_account consent'
  })

  return authUrl
}

Google.prototype.getAndSetTokens = async function(code) {
  const result = await this.oAuth2Client.getToken(code)
  await this.setCredentials(result.tokens)

  return result.tokens
}


// Profile
Google.prototype.getGmailProfile = async function () {
  const response = await this.gmail.users.getProfile({ auth: this.oAuth2Client, userId: 'me' })

  return response.data
}


// History
Google.prototype.discreteHistory = async function* (limit, currentHistoryId = null) {
  let nextPageToken = null
  let response

  do {
    try {

      response = await this.gmail.users.history.list({
        userId: this.gmailAddress,
        maxResults: limit, // max: 500
        historyTypes: ['messageAdded', 'messageDeleted'],
        startHistoryId: currentHistoryId,
        pageToken: nextPageToken
      })

      nextPageToken = response ? response.data.nextPageToken : null

    } catch (ex) {
      response = ex.response
    }

    yield response

  } while (nextPageToken)
}

Google.prototype.history = async function (currentHistoryId = null) {
  let history        = []
  let nextPageToken  = null
  let response

  do {

    response = await this.gmail.users.history.list({
      userId: this.gmailAddress,
      maxResults: 250,
      historyTypes: ['messageAdded', 'messageDeleted'],
      startHistoryId: currentHistoryId,
      pageToken: nextPageToken
    })

    if (response) {
      nextPageToken = response.data.nextPageToken || null

      if (response.data.history)
        history = history.concat(response.data.history)
    }

  } while ( nextPageToken !== null )

  return history
}


// Threads
Google.prototype.discreteSyncThreads = async function* () {
  let nextPageToken = null
  let response

  do {
    try {

      response = await this.gmail.users.threads.list({
        userId: this.gmailAddress,
        includeSpamTrash: false,
        maxResults: 250, // max: 500
        pageToken: nextPageToken
      })

      nextPageToken = response ? response.data.nextPageToken : null

    } catch (ex) {
      response = ex.response
    }

    yield response

  } while (nextPageToken)
}

Google.prototype.syncThreads = async function () {
  let threads       = []
  let nextPageToken = null
  let response

  do {

    response = await this.gmail.users.threads.list({
      userId: this.gmailAddress,
      includeSpamTrash: false,
      maxResults: 250,
      pageToken: nextPageToken,
    })

    nextPageToken = response.data.nextPageToken || null

    if (response.data.threads)
      threads = threads.concat(response.data.threads)

  } while ( nextPageToken !== null )

  return {
    threads
  }
}

Google.prototype.getThread = async function (threadId) {
  const response = await this.gmail.users.threads.get({
    auth: this.oAuth2Client,
    userId: this.gmailAddress,
    id: threadId,
    format: 'full' // metadata, minimal
  })

  return response.data
}


// Messages
Google.prototype.discreteSyncMessages = async function* (limit) {
  let nextPageToken = null
  let response

  do {

    response = await this.gmail.users.messages.list({
      userId: this.gmailAddress,
      includeSpamTrash: false,
      maxResults: limit, // max: 500
      pageToken: nextPageToken
    })

    nextPageToken = response ? response.data.nextPageToken : null

    yield response

  } while (nextPageToken)
}

Google.prototype.syncMessages = async function () {
  let messages      = []
  let nextPageToken = null
  let response

  do {

    response = await this.gmail.users.messages.list({
      userId: this.gmailAddress,
      includeSpamTrash: false,
      maxResults: 50, // max: 500
      pageToken: nextPageToken
    })

    if(response.data.messages) {
      nextPageToken = response.data.nextPageToken || null
      messages      = messages.concat(response.data.messages)

    } else {
      
      nextPageToken = null
    }

  } while ( nextPageToken !== null )

  return {
    messages
  }
}

Google.prototype.batchGetMessages = async function (messages, fields) {
  const authHeader = await this.oAuth2Client.getRequestHeaders()
  const multipart  = messages.map(message => ({
    'Content-Type': 'application/http',
    'Content-ID': message.id,
    'body': `GET gmail/v1/users/me/messages/${message.id}?format=full${fields} HTTP/1.1\n`
  }))

  const responseString = await request.post({
    url: 'https://www.googleapis.com/batch/gmail/v1',
    multipart: multipart,
    headers: {
      'Authorization': authHeader.Authorization,
      'content-type': 'multipart/mixed'
    }
  })

  return extractor.extract(responseString)
}

Google.prototype.getMessage = async function (messageId) {
  const response = await this.gmail.users.messages.get({
    auth: this.oAuth2Client,
    userId: this.gmailAddress,
    id: messageId,
    format: 'full'
  })
  
  return response.data
}

Google.prototype.getAttachment = async function (messageId, attachmentId) {
  const response = await this.gmail.users.messages.attachments.get({
    auth: this.oAuth2Client,
    userId: this.gmailAddress,
    id: attachmentId,
    messageId: messageId
  })

  return response.data
}

Google.prototype.sendMessage = async function (email) {
  const message = [
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
    'Content-Transfer-Encoding: 7bit',
    `To: ${email.to}`,
    `Subject: ${email.subject}`,
    '', // Extra new line required
    `${email.htmlBody}`
  ].join('\n')
  
  const raw = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  const response = await this.gmail.users.messages.send({
    auth: this.oAuth2Client,
    userId: this.gmailAddress,
    resource: {
      threadId: email.threadId,
      raw: raw
    }
  })

  return response
}

Google.prototype.sendMessageWithAttachment = async function (email) {
  // File Size Limit: 5 MB

  const message = new MailComposer({
    to: email.to,
    subject: email.subject,
    text: email.textBody,
    html: email.htmlBody,
    textEncoding: 'base64',
    attachments: email.attachments
  })

  const builtMessage = await message.compile().build()
  const raw          = Buffer.from(builtMessage).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')    

  const response = await this.gmail.users.messages.send({
    auth: this.oAuth2Client,
    userId: this.gmailAddress,
    uploadType: 'multipart',
    resource: {
      threadId: email.threadId,
      raw: raw
    }
  })

  return response
}

Google.prototype.sendMultipartMessage = async function (body) {
  // File Size Limit: Up To 35 MB
  const authHeader = await this.oAuth2Client.getRequestHeaders()
  
  const arr   = authHeader.Authorization.split('Bearer ')
  const token = arr[1]

  const responseString = await request.post({
    url: 'https://www.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=multipart',
    headers: {
      'Authorization': `OAuth ${token}`,
      'Content-Type': 'multipart/related; boundary="foo_bar_baz"'
    },
    body: createBody(body)
  })

  return JSON.parse(responseString)
}

Google.prototype.updateMessageLables = async function (messageId, labelsToAdd, labelsToRemove) {
  const response = await this.gmail.users.messages.modify({
    auth: this.oAuth2Client,
    userId: this.gmailAddress,
    id: messageId,
    requestBody: {
      addLabelIds: labelsToAdd,
      removeLabelIds: labelsToRemove
    }
  })

  return response.data
}

Google.prototype.markAsRead = async function(messageId) {
  const labelsToAdd    = []
  const labelsToRemove = ['UNREAD']

  return this.updateMessageLables(messageId, labelsToAdd, labelsToRemove)
}

Google.prototype.markAsUnRead = async function(messageId) {
  const labelsToAdd    = ['UNREAD']
  const labelsToRemove = []

  return this.updateMessageLables(messageId, labelsToAdd, labelsToRemove)
}



// Lables
Google.prototype.listLabels = async function () {
  const response = await this.gmail.users.labels.list({
    auth: this.oAuth2Client,
    userId: this.gmailAddress
  })

  return response.data
}


// People, Contacts (pageSize: between 1 and 2000, inclusive. Defaults to 100)
Google.prototype.getProfile = async function () {
  const response = await this.people.people.get({
    resourceName: 'people/me',
    personFields: 'emailAddresses,names,photos',
  })

  return response.data
}

Google.prototype.listConnections = async function (currentSyncToken = null) {
  const currentGmailAddress = this.gmailAddress

  const expTokenMsg  = 'Sync token is expired. Clear local cache and retry call without the sync token.'
  const personFields = 'metadata,addresses,birthdays,coverPhotos,emailAddresses,names,nicknames,organizations,phoneNumbers,photos,urls,memberships'

  let connections    = []
  let syncToken      = currentSyncToken
  let nextPageToken
  let response

  do {

    try {

      response = await this.people.people.connections.list({
        personFields: personFields,
        resourceName: 'people/me',
        pageSize: 250,
        requestSyncToken: true,
        pageToken: nextPageToken,
        syncToken: syncToken
      })

    } catch (ex) {

      if ( ex.message !== expTokenMsg ) {
        throw Error.Conflict({ details: {
          attributes: { email: currentGmailAddress },
          info: { method: 'google.listConnections', currentSyncToken: currentSyncToken }
        }})
      }

      response = await this.people.people.connections.list({
        personFields: personFields,
        resourceName: 'people/me',
        pageSize: 250,
        requestSyncToken: true,
        pageToken: nextPageToken,
        syncToken: ''
      })

    } finally {
  
      nextPageToken = response.data.nextPageToken || null
      syncToken     = response.data.nextSyncToken

      if (response.data.connections)
        connections = connections.concat(response.data.connections)
    }

  } while ( nextPageToken !== null )

  return {
    connections,
    syncToken
  }
}

Google.prototype.listContactGroups = async function (currentSyncToken = null) {
  let contactGroups = []
  let syncToken     = currentSyncToken
  let pageToken
  let response
  let body

  do {

    body = {
      resourceName: 'contactGroups',
      pageSize: 250
    }
    
    if (pageToken)
      body.pageToken = pageToken

    if (syncToken && !pageToken)
      body.syncToken = syncToken

    response = await this.people.people.get(body)

    pageToken = response.data.nextPageToken || null
    syncToken = response.data.nextSyncToken

    if (response.data.contactGroups)
      contactGroups = contactGroups.concat(response.data.contactGroups)

  } while ( pageToken !== null )

  return {
    contactGroups,
    syncToken
  }
}


// conatacts api v3
Google.prototype.getContactGroups = async function () {
  const authHeader = await this.oAuth2Client.getRequestHeaders()
  
  const arr   = authHeader.Authorization.split('Bearer ')
  const token = arr[1]

  const responseString = await request.get({
    url: 'https://www.google.com/m8/feeds/groups/default/full?alt=json&showdeleted=false',
    headers: {
      'Authorization': `OAuth ${token}`,
      'GData-Version': 3
    }
  })

  const data = JSON.parse(responseString)

  if (!data)
    return []

  if (!data.feed)
    return []

  if (data.feed.entry.length)
    return data.feed.entry

  return []
}

Google.prototype.getContacts = async function (path) {
  const authHeader = await this.oAuth2Client.getRequestHeaders()
  
  const arr   = authHeader.Authorization.split('Bearer ')
  const token = arr[1]

  let url      = `https://www.google.com${path}`
  let contacts = []
  let next     = false

  do {
    const responseString = await request.get({
      url: url,
      headers: {
        'Authorization': `OAuth ${token}`,
        'GData-Version': 3
      }
    })

    const data = JSON.parse(responseString)
    
    contacts = contacts.concat(data.feed.entry)
    next     = false

    for (const link of data.feed.link) {
      if ( link.rel === 'next' ) {
        next = true
        url  = link.href
      }
    }

  } while ( next )

  return contacts
}

Google.prototype.getContactPhoto = async function (url) {
  const authHeader = await this.oAuth2Client.getRequestHeaders()

  const arr   = authHeader.Authorization.split('Bearer ')
  const token = arr[1]

  const imagedata = await request.get({
    url: url,
    encoding: 'binary',
    headers: {
      'Authorization': `OAuth ${token}`,
      'GData-Version': 3
    }
  })

  return imagedata
}


// Calendar
Google.prototype.listCalendars = async function () {
  const option = {
    maxResults: 100,
    pageToken: null,
    showHidden: true,
    showDeleted: false,
    syncToken: null
  }

  const calendarList = await this.calendar.calendarList.list(option)
  
  return calendarList.data
}

Google.prototype.createCalendar = async function (resource) {
  const result = await this.calendar.calendars.insert({ resource: resource })

  return result.data
}

Google.prototype.getCalendarList = async function (calendarId) {
  const result = await this.calendar.calendarList.get({ calendarId: calendarId })

  return result.data
}

Google.prototype.getCalendar = async function (calendarId) {
  const result = await this.calendar.calendars.get({ calendarId: calendarId })

  return result.data
}

Google.prototype.updateCalendar = async function (calendarId, resource) {
  const result = await this.calendar.calendars.update({ calendarId: calendarId, resource: resource })

  return result.data
}

Google.prototype.deleteCalendar = async function (calendarId) {
  return await this.calendar.calendars.delete({ calendarId: calendarId })
}

Google.prototype.watchCalendar = async function (options) {
  const result = await this.calendar.events.watch(options)

  return result.data
}

Google.prototype.stopWatchCalendar = async function (options) {
  return await this.calendar.channels.stop(options)
}


// Calendar Events
Google.prototype.listEvents = async function (calendarId) {
  const response = await this.calendar.events.list({
    calendarId: calendarId,
    singleEvents: true,
    maxResults: 10,
    showHiddenInvitations: true,
    showDeleted: true
  })

  return response.data.items
}

Google.prototype.syncEvents = async function (calendarId, currentSyncToken = null) {
  let items         = []
  let nextSyncToken = currentSyncToken
  let nextPageToken = null
  let response

  do {
    response = await this.calendar.events.list({
      calendarId: calendarId,
      singleEvents: true,
      maxResults: 50,
      showHiddenInvitations: true,
      showDeleted: true,
      pageToken: nextPageToken,
      syncToken: nextSyncToken
    })

    nextPageToken = response.data.nextPageToken || null
    nextSyncToken = response.data.nextSyncToken || null

    if (response.data.items)
      items = items.concat(response.data.items)

  } while ( nextPageToken !== null )

  return {
    items,
    nextSyncToken
  }
}

Google.prototype.createEvent = async function (calendarId, resource) {
  const result = await this.calendar.events.insert({
    calendarId: calendarId,
    resource: resource
  })

  return result.data
}

Google.prototype.getEvent = async function (calendarId, eventId) {
  const result = await this.calendar.events.get({ calendarId: calendarId, eventId: eventId })

  return result.data
}

Google.prototype.getEventInstances = async function (calendarId, eventId, options) {
  let items         = []
  let nextSyncToken = options.currentSyncToken
  let nextPageToken = null
  let response

  do {

    response = await this.calendar.events.instances({
      calendarId: calendarId,
      eventId: eventId,
      maxResults: 100,
      showDeleted: true,

      timeMax: options.timeMax,
      timeMin: options.timeMin,

      pageToken: nextPageToken,
      syncToken: nextSyncToken
    })

    nextPageToken = response.data.nextPageToken || null
    nextSyncToken = response.data.nextSyncToken || null

    if (response.data.items)
      items = items.concat(response.data.items)

  } while ( nextPageToken !== null )

  return {
    items,
    nextSyncToken
  }
}

Google.prototype.updateEvent = async function (calendarId, eventId, resource) {
  const result = await this.calendar.events.update({
    calendarId: calendarId,
    eventId: eventId,
    resource: resource
  })

  return result.data
}

Google.prototype.deleteEvent = async function (calendarId, eventId) {
  return await this.calendar.events.delete({ calendarId: calendarId, eventId: eventId })
}


// Clients
module.exports.cli = function() {
  const gClient = new Google()
  gClient.config('cli')

  return gClient
}

module.exports.api = function() {
  const gClient = new Google()
  gClient.config('api')

  return gClient
}

module.exports.setupClient = async function(credential) {
  const gClient = new Google()

  gClient.config('api')

  gClient.setCredentials({
    'access_token': credential.access_token,
    'refresh_token': credential.refresh_token,
    'scope': credential.scope,
    'expiry_date': credential.expiry_date // 3600 (1 hour)
  })

  gClient.setGmailAddress(credential.email)

  return gClient
}
