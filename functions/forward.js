const request = require('request');
const pe = require('./peers');


function forward(port, requestUrl, requestId) {
    let peers = pe.getPeers(port);
    for (let i = 0; i < peers.length; i++) {
        if (peers[i].available) {
            let url = 'http://' + peers[i].ip + '/download?url=' + requestUrl + '&id=' + requestId;
            console.log('Forwarding download request to: ' + url);
            request.get({
                uri: url
            }).on('error', function(e) {
                console.log("ERROR:", e);
            });




        }
    }
}

module.exports.forward = forward;
