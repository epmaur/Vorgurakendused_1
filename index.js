const http = require('http');
const url = require('url');
const HttpDispatcher = require('httpdispatcher');
const dispatcher = new HttpDispatcher();
const dl = require('./functions/download');
const sR = require('./functions/post');
const fw = require('./functions/forward');
const pe = require('./functions/peers');
const ipaddr = require('ipaddr.js');
const fs = require('fs');


const LAZINESS = 0.2;
let PORT = null;
let ID = -1;
let unhandledResponses = {};
let downloadedIDs = [];
let RES_BODY = null;


function returnUrlParam(request) {
  console.log('request' , request.url);
  let params = url.parse(decodeURIComponent(request.url), true).query;
  console.log('params', params);
  if (params.url != null) {
    console.log();
    return params.url.includes('http') ? params.url : 'http://' + params.url;
  }
  return null;
}

function returnIdParam(request) {
  let params = url.parse(request.url, true).query;
  if(params.id != null) {
    return params.id;
  }
}


function downloadOrNot() {
  //return Math.random() > LAZINESS;
  return true;
}

function ipAddressHandler(req) {
  console.log('ipAddressReq', req.connection.remoteAddress);
  let ipString = req.connection.remoteAddress;
  if (ipaddr.IPv4.isValid(ipString)) {
  } else if (ipaddr.IPv6.isValid(ipString)) {
    let ip = ipaddr.IPv6.parse(ipString);
    console.log('ip', ip.toIPv4Address().toString());

    if (ip.isIPv4MappedAddress()) {
      return ip.toIPv4Address().toString();
    }
  }
}

function checkPeer(url, ip, callback) {
    const request = require('request');
    let obj = {};
    request
        .get(url)
        .on('error', function () {
            obj.ip = ip;
            obj.available = 'false';
            JSON.stringify(obj);
            callback(obj);
        })
        .on('response', function() {
            obj.ip = ip;
            obj.available = 'true';
            JSON.stringify(obj);
            callback(obj);
        });
}

function handleNewDestinations() {
    const fs = require('fs');
    let peers = pe.getPeers(PORT);
    fs.writeFileSync('functions/peers-' + PORT + '.json', JSON.stringify(null));
    for (let i = 0; i < peers.length; i++) {
        let ip = peers[i].ip;
        let url = 'http://' + ip + '/check';
        checkPeer(url, ip, function (response) {
            fs.readFile('functions/peers-' + PORT + '.json', function (err, data) {
                let json = JSON.parse(data);
                if (json === null) {
                    json = []
                }
                json.push(response);
                console.log(json);
                fs.writeFileSync('functions/peers-' + PORT + '.json', JSON.stringify(json));
            });
        });
    }
}

function handleRequest(request, response){
  try {
    dispatcher.dispatch(request, response);
  } catch(error) {
    response.end(error);
  }
}


function triggerDownloader(req, res, trigger) {
  return new Promise(function(resolve, reject) {
    dl.download(returnUrlParam(req)).then(function(resolves, rej) {
      resolve({
      'status': 200,
      'mime-type': resolves.headers['content-type'],
      'content': new Buffer(resolves.body).toString('base64')
      });
    });
  });
}



function createFileForNewPeer(port) {
    fs.open('functions/peers-' + port + '.json', 'w', function () {
        let json = [];
        let obj = {};
        obj.ip = "192.168.43.15:1215";
        obj.available = "false";
        json.push(obj);
        /*
        obj = {};
        obj.ip = "192.168.43.144:1215";
        obj.available = "false";
        json.push(obj);
        */

        fs.writeFileSync('functions/peers-' + port + '.json', JSON.stringify(json));
    });
}


function makeDownloadRequest(port, requestedUrl) {
    const request = require('request');
    console.log('Making a download request');
    let peers = pe.getPeers(port);
    ID =  Math.floor((Math.random() * 1000) + 1);
    for (let i = 0; i < peers.length; i++) {
        if (peers[i].available) {
            let url = 'http://' + peers[i].ip + '/download?url=' + encodeURIComponent(requestedUrl) + '&id=' + ID +'';
            console.log('url:', url);
            request.get({
                uri: url
            }).on('error', function(e) {
                console.log("make download request error:", e);
            });
        }
    }
}

function getFormattedResponse(content) {
    content = content.split('\\').join('');
    const split = content.split('"content":"');
    let index = 0;
    if (split[0].substring(0, 1) === '\"') {
        index = 1;
    }
    split[0] = split[0].substring(index);
    split[1] = Buffer.from(split[1].substring(0, split[1].length - 2), 'base64').toString('ascii');
    return split.join('"content":"') + '"}';
}

function startServer(port) {
    dispatcher.onGet('/download', function (req, res) {
        console.log('Got a download request');
        if (downloadOrNot() && ID !== null && (parseInt(returnIdParam(req)) !== parseInt(ID)) &&
            !downloadedIDs.includes(parseInt(returnIdParam(req)))) {
            downloadedIDs.push(parseInt(returnIdParam(req)));
            console.log('Starting download...');
            triggerDownloader(req, res).then(function (resolve, reject) {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(resolve));
                sR.post('http://' + ipAddressHandler(req) + ':1215/file?id=' + returnIdParam(req), resolve).then(function (resolve, reject) {
                });
                console.log('Download to client was ok');

            });
        } else {
          console.log('Not downloading');
          let requestId = returnIdParam(req);
          let requestIp = ipAddressHandler(req);
          let requestUrl = returnUrlParam(req);
          if (!unhandledResponses[requestId]) {
              unhandledResponses[requestId] = requestIp;
              fw.forward(port, requestUrl, requestId);
          }
        }
    });

    dispatcher.onGet('/check', function (req, res) {
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end('OK');
    });

    dispatcher.onGet('/startdownload', function(req, res) {
      let url = returnUrlParam(req);
      res.writeHead(200, {'Content-Type': 'text/plain'});
      makeDownloadRequest(port, url);
      setTimeout(function() {
        // console.log('RES_BODY.content:', typeof RES_BODY);
        if (RES_BODY) {
          res.end(RES_BODY);
          RES_BODY = null;
        } else {
          setTimeout(function() {
            res.end('Noone wanted to download your file. lol');
          }, 1000);
        }
      }, 4000);
    });

    dispatcher.onPost('/file', function (req, res) {
        console.log('Got post request, Checking Id.');
        const postId = returnIdParam(req);
        if (postId !== null && postId in unhandledResponses && ID !== null && (parseInt(returnIdParam(req)) !== parseInt(ID))) {
            unHandledIp = unhandledResponses[postId];
            sR.post('http://' + unHandledIp + ':1215/file?id=' + postId, req.body).then(function (resolve, reject) {
            });
            console.log('Returned post request to previous client');
            delete unhandledResponses[postId];
        } else if(postId !== null && parseInt(postId) === parseInt(ID)) {
            console.log('sain tagasi ip', ipAddressHandler(req));
            // console.log('yayy minu request saadeti tagasiiiii', req.body.toString());
            // console.log('req.body.content:', typeof req.body);
            RES_BODY = getFormattedResponse(req.body);
            ID = null;
        } else {
            console.log('Random post request (id not in unhandled)');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({error: 404}));
        }
    });

    createFileForNewPeer(port);

    const server = http.createServer(handleRequest);

    server.listen(port, function () {
        PORT = port;
        console.log("Server listening on: http://localhost:%s", port);
        setInterval(handleNewDestinations, 2000);
    });
}

module.exports.start = function (port) {
    startServer(port);
};
