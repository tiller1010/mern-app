require('dotenv').config();
const express = require('express');
const multer  = require('multer');
var upload = multer({ dest: 'public/assets/' });
const path = require('path');
const appPort = process.env.APP_PORT || 3000;
const { connectToDB, getDB } = require('./db.js');
const { indexVideos, addVideo, removeVideo, getRecent, addVideoToUsersUploads } = require('./videos.js');
const feathers = require('@feathersjs/feathers');
const service = require('feathers-mongodb');
const search = require('feathers-mongodb-fuzzy-search');
const { passport } = require('./passport.js');
var session = require('express-session');
var flash = require('connect-flash');
var { addUser, findAndSyncUser, findUserByID, addCompletedTopic, removeCompletedTopic } = require('./users.js');
var { getTopic, getTopicChallenges } = require('./topics.js');
var { addLike, removeLike } = require('./likes.js');

var app = express();
app.set('views', __dirname + '/views');
app.set('view engine', '.jsx');
app.engine('jsx', require('express-react-views').createEngine());

// For login sessions
app.use(session({
	secret: 'supersecret',
	resave: true,
	saveUninitialized: true
}));
app.use(flash());

app.use(express.urlencoded());
app.use(express.static(path.join(__dirname, 'public')));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.json());

function randomFilename() {
  var text = "";
  var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for(var i = 0; i < 40; i++){
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  return text;
}

var storage = multer.diskStorage({
	destination: function (req, file, cb) {
		cb(null, __dirname + '/public/assets');
	},
	filename: function(req, file, cb){
		let fileExtension = file.mimetype.split('').splice(file.mimetype.indexOf('/') + 1, file.mimetype.length).join('');
		if(fileExtension == 'quicktime'){
			fileExtension = 'mov';
		}
		cb(null, randomFilename() + '.' + fileExtension);
	}
})
 
var upload = multer({ storage });

(async function start(){
	try{
		await connectToDB();
		const db = await getDB();

		// Create search service
		const feathersService = feathers();
		// Use videos for search
		feathersService.use('/videos', service({
			Model: db.collection('videos'),
			whitelist: ['$text', '$search']
		}));
		// Create video search service
		const VideoService = feathersService.service('videos');
		// Create videos index
		VideoService.Model.createIndex({ title: 'text' })
		// Add search hooks
		VideoService.hooks({
			before: {
			  find: search()
			}
		})

		// Home route
		app.get('/', (req, res) => {
			let userLikedVideos = [];
			if(req.user){
				userLikedVideos = req.user.likedVideos || [];
			}
			res.render('home', { userLikedVideos });
		});

		// Recent videos API
		app.get('/recent-videos', async (req, res) => {
			const videos = await getRecent();
			res.send(JSON.stringify(videos));
		});

		// Levels route
		app.get('/level/:levelID', (req, res) => {
			res.render('level.jsx', {levelID: req.params.levelID});
		});

		// Topics route
		app.get('/level/:levelID/topic/:topicID', (req, res) => {
			let completed = false;
			if(req.user){
				let completedTopics = req.user.completedTopics || [];
				completedTopics.forEach((topic) => {
					if(topic.id == req.params.topicID){
						completed = true;
					}
				});
			}
			res.render('topic.jsx', {
				levelID: req.params.levelID,
				topicID: req.params.topicID,
				completed
			});
		});
		app.post('/level/:levelID/topic/:topicID', async (req, res) => {
			if(req.user && req.params.levelID && req.params.topicID){
				const topicData = await getTopic(req.params.topicID);
				const challenges = await getTopicChallenges(req.params.topicID);
				const topic = {
					levelID: req.params.levelID,
					topicID: req.params.topicID,
					...topicData,
					challenges
				}
				addCompletedTopic(req.user._id, topic);
				res.send('success');
			}
		});
		app.post('/level/:levelID/topic/:topicID/reset', async (req, res) => {
			if(req.user && req.params.topicID){
				removeCompletedTopic(req.user._id, req.params.topicID);
				res.send('reset');
			}
		});


		// Index videos route
		app.get('/videos:format?', async (req, res) => {
			let keywords = req.query.keywords || false;
			let sort = req.query.sort || false;
			let videos = null;
			const page = req.query.page || 1;

			// If using sort
			let sortObject = {};
			if(sort === 'Recent'){
				sortObject = {created: -1};
			} else if(sort === 'Oldest'){
				sortObject = {created: 1};
			} else if(sort === 'A-Z'){
				sortObject = {title: 1};
			} else if(sort === 'Z-A'){
				sortObject = {title: -1};
			}
			// If using search keywords
			if(keywords){
				const searchPageLength = 3;
				videos = await VideoService.find({
					query: {
						$search: keywords,
						$sort: sortObject,
						$limit: searchPageLength,
						$skip: (page - 1) * searchPageLength
					}
				});
				const allVideoResults = await VideoService.find({ query: { $search: keywords } });
				const pages = Math.ceil(allVideoResults.length / searchPageLength);

			    videos = {
			    	videos,
			    	pages
			    }
			} else {
				videos = await indexVideos(page, sortObject);
			}

			if(req.params.format){
				res.format({
					json: function(){
						res.send(JSON.stringify(videos))
					}
				})
				return;
			}

			let userLikedVideos = [];
			if(req.user){
				userLikedVideos = req.user.likedVideos || [];
			}

			res.render('videos', { userLikedVideos });
		});

		// Send like API
		app.get('/sendLike/:videoID', async (req, res) => {
			// Only can send a like if logged in
			if(!req.user){
				return res.send({ message: 'Must be signed in to send like.' });
			} else {
				const updatedVideo = await addLike(req.user._id, req.params.videoID);
				return res.send(updatedVideo);
			}
		});
		// React Native Send like API
		app.post('/sendLike/:videoID', async (req, res) => {
			// Only can send a like if logged in
			if(!req.body.user){
				return res.send({ message: 'Must be signed in to send like.' });
			} else {
				const updatedVideo = await addLike(req.body.user._id, req.params.videoID);
				return res.send(updatedVideo);
			}
		});

		// Remove like API
		app.get('/removeLike/:videoID', async (req, res) => {
			// Only can remove a like if logged in
			if(!req.user){
				return res.send({ message: 'Must be signed in to remove like.' }); // This cannot occur in most cases. Need to be signed in to send likes.
			} else {
				const updatedVideo = await removeLike(req.user._id, req.params.videoID);
				return res.send(updatedVideo);
			}
		});
		// React Native Remove like API
		app.post('/removeLike/:videoID', async (req, res) => {
			// Only can remove a like if logged in
			if(!req.body.user){
				return res.send({ message: 'Must be signed in to remove like.' }); // This cannot occur in most cases. Need to be signed in to send likes.
			} else {
				const updatedVideo = await removeLike(req.body.user._id, req.params.videoID);
				return res.send(updatedVideo);
			}
		});

		// Add video route
		app.get('/videos/add', (req, res) => {
			res.render('videos-add');
		});

		// Submit new video route
		app.post('/videos/add', upload.fields([{name: 'video', maxCount: 1}, {name: 'thumbnail', maxCount: 1}]), async (req, res) => {
			const newVideo = await addVideo({
				title: req.body.title,
				src: 'assets/' + req.files['video'][0].filename,
				originalName: req.files['video'][0].originalname,
				thumbnailSrc: 'assets/' + req.files['thumbnail'][0].filename,
				originalThumbnailName: req.files['thumbnail'][0].originalname,
				created: new Date(),
				uploadedBy: req.user ? { _id: req.user._id, displayName: req.user.displayName } : { displayName: 'Guest' }
			});
			if(req.user){
				await addVideoToUsersUploads(newVideo, req.user._id);
			}
			if(req.body.nativeFlag){
				res.status(200).send('Successful upload');
			} else {
				res.redirect('/videos');
			}
		});

		// Remove uploaded video route
		app.post('/videos/remove', async (req, res) => {
			if(req.user){
				await removeVideo(req.body.videoID);
			}
			if(req.body.nativeFlag){
				res.status(200).send('Successfully removed');
			} else {
				res.redirect('/account-profile');
			}
		});

		// Account profile
		app.get('/account-profile/:viewOtherUserID?',
			async (req, res) => {
				if(req.params.viewOtherUserID){
					let user = await findAndSyncUser(req.params.viewOtherUserID, 'id');
					return res.render('account-profile', {
						user,
						authenticatedUser: req.user || null,
						isCurrentUser: false,
						pathResolver: '../'
					});
				}else if(req.user){
					let user = req.user;
					return res.render('account-profile', {
						user,
						authenticatedUser: req.user || null,
						isCurrentUser: true
					});
				} else {
					return res.redirect('/login');
				}
			}
		);

		// Account login
		app.get('/login', (req, res) => {
			if(req.user){
				return res.redirect('/account-profile');
			}
			const errors = req.flash().error || [];
			res.render('login', { errors });
		});
		// Submit login form
		app.post('/login', passport.authenticate('local-login', {
			successRedirect: '/account-profile',
			failureRedirect: '/login',
			failureFlash: true 
		}));
		// Submit login form from react native
		app.post('/react-native-login', passport.authenticate('local-login'), async (req, res) => {
			if(req.body.nativeFlag && req.user){
				res.status(200).json(req.user);
			}
		});

		// Google login
		let googleNativeFlag = false;
		app.get('/auth/google', (req, res, next) => {
			if(req.query.nativeFlag){
				googleNativeFlag = true;
			}
			next();
		}, passport.authenticate('google', { scope: 'https://www.googleapis.com/auth/plus.login' }));
		app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), (req, res) => {
			if(googleNativeFlag && req.user){
				googleNativeFlag = false;
				res.redirect(process.env.REACT_NATIVE_APP_URL + '?userID=' + String(req.user._id));
				return;
			} else {
				res.redirect('/account-profile');
				return;
			}
		});

		// Account register
		app.get('/register', (req, res) => {
			if(req.user){
				return res.redirect('/account-profile');
			}
			const errors = req.flash().error || [];
			res.render('register', { errors });
		});
		// Submit register form
		app.post('/register', passport.authenticate('local-signup', {
				successRedirect: '/account-profile',
				failureRedirect: '/register',
				failureFlash: true,
				successFlash: {
					type: 'messageSuccess',
					message: 'Successfully signed up.'
				}
			})
		);
		// Submit register form from react native
		app.post('/react-native-register', passport.authenticate('local-signup'), async (req, res) => {
			if(req.body.nativeFlag && req.user){
				res.status(200).json(req.user);
			}
		});

		// Account logout
		app.get('/logout', (req, res) => {
			req.logout();
			res.redirect('/');
		});

		// Find user api for react native
		app.get('/user/:id', async (req, res) => {
			if(req.params.id){
				let user = await findUserByID(req.params.id);
				res.status(200).json(user);
			}
		});

		// Start app
		app.listen(appPort, () => {
			console.log(`App up on port ${appPort}`);
		});
	} catch(err){
		console.log(`Error: ${err}`);
	}
})();
