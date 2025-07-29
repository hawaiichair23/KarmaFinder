const fetch = require('node-fetch');
require('dotenv').config();

const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const COLLECTION_NAME = 'reddit_posts';

async function lowercaseSubredditsInQdrant() {
    let hasMore = true;
    let offset = null;

    console.log(`Starting update for collection: ${COLLECTION_NAME}`);

    while (hasMore) {
        console.log(`Fetching points with offset: ${offset || 'start'}`);

        const scrollResponse = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/scroll`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': QDRANT_API_KEY,
            },
            body: JSON.stringify({
                limit: 100,
                offset: offset,
                with_payload: true,
                with_vectors: true
            }),
        });

        const scrollData = await scrollResponse.json();

        if (!scrollResponse.ok) {
            console.error('Error scrolling points:', scrollData);
            break;
        }

        const points = scrollData.result.points;
        hasMore = scrollData.result.next_page_offset !== null;
        offset = scrollData.result.next_page_offset;

        if (points.length === 0) {
            console.log('No more points to process.');
            break;
        }

        const pointsToUpdate = [];
        for (const point of points) {
            if (point.payload && point.payload.subreddit) {
                const currentSubreddit = point.payload.subreddit;
                const lowercasedSubreddit = String(currentSubreddit).toLowerCase();

                if (currentSubreddit !== lowercasedSubreddit) {
                    pointsToUpdate.push({
                        id: point.id,
                        vector: point.vector,
                        payload: {
                            ...point.payload,
                            subreddit: lowercasedSubreddit,
                        },
                    });
                }
            }
        }

        if (pointsToUpdate.length > 0) {
            console.log(`Updating ${pointsToUpdate.length} points...`);

            const updateResponse = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': QDRANT_API_KEY,
                },
                body: JSON.stringify({
                    points: pointsToUpdate,
                    wait: true
                }),
            });

            const updateData = await updateResponse.json();

            if (!updateResponse.ok) {
                console.error('Error updating points:', updateData);
            } else {
                console.log(`Successfully updated ${pointsToUpdate.length} points.`);
            }
        } else {
            console.log('No subreddits to update in this batch.');
        }

        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('Finished updating subreddits in Qdrant.');
}

lowercaseSubredditsInQdrant().catch(console.error);