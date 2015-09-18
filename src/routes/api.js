"use strict";

var express = require('express'),

	posts = require('../posts'),
	categories = require('../categories'),
	uploadsController = require('../controllers/uploads');

module.exports =  function(app, middleware, controllers) {

	var router = express.Router();
	app.use('/api', router);

    // Launch and learn API routes
    router.post('/group/create/:name', middleware.validateRequestSource, controllers.admin.groups.create);
    router.post('/group/:name/addUsers', middleware.validateRequestSource, controllers.admin.groups.addUser);
    router.post('/category/create/:name', middleware.validateRequestSource, controllers.categories.create);
    router.post('/category/create/:name/child/:child', middleware.validateRequestSource, controllers.categories.createChild);
    router.post('/category/:name/moderate', middleware.validateRequestSource, controllers.categories.grantModeratorPrivs);
    router.post('/category/:name/revoke', middleware.validateRequestSource, controllers.categories.revokeModeratorPrivs);
    router.post('/category/:name/child/:child/topic/:slug/create', middleware.validateRequestSource, controllers.topics.createPublicTopic);
    router.post('/category/:name/child/:child/topic/:slug/private', middleware.validateRequestSource, controllers.topics.createPrivateTopic);
    router.post('/category/:name/remove', middleware.validateRequestSource, controllers.categories.removeCategoryData);


	router.get('/config', middleware.applyCSRF, controllers.api.getConfig);
	router.get('/widgets/render', controllers.api.renderWidgets);

	router.get('/user/uid/:uid', middleware.checkGlobalPrivacySettings, controllers.accounts.getUserByUID);
	router.get('/post/:pid', controllers.posts.getPost);
	router.get('/categories/:cid/moderators', getModerators);
	router.get('/recent/posts/:term?', getRecentPosts);
	router.get('/unread/total', middleware.authenticate, controllers.unread.unreadTotal);

	var multipart = require('connect-multiparty');
	var multipartMiddleware = multipart();
	var middlewares = [multipartMiddleware, middleware.validateFiles, middleware.applyCSRF];
	router.post('/post/upload', middlewares, uploadsController.uploadPost);
	router.post('/topic/thumb/upload', middlewares, uploadsController.uploadThumb);
	router.post('/user/:userslug/uploadpicture', middlewares.concat([middleware.authenticate, middleware.checkGlobalPrivacySettings, middleware.checkAccountPermissions]), controllers.accounts.uploadPicture);
};

function getModerators(req, res, next) {
	categories.getModerators(req.params.cid, function(err, moderators) {
		res.json({moderators: moderators});
	});
}


function getRecentPosts(req, res, next) {
	posts.getRecentPosts(req.uid, 0, 19, req.params.term, function (err, data) {
		if (err) {
			return next(err);
		}

		res.json(data);
	});
}