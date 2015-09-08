"use strict";

var async = require('async'),

	db = require('../../database'),
	groups = require('../../groups'),
	user = require('../../user'),
	meta = require('../../meta'),
	pagination = require('../../pagination'),
	helpers = require('../helpers');


var groupsController = {};

groupsController.create = function(req, res, next) {
    groups.create({ name: req.params.name, description: req.body.description }, function(err) {
        if (err) return next(err);

        res.status(201).send();
    });
};

function addUserToGroup(user, group, next) {
    user.getUidByUsername(username, function (err, user) {
        if (err) return next(err);

        console.log("GROUPS: ", groups);
        console.log("USER: ", user);

        /* groups.join({}, function (err) {
            if (err) return next(err);

            next();
        }); */
    });
}

groupsController.addUser = function(req, res, next) {
    var users = req.body.users;
    var group = req.params.name;
    if (!group || !users || !users.length)
        return res.status(400).send();

    async.each(users, function (user, callback) {
        addUserToGroup(user, group, callback);
    }, function (err) {
        if (err) res.status(500).send(err);

        res.status(200).send();
    });
};

groupsController.list = function(req, res, next) {
	var page = parseInt(req.query.page, 10) || 1;
	var groupsPerPage = 20;
	var pageCount = 0;

	async.waterfall([
		function(next) {
			db.getSortedSetRevRange('groups:createtime', 0, -1, next);
		},
		function(groupNames, next) {
			groupNames = groupNames.filter(function(name) {
				return name.indexOf(':privileges:') === -1 && name !== 'registered-users';
			});
			pageCount = Math.ceil(groupNames.length / groupsPerPage);

			var start = (page - 1) * groupsPerPage;
			var stop =  start + groupsPerPage - 1;

			groupNames = groupNames.slice(start, stop + 1);
			groups.getGroupsData(groupNames, next);
		},
		function(groupData, next) {
			groupData.forEach(groups.escapeGroupData);
			next(null, {groups: groupData, pagination: pagination.create(page, pageCount)});
		}
	], function(err, data) {
		if (err) {
			return next(err);
		}

		res.render('admin/manage/groups', {
	 		groups: data.groups,
	 		pagination: data.pagination,
	 		yourid: req.user.uid
	 	});
	});
};

groupsController.get = function(req, res, callback) {
	var groupName = req.params.name;
	async.waterfall([
		function(next){
			groups.exists(groupName, next);
		},
		function(exists, next) {
			if (!exists) {
				return callback();
			}
			groups.get(groupName, {uid: req.uid}, next);
		}
	], function(err, group) {
		if (err) {
			return callback(err);
		}
		res.render('admin/manage/group', {group: group});
	});
};

module.exports = groupsController;
