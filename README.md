
<img width="1914" height="874" alt="Screenshot (237)" src="https://github.com/user-attachments/assets/212c259e-2865-4f4b-86dd-e652e6167df5" />

<h1><img width="34" height="35" alt="KarmaFinder logo" src="https://github.com/user-attachments/assets/2650bd36-1834-4b96-96bb-851e9536a6e2" align="absmiddle" /> KarmaFinder</h1>

**A fast & responsive browser-based Reddit client** with semantic search, bookmark features, advanced filters, themes and more.

**Live Site:** https://karmafinder.site/


**Demo Video:** 


<div align="center">

https://github.com/user-attachments/assets/4b80a618-6261-49ee-b6cc-75f6f599465c

</div>

<img width="1918" height="876" alt="forestsectioninfo" src="https://github.com/user-attachments/assets/0fc6480e-793e-4e64-aa52-6348c629baff" />

### **Section analytics and metadata** 
- Track creation date, bookmark count, top subreddit, and last modified with custom descriptions for organizing collections.
- Generate public links to share curated bookmark collections with anyone, no login required.

<div align="center">
  
https://github.com/user-attachments/assets/7f6261c8-1bd9-447b-a431-112f9fdeb20c

</div>

### **Imports**

- Import Reddit saves instantly using OAuth single click login.
- See number of unique posts.
- Saves populate in order to any section.

### **Bookmarks**

- Move any post with dropdown menu.
- Organize posts inside custom sections with drag-and-drop.
- Choose emoji, rename, and delete sections.

<img width="1920" height="878" alt="Screenshot (238)" src="https://github.com/user-attachments/assets/6f266646-0e88-4a91-bbf8-00ccfa19c72f" />

### **Search**

- Enhanced Search: semantic search with vector embeddings using Pinecone, query matching and algorithmic ranking.
- Smart filtering with progressive fetch - batch filter by content type (video/image/text, time period).
- Combine filters Reddit doesn't allow (hot + past week, etc.).
- Dynamic search suggestions with spell check from dictionary, word completion API, and user input.

<img width="1916" height="873" alt="pic7" src="https://github.com/user-attachments/assets/48c1b936-957f-466a-8748-dfcb8fc0f1e8" />

### **Media**

- Plyr.io player for smooth playback on Reddit video: ffmpeg merges audio/video streams and caches on a local CDN.
- YouTube and Streamable embeds.
- Modal viewer with zoom and smooth gallery navigation with preloading & decoding for seamless transitions.
- Markdown and image support in comments.

<div align="center">
  
<img alt="Screen Shot 2026-04-03 at 01 39 29-fullpage" src="https://github.com/user-attachments/assets/e3b0dde0-7eaa-4bac-8032-26c78deb8387" width="300"/>

</div>

### **UI**

- Multiple themes (Forest, Bluebird, dark, light).
- Configurable layouts: Comfy and Compact modes for different card sizes.
- Top 8 comments on every post without clicking through.
- Hermes - animated kitty mascot with 100+ unique contextual responses. <img width="24" height="25" alt="KarmaFinder logo" src="https://github.com/user-attachments/assets/2650bd36-1834-4b96-96bb-851e9536a6e2" />

### **Misc Features**
- Batch rendering for performance, caching for quick responses, minimal API load.
- Passwordless magic link login (login optional).
- NSFW blur filter with pattern detection.

# **Install**
## Local Installation
```bash
git clone https://github.com/hawaiichair23/karmafinder.git
cd karmafinder
npm install
node server.js
```

Open [http://localhost:3000](http://localhost:3000)

## Configuration

Create a `.env` file in the root directory with the following variables:

### Required
```
# Postgres Database
PGUSER=your_postgres_user
PGHOST=localhost
PGDATABASE=whatever
PGPASSWORD=your_postgres_password
PGPORT=5432

# Email Magic Links - for login
RESEND_API_KEY=your_resend_api_key

# Reddit API
REDDIT_CLIENT_1_ID=your_reddit_client_id
REDDIT_CLIENT_1_SECRET=your_reddit_client_secret
REDDIT_USER_AGENT_1=KarmaFinder/1.0 by /u/yourusername

# Reddit OAuth (for importing saves)
REDDIT_WEBAPP_SECRET=your_reddit_webapp_secret
REDDIT_WEBAPP_CLIENT=your_reddit_webapp_client
```

### Optional
```
# Vector Search (Pinecone)
PINECONE_API_KEY=
PINECONE_ENVIRONMENT=

# Caching (Redis)
REDIS_API_KEY=
REDIS_ENDPOINT=

# Stripe Payment Processing
STRIPE_ENABLED=false
```
