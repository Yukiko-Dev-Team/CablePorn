// Import necessary modules and libraries
require("dotenv").config();
const { TwitterApi } = require("twitter-api-v2");
const axios = require("axios");
const mongoose = require("mongoose");
const AWS = require("aws-sdk");
const fs = require("fs");
const Path = require("path");
const request = require("request");
const schedule = require('node-schedule');

// Models
const Media = require("../models/Media");

// Database connection using Mongoose
mongoose.connect(process.env.DATABASE_URI);
mongoose.connection.on('open', (data) => console.log("Database connected."));
mongoose.connection.on("error", (err) => console.error(err));

// Initialize Twitter API client
const client = new TwitterApi({ 
    appKey: process.env.CONSUMER_KEY, 
    appSecret: process.env.CONSUMER_SECRET, 
    accessToken: process.env.USER_ACCESS_TOKEN, 
    accessSecret: process.env.USER_ACCESS_SECRET
});

client.appLogin()
    .then((data) => {
        console.log("User connected.");
    })
    .catch((err) => {
        console.error("Something went wrong with Twitter.");
    });

// Configure AWS S3
AWS.config.update({
    accessKeyId: process.env.AWS_KEY,
    secretAccessKey: process.env.AWS_SECRET,
    region: process.env.AWS_REGION,
    s3ForcePathStyle: true
});

const s3 = new AWS.S3;

// Function to fetch images from Reddit
/**
 * Fetches images from the Reddit 'cableporn' subreddit.
 */
async function fetchReddit() {
    axios.get('https://reddit.com/r/cableporn.json')
        .then(async (res) => {
            const posts = res.data.data.children;
            posts.forEach(async (reddit) => {
                const data = reddit.data;
                if (reddit.data.url_overridden_by_dest == null) return console.log(`🙅‍♀️ ${data.id} has No media.`);
                if (!reddit.data.url_overridden_by_dest.endsWith(".jpg") && !reddit.data.url_overridden_by_dest.endsWith(".png")) return console.log(`🙅‍♀️ ${data.id} has no compatible image.`);
                const MediaAlreadySaved = await Media.find({ postId: data.id });
                if (MediaAlreadySaved === null) return console.log(`🙅‍♀️ ${data.id} has already been saved.`);

                // Function to upload to S3
                /**
                 * Uploads a media file to AWS S3.
                 * @param {string} file - The path to the file to be uploaded.
                 * @returns {Promise} - A promise that resolves when the upload is complete.
                 */
                const uploadMedia = async (file) => {
                    const params = {
                        Bucket: process.env.AWS_BUCKET,
                        Key: `CablePornDev/media/${data.id}.jpg`,
                        Body: fs.readFileSync(file),
                        ACL: "public-read",
                        ContentType: "image/jpeg"
                    };
                    return await s3.upload(params).promise();
                }

                // Function to download files
                /**
                 * Downloads a file from a given URL and saves it to a specified path.
                 * @param {string} url - The URL of the file to download.
                 * @param {string} path - The path where the downloaded file will be saved.
                 * @param {Function} callback - A callback function to execute after the download is complete.
                 */
                const download = async (url, path, callback) => {
                    await request.head(url, async (err, res, body) => {
                        await request(url)
                            .pipe(fs.createWriteStream(path))
                            .on("close", callback);
                    })
                }
                const url = data.url_overridden_by_dest;
                const path = Path.join(__dirname, `../media/${data.id}.jpg`);
                await download(url, path, () => {
                    console.log(`${data.id} has been downloaded`);
                    uploadMedia(path)
                        .then((dataS3) => {
                            console.log(`${data.id} has been uploaded to S3!! ${dataS3.Key}`);
                            const newMedia = new Media({
                                postId: data.id,
                                pictName: dataS3.Key,
                                title: data.title,
                                author: data.author,
                                url: `https://reddit.com${data.permalink}`,
                                isPosted: false
                            });
                            newMedia.save()
                                .then(() => {
                                    console.log(`${data.id} has been saved to the database!`)
                                    fs.unlink(path, (err) => {
                                        if (err) return console.log(err);
                                        console.log(`${data.id} has been deleted from the disk.`)
                                    })
                                })
                        })
                        .catch((err) => {
                            console.error(err);
                        })
                })
            })
        })
}
// fetchReddit();
getMedia();

// Download media using the database
/**
 * Downloads media using information from the database and sends it to Twitter.
 */
async function getMedia() {
    let media;
    media = await Media.findOne({ isPosted: false });
    if (!media) {
        const oldMedia = await Media.find({ isPosted: true });
        media = oldMedia[Math.floor(Math.random() * oldMedia.length)];
    }
    const download = async (url, path, callback) => {
        await request.head(url, async (err, res, body) => {
            await request(url)
                .pipe(fs.createWriteStream(path))
                .on("close", callback);
        });
    }
    let url = `https://kyoko-cdn.s3.ap-northeast-1.amazonaws.com/${media.pictName}`
    const path = Path.join(__dirname, `../media/${media.postId}.jpg`);
    await download(url, path, () => {
        console.log(`${media.postId} has been downloaded.`);
        // Send to Twitter to get the mediaId
        uploadImage(path, media);
    })
}

// Send Media to Twitter
/**
 * Uploads an image to Twitter and sends a tweet with the image.
 * @param {string} path - The path to the image file.
 * @param {object} media - Information about the media to be tweeted.
 */
async function uploadImage(path, media) {
    const mediaId = await Promise.all([
        client.v1.uploadMedia(path)
    ])
        .catch((err) => {
            console.error(err);
            sendTweet(null, media);
        })
    await sendTweet(mediaId, media)
}

/**
 * Sends a tweet with media to Twitter.
 * @param {string|null} mediaId - The media ID of the uploaded image.
 * @param {object} media - Information about the media to be tweeted.
 */
async function sendTweet(mediaId, media) {
    if (!mediaId) {
        return await client.v2.tweet(`${media.title}\nBy: ${media.author}\n${media.url}\nVia: r/CablePorn`);
    } else {
        await client.v2.tweet({
            text: `${media.title}\nBy: ${media.author}\n${media.url}\nVia: r/CablePorn`,
            media: { media_ids: mediaId }
        })
            .then(() => {
                deleteLocalMedia(media);
            })
    }
}

/**
 * Deletes a locally stored media file and marks it as posted in the database.
 * @param {object} media - Information about the media to be deleted.
 */
async function deleteLocalMedia(media) {
    const path = Path.join(__dirname, `../media/${media.postId}.jpg`);
    fs.unlinkSync(path)
    console.log(`${media.postId}.jpg has been deleted from the local disk.`);
    // Mark as posted in the database. 
    media.isPosted = true;
    media.save();
};

// Timed and Sync
// Get new posts on boot
// fetchReddit()
// Send new tweet on boot
getMedia();


// Send new tweet at 14:00JST
schedule.scheduleJob('0 14 * * *', () => {
    getMedia();
});
// Get new media at 00:00 JST
schedule.scheduleJob('0 0 * * *', () => {
    fetchReddit();
});