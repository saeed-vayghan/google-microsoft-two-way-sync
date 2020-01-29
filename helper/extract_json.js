/* 
  Credit: https://stackoverflow.com/questions/10574520/extract-json-from-text
  I made some changes into main script
*/

module.exports = {

  extract: function(str) {
    const result = []

    let firstOpen  = 0
    let firstClose = 0
    let candidate  = 0
  
    firstOpen = str.indexOf('{', firstOpen + 1)
  
    do {
      firstClose = str.lastIndexOf('}')
  
      if ( firstClose <= firstOpen ) {
        return null
      }
  
      do {
        candidate = str.substring(firstOpen, firstClose + 1)
  
        try {
          result.push(JSON.parse(candidate));
          firstOpen = firstClose
        } catch (e) {
          firstClose = str.substr(0, firstClose).lastIndexOf('}')
        }
  
      } while ( firstClose > firstOpen )
  
      firstOpen = str.indexOf('{', firstOpen + 1)
  
    } while ( firstOpen != -1 )
  
    return result
  }
}
