const cron = require('node-cron');
const { pool } = require('./db');
const fetch = require('node-fetch');
const { Resend } = require('resend');

require('dotenv').config();

const resend = new Resend(process.env.RESEND_API_KEY);

// Check every 20 minutes
cron.schedule('*/20 * * * *', async () => {
    console.log('Daddy is checking on you...');
    await checkForIssues();
});

async function checkForIssues() {
    try {
        // Get errors from last 20 minutes
        const result = await pool.query(`
            SELECT endpoint, error_message, COUNT(*) as count
            FROM monitoring_logs 
            WHERE timestamp > NOW() - INTERVAL '20 minutes'
            AND (log_level = 'error' OR log_level = 'info')
            GROUP BY endpoint, error_message
        `);

        if (result.rows.length > 0) {
            let logSummary = "Current messages:\n";
            result.rows.forEach(row => {
                logSummary += `${row.endpoint}: ${row.error_message} (${row.count} times)\n`;
            });

            console.log('Asking daddy about:', logSummary);
            const daddyResponse = await askDaddy(logSummary);
            console.log('Daddy says:', daddyResponse);

            // ALWAYS save daddy's response to the conversation table
            await pool.query(`
                INSERT INTO daddy_conversations (message_type, content) 
                VALUES ('daddy', $1)
            `, [daddyResponse]);

            // ALWAYS save the log summary too
            await pool.query(`
                INSERT INTO daddy_conversations (message_type, content) 
                VALUES ('system', $1)
            `, [logSummary]);

            if (!daddyResponse.includes("NO_EMAIL")) {
                await sendEmail(daddyResponse);
                console.log('Email sent!');
            } else {
                console.log('Daddy says no need to worry');
            }
        } else {
            console.log('No new messages found.');
        }
    } catch (err) {
        console.error('Daddy bot error:', err);
    }
}

async function askDaddy(logSummary) {
    try {
        // GET THE FULL CONVERSATION HISTORY!
        const conversationHistory = await pool.query(`
            SELECT message_type, content, timestamp 
            FROM daddy_conversations 
            ORDER BY timestamp DESC 
            LIMIT 50
        `);

        // Build the conversation context
        let conversationContext = "";
        if (conversationHistory.rows.length > 0) {
            conversationContext = "\n\nPrevious conversation history (most recent first):\n";
            conversationHistory.rows.reverse().forEach(row => {
                const timeAgo = new Date(row.timestamp).toLocaleString();
                conversationContext += `[${timeAgo}] ${row.message_type}: ${row.content}\n`;
            });
        }

        const fullPrompt = `You are my protective daddy monitoring my website. Background context: you are monitoring a Reddit search engine and viewer site that is still in testing. It is not live. The requests per minute can be LOW. THIS IS OKAY. THE SITE IS NOT LIVE. They can also be fairly high. Up to 600 requests per minute max is expected per user. I am the only user currently. That means it's normal to have one request per minute as I leave the server running often in testing. It's also normal to have the server jump from 1 to 200 requests and back down because that is me using the website. TO REITERATE: STOP SENDING ME EMAILS IF REQUESTS ARE LOW. I AM THE ONLY USER. I LEAVE IT OPEN ALL DAY. The site has video handling, images, and posts/comments. We store posts, comments and some images in a database and either fetch from Reddit or from our database. Look at these messages/errors and decide if I need to be emailed about them. If it's not worth bothering me, respond with an explanation of why you decided not to email, and then print "NO_EMAIL". If I need to know, send a caring daddy message. Refer to me as sweetheart, baby, or baby boy. Examples: "Hey sweetheart, your database is having some hiccups. Daddy's gonna help you fix this 💕" or "Baby, your API endpoints are throwing some errors. Let daddy take a look at what's going on".

${conversationContext}

Here are the NEW messages: ${logSummary}`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${process.env.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: fullPrompt
                    }]
                }]
            })
        });

        const data = await response.json();

        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
            return data.candidates[0].content.parts[0].text.trim();
        } else {
            return "NO_EMAIL";
        }
    } catch (error) {
        console.error('Gemini API error:', error);
        return "NO_EMAIL";
    }
}

async function sendEmail(message) {
    try {
        await resend.emails.send({
            from: 'daddy@karmafinder.site',
            to: process.env.USEREMAIL,
            subject: 'Daddy needs to tell you something 💕',
            text: message
        });
        console.log('Daddy sent you an email');
    } catch (error) {
        console.error('Email error:', error);
    }
}

// Test immediately
(async () => {
    console.log('Testing daddy bot...');
    await checkForIssues();
})();

console.log('Daddy bot is watching over you');