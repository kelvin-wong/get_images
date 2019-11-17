const express = require('express');
const graphqlHTTP = require('express-graphql');
const { buildSchema } = require('graphql');
const crypto = require('crypto');
const axios = require('axios');
const app = express();
const port = 3000;
require('dotenv').config();

const schema = buildSchema(`
  type Query {
    images(q: String!): [Image]
  },
  type Image {
    image_ID: String,
    thumbnails: String,
    preview: String,
    title: String,
    source: String!,
    tags: [String],
  }
`);

const root = {
    images: async function (args) {
        const query = args.q;
        const imageFromStoryblocks = await searchImageFromStoryblocks(query);
        const imageFromUnsplash = await searchImageFromUnsplash(query);
        const imageFromPixabay = await searchImageFromPixabay(query);

        return [
            imageFromUnsplash,
            imageFromPixabay,
            imageFromStoryblocks,
        ];
    },
};

app.use(
    '/graphql',
    graphqlHTTP({
        schema: schema,
        rootValue: root,
        graphiql: true,
    }),
);

const searchImageFromStoryblocks = async function (query) {
    const publicKey = process.env.STORYBLOCKS_PUBLIC_KEY;
    const privateKey = process.env.STORYBLOCKS_PRIVATE_KEY;

    const baseUrl = 'https://api.graphicstock.com';
    const searchUri = '/api/v1/stock-items/search/';

    // HMAC generation
    const expires = Math.floor(Date.now() / 1000);
    const hmacBuilder = crypto.createHmac('sha256', privateKey + expires);
    hmacBuilder.update(searchUri);
    const hmac = hmacBuilder.digest('hex');

    const response = await axios.get(baseUrl + searchUri, {
        params: {
            keywords: query,
            page: 1,
            num_results: 1,
            APIKEY: publicKey,
            EXPIRES: expires,
            HMAC: hmac
        }
    }).catch(function (error) {
        console.error(error);
        return {
            data: {
                info: [],
            }
        };
    });

    if (0 === response.data.info.length) {
        return {
            image_ID: null,
            thumbnails: null,
            preview: null,
            title: null,
            source: 'Storyblocks',
            tags: null,
        };
    }

    const image = response.data.info[0];
    return {
        image_ID: image.id,
        thumbnails: image.thumbnail_url,
        preview: image.preview_url,
        title: image.title,
        source: 'Storyblocks',
        tags: image.keywords.split(','),
    };
}

const searchImageFromUnsplash = async function (query) {
    const url = 'https://api.unsplash.com/search/photos';
    const response = await axios.get(url, {
        params: {
            client_id: process.env.UNSPLASH_ACCESS_KEY,
            query: query,
            page: 1,
            per_page: 1
        }
    }).catch(function (error) {
        console.error(error);
        return {
            data: {
                results: [],
            }
        }
    });

    if (0 === response.data.results.length) {
        return {
            image_ID: null,
            thumbnails: null,
            preview: null,
            title: null,
            source: 'Unsplash',
            tags: null,
        };
    }
    const image = response.data.results[0];
    return {
        image_ID: image.id,
        thumbnails: image.urls.thumb,
        preview: image.urls.regular,
        title: image.description,
        source: 'Unsplash',
        tags: image.tags.map(function (tag) {
            return tag.title;
        }),
    };
}

const searchImageFromPixabay = async function (query) {
    const url = 'https://pixabay.com/api/';
    const response = await axios.get(url, {
        params: {
            key: process.env.PIXABAY_API_KEY,
            q: query,
            page: 1,
            per_page: 3
        }
    }).catch(function (error) {
        console.error(error);
        return {
            data: {
                hits: [],
            }
        };
    });

    if (0 === response.data.hits.length) {
        return {
            image_ID: null,
            thumbnails: null,
            preview: null,
            title: null,
            source: 'Pixabay',
            tags: null,
        };
    }

    const image = response.data.hits[0];
    return {
        image_ID: image.id,
        thumbnails: image.previewURL,
        preview: image.largeImageURL,
        title: null,
        source: 'Pixabay',
        tags: image.tags.split(', '),
    };
}

app.get('/search', async function (req, res) {
    const query = req.query.q;
    const imageFromStoryblocks = await searchImageFromStoryblocks(query);
    const imageFromUnsplash = await searchImageFromUnsplash(query);
    const imageFromPixabay = await searchImageFromPixabay(query);

    res.json({
        data: {
            images: [
                imageFromUnsplash,
                imageFromPixabay,
                imageFromStoryblocks,
            ],
        }
    });
});

app.listen(port, () => console.log(`app listening on port ${port}!`));
