const { Schema, model } = require("mongoose");

const MediaSchema = new Schema({
    postId: String,
    pictName: String,
    title: String,
    author: String,
    url: String,
    isPosted: Boolean
});

module.exports = model("Media", MediaSchema);