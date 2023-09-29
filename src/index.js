require("dotenv").config();
const { TwitterApi } = require("twitter-api-v2");
const axios = require("axios");
const mongoose = require("mongoose")

// Models
const Media = require("../models/Media");

// Database connection USING MONGOOSE!!!!
mongoose.connect(process.env.DATABASE_URI);
mongoose.connection.on('open', (data) => console.log("database connected."));
mongoose.connection.on("error", (err) => console.error(err));

// Twitter login string and stuff...
const client = new TwitterApi({ appKey: process.env.CONSUMER_KEY, appSecret: process.env.CONSUMER_SECRET, accessToken: process.env.USER_ACCESS_TOKEN, accessSecret: process.env.USER_ACCESS_SECRET})

client.appLogin()
.then((data) => {
    console.log("User connected.")
})
.catch((err) => {
    console.error("Something went wrong with twitter.")
});

axios.get('https://reddit.com/r/cableporn.json')
.then( async (res) => {
    const posts = res.data.data.children;
    posts.forEach(async (reddit) => {
        const data = reddit.data;
        if (reddit.data.url_overridden_by_dest == null) return console.log(`🙅‍♀️ ${data.id} has No media.`);
        if (!reddit.data.url_overridden_by_dest.endsWith(".jpg") && !reddit.data.url_overridden_by_dest.endsWith(".png")) return console.log(`🙅‍♀️ ${data.id} has no compatible image.`);
        const MediaAlreadySaved = await Media.find({ postId: data.id});
        if(MediaAlreadySaved) return console.log(`🙅‍♀️ ${data.id} has already been saved.`);

        const newMedia = new Media({
            postId: data.id,
            pictName: dataS3.Key,
            title: data.title,
            author: data.author,
            url: `https://reddit.com${data.permalink}`,
            isPosted: false
        });
    })
})

async function uploadImage() {
    const mediaId = await Promise.all([
        client.v1.uploadMedia("./media/112119595_p0_master1200.jpg")
    ])
    await sendTwitt(mediaId)
}
async function sendTwitt(mediaId) {
    if(!mediaId) {
        return await client.v2.tweet("Image: Cozy Mumei\nCreator:イッキ\nLink: https://www.pixiv.net/en/artworks/112119595");
    } else {
        await client.v2.tweet({
            text: "Image: Cozy Mumei\nCreator:イッキ\nLink: https://www.pixiv.net/en/artworks/112119595",
            media: { media_ids: mediaId}
        });
    }
}


// Dev Functions call
// uploadImage();
// sendTwitt()