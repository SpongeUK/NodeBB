'use strict';

(function(module) {
	var fork = require('child_process').fork;

	module.hash = function(rounds, password, callback) {
		forkChild({type: 'hash', rounds: rounds, password: password}, callback);
	};

	module.compare = function(password, hash, callback) {
		forkChild({type: 'compare', password: password, hash: hash}, callback);
	};

	function forkChild(message, callback) {
        console.log(new Date().toTimeString().split(" ")[0], " FORK CHILD");
		var child = fork('./bcrypt', {
				silent: true
			});

        console.log(new Date().toTimeString().split(" ")[0], " CHILD.ON");
		child.on('message', function(msg) {
			if (msg.err) {
				return callback(new Error(msg.err));
			}

            console.log(new Date().toTimeString().split(" ")[0], " PASSWORD CALLING BACK");
			callback(null, msg.result);
		});

        console.log(new Date().toTimeString().split(" ")[0], " CHILD.SEND");
		child.send(message);
	}

	return module;
})(exports);