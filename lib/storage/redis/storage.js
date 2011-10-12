var redis = require('redis');

var root = this;

var RedisStorage;

if (typeof exports !== 'undefined') {
    RedisStorage = exports;
} else {
    RedisStorage = root.RedisStorage = {};
}

RedisStorage.VERSION = '0.0.1';

// create new instance of storage
RedisStorage.createStorage = function(options, callback) {
    new Storage(options, callback);
};

/*******************************************
* Storage 
*/
var Storage = function(options, callback) {
    callback = !callback ? options : callback;
    options = callback ? options : {};
    
    // set options and load defaults if needed
    this.options = options || {};
    this.options.host = this.options.host || 'localhost';
    this.options.port = this.options.port || 6379;
    
    this.logger = this.options.logger || null;
    this.collectionName = this.options.collectionName || 'events';

    this.client = redis.createClient(this.options.port, this.options.host);

    this.client.on("error", function (err) {
		if (this.logger) {
			this.logger.error("Redis connection error to " + this.client.host + ":" + this.client.port + " - " + err);
		}
    }.bind(this));
    callback(this);
};

Storage.prototype._clear = function(clb) {
    var logger = this.logger;
    this.client.flushdb(function(err, res) {
        if (err) {
            if (logger) {
				logger.error(err);
			}
        }
        else {
            clb();
        }
    });
};

Storage.prototype.addEvent = function(event, clb) {
	var logger = this.logger;
    this.client.lpush(this.collectionName+':'+event.streamId, JSON.stringify(event), function(err, res) {
        if (err) {
			if (logger) {
				logger.error(err);
			}
        }
        else {
            this.client.hset('undispatched'+this.collectionName, event.commitId, JSON.stringify(event), function(err, res) {
                if (err) {
                    if (logger) {
                        logger.error(err);
                    }
                }
                else {
                    clb();
                }
            });
        }
    }.bind(this));
};

Storage.prototype.getEvents = function(streamId, minRev, maxRev, callback) {
	var logger = this.logger;
    maxRev = maxRev > 0 ? maxRev-1 : maxRev;
    this.client.lrange(this.collectionName+':'+streamId, minRev, maxRev, function (err, res) {
        if (err) {
            if (logger) {
                logger.error(err);
            }
            callback(null);
        }
        else if (res && res.length > 0) {
            var arr = [];
            for (var e in res) {
                arr.push(JSON.parse(res[e]));
            }
            callback(arr);
        }
        else {
            callback([]);
        }
    });
};

Storage.prototype.getUndispatchedEvents = function(callback) {
    logger = this.logger;
    this.client.hkeys('undispatched'+this.collectionName, function (err, res) {
        if (err) {
            if (logger) {
                logger.error(err);
            }
            callback(null);
        }
        else {
            var arr = [];
            for (var e in res) {
                var key = res[e];
                this.client.hget('undispatched'+this.collectionName, key, function (err, res) {
                    if (err) {
                        if (logger) {
                            logger.error(err);
                        }
                    }
                    else {
                        arr.push(JSON.parse(res));
                    }
                });
            }
            callback(arr);
        }
    }.bind(this));
};

Storage.prototype.setEventToDispatched = function(evt) {
    logger = this.logger;
    this.client.hdel('undispatched'+this.collectionName, evt.commitId, function (err, res) {
        if (err) {
            if (logger) {
                logger.error(err);
            }
        }
    });
};

Storage.prototype.getId = function(callback) {
	var logger = this.logger;
    this.client.incr('nextItemId', function(err, id) {
		if (err) {
			if (logger) {
				logger.error(err);
			}
		}
        else {
            if (typeof callback === 'function') {
                callback(id.toString());
            }
        }
    });
};