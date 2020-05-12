# googleapis-wrapper
 A Node.js Wrapper around Google APIs Client Library (googleapis)

## Third-Party libraries:

* https://github.com/saeed-vayghan/googleapis-wrapper/blob/master/helper/extract_json.js
* https://github.com/saeed-vayghan/gmail-multipart-body-maker

```js
const GooglePlugin = require('./googleapis.js')


const authenticationLink = async () => {
  const google = GooglePlugin.api()

  const state  = `custom-authorization-key`
  const scopes = ['contacts.readonly', 'gmail.readonly', 'gmail.send']

  const url = await google.getAuthenticationLink(state, scopes)

  return url
}


const grantAccess = async (query) => {
  const scopes = query.scope
  const state  = query.state

  try {

    const google  = GooglePlugin.api()
    const tokens  = await google.getAndSetTokens(query.code)
    const profile = await google.getProfile()

    return {
      tokens,
      profile
    }

  } catch (ex) {

    return ex
  }
}

const revokeAccess = async (id) => {
  const googleCredential = await GoogleCredential.get(id)

  try {

    const google = await getGoogleClient(googleCredential)
    await google.revokeCredentials()

    return true

  } catch (ex) {

    return ex
  }    
}
```
