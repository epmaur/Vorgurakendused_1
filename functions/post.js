const request = require('request')

function post(DESTINATION, DATA) {
  console.log('sending post request to : ', DESTINATION);
  return new Promise(function(resolve, reject) {
      request.post({
        uri: DESTINATION,
        body: JSON.stringify(DATA)
      }, function() {
        resolve(true);
      }).on('error', function(err) {
        console.log('post request error: ', err);
      })
  })
}

module.exports.post = post;
