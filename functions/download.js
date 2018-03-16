const request = require('request')

function download(url) {
  return new Promise(function(resolve, rej) {
    request.get({
      uri: decodeURIComponent(url),
        },
      function(req, res, body) {
        resolve(res);
      }).on('error', function(err) {
        console.log('DOWNLOAD Something happend', err);
      })
  })
}

module.exports.download = download;
