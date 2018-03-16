const request = require('request');

function getPeers(port) {
  let filename = './peers-'+ port +'.json';
  return require(filename);
}

module.exports.getPeers = getPeers;
