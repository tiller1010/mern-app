const { getDB } = require('./db.js');
const fs = require('fs');

const pageLength = 3;
async function index(page = 1){
	const db = getDB();
	// Skip items per page, minus the current page
	const videos = await db.collection('videos').find({}).skip((page - 1) * pageLength).limit(pageLength).toArray();
	const videoCount = await db.collection('videos').count();
	const pages = Math.ceil(videoCount / pageLength);
	return {
		videos,
		pages
	}
}

async function add(video){
	const db = getDB();
	const newVideo = await db.collection('videos').insertOne(video);
	return video;
}

async function getRecent(limit = 6){
	const db = getDB();
	const videos = await db.collection('videos').find({}).sort({created: -1}).limit(5).toArray();
	return {videos};
}

module.exports = { index, add, getRecent };