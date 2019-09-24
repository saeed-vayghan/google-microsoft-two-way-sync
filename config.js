'user strict';


module.exports = {

  CREDENTIALS: {
    client_id: 'xxx-xxx.xxx',
    client_secret: 'xxx',
    project_id: 'xxx',
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    redirect_to_uri: 'http://127.0.0.1:8080/webhook/google/grant',
    redirect_to_uri_cli: 'http://127.0.0.1:8080/webhook/google/grant'
  },
  
  SCOPES: {
    basic: ['profile', 'email'],
  
    contacts: {
      readonly: ['https://www.googleapis.com/auth/contacts.readonly']
    },
      
    gmail: {
      readonly: ['https://www.googleapis.com/auth/gmail.readonly'],
  
      send: ['https://www.googleapis.com/auth/gmail.send'],
    }
  }
}
