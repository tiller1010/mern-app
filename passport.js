var passport = require('passport');
var LocalStrategy = require('passport-local');
var GoogleStrategy = require('passport-google-oauth20').Strategy;
var { addUser, findAndSyncUser } = require('./users.js');
var bcrypt = require('bcrypt');

passport.use('local-login', new LocalStrategy({
		usernameField: 'displayName',
		passwordField: 'password',
		passReqToCallback: true
	}, async (req, displayName, password, done) => {
		try {
			let user = await findAndSyncUser(displayName, 'local');

			if(user){
				if(!bcrypt.compareSync(password, user.passwordHash)){
					return done(null, false, { message: 'Incorrect password.' });
				}
				return done(null, user);
			} else {
				return done(null, false, { message: 'No user found with that name.' });
			}
		} catch(error) {
			console.log(error);
		}
	}
));

passport.use('local-signup', new LocalStrategy({
		usernameField: 'displayName',
		passwordField: 'password',
		passReqToCallback: true
	}, async (req, displayName, password, done) => {
		try {
			let user = await findAndSyncUser(displayName, 'local');
			if(user){
				return done(null, false, { message: 'User with that name already exists.' });
			} else {
				if(password !== req.body.confirmPassword){
					return done(null, false, { message: 'Passwords do not match.' });
				}
				let newUser = {
					displayName,
					firstName : req.body.firstName,
					lastName : req.body.lastName,
					passwordHash: bcrypt.hashSync(password, 10),
					completedTopics: [],
					uploadedVideos: [],
					likedVideos: []
				}
				let user = await addUser(newUser);
				return done(null, newUser);
			}
		} catch(error) {
			console.log(error);
		}
	}
));

const callbackURL = process.env.SECURED_DOMAIN_WITH_PROTOCOL ? `${process.env.SECURED_DOMAIN_WITH_PROTOCOL}/auth/google/callback` : '/auth/google/callback';
passport.use(new GoogleStrategy({
	clientID: process.env.GOOGLE_AUTH_ID,
	clientSecret: process.env.GOOGLE_AUTH_SECRET,
	callbackURL
}, async (token, tokenSecret, profile, done) => {
		const newUser = {
			googleID: profile.id,
			displayName: profile.displayName,
			firstName: profile.name.givenName,
			lastName: profile.name.familyName,
			image: profile.photos[0],
			completedTopics: [],
			uploadedVideos: [],
			likedVideos: []
		}

		try {
			let user = await findAndSyncUser(profile.id, 'google');

			if(user){
				return done(null, user);
			} else {
				let user = await addUser(newUser);
				return done(null, newUser);
			}
		} catch(error) {
			console.log(error);
		}
	}
));

passport.serializeUser((user, done) => {
	if(user.googleID){
		return done(null, user.googleID);
	} else {
		return done(null, user.displayName);
	}
});

passport.deserializeUser( async (identifier, done) => {
	let user = await findAndSyncUser(identifier, 'google');
	if(user){
		return done(null, user);
	} else {
		let user = await findAndSyncUser(identifier, 'local');
		return done(null, user);
	}
});

module.exports.passport = passport;