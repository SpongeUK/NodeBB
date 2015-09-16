"use strict";

var categoriesController = {},
	async = require('async'),
	nconf = require('nconf'),
	validator = require('validator'),

	db = require('../database'),
	privileges = require('../privileges'),
	user = require('../user'),
	groups = require('../groups'),
	categories = require('../categories'),
	topics = require('../topics'),
	meta = require('../meta'),
	plugins = require('../plugins'),
	pagination = require('../pagination'),
	helpers = require('./helpers'),
	utils = require('../../public/src/utils');

function removeAllPrivs(categoryId, member, callback) {
    var privileges = [ "groups:moderate", "groups:topics:reply", "groups:topics:create", "groups:read", "groups:find" ];

    async.each(privileges, function(privilege, next) {
        groups.leave('cid:' + categoryId + ':privileges:' + privilege, member, next);
    }, callback);
}

function addUserPrivs(categoryId, member, callback) {
    var privileges = [ "groups:topics:reply", "groups:topics:create", "groups:read", "groups:find" ];

    async.each(privileges, function(privilege, next) {
        groups.join('cid:' + categoryId + ':privileges:' + privilege, member, next);
    }, callback);
}

function configurePrivileges(category, callback) {
    removeAllPrivs(category.cid, 'registered-users', function (err) {
        if (err) return callback(err);

        removeAllPrivs(category.cid, 'guests', function (err) {
            if (err) return callback(err);

            addUserPrivs(category.cid, category.name, function (err) {
                if (err) return callback(err);

                callback();
            });
        });
    });
}

function createDiscussionTopic(category, callback) {
    topics.post({
        uid: 1,
        title: "General discussion for " + category.name,
        slug: "general-" + category.name,
        content: "This topic has been created for general discussion within the " + category.name + " group.",
        cid: category.cid,
        thumb: "",
        tags: []
    }, function (err) {
        if (err) return callback(err);

        callback();
    });
}

categoriesController.create = function(req, res, next) {
    var categoryName = req.params.name;

    categories.existsByName(categoryName, function (err, exists) {
        if (err) return next(err);
        if (exists)
            return res.status(400).send({ "msg": "Category " + categoryName + " already exists" });

        categories.create({ name: categoryName, description: req.body.description, icon: "fa-comments" }, function(err) {
            if (err) return next(err);

            categories.getByName(categoryName, function (err, category) {
                if (err) return next (err);

                configurePrivileges(category, function (err) {
                    if (err) return next(err);

                    createDiscussionTopic(category, function (err) {
                        if (err) return next(err);

                        res.status(201).send();
                    });
                });
            });
        });
    });
};

function grantModeratorPrivsById(categoryId, member, callback) {
    var privileges = [ "mods", "topics:reply", "topics:create", "read", "find" ];

    async.each(privileges, function(privilege, next) {
        groups.join('cid:' + categoryId + ':privileges:' + privilege, member, next);
    }, callback);
}

function revokeModeratorPrivsById(categoryId, member, callback) {
    groups.leave('cid:' + categoryId + ':privileges:mods', member, callback);
}

categoriesController.grantModeratorPrivs = function (req, res, next) {
    var categoryName = req.params.name;
    var username = req.body.username;

    user.getUidByUsername(username, function (err, uid) {
        if (err) return next(err);

        categories.getByName(categoryName, function (err, category) {
            if (err) return next(err);

            grantModeratorPrivsById(category.cid, uid, function (err) {
                if (err) return next(err);

                res.status(200).send();
            });
        });
    });
};

categoriesController.revokeModeratorPrivs = function (req, res, next) {
    var categoryName = req.params.name;
    var username = req.body.username;

    user.getUidByUsername(username, function (err, uid) {
        if (err) return next(err);

        categories.getByName(categoryName, function (err, category) {
            if (err) return next(err);

            revokeModeratorPrivsById(category.cid, uid, function (err) {
                if (err) return next(err);

                res.status(200).send();
            });
        });
    });
};

categoriesController.list = function(req, res, next) {
	async.parallel({
		header: function (next) {
			res.locals.metaTags = [{
				name: "title",
				content: validator.escape(meta.config.title || 'NodeBB')
			}, {
				name: "description",
				content: validator.escape(meta.config.description || '')
			}, {
				property: 'og:title',
				content: '[[pages:categories]]'
			}, {
				property: 'og:type',
				content: 'website'
			}];

			if (meta.config['brand:logo']) {
				res.locals.metaTags.push({
					property: 'og:image',
					content: meta.config['brand:logo']
				});
			}

			next(null);
		},
		categories: function (next) {
			var categoryData;
			async.waterfall([
				function(next) {
					categories.getCategoriesByPrivilege('cid:0:children', req.uid, 'find', next);
				},
				function(_categoryData, next) {
					categoryData = _categoryData;

					var allCategories = [];
					categories.flattenCategories(allCategories, categoryData);

					categories.getRecentTopicReplies(allCategories, req.uid, next);
				}
			], function(err) {
				next(err, categoryData);
			});
		}
	}, function (err, data) {
		if (err) {
			return next(err);
		}

		data.title = '[[pages:categories]]';

		plugins.fireHook('filter:categories.build', {req: req, res: res, templateData: data}, function(err, data) {
			if (err) {
				return next(err);
			}
			res.render('categories', data.templateData);
		});
	});
};

categoriesController.get = function(req, res, callback) {
	var cid = req.params.category_id,
		page = parseInt(req.query.page, 10) || 1,
		userPrivileges;

	if ((req.params.topic_index && !utils.isNumber(req.params.topic_index)) || !utils.isNumber(cid)) {
		return callback();
	}

	async.waterfall([
		function(next) {
			async.parallel({
				exists: function(next) {
					categories.exists(cid, next);
				},
				categoryData: function(next) {
					categories.getCategoryFields(cid, ['slug', 'disabled', 'topic_count'], next);
				},
				privileges: function(next) {
					privileges.categories.get(cid, req.uid, next);
				},
				userSettings: function(next) {
					user.getSettings(req.uid, next);
				}
			}, next);
		},
		function(results, next) {
			userPrivileges = results.privileges;

			if (!results.exists || (results.categoryData && parseInt(results.categoryData.disabled, 10) === 1)) {
				return callback();
			}

			if (!results.privileges.read) {
				return helpers.notAllowed(req, res);
			}

			if ((!req.params.slug || results.categoryData.slug !== cid + '/' + req.params.slug) && (results.categoryData.slug && results.categoryData.slug !== cid + '/')) {
				return helpers.redirect(res, '/category/' + encodeURI(results.categoryData.slug));
			}

			var settings = results.userSettings;
			var topicIndex = utils.isNumber(req.params.topic_index) ? parseInt(req.params.topic_index, 10) - 1 : 0;
			var topicCount = parseInt(results.categoryData.topic_count, 10);
			var pageCount = Math.max(1, Math.ceil(topicCount / settings.topicsPerPage));

			if (topicIndex < 0 || topicIndex > Math.max(topicCount - 1, 0)) {
				return helpers.redirect(res, '/category/' + cid + '/' + req.params.slug + (topicIndex > topicCount ? '/' + topicCount : ''));
			}

			if (settings.usePagination && (page < 1 || page > pageCount)) {
				return callback();
			}

			if (!settings.usePagination) {
				topicIndex = Math.max(topicIndex - (settings.topicsPerPage - 1), 0);
			} else if (!req.query.page) {
				var index = Math.max(parseInt((topicIndex || 0), 10), 0);
				page = Math.ceil((index + 1) / settings.topicsPerPage);
				topicIndex = 0;
			}

			var set = 'cid:' + cid + ':tids',
				reverse = false;

			if (settings.categoryTopicSort === 'newest_to_oldest') {
				reverse = true;
			} else if (settings.categoryTopicSort === 'most_posts') {
				reverse = true;
				set = 'cid:' + cid + ':tids:posts';
			}

			var start = (page - 1) * settings.topicsPerPage + topicIndex,
				stop = start + settings.topicsPerPage - 1;

			next(null, {
				cid: cid,
				set: set,
				reverse: reverse,
				start: start,
				stop: stop,
				uid: req.uid
			});
		},
		function(payload, next) {
			user.getUidByUserslug(req.query.author, function(err, uid) {
				payload.targetUid = uid;
				if (uid) {
					payload.set = 'cid:' + cid + ':uid:' + uid + ':tids';
				}
				next(err, payload);
			});
		},
		function(payload, next) {
			categories.getCategoryById(payload, next);
		},
		function(categoryData, next) {
			if (categoryData.link) {
				db.incrObjectField('category:' + categoryData.cid, 'timesClicked');
				return res.redirect(categoryData.link);
			}

			var breadcrumbs = [
				{
					text: categoryData.name,
					url: nconf.get('relative_path') + '/category/' + categoryData.slug
				}
			];
			helpers.buildCategoryBreadcrumbs(categoryData.parentCid, function(err, crumbs) {
				if (err) {
					return next(err);
				}
				categoryData.breadcrumbs = crumbs.concat(breadcrumbs);
				next(null, categoryData);
			});
		},
		function(categoryData, next) {
			var allCategories = [];
			categories.flattenCategories(allCategories, [categoryData]);
			categories.getRecentTopicReplies(allCategories, req.uid, function(err) {
				next(err, categoryData);
			});
		},
		function (categoryData, next) {
			categoryData.privileges = userPrivileges;
			categoryData.showSelect = categoryData.privileges.editable;

			res.locals.metaTags = [
				{
					name: 'title',
					content: categoryData.name
				},
				{
					property: 'og:title',
					content: categoryData.name
				},
				{
					name: 'description',
					content: categoryData.description
				},
				{
					property: "og:type",
					content: 'website'
				}
			];

			if (categoryData.backgroundImage) {
				res.locals.metaTags.push({
					name: 'og:image',
					content: categoryData.backgroundImage
				});
			}

			res.locals.linkTags = [
				{
					rel: 'alternate',
					type: 'application/rss+xml',
					href: nconf.get('url') + '/category/' + cid + '.rss'
				},
				{
					rel: 'up',
					href: nconf.get('url')
				}
			];

			next(null, categoryData);
		}
	], function (err, data) {
		if (err) {
			return callback(err);
		}

		data.currentPage = page;
		data['feeds:disableRSS'] = parseInt(meta.config['feeds:disableRSS'], 10) === 1;
		data.rssFeedUrl = nconf.get('relative_path') + '/category/' + data.cid + '.rss';
		data.pagination = pagination.create(data.currentPage, data.pageCount);
		data.title = data.name;
		data.pagination.rel.forEach(function(rel) {
			res.locals.linkTags.push(rel);
		});

		plugins.fireHook('filter:category.build', {req: req, res: res, templateData: data}, function(err, data) {
			if (err) {
				return callback(err);
			}
			res.render('category', data.templateData);
		});
	});
};



module.exports = categoriesController;
